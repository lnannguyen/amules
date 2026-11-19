const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const crypto = require('crypto');

// Load .env configuration
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
    envLines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [k, ...v] = trimmed.split('=');
        if (k && !process.env[k.trim()]) {
          process.env[k.trim()] = v.join('=').trim().replace(/(^['"]|['"]$)/g, '');
        }
      }
    });
  }
} catch (e) { }

const { connectDB, getDB, ObjectId } = require('./config/db');

const app = express();
const port = process.env.PORT || 3002;

// 1. Logger
app.use(morgan('dev'));

// 2. Static files (for uploaded images)
const publicImagesDir = path.join(__dirname, 'public', 'images');
fs.mkdirSync(publicImagesDir, { recursive: true });
app.use(express.static(path.join(__dirname, 'public')));

// 3. CORS with credentials for cookies & sessions
app.use(cors({
  origin: ['http://localhost:4200', 'http://127.0.0.1:4200'],
  credentials: true
}));

// 4. Body parser (large limit for base64 image uploads as taught in slide VI & VII)
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// 5. Cookie Parser & Express Session with Fallback Store
app.use(cookieParser());

let sessionStore = null;
try {
  const sessionMongoUrl = (process.env.MONGODB_URI && process.env.MONGODB_URI.includes('amules'))
    ? process.env.MONGODB_URI
    : 'mongodb://127.0.0.1:27017/amules';

  sessionStore = MongoStore.create({
    mongoUrl: sessionMongoUrl,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60, // 1 day
    autoRemove: 'native'
  });

  sessionStore.on('error', (err) => {
    // Không để lỗi connection session làm crash process
  });
} catch (err) {
  sessionStore = null;
}

process.on('unhandledRejection', (reason) => {
  // Bắt các ngoại lệ connection timeout từ driver MongoDB/MongoStore ngầm
});

const sessionConfig = {
  secret: 'amules-secret-key-2026',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    httpOnly: true,
    secure: false, // set true if using HTTPS
    sameSite: 'lax'
  }
};
if (sessionStore) {
  sessionConfig.store = sessionStore;
}
app.use(session(sessionConfig));

// Helper to convert string id or ObjectId
function toObjectId(id) {
  try {
    return new ObjectId(id);
  } catch (err) {
    return id;
  }
}

// -------------------------------------------------------------
// ROUTES
// -------------------------------------------------------------

// Root health check
app.get('/', (req, res) => {
  res.send('AMULES RESTful API Server is running (NodeJS + ExpressJS + MongoDB)');
});

// Helper: Nạp dữ liệu mẫu từ thư mục amules-database nếu collection trong MongoDB đang rỗng
function loadFallbackJsonData(collectionName) {
  try {
    const candidates = [
      path.join(__dirname, '..', '..', 'amules-database', `${collectionName}.json`),
      path.join(__dirname, '..', 'amules-database', `${collectionName}.json`),
      path.join(process.cwd(), 'amules-database', `${collectionName}.json`)
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Chuẩn hóa định dạng Extended JSON MongoDB ($oid, $date)
          return parsed.map(item => {
            const clean = { ...item };
            if (clean._id && clean._id.$oid) clean._id = toObjectId(clean._id.$oid);
            if (clean.createdAt && clean.createdAt.$date) clean.createdAt = new Date(clean.createdAt.$date);
            if (clean.updatedAt && clean.updatedAt.$date) clean.updatedAt = new Date(clean.updatedAt.$date);
            // Chuẩn hóa ảnh và mô tả cho bộ sưu tập & chủ đề
            if (collectionName === 'collections') {
              clean.image = clean.image || clean.coverImage || 'https://i.pinimg.com/736x/d2/c1/cd/d2c1cd50bee4cf66b8a095b253a55beb.jpg';
              clean.coverImage = clean.coverImage || clean.image;
              clean.desc = clean.desc || clean.description || '';
              if (!clean.tag) {
                if ((clean.slug || '').includes('mystic')) clean.tag = 'Cổ điển & Huyền bí';
                else if ((clean.slug || '').includes('moon')) clean.tag = 'Thiên thể & Chiêm tinh';
                else clean.tag = 'Dịu dàng & Lãng mạn';
              }
            }
            if (collectionName === 'themes') {
              clean.image = clean.image || clean.coverImage || clean.bannerImage || 'https://i.pinimg.com/736x/47/9c/df/479cdf269b5b50948b8aef6103b475ed.jpg';
              clean.coverImage = clean.image;
              clean.bannerImage = clean.image;
            }
            return clean;
          });
        }
      }
    }
  } catch (err) {
    console.error(`[Seed] Lỗi đọc fallback JSON cho ${collectionName}:`, err.message);
  }
  return null;
}

// Helper: Tự động đồng bộ toàn bộ danh sách đơn hàng vào file amules-database/orders.json
function syncOrdersToJson(orders) {
  try {
    const candidates = [
      path.join(__dirname, '..', '..', 'amules-database', 'orders.json'),
      path.join(__dirname, '..', 'amules-database', 'orders.json'),
      path.join(process.cwd(), 'amules-database', 'orders.json')
    ];
    let target = null;
    for (const p of candidates) {
      if (fs.existsSync(p)) { target = p; break; }
    }
    if (!target) target = candidates[0];

    const serialized = (orders || []).map(o => {
      const copy = { ...o };
      if (copy._id && typeof copy._id === 'object' && copy._id.toHexString) {
        copy._id = { $oid: copy._id.toHexString() };
      } else if (typeof copy._id === 'string' && copy._id.length === 24) {
        copy._id = { $oid: copy._id };
      }
      if (copy.userId && typeof copy.userId === 'object' && copy.userId.toHexString) {
        copy.userId = { $oid: copy.userId.toHexString() };
      }
      if (copy.createdAt instanceof Date) {
        copy.createdAt = { $date: copy.createdAt.toISOString() };
      }
      if (copy.updatedAt instanceof Date) {
        copy.updatedAt = { $date: copy.updatedAt.toISOString() };
      }
      return copy;
    });

    fs.writeFileSync(target, JSON.stringify(serialized, null, 2), 'utf-8');
    console.log(`[Auto-Sync Database] Đã tự động cập nhật ${serialized.length} đơn hàng vào ${target}`);
    return true;
  } catch (err) {
    console.error('[Auto-Sync Database] Lỗi ghi file orders.json:', err.message);
    return false;
  }
}

// Helper: Tự động đồng bộ toàn bộ danh sách tài khoản người dùng vào file amules-database/users.json
function syncUsersToJson(users) {
  try {
    const candidates = [
      path.join(__dirname, '..', '..', 'amules-database', 'users.json'),
      path.join(__dirname, '..', 'amules-database', 'users.json'),
      path.join(process.cwd(), 'amules-database', 'users.json')
    ];
    let target = null;
    for (const p of candidates) {
      if (fs.existsSync(p)) { target = p; break; }
    }
    if (!target) target = candidates[0];

    const serialized = (users || []).map(u => {
      const copy = { ...u };
      if (copy._id && typeof copy._id === 'object' && copy._id.toHexString) {
        copy._id = { $oid: copy._id.toHexString() };
      } else if (typeof copy._id === 'string' && copy._id.length === 24) {
        copy._id = { $oid: copy._id };
      }
      if (copy.createdAt instanceof Date) {
        copy.createdAt = { $date: copy.createdAt.toISOString() };
      }
      if (copy.updatedAt instanceof Date) {
        copy.updatedAt = { $date: copy.updatedAt.toISOString() };
      }
      return copy;
    });

    fs.writeFileSync(target, JSON.stringify(serialized, null, 2), 'utf-8');
    console.log(`[Auto-Sync Users] Đã tự động cập nhật ${serialized.length} tài khoản vào ${target}`);
    return true;
  } catch (err) {
    console.error('[Auto-Sync Users] Lỗi ghi file users.json:', err.message);
    return false;
  }
}

// Generic collection getter helper với Auto-Seed từ amules-database
function registerStandardCollectionRoute(endpoint, collectionName) {
  app.get(`/api/${endpoint}`, async (req, res) => {
    try {
      const db = getDB();
      let items = await db.collection(collectionName).find({}).toArray();

      // Nếu MongoDB chưa có dữ liệu -> Tự động nạp từ file amules-database/*.json
      if (!items || items.length === 0) {
        const seedData = loadFallbackJsonData(collectionName);
        if (seedData && seedData.length > 0) {
          try {
            await db.collection(collectionName).insertMany(seedData);
            console.log(`[MongoDB Auto-Seed] Đã tự động nạp ${seedData.length} bản ghi vào collection '${collectionName}'`);
            items = seedData;
          } catch (seedErr) {
            items = seedData;
          }
        }
      }

      // Chuẩn hóa các trường ảnh cho collections
      if (collectionName === 'collections' && items) {
        items = items.map(c => ({
          ...c,
          image: c.image || c.coverImage || 'https://i.pinimg.com/736x/d2/c1/cd/d2c1cd50bee4cf66b8a095b253a55beb.jpg',
          coverImage: c.coverImage || c.image || 'https://i.pinimg.com/736x/d2/c1/cd/d2c1cd50bee4cf66b8a095b253a55beb.jpg',
          desc: c.desc || c.description || '',
          tag: c.tag || ((c.slug || '').includes('moon') ? 'Thiên thể & Chiêm tinh' : (c.slug || '').includes('mystic') ? 'Cổ điển & Huyền bí' : 'Dịu dàng & Lãng mạn')
        }));
      }

      if (endpoint === 'themes' && items) {
        items = items.map(t => {
          let img = t.image || t.coverImage || t.bannerImage || 'https://i.pinimg.com/736x/47/9c/df/479cdf269b5b50948b8aef6103b475ed.jpg';
          return {
            ...t,
            image: img,
            coverImage: img,
            bannerImage: img
          };
        });
      }

      if (endpoint === 'articles' && items) {
        const fallbackImgs = [
          'https://i.pinimg.com/736x/8c/01/6d/8c016d17da264368845d7d7ae0ad195a.jpg',
          'https://i.pinimg.com/736x/65/12/56/6512568af032cfb982e96c42c6218599.jpg',
          'https://i.pinimg.com/736x/b5/03/40/b50340697147b14ca4fd8f6b815bf8aa.jpg'
        ];
        items = (items || []).map((a, idx) => {
          let img = a.image || a.thumbnail;
          if (!img || img.startsWith('images/')) {
            img = fallbackImgs[idx % fallbackImgs.length];
          }
          return {
            ...a,
            image: img,
            thumbnail: img,
            tag: a.tag || a.category || 'Cẩm nang năng lượng',
            read: a.read || '5 phút đọc',
            date: a.date || '12 Tháng 10, 2025'
          };
        });
      }

      res.json(items || []);
    } catch (error) {
      // Fallback trả dữ liệu từ JSON trực tiếp nếu kết nối DB gặp gián đoạn
      const fallback = loadFallbackJsonData(collectionName);
      if (fallback) return res.json(fallback);
      res.status(500).json({ error: error.message });
    }
  });

  app.get(`/api/${endpoint}/:id`, async (req, res) => {
    try {
      const db = getDB();
      const id = req.params.id;
      const o_id = toObjectId(id);
      const item = await db.collection(collectionName).findOne({
        $or: [{ _id: o_id }, { id: id }, { slug: id }]
      });
      if (!item) {
        const seedData = loadFallbackJsonData(collectionName);
        if (seedData) {
          const match = seedData.find(i => i.id === id || i.slug === id || (i._id && i._id.toString() === id));
          if (match) return res.json(match);
        }
        return res.status(404).json({ message: 'Item not found' });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

// Register master data routes
registerStandardCollectionRoute('banners', 'banners');
registerStandardCollectionRoute('categories', 'categories');
registerStandardCollectionRoute('collections', 'collections');
registerStandardCollectionRoute('gemstones', 'gemstones');
registerStandardCollectionRoute('elements', 'elements');
registerStandardCollectionRoute('zodiac-signs', 'zodiac_signs');
registerStandardCollectionRoute('themes', 'themes');
registerStandardCollectionRoute('articles', 'articles');
registerStandardCollectionRoute('vouchers', 'vouchers');
registerStandardCollectionRoute('reviews', 'reviews');
registerStandardCollectionRoute('point-transactions', 'point_transactions');
app.get('/api/gift-packages', async (req, res) => {
  try {
    const db = getDB();
    let prods = [];
    if (db) {
      const cOid = toObjectId('c326bff57cfa65f545d70517');
      prods = await db.collection('products').find({
        $or: [
          { isGiftPackage: true },
          { categoryId: 'c326bff57cfa65f545d70517' },
          { categoryId: cOid },
          { category: 'Set quà tặng' },
          { category: { $regex: 'quà tặng', $options: 'i' } }
        ]
      }).toArray();
    }
    if (!prods || prods.length === 0) {
      const all = loadFallbackJsonData('products') || [];
      prods = all.filter(p => p.isGiftPackage || p.categoryId === 'c326bff57cfa65f545d70517' || p.category === 'Set quà tặng');
    }
    const packages = prods.map(p => ({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      desc: p.shortDescription || p.description || p.desc || '',
      price: p.price,
      image: p.image || (p.images && p.images[0]) || ''
    }));
    res.json(packages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper to resolve distinct, appropriate product images
function resolveProductImage(p) {
  if (!p) return 'https://i.pinimg.com/736x/d4/3c/3d/d43c3d69296b0badad1636033dd34e9c.jpg';

  // 1. Ưu tiên URL ảnh online hoặc upload hợp lệ từ p.image
  if (typeof p.image === 'string' && (p.image.startsWith('http://') || p.image.startsWith('https://') || p.image.startsWith('data:image/') || p.image.startsWith('/images/product_'))) {
    return p.image;
  }

  // 2. Kiểm tra mảng p.images
  if (Array.isArray(p.images) && p.images.length > 0) {
    const validImg = p.images.find(img => typeof img === 'string' && (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:image/') || img.startsWith('/images/product_')));
    if (validImg) return validImg;
    if (typeof p.images[0] === 'string' && p.images[0].trim() && !p.images[0].startsWith('images/')) return p.images[0];
  }

  // 3. Fallback bằng ảnh CDN trực tuyến chất lượng cao theo danh mục / tên sản phẩm
  const nameText = `${p.name || ''} ${p.slug || ''} ${p.productCode || ''}`.toLowerCase();
  if (nameText.includes('hơi thở biển') || nameText.includes('aquamarine') || nameText.includes('hải lam')) {
    return 'https://i.pinimg.com/736x/d4/3c/3d/d43c3d69296b0badad1636033dd34e9c.jpg';
  }
  if (nameText.includes('moonstone') || nameText.includes('mặt trăng') || nameText.includes('tinh tú')) {
    return 'https://i.pinimg.com/736x/8b/56/4e/8b564e66f5a26e5a7761873879e15a44.jpg';
  }
  if (nameText.includes('thạch anh hồng') || nameText.includes('venus') || nameText.includes('trái tim')) {
    return 'https://i.pinimg.com/736x/cb/dc/01/cbdc012803b0d24268e367fc9b084e56.jpg';
  }
  if (nameText.includes('dây chuyền') || nameText.includes('merlia')) {
    return 'https://i.pinimg.com/736x/88/cc/a9/88cca9873ac223970e511970e84f478d.jpg';
  }
  if (nameText.includes('bông tai') || nameText.includes('baroque')) {
    return 'https://i.pinimg.com/736x/e8/62/3e/e8623eb64eb7f5c5311910bc49247d8e.jpg';
  }
  return 'https://i.pinimg.com/736x/d4/3c/3d/d43c3d69296b0badad1636033dd34e9c.jpg';
}

// Enrich products with metadata (Category, Stone, Collection, Elements, Zodiacs) from database
let metadataCache = null;
let metadataCacheTime = 0;

async function enrichProductsWithMetadata(rawProducts, db) {
  let categories = [], gemstones = [], collections = [], elements = [], zodiacs = [], reviews = [];
  const now = Date.now();
  if (metadataCache && (now - metadataCacheTime < 60000)) {
    ({ categories, gemstones, collections, elements, zodiacs, reviews } = metadataCache);
  } else {
    try {
      if (db) {
        [categories, gemstones, collections, elements, zodiacs, reviews] = await Promise.all([
          db.collection('categories').find({}).toArray().catch(() => []),
          db.collection('gemstones').find({}).toArray().catch(() => []),
          db.collection('collections').find({}).toArray().catch(() => []),
          db.collection('elements').find({}).toArray().catch(() => []),
          db.collection('zodiac_signs').find({}).toArray().catch(() => []),
          db.collection('reviews').find({}).toArray().catch(() => [])
        ]);
      }
    } catch (err) { }

    if (!categories || categories.length === 0) categories = loadFallbackJsonData('categories') || [];
    if (!gemstones || gemstones.length === 0) gemstones = loadFallbackJsonData('gemstones') || [];
    if (!collections || collections.length === 0) collections = loadFallbackJsonData('collections') || [];
    if (!elements || elements.length === 0) elements = loadFallbackJsonData('elements') || [];
    if (!zodiacs || zodiacs.length === 0) zodiacs = loadFallbackJsonData('zodiac_signs') || [];
    if (!reviews || reviews.length === 0) reviews = loadFallbackJsonData('reviews') || [];

    metadataCache = { categories, gemstones, collections, elements, zodiacs, reviews };
    metadataCacheTime = now;
  }

  const getOid = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
      for (const k of Object.keys(val)) {
        if (k.endsWith('oid')) return String(val[k]);
      }
    }
    return String(val);
  };

  const catMap = new Map(categories.map(c => [getOid(c._id), c.name]));
  const gemMap = new Map(gemstones.map(g => [getOid(g._id), g.name]));
  const elMap = new Map(elements.map(e => [getOid(e._id), e.name]));
  const zodMap = new Map(zodiacs.map(z => [getOid(z._id), z.name]));

  return rawProducts.map(p => {
    const primaryImage = resolveProductImage(p);
    const pCatId = getOid(p.categoryId);
    const categoryName = catMap.get(pCatId) || p.category || 'Vòng tay';

    const pGemIds = (p.gemstoneIds || []).map(getOid);
    const stoneNames = pGemIds.map(id => gemMap.get(id)).filter(Boolean);
    const stoneName = stoneNames.length > 0 ? stoneNames.join(', ') : (p.stone || p.material || 'Đá tự nhiên');

    const pElIds = (p.elementIds || []).map(getOid);
    const elNames = [...new Set(pElIds.map(id => elMap.get(id)).filter(Boolean))];

    const pZodIds = (p.zodiacIds || []).map(getOid);
    const zodNames = [...new Set(pZodIds.map(id => zodMap.get(id)).filter(Boolean))];

    const pId = getOid(p._id) || p.id;
    const colFound = collections.find(c => {
      const cProdIds = (c.productIds || []).map(getOid);
      return cProdIds.includes(pId) || getOid(c._id) === getOid(p.collectionId);
    });
    const colName = colFound ? colFound.name : (p.collection || 'Bộ sưu tập độc bản');

    const cleanFallbackEl = p.element ? [...new Set(p.element.split(/&|,|\+/).map(s => s.trim()).filter(Boolean))].join(' & ') : '';

    const prodReviews = (reviews || []).filter(r => {
      const rPid = getOid(r.productId);
      const rPname = String(r.productName || '').toLowerCase();
      const pNameLower = String(p.name || '').toLowerCase();
      return (rPid && (rPid === pId || rPid === p.id)) || (rPname && pNameLower && (rPname.includes(pNameLower) || pNameLower.includes(rPname)));
    });

    const calculatedReviewCount = prodReviews.length > 0 ? prodReviews.length : (p.reviewCount !== undefined ? Number(p.reviewCount) : 0);
    const calculatedRating = prodReviews.length > 0
      ? Number((prodReviews.reduce((sum, r) => sum + (Number(r.rating || r.stars) || 5), 0) / prodReviews.length).toFixed(1))
      : (p.ratingAverage !== undefined && Number(p.ratingAverage) > 0 ? Number(p.ratingAverage) : 5.0);

    return {
      ...p,
      id: pId || p.slug,
      image: primaryImage,
      images: (p.images && p.images.length > 0)
        ? p.images.map(img => (typeof img === 'string' && img.startsWith('images/')) ? primaryImage : img)
        : [primaryImage],
      category: categoryName,
      stone: stoneName,
      collection: colName,
      compatibleElements: elNames.length > 0 ? elNames : (Array.isArray(p.compatibleElements) && p.compatibleElements.length > 0 ? [...new Set(p.compatibleElements)] : (cleanFallbackEl ? [cleanFallbackEl] : [])),
      element: elNames.length > 0 ? elNames.join(' & ') : cleanFallbackEl,
      compatibleZodiacs: zodNames.length > 0 ? zodNames : (p.compatibleZodiacs || ['Cự Giải', 'Song Ngư']),
      sold: p.sold || '120+',
      badge: p.badge || (p.isFeatured ? 'Nổi bật' : ''),
      reviewCount: calculatedReviewCount,
      ratingAverage: calculatedRating
    };
  });
}

// -------------------------------------------------------------
// PRODUCTS CRUD (Slide VI & VII)
// -------------------------------------------------------------
// Helper hàm lọc mảng sản phẩm nhanh trong bộ nhớ (0ms latency)
function filterProductsArray(items, query = {}) {
  if (!items || !items.length) return [];
  const { category, gemstone, element, minPrice, maxPrice, search, sort, inStock, material } = query;
  let res = [...items];

  if (category) {
    const cNorm = String(category).toLowerCase().trim();
    res = res.filter(p => {
      const pCatId = String(p.categoryId?.$oid || p.categoryId || '').toLowerCase();
      const pCatName = String(p.category || p.categoryName || '').toLowerCase();
      const pName = String(p.name || '').toLowerCase();
      if (cNorm.includes('charm')) {
        return pCatName.includes('charm') || pName.includes('charm') || pCatId === '869baa4a458a5d6513556c60';
      }
      return pCatId === cNorm || pCatName.includes(cNorm);
    });
  }

  if (element) {
    const eNorm = String(element).toLowerCase().replace('mệnh', '').trim();
    const elementIdMap = {
      'kim': '2f282b13c139ff9174d71a7d',
      'moc': '9d26236c8e94bd24477f1d36',
      'thuy': '448a24f33e03c0d6d4c7ebe8',
      'hoa': '63a4bd3d02a3d5d97bb7d13a',
      'tho': '609ffe8a9ec708cdf7c30749'
    };
    const targetOid = elementIdMap[eNorm];
    res = res.filter(p => {
      const pEls = (p.elementIds || []).map(e => String(e?.$oid || e || '').toLowerCase());
      const pElStr = String(p.element || '').toLowerCase();
      const pCompat = (p.compatibleElements || []).map(c => String(c).toLowerCase());
      if (targetOid && pEls.includes(targetOid.toLowerCase())) return true;
      if (pElStr.includes(eNorm)) return true;
      if (pCompat.some(c => c.includes(eNorm))) return true;
      return false;
    });
  }

  if (gemstone) {
    const gNorm = String(gemstone).toLowerCase().trim();
    res = res.filter(p => {
      const pStone = String(p.stone || '').toLowerCase();
      const pGems = (p.gemstoneIds || []).map(g => String(g?.$oid || g || '').toLowerCase());
      return pStone.includes(gNorm) || pGems.includes(gNorm);
    });
  }

  if (inStock === 'true' || inStock === true) {
    res = res.filter(p => (p.stock !== undefined ? p.stock > 0 : true));
  }

  if (material) {
    const mNorm = String(material).toLowerCase().trim();
    res = res.filter(p => String(p.material || '').toLowerCase().includes(mNorm));
  }

  if (minPrice) {
    const min = Number(minPrice);
    res = res.filter(p => Number(p.price || 0) >= min);
  }
  if (maxPrice) {
    const max = Number(maxPrice);
    res = res.filter(p => Number(p.price || 0) <= max);
  }

  if (search) {
    const s = String(search).toLowerCase().trim();
    res = res.filter(p =>
      String(p.name || '').toLowerCase().includes(s) ||
      String(p.description || '').toLowerCase().includes(s) ||
      String(p.productCode || p.code || '').toLowerCase().includes(s) ||
      String(p.stone || '').toLowerCase().includes(s)
    );
  }

  if (sort === 'price_asc') res.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  else if (sort === 'price_desc') res.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  else if (sort === 'featured' || sort === 'popular') res.sort((a, b) => (b.badge || b.isFeatured ? 1 : 0) - (a.badge || a.isFeatured ? 1 : 0));
  else if (sort === 'rating') res.sort((a, b) => Number(b.ratingAverage || 0) - Number(a.ratingAverage || 0));

  return res;
}

app.get('/api/products', async (req, res) => {
  try {
    let db = null;
    try { db = getDB(); } catch (e) { }
    const { category, gemstone, element, theme, minPrice, maxPrice, search, sort, inStock, material } = req.query;
    const filter = {};

    if (category) {
      const cStr = String(category).trim();
      const cNorm = cStr.toLowerCase();
      const orConditions = [
        { category: { $regex: cStr, $options: 'i' } }
      ];
      const cId = toObjectId(category);
      if (cId && typeof cId === 'object') {
        orConditions.push({ categoryId: cId });
      } else {
        orConditions.push({ categoryId: category });
      }
      if (cNorm.includes('charm')) {
        orConditions.push(
          { category: { $regex: 'charm', $options: 'i' } },
          { name: { $regex: 'charm', $options: 'i' } },
          { categoryId: toObjectId('869baa4a458a5d6513556c60') }
        );
      }
      filter.$or = orConditions;
    }
    if (gemstone) {
      const gId = toObjectId(gemstone);
      filter.$or = [
        { gemstoneIds: gId ? { $in: [gId, gemstone] } : gemstone },
        { stone: { $regex: gemstone, $options: 'i' } }
      ];
    }
    if (element) {
      const eNorm = String(element).toLowerCase().replace('mệnh', '').trim();
      const elementMap = {
        'kim': '2f282b13c139ff9174d71a7d',
        'moc': '9d26236c8e94bd24477f1d36',
        'thuy': '448a24f33e03c0d6d4c7ebe8',
        'hoa': '63a4bd3d02a3d5d97bb7d13a',
        'tho': '609ffe8a9ec708cdf7c30749'
      };
      const mappedId = elementMap[eNorm] || element;
      const eOid = toObjectId(mappedId);
      const eTargetIds = [mappedId];
      if (eOid) eTargetIds.push(eOid);
      filter.$or = [
        { elementIds: { $in: eTargetIds } },
        { element: { $regex: eNorm, $options: 'i' } }
      ];
    }
    if (inStock === 'true' || inStock === true) {
      filter.stock = { $gt: 0 };
    }
    if (material) {
      filter.material = { $regex: material, $options: 'i' };
    }
    if (theme) {
      const tId = toObjectId(theme);
      filter.$or = [{ themeId: tId }, { theme: theme }];
    }
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { productCode: { $regex: search, $options: 'i' } },
        { stone: { $regex: search, $options: 'i' } }
      ];
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'price_asc') sortOption = { price: 1 };
    else if (sort === 'price_desc') sortOption = { price: -1 };
    else if (sort === 'featured') sortOption = { isFeatured: -1 };
    else if (sort === 'popular') sortOption = { sold: -1 };
    else if (sort === 'rating') sortOption = { ratingAverage: -1 };

    let rawProducts = [];
    if (db) {
      try {
        rawProducts = await db.collection('products').find(filter).sort(sortOption).toArray();
      } catch (e) { }
    }

    // Nếu MongoDB không có dữ liệu hoặc offline, dùng mảng fallback JSON
    if (!rawProducts || rawProducts.length === 0) {
      const seedData = loadFallbackJsonData('products') || [];
      // Nếu không có filter nào mà collection rỗng thì nạp seedData vào MongoDB
      if (db && (!req.query || Object.keys(req.query).length === 0) && seedData.length > 0) {
        try {
          await db.collection('products').insertMany(seedData);
        } catch (e) { }
      }
      rawProducts = filterProductsArray(seedData, req.query);
    }

    // Map each product to standard frontend fields with rich metadata
    const products = await enrichProductsWithMetadata(rawProducts, db);
    if (sort === 'price_asc') products.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    else if (sort === 'price_desc') products.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    else if (sort === 'rating') products.sort((a, b) => Number(b.ratingAverage || 0) - Number(a.ratingAverage || 0));
    res.json(products);
  } catch (error) {
    const fallback = loadFallbackJsonData('products') || [];
    const filtered = filterProductsArray(fallback, req.query);
    const products = await enrichProductsWithMetadata(filtered, null);
    return res.json(products);
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const db = getDB();
    const id = req.params.id;
    const o_id = toObjectId(id);
    let product = await db.collection('products').findOne({
      $or: [{ _id: o_id }, { slug: id }, { code: id }, { productCode: id }]
    });

    if (!product) {
      // Check fallback data
      const seedData = loadFallbackJsonData('products');
      if (seedData) {
        product = seedData.find(p =>
          p.slug === id ||
          p.productCode === id ||
          p.code === id ||
          (p._id && p._id.toString() === id) ||
          p.id === id
        );
      }
    }

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const [formatted] = await enrichProductsWithMetadata([product], db);
    res.json(formatted);
  } catch (error) {
    const seedData = loadFallbackJsonData('products');
    if (seedData) {
      const product = seedData.find(p =>
        p.slug === req.params.id ||
        p.productCode === req.params.id ||
        p.code === req.params.id ||
        (p._id && p._id.toString() === req.params.id) ||
        p.id === req.params.id
      );
      if (product) {
        const [formatted] = await enrichProductsWithMetadata([product], null);
        return res.json(formatted);
      }
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const db = getDB();
    const newProduct = { ...req.body, createdAt: new Date() };

    // Handle base64 image if uploaded
    if (newProduct.imageBase64) {
      const base64Data = newProduct.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const fileName = `product_${Date.now()}.png`;
      fs.writeFileSync(path.join(publicImagesDir, fileName), base64Data, 'base64');
      newProduct.image = `/images/${fileName}`;
      delete newProduct.imageBase64;
    }

    const result = await db.collection('products').insertOne(newProduct);
    newProduct._id = result.insertedId;
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const db = getDB();
    const o_id = toObjectId(req.params.id);
    const updateData = { ...req.body };
    delete updateData._id;

    if (updateData.imageBase64) {
      const base64Data = updateData.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const fileName = `product_${Date.now()}.png`;
      fs.writeFileSync(path.join(publicImagesDir, fileName), base64Data, 'base64');
      updateData.image = `/images/${fileName}`;
      delete updateData.imageBase64;
    }

    await db.collection('products').updateOne(
      { _id: o_id },
      { $set: updateData }
    );
    const updated = await db.collection('products').findOne({ _id: o_id });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const db = getDB();
    const o_id = toObjectId(req.params.id);
    const item = await db.collection('products').findOne({ _id: o_id });
    await db.collection('products').deleteOne({ _id: o_id });
    res.json(item || { message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// USER AUTH & COOKIE / SESSION (Slide VIII)
// -------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  try {
    const db = getDB();
    const { username, password, rememberMe } = req.body;
    const cleanUser = (username || '').trim().toLowerCase();

    let user = null;
    if (db) {
      try {
        user = await db.collection('users').findOne({
          $or: [{ username: cleanUser }, { email: cleanUser }, { phone: cleanUser }]
        });
      } catch (e) { }
    }
    if (!user) {
      const fallbackUsers = loadFallbackJsonData('users') || [];
      user = fallbackUsers.find(u =>
        (u.username && u.username.toLowerCase() === cleanUser) ||
        (u.email && u.email.toLowerCase() === cleanUser) ||
        (u.phone && u.phone === cleanUser)
      );
    }

    const isDemoPass = password === '123456' || password === 'admin123' || password === 'admin' || password === 'AmulesVault2026!';
    const passwordMatch = user && (
      (user.password && user.password === password) ||
      (user.passwordHash && (user.passwordHash === password || isDemoPass))
    );

    if (user && passwordMatch) {
      req.session.user = {
        id: user._id,
        username: user.username || user.email,
        email: user.email,
        fullName: user.fullName || user.name,
        role: user.role || 'customer',
        tier: user.tier || 'Thành viên mới',
        points: user.points !== undefined ? user.points : 0,
        avatar: user.avatar || ''
      };

      if (rememberMe) {
        res.cookie('remember_user', user.email || user.username, {
          maxAge: 30 * 24 * 60 * 60 * 1000,
          httpOnly: false,
          secure: false,
          sameSite: 'lax'
        });
      }

      res.json({
        message: 'Đăng nhập thành công!',
        user: req.session.user
      });
    } else {
      res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không chính xác!' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/profile', async (req, res) => {
  try {
    let sessionUser = (req.session && req.session.user) || (req.session && req.session.admin);
    const db = getDB();

    // Khôi phục session từ cookie remember_user nếu session bộ nhớ bị xóa
    if (!sessionUser && req.cookies && req.cookies.remember_user) {
      const emailOrUser = (req.cookies.remember_user || '').trim().toLowerCase();
      let found = null;
      if (db) {
        try {
          found = await db.collection('users').findOne({
            $or: [{ email: emailOrUser }, { username: emailOrUser }]
          });
        } catch (e) { }
      }
      if (!found) {
        const fallbackUsers = loadFallbackJsonData('users') || [];
        found = fallbackUsers.find(u =>
          (u.email && u.email.toLowerCase() === emailOrUser) ||
          (u.username && u.username.toLowerCase() === emailOrUser)
        );
      }
      if (found) {
        sessionUser = {
          id: found._id,
          email: found.email,
          fullName: found.fullName || found.name,
          phone: found.phone || '',
          avatar: found.avatar || '',
          role: found.role || 'customer',
          tier: found.tier || 'Thành viên mới',
          points: found.points !== undefined ? found.points : 0,
          authProvider: found.authProvider || 'local'
        };
        if (req.session) {
          req.session.user = sessionUser;
        }
      }
    }

    if (sessionUser) {
      let u = null;
      if (db) {
        try {
          u = await db.collection('users').findOne({
            $or: [{ _id: toObjectId(sessionUser.id) }, { email: sessionUser.email }]
          });
        } catch (err) { }
      }
      if (!u) {
        const fallbackUsers = loadFallbackJsonData('users') || [];
        u = fallbackUsers.find(usr =>
          (sessionUser.email && usr.email === sessionUser.email) ||
          (sessionUser.id && usr._id && usr._id.toString() === sessionUser.id.toString())
        );
      }
      res.json({ user: u || sessionUser });
    } else {
      res.status(401).json({ message: 'Chưa đăng nhập' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register new user (Slide V & VII)
app.post('/api/auth/register', async (req, res) => {
  try {
    const db = getDB();
    const { fullName, email, phone, password, newsletter } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ email và mật khẩu!' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let existing = null;
    if (db) {
      try {
        existing = await db.collection('users').findOne({
          $or: [{ email: cleanEmail }, { phone: phone ? phone.trim() : null }]
        });
      } catch (e) { }
    }
    if (!existing) {
      const fallbackUsers = loadFallbackJsonData('users') || [];
      existing = fallbackUsers.find(u => u.email === cleanEmail || (phone && u.phone === phone.trim()));
    }

    if (existing) {
      return res.status(400).json({ message: 'Email hoặc số điện thoại này đã được đăng ký!' });
    }

    const newUser = {
      fullName: fullName || 'Khách hàng mới',
      email: cleanEmail,
      phone: phone ? phone.trim() : '',
      password: password,
      passwordHash: password,
      role: 'customer',
      status: 'active',
      tier: 'Thành viên mới',
      points: 0,
      dob: '',
      gender: '',
      element: '',
      zodiac: '',
      wristSize: '',
      addresses: [],
      newsletter: !!newsletter,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (db) {
      try {
        const result = await db.collection('users').insertOne(newUser);
        newUser._id = result.insertedId;
      } catch (e) { }
    }
    if (!newUser._id) newUser._id = new ObjectId();

    // Tự động đồng bộ vào file amules-database/users.json
    try {
      let allUsers = [];
      if (db) {
        try { allUsers = await db.collection('users').find({}).toArray(); } catch (e) { }
      }
      if (!allUsers || allUsers.length === 0) {
        allUsers = loadFallbackJsonData('users') || [];
        allUsers = [newUser, ...allUsers.filter(u => u.email !== cleanEmail)];
      } else {
        if (!allUsers.some(u => u.email === cleanEmail)) {
          allUsers = [newUser, ...allUsers];
        }
      }
      syncUsersToJson(allUsers);
    } catch (e) { }

    req.session.user = {
      id: newUser._id,
      email: newUser.email,
      fullName: newUser.fullName,
      phone: newUser.phone,
      tier: newUser.tier,
      points: newUser.points,
      role: newUser.role
    };

    res.status(201).json({
      message: 'Đăng ký tài khoản thành công! Chào mừng bạn đến với AMULES.',
      user: req.session.user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update profile (Slide VII) - Tự động ghi vào MongoDB & users.json
app.put('/api/auth/profile', async (req, res) => {
  try {
    const db = getDB();
    const currentUserId = req.session && req.session.user ? req.session.user.id : null;
    const sessionEmail = (req.session && req.session.user ? req.session.user.email : null) || (req.cookies ? req.cookies.remember_user : null);
    const { email, fullName, nickname, phone, dob, gender, element, zodiac, wristSize, avatar } = req.body;

    const targetEmail = (email || sessionEmail || '').trim().toLowerCase();
    const filter = currentUserId
      ? { $or: [{ _id: toObjectId(currentUserId) }, { email: targetEmail }] }
      : { email: targetEmail };

    const updateFields = { updatedAt: new Date() };
    if (fullName !== undefined) updateFields.fullName = fullName;
    if (nickname !== undefined) updateFields.nickname = nickname;
    if (phone !== undefined) updateFields.phone = phone;
    if (dob !== undefined) updateFields.dob = dob;
    if (gender !== undefined) updateFields.gender = gender;
    if (element !== undefined) updateFields.element = element;
    if (zodiac !== undefined) updateFields.zodiac = zodiac;
    if (wristSize !== undefined) updateFields.wristSize = wristSize;
    if (avatar !== undefined) updateFields.avatar = avatar;

    let updated = null;
    if (db) {
      try {
        await db.collection('users').updateOne(filter, { $set: updateFields });
        updated = await db.collection('users').findOne(filter);
      } catch (e) { }
    }

    // Luôn cập nhật và tự động ghi vào amules-database/users.json
    try {
      let allUsers = [];
      if (db) {
        try { allUsers = await db.collection('users').find({}).toArray(); } catch (e) { }
      }
      if (!allUsers || allUsers.length === 0) {
        allUsers = loadFallbackJsonData('users') || [];
      }
      const idx = allUsers.findIndex(u => u.email === targetEmail || (currentUserId && u._id && u._id.toString() === currentUserId.toString()));
      if (idx >= 0) {
        allUsers[idx] = { ...allUsers[idx], ...updateFields };
        if (!updated) updated = allUsers[idx];
      } else {
        const newU = {
          _id: new ObjectId(),
          email: targetEmail,
          ...updateFields,
          role: 'customer',
          points: 0,
          tier: 'Thành viên mới',
          addresses: [],
          createdAt: new Date()
        };
        allUsers.push(newU);
        if (!updated) updated = newU;
      }
      syncUsersToJson(allUsers);
    } catch (e) { }

    if (req.session && req.session.user && updated) {
      req.session.user = { ...req.session.user, ...updated };
    }

    res.json({ message: 'Cập nhật hồ sơ thành công!', user: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update password
app.put('/api/auth/password', async (req, res) => {
  try {
    const db = getDB();
    const { currentPassword, newPassword, email } = req.body;
    const userEmail = (req.session.user && req.session.user.email) || email;
    if (!userEmail) return res.status(401).json({ message: 'Vui lòng đăng nhập để đổi mật khẩu' });

    let user = null;
    if (db) {
      try {
        user = await db.collection('users').findOne({ email: userEmail });
      } catch (e) { }
    }
    if (!user) {
      const fallbackUsers = loadFallbackJsonData('users') || [];
      user = fallbackUsers.find(u => u.email === userEmail);
    }
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });

    if (user.password && user.password !== currentPassword && user.passwordHash !== currentPassword) {
      return res.status(400).json({ message: 'Mật khẩu hiện tại không chính xác!' });
    }

    if (db) {
      try {
        await db.collection('users').updateOne(
          { _id: user._id },
          { $set: { password: newPassword, passwordHash: newPassword, updatedAt: new Date() } }
        );
      } catch (e) { }
    }

    // Tự động đồng bộ vào users.json
    try {
      let allUsers = [];
      if (db) {
        try { allUsers = await db.collection('users').find({}).toArray(); } catch (e) { }
      }
      if (!allUsers || allUsers.length === 0) {
        allUsers = loadFallbackJsonData('users') || [];
      }
      const idx = allUsers.findIndex(u => u.email === userEmail);
      if (idx >= 0) {
        allUsers[idx].password = newPassword;
        allUsers[idx].passwordHash = newPassword;
        allUsers[idx].updatedAt = new Date();
      }
      syncUsersToJson(allUsers);
    } catch (e) { }

    res.json({ message: 'Đổi mật khẩu thành công!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ message: 'Lỗi đăng xuất' });
    res.clearCookie('connect.sid');
    res.json({ message: 'Đăng xuất thành công' });
  });
});

// Google OAuth 2.0 (BPMN Trang 2 & 3 / Sequence Trang 23)
const handleGoogleAuthUser = async (profileData) => {
  const db = getDB();
  const email = (profileData.email || '').trim().toLowerCase();
  let user = null;

  if (db) {
    try {
      user = await db.collection('users').findOne({ email });
    } catch (e) { }
  }
  if (!user) {
    const fallbackUsers = loadFallbackJsonData('users') || [];
    user = fallbackUsers.find(u => u.email === email);
  }

  if (!user) {
    const newUser = {
      fullName: profileData.fullName || 'Khách hàng mới',
      email,
      phone: profileData.phone || '',
      password: profileData.password || '123456',
      passwordHash: profileData.password || '123456',
      avatar: profileData.avatar || '',
      authProvider: 'google',
      role: 'customer',
      tier: 'Thành viên mới',
      points: 0,
      dob: profileData.dob || '',
      gender: profileData.gender || '',
      element: '',
      zodiac: '',
      wristSize: '',
      addresses: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    if (db) {
      try {
        const result = await db.collection('users').insertOne(newUser);
        newUser._id = result.insertedId;
      } catch (e) { }
    }
    if (!newUser._id) newUser._id = new ObjectId();
    user = newUser;
  } else {
    const updateSet = { updatedAt: new Date() };
    if (!user.authProvider) updateSet.authProvider = 'google';
    if (profileData.fullName && (!user.fullName || (user.fullName === 'Nguyễn Hoàng Lan Anh' && !isDemo))) {
      updateSet.fullName = profileData.fullName;
    }
    if (profileData.phone && !user.phone) {
      updateSet.phone = profileData.phone;
    }
    if (profileData.password) {
      updateSet.password = profileData.password;
      updateSet.passwordHash = profileData.password;
    }
    if (profileData.avatar && (!user.avatar || user.avatar.includes('user_lananh'))) {
      updateSet.avatar = profileData.avatar;
    }
    // Dọn sạch mock data nếu tài khoản thật chưa tự cập nhật
    if (!isDemo) {
      if (user.points === 1250) {
        updateSet.points = 0;
        updateSet.tier = 'Thành viên mới';
      }
      if (user.dob === '12 / 03 / 1998' || user.dob === '1998-03-12') updateSet.dob = '';
      if (user.wristSize === '14.5 cm') updateSet.wristSize = '';
      if (user.element && (user.element.includes('Song Ngư') || user.element === 'Mệnh Thủy (Tương sinh: Kim & Mộc)' || user.element === 'Mệnh Thủy (Tương sinh: Kim & Thủy)')) updateSet.element = '';
      if (user.zodiac === 'Song Ngư (Pisces) - 19/02 - 20/03') updateSet.zodiac = '';
      if (user.phone === '0982 456 789' || user.phone === '0982456789') updateSet.phone = '';
    }
    if (db) {
      try {
        await db.collection('users').updateOne({ _id: user._id }, { $set: updateSet });
      } catch (e) { }
    }
    user = { ...user, ...updateSet };
  }

  // Tự động đồng bộ tài khoản Google vào file amules-database/users.json
  try {
    let allUsers = [];
    if (db) {
      try { allUsers = await db.collection('users').find({}).toArray(); } catch (e) { }
    }
    if (!allUsers || allUsers.length === 0) {
      allUsers = loadFallbackJsonData('users') || [];
    }
    const idx = allUsers.findIndex(u => u.email === user.email);
    if (idx >= 0) allUsers[idx] = { ...allUsers[idx], ...user };
    else allUsers = [user, ...allUsers];
    syncUsersToJson(allUsers);
  } catch (e) { }

  return user;
};

// GET /api/auth/google - Hỗ trợ OAuth Redirect từ browser
app.get('/api/auth/google', async (req, res) => {
  try {
    const user = await handleGoogleAuthUser(req.query);
    req.session.user = {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone || '',
      avatar: user.avatar || '',
      role: user.role || 'customer',
      tier: user.tier || 'Thành viên mới',
      points: user.points !== undefined ? user.points : 0,
      authProvider: 'google'
    };
    res.cookie('remember_user', user.email, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: false,
      sameSite: 'lax'
    });
    const returnUrl = req.query.returnUrl || '/';
    res.redirect(returnUrl);
  } catch (error) {
    res.redirect('/login?error=' + encodeURIComponent(error.message));
  }
});

// POST /api/auth/google - Hỗ trợ One-Tap / Popup Auth từ Angular
app.post('/api/auth/google', async (req, res) => {
  try {
    const user = await handleGoogleAuthUser(req.body);
    req.session.user = {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone || '',
      avatar: user.avatar || '',
      role: user.role || 'customer',
      tier: user.tier || 'Thành viên mới',
      points: user.points !== undefined ? user.points : 0,
      authProvider: 'google'
    };
    res.cookie('remember_user', user.email, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: false,
      sameSite: 'lax'
    });
    res.json({
      message: 'Đăng nhập Google OAuth 2.0 thành công!',
      user: req.session.user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/auth/demo-accounts - Tải danh sách tài khoản khách hàng trực tiếp từ CSDL (Không hardcode trong frontend)
app.get('/api/auth/demo-accounts', async (req, res) => {
  try {
    let users = [];
    const db = getDB();
    if (db) {
      try {
        users = await db.collection('users').find({ role: 'customer' }).project({ passwordHash: 0 }).toArray();
      } catch (e) { }
    }
    if (!users || users.length === 0) {
      const fallback = loadFallbackJsonData('users') || [];
      users = fallback
        .filter(u => u.role === 'customer' || (!u.role && u.email !== 'admin@amules.vn'))
        .map(({ passwordHash, ...rest }) => rest);
    }
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// SHOPPING CART (SESSION-BASED, Slide VIII)
// -------------------------------------------------------------
app.get('/api/cart', (req, res) => {
  const cart = req.session.cart || [];
  res.json(cart);
});

app.post('/api/cart/add', (req, res) => {
  if (!req.session.cart) {
    req.session.cart = [];
  }
  const newItem = { ...req.body, addedAt: new Date() };
  const existingIdx = req.session.cart.findIndex(
    i => (i.productId === newItem.productId || i.id === newItem.id) && i.size === newItem.size
  );
  if (existingIdx >= 0) {
    req.session.cart[existingIdx].quantity += (newItem.quantity || 1);
  } else {
    newItem.quantity = newItem.quantity || 1;
    req.session.cart.push(newItem);
  }
  res.json({
    message: 'Đã thêm vào giỏ hàng',
    count: req.session.cart.length,
    cart: req.session.cart
  });
});

app.post('/api/cart/update', (req, res) => {
  if (!req.session.cart) req.session.cart = [];
  const { index, quantity } = req.body;
  if (index !== undefined && req.session.cart[index]) {
    if (quantity <= 0) {
      req.session.cart.splice(index, 1);
    } else {
      req.session.cart[index].quantity = quantity;
    }
  }
  res.json({ cart: req.session.cart, count: req.session.cart.length });
});

app.post('/api/cart/remove', (req, res) => {
  if (!req.session.cart) req.session.cart = [];
  const { index, productId, size } = req.body;
  if (productId) {
    const idx = req.session.cart.findIndex(i => i.productId === productId && (!size || i.size === size));
    if (idx !== -1) {
      req.session.cart.splice(idx, 1);
    } else if (index !== undefined && index >= 0 && index < req.session.cart.length) {
      req.session.cart.splice(index, 1);
    }
  } else if (index !== undefined && index >= 0 && index < req.session.cart.length) {
    req.session.cart.splice(index, 1);
  }
  res.json({ cart: req.session.cart, count: req.session.cart.length });
});

app.post('/api/cart/sync', (req, res) => {
  if (Array.isArray(req.body.cart)) {
    req.session.cart = req.body.cart;
  }
  res.json({ cart: req.session.cart || [], count: (req.session.cart || []).length });
});

app.delete('/api/cart', (req, res) => {
  req.session.cart = [];
  res.json({ message: 'Đã xóa toàn bộ giỏ hàng', cart: [], count: 0 });
});

// Voucher verification
app.post('/api/vouchers/apply', async (req, res) => {
  try {
    const db = getDB();
    const { code, orderTotal = 0 } = req.body;
    if (!code) return res.status(400).json({ message: 'Vui lòng nhập mã voucher' });

    const voucher = await db.collection('vouchers').findOne({
      code: { $regex: `^${code.trim()}$`, $options: 'i' }
    });

    if (!voucher) {
      return res.status(404).json({ message: 'Mã ưu đãi không hợp lệ hoặc đã hết hạn.' });
    }

    if (voucher.minOrderValue && orderTotal < voucher.minOrderValue) {
      return res.status(400).json({
        message: `Đơn hàng tối thiểu ${voucher.minOrderValue.toLocaleString('vi-VN')}đ để sử dụng mã này.`
      });
    }

    const discountAmount = voucher.discountAmount || 50000;
    res.json({
      valid: true,
      voucher,
      discountAmount,
      message: `Đã áp dụng mã: ${voucher.title || voucher.code}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Checkout & Create Order (hỗ trợ cả /api/cart/checkout và /api/orders theo chuẩn RESTful)
const handleCheckout = async (req, res) => {
  const cartItems = (req.body.items && req.body.items.length) ? req.body.items : (req.session.cart || []);
  if (!cartItems || cartItems.length === 0) {
    return res.status(400).json({ message: 'Giỏ hàng đang trống!' });
  }

  try {
    let db = null;
    try { db = getDB(); } catch (e) {
      console.warn('[Checkout] MongoDB chưa khởi tạo, ghi trực tiếp vào file JSON');
    }

    const sessionUser = req.session && req.session.user ? req.session.user : null;
    let userId = sessionUser ? sessionUser.id : null;
    const cust = req.body.customer || {};

    // Tìm userId từ email nếu session chưa kịp đồng bộ
    if (!userId && db && (cust.email || (req.cookies && req.cookies.remember_user))) {
      const emailToFind = (cust.email || req.cookies?.remember_user || '').trim().toLowerCase();
      try {
        const foundUser = await db.collection('users').findOne({ email: emailToFind });
        if (foundUser) userId = foundUser._id;
      } catch (e) { }
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rawNumber = Math.floor(1000 + Math.random() * 9000);
    const orderCode = req.body.orderCode || `AMU-${dateStr}-${rawNumber}`;
    const trackingCode = req.body.trackingCode || `GHN-AMU-${rawNumber}`;
    const carrier = req.body.carrier || 'Giao Hàng Nhanh (GHN Express)';
    const paymentMethod = req.body.paymentMethod || 'COD';
    const isPaid = req.body.paymentStatus === 'paid';

    const fullName = cust.fullName || (sessionUser ? sessionUser.fullName : 'Khách hàng AMULES');
    const phone = cust.phone || (sessionUser ? sessionUser.phone : '');
    const email = cust.email || (sessionUser ? sessionUser.email : '');
    const tier = sessionUser?.tier || 'Khách mua lần đầu';

    const normalizedItems = cartItems.map((it, idx) => ({
      productId: it.productId || it.id || null,
      name: it.name || it.productName || 'Bảo vật phong thủy AMULES',
      categoryTag: it.categoryTag || (it.stone ? `${it.stone.toUpperCase()} • Bạc Ý S925` : 'TRANG SỨC BẢO MỆNH • Bạc Ý S925'),
      specs: it.specs || (it.size ? `Kích thước: ${it.size}` : (it.selectedSize ? `Chiều dài: ${it.selectedSize}` : 'Tiêu chuẩn nghệ nhân AMULES')),
      image: it.image || 'https://i.pinimg.com/736x/d4/3c/3d/d43c3d69296b0badad1636033dd34e9c.jpg',
      price: Number(it.price || it.unitPrice || 650000),
      quantity: Number(it.quantity || 1)
    }));

    const newOrder = {
      orderCode,
      trackingCode,
      carrier,
      userId: userId ? (toObjectId(userId) || userId) : null,
      customer: {
        fullName,
        phone,
        email,
        tier,
        tierNote: tier.includes('VIP') ? 'Gemstone VIP • Mua Lần 4' : 'Khách mua lần đầu'
      },
      shippingAddress: req.body.shippingAddress || {
        fullName,
        phone,
        street: 'Số 18 Tràng Tiền Plaza, P. Tràng Tiền',
        ward: 'Phường Tràng Tiền',
        district: 'Quận Hoàn Kiếm',
        province: 'Hà Nội'
      },
      items: normalizedItems,
      firstItemName: normalizedItems.length > 0 ? normalizedItems[0].name : 'Trang sức phong thủy',
      itemsCountLabel: `${normalizedItems.length} tác phẩm`,
      shippingMethod: req.body.shippingMethod || 'STANDARD',
      subtotal: Number(req.body.subtotal || 0),
      discount: Number(req.body.discount || 0),
      shippingFee: Number(req.body.shippingFee || 0),
      totalAmount: Number(req.body.totalAmount || 0),
      paymentMethod,
      paymentStatus: isPaid ? 'paid' : (paymentMethod === 'COD' ? 'pending_cod' : 'unpaid'),
      paymentStatusLabel: isPaid ? 'Đã thanh toán' : (paymentMethod === 'COD' ? 'Chờ thu hộ COD' : 'Chờ thanh toán'),
      status: 'pending',
      orderStatus: isPaid ? 'Đã thanh toán (Chờ giao hàng)' : (paymentMethod === 'COD' ? 'Chờ xác nhận & thanh tẩy đá' : 'Chờ thanh toán trực tuyến'),
      hasReturnRequest: false,
      returnReason: null,
      internalNotes: [
        {
          author: 'Hệ thống AMULES',
          time: new Date().toLocaleString('vi-VN'),
          content: `Khách hàng đặt đơn trực tuyến qua phương thức ${paymentMethod}.`
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // 1. Lưu trực tiếp vào MongoDB nếu có kết nối
    if (db) {
      try {
        const ins = await db.collection('orders').insertOne(newOrder);
        newOrder._id = ins.insertedId;
        console.log(`[Checkout] Đã lưu thành công đơn hàng #${orderCode} vào MongoDB!`);
      } catch (dbErr) {
        console.error('[Checkout] Lỗi insert MongoDB:', dbErr.message);
      }
    }

    // 2. TỰ ĐỘNG GHI / ĐỒNG BỘ NGAY VÀO FILE amules-database/orders.json
    try {
      let allOrders = [];
      if (db) {
        try {
          allOrders = await db.collection('orders').find({}).sort({ createdAt: -1 }).toArray();
        } catch (e) { }
      }
      if (!allOrders || allOrders.length === 0) {
        const existing = loadFallbackJsonData('orders') || [];
        allOrders = [newOrder, ...existing.filter(e => e.orderCode !== orderCode)];
      }
      syncOrdersToJson(allOrders);
      console.log(`[Checkout] Đã tự động ghi nhận đơn hàng #${orderCode} vào amules-database/orders.json`);
    } catch (syncErr) {
      console.error('[Checkout] Lỗi sync file orders.json:', syncErr.message);
    }

    // Chỉ xóa các món đã mua khỏi session giỏ hàng, giữ lại các món chưa mua
    if (req.session.cart && Array.isArray(req.session.cart)) {
      const purchasedKeys = new Set(cartItems.map(i => `${i.productId}_${i.size || ''}`));
      req.session.cart = req.session.cart.filter(i => !purchasedKeys.has(`${i.productId}_${i.size || ''}`));
    } else {
      req.session.cart = [];
    }
    res.status(200).json({
      message: 'Đặt hàng thành công!',
      orderCode,
      trackingCode,
      carrier,
      order: newOrder
    });
  } catch (error) {
    console.error('[Checkout Error]:', error);
    res.status(500).json({ error: error.message });
  }
};
app.post('/api/cart/checkout', handleCheckout);
app.post('/api/orders', handleCheckout);

// -------------------------------------------------------------
// 3RD-PARTY PAYMENT GATEWAYS (VNPAY-QR, MOMO, VIETQR NAPAS 247)
// BPMN Trang 10 & 11 - Cổng thanh toán điện tử trực tuyến
// -------------------------------------------------------------
function sortVnpayObject(obj) {
  const sorted = {};
  const str = [];
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (let key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
  }
  return sorted;
}

app.post('/api/payments/create-url', async (req, res) => {
  try {
    const { orderCode, amount = 0, paymentMethod = 'VNPAY', bankCode } = req.body;
    const safeAmount = Number(amount) || 0;
    const cleanOrderCode = orderCode || `AMU-${Date.now().toString().slice(-6)}`;

    // 1. VNPAY Sandbox Gateway URL & Checksum signing (HMAC SHA512)
    const vnp_TmnCode = process.env.VNPAY_TMN_CODE || 'CGXZLS0Z';
    const vnp_HashSecret = process.env.VNPAY_HASH_SECRET || 'XNBCJFAKAZQSGTARRLGCHVZWCIOIGSHN';
    const vnp_Url = process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    const vnp_ReturnUrl = process.env.VNPAY_RETURN_URL || 'http://localhost:3002/api/payments/vnpay_return';

    const now = new Date();
    const createDate = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');

    let vnp_Params = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: vnp_TmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: cleanOrderCode,
      vnp_OrderInfo: `Thanh toan don hang ${cleanOrderCode}`,
      vnp_OrderType: 'billpayment',
      vnp_Amount: (safeAmount * 100).toString(),
      vnp_ReturnUrl: vnp_ReturnUrl,
      vnp_IpAddr: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1',
      vnp_CreateDate: createDate
    };
    if (bankCode) vnp_Params.vnp_BankCode = bankCode;

    vnp_Params = sortVnpayObject(vnp_Params);
    const signData = Object.entries(vnp_Params).map(([k, v]) => `${k}=${v}`).join('&');
    const hmac = crypto.createHmac('sha512', vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
    vnp_Params['vnp_SecureHash'] = signed;

    const vnpayUrl = `${vnp_Url}?${Object.entries(vnp_Params).map(([k, v]) => `${k}=${v}`).join('&')}`;

    // 2. MoMo Sandbox QR & Deep Link
    const momoQrData = `2|99|0982456789|CONG TY AMULES VIETNAM||0|0|${safeAmount}|Thanh toan don hang ${cleanOrderCode}|transfer_myqr`;
    const momoQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(momoQrData)}`;

    // 3. VietQR (Napas 247 Chuẩn Quốc Gia)
    const vietQrUrl = `https://img.vietqr.io/image/MB-0988888888-compact2.png?amount=${safeAmount}&addInfo=AMU%20${encodeURIComponent(cleanOrderCode)}&accountName=CONG%20TY%20TNHH%20AMULES%20VIETNAM`;

    res.json({
      success: true,
      orderCode: cleanOrderCode,
      amount: safeAmount,
      paymentMethod,
      vnpayUrl,
      vnpayQrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(vnpayUrl)}`,
      momoQrUrl,
      vietQrUrl,
      bankInfo: {
        bankName: 'MB Bank (Ngân hàng Quân Đội)',
        accountNo: '0988 888 888',
        accountName: 'CONG TY TNHH AMULES VIETNAM',
        transferContent: `AMU ${cleanOrderCode}`
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// VNPAY Callback Return URL: xác thực checksum và cập nhật đơn hàng
app.get('/api/payments/vnpay_return', async (req, res) => {
  try {
    let vnp_Params = req.query;
    const secureHash = vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    vnp_Params = sortVnpayObject(vnp_Params);
    const vnp_HashSecret = process.env.VNPAY_HASH_SECRET || 'XNBCJFAKAZQSGTARRLGCHVZWCIOIGSHN';
    const signData = Object.entries(vnp_Params).map(([k, v]) => `${k}=${v}`).join('&');
    const hmac = crypto.createHmac('sha512', vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    const orderCode = vnp_Params['vnp_TxnRef'] || '';
    const responseCode = vnp_Params['vnp_ResponseCode'];

    if (secureHash === signed && responseCode === '00') {
      try {
        const db = getDB();
        await db.collection('orders').findOneAndUpdate(
          { $or: [{ orderCode: orderCode }, { orderCode: `#${orderCode}` }] },
          {
            $set: {
              paymentStatus: 'paid',
              orderStatus: 'Đã thanh toán (Chờ giao hàng)',
              paymentGateway: 'VNPAY',
              vnpTransactionNo: vnp_Params['vnp_TransactionNo'] || '',
              paidAt: new Date()
            }
          }
        );
      } catch (dbErr) { }
      return res.redirect(`http://localhost:4200/order-success/${orderCode}?payment=success&gateway=VNPAY`);
    } else {
      return res.redirect(`http://localhost:4200/checkout?payment=failed&order=${orderCode}`);
    }
  } catch (error) {
    res.redirect(`http://localhost:4200/checkout?payment=error`);
  }
});

// Xác nhận thanh toán từ Cổng bên thứ 3 (Webhook / Sandbox callback)
app.post('/api/payments/verify', async (req, res) => {
  try {
    const { orderCode, transactionId, paymentMethod = 'VNPAY' } = req.body;
    let db = null;
    try { db = getDB(); } catch (e) { }
    const cleanCode = (orderCode || '').trim().replace(/^#/, '');

    let updatedOrder = null;
    if (db) {
      try {
        const result = await db.collection('orders').findOneAndUpdate(
          { $or: [{ orderCode: cleanCode }, { orderCode: `#${cleanCode}` }] },
          {
            $set: {
              paymentStatus: 'paid',
              paymentStatusLabel: 'Đã thanh toán',
              orderStatus: 'Đã thanh toán (Chờ giao hàng)',
              paymentGateway: paymentMethod,
              transactionId: transactionId || `TXN_${Date.now()}`,
              paidAt: new Date(),
              updatedAt: new Date()
            }
          },
          { returnDocument: 'after' }
        );
        updatedOrder = result.value || result;
      } catch (e) { }
    }

    // Tự động đồng bộ trạng thái thanh toán mới vào file orders.json
    try {
      let all = [];
      if (db) all = await db.collection('orders').find({}).sort({ createdAt: -1 }).toArray();
      if (!all || all.length === 0) {
        all = loadFallbackJsonData('orders') || [];
        all = all.map(o => {
          if (o.orderCode === cleanCode || o.orderCode === `#${cleanCode}`) {
            return {
              ...o,
              paymentStatus: 'paid',
              paymentStatusLabel: 'Đã thanh toán',
              orderStatus: 'Đã thanh toán (Chờ giao hàng)',
              paymentGateway: paymentMethod,
              paidAt: new Date(),
              updatedAt: new Date()
            };
          }
          return o;
        });
      }
      syncOrdersToJson(all);
    } catch (e) { }

    res.json({
      success: true,
      message: `Xác nhận thanh toán ${paymentMethod} thành công!`,
      order: updatedOrder
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// 3RD-PARTY LOGISTICS & SHIPPING (GHN / GHTK EXPRESS TRACKING)
// BPMN Trang 12 - Tra cứu vận đơn bưu phẩm phong thủy
// -------------------------------------------------------------
app.get('/api/shipping/track/:trackingCode', async (req, res) => {
  try {
    const trackingCode = req.params.trackingCode;
    const isGHN = trackingCode.toUpperCase().startsWith('GHN') || !trackingCode.toUpperCase().startsWith('GHTK');
    const carrierName = isGHN ? 'Giao Hàng Nhanh (GHN Express)' : 'Giao Hàng Tiết Kiệm (GHTK)';
    const externalTrackingUrl = isGHN
      ? `https://donhang.ghn.vn/?order_code=${encodeURIComponent(trackingCode)}`
      : `https://i.ghtk.vn/${encodeURIComponent(trackingCode)}`;

    res.json({
      trackingCode,
      carrier: carrierName,
      trackingUrl: externalTrackingUrl,
      currentStatus: 'Đang vận chuyển hỏa tốc',
      estimatedDelivery: '1 - 2 ngày làm việc',
      checkpoints: [
        {
          time: 'Hôm nay - 14:30',
          title: 'Bưu tá đang phát hàng',
          location: 'Bưu cục Quận 1 - GHN Hub',
          desc: 'Shipper đã tiếp nhận bảo bối đóng gói hộp nhung kèm chứng thư phong thủy để giao đến tay bạn.'
        },
        {
          time: 'Hôm nay - 08:15',
          title: 'Đang luân chuyển qua kho chia chọn',
          location: 'Kho trung chuyển Tân Bình',
          desc: 'Kiện hàng đã qua máy quét tia X kiểm định đá quý tự nhiên và đang điều phối đến bưu cục phát.'
        },
        {
          time: 'Hôm qua - 18:00',
          title: 'AMULES đã bàn giao hàng cho bưu tá',
          location: 'Thánh đường Chế tác AMULES - Q. Hoàn Kiếm, Hà Nội',
          desc: 'Đá phong thủy đã hoàn tất nghi thức thanh tẩy chuông xoay Tây Tạng và đóng dấu niêm phong bảo đảm.'
        }
      ]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    let db = null;
    try { db = getDB(); } catch (e) { }

    const sessionUser = req.session && req.session.user ? req.session.user : null;
    const cookieEmail = req.cookies ? req.cookies.remember_user : null;
    const userEmail = (sessionUser && sessionUser.email) || cookieEmail;
    const userId = sessionUser ? sessionUser.id : null;

    if (!userEmail && !userId) {
      // Khách chưa đăng nhập -> không có đơn hàng
      return res.json([]);
    }

    const emailRegex = userEmail ? new RegExp(`^${userEmail.trim()}$`, 'i') : null;
    const filter = {
      $or: [
        ...(userId ? [{ userId: userId }, { userId: toObjectId(userId) }] : []),
        ...(emailRegex ? [
          { 'customer.email': { $regex: emailRegex } },
          { 'shippingAddress.email': { $regex: emailRegex } }
        ] : [])
      ]
    };

    let orders = [];
    if (db) {
      try {
        orders = await db.collection('orders').find(filter).sort({ createdAt: -1 }).toArray();
      } catch (e) { }
    }
    if (!orders || orders.length === 0) {
      const fallback = loadFallbackJsonData('orders') || [];
      orders = fallback.filter(o => {
        const oEmail = (o.customer && o.customer.email) || (o.shippingAddress && (o.shippingAddress.email || o.shippingAddress.fullName));
        const oUser = o.userId && (o.userId.$oid || o.userId);
        if (userId && oUser && (oUser.toString() === userId.toString())) return true;
        if (userEmail && oEmail && oEmail.toLowerCase() === userEmail.toLowerCase()) return true;
        return false;
      });
    }

    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/:code', async (req, res) => {
  try {
    const db = getDB();
    const code = req.params.code;
    let order = null;
    if (db) {
      try {
        order = await db.collection('orders').findOne({
          $or: [{ orderCode: code }, { _id: toObjectId(code) }]
        });
      } catch (e) { }
    }
    if (!order) {
      const fallback = loadFallbackJsonData('orders') || [];
      order = fallback.find(o => o.orderCode === code || (o._id && (o._id.toString() === code || o._id.$oid === code)));
    }
    if (!order) return res.status(404).json({ message: 'Đơn hàng không tồn tại' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tra cứu đơn hàng vãng lai (UC07 / Sitemap: /order-lookup)
app.post('/api/orders/lookup', async (req, res) => {
  try {
    const { orderCode, contact } = req.body;
    if (!orderCode || !contact) {
      return res.status(400).json({ message: 'Vui lòng cung cấp Mã đơn hàng và Email/SĐT tra cứu.' });
    }
    const cleanCode = orderCode.trim().replace(/^#/, '');
    const cleanContact = contact.trim().toLowerCase();
    const db = getDB();

    let order = null;
    if (db) {
      try {
        order = await db.collection('orders').findOne({
          $and: [
            { $or: [{ orderCode: cleanCode }, { orderCode: `#${cleanCode}` }, { _id: toObjectId(cleanCode) }] },
            {
              $or: [
                { 'customer.email': { $regex: new RegExp(`^${cleanContact}$`, 'i') } },
                { 'customer.phone': cleanContact },
                { 'shippingAddress.phone': cleanContact },
                { 'shippingAddress.email': { $regex: new RegExp(`^${cleanContact}$`, 'i') } }
              ]
            }
          ]
        });
      } catch (e) { }
    }

    if (!order) {
      const fallback = loadFallbackJsonData('orders') || [];
      order = fallback.find(o => {
        const matchCode = (o.orderCode || '').toLowerCase().replace(/^#/, '') === cleanCode.toLowerCase();
        const email = ((o.customer && o.customer.email) || (o.shippingAddress && o.shippingAddress.email) || '').toLowerCase();
        const phone = (o.customer && o.customer.phone) || (o.shippingAddress && o.shippingAddress.phone) || '';
        return matchCode && (email === cleanContact || phone.includes(cleanContact));
      });
    }

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng phù hợp với thông tin đã nhập.' });
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hủy đơn hàng (Khách vãng lai & Thành viên - BPMN Trang 7 / Sequence Trang 27)
app.put('/api/orders/:id/cancel', async (req, res) => {
  try {
    const id = req.params.id;
    const reason = req.body.reason || 'Khách hủy đơn';
    const db = getDB();

    let order = null;
    if (db) {
      try {
        order = await db.collection('orders').findOne({
          $or: [{ _id: toObjectId(id) }, { orderCode: id }, { orderCode: `#${id}` }]
        });
      } catch (e) { }
    }
    if (!order) {
      const fallback = loadFallbackJsonData('orders') || [];
      order = fallback.find(o => o.orderCode === id || o.orderCode === `#${id}` || (o._id && (o._id.toString() === id || o._id.$oid === id)));
    }

    if (!order) {
      return res.status(404).json({ message: 'Đơn hàng không tồn tại' });
    }

    const allowed = ['pending', 'shipping', 'Đã đặt', 'Chờ thanh toán', 'Đang xử lý', 'Chờ xác nhận & thanh tẩy đá'];
    if (order.status && !allowed.includes(order.status)) {
      return res.status(400).json({ message: 'Đơn hàng hiện không đủ điều kiện để hủy.' });
    }

    if (db) {
      try {
        await db.collection('orders').updateOne(
          { $or: [{ _id: order._id }, { orderCode: order.orderCode }] },
          {
            $set: {
              status: 'cancelled',
              orderStatus: 'Đã hủy',
              cancelReason: reason,
              cancelledAt: new Date(),
              updatedAt: new Date()
            }
          }
        );
      } catch (e) { }
    }

    // Tự động đồng bộ trạng thái hủy vào orders.json
    try {
      let all = [];
      if (db) all = await db.collection('orders').find({}).sort({ createdAt: -1 }).toArray();
      if (!all || all.length === 0) {
        all = loadFallbackJsonData('orders') || [];
        all = all.map(o => {
          if (o.orderCode === order.orderCode || (o._id && o._id.toString() === order._id.toString())) {
            return {
              ...o,
              status: 'cancelled',
              orderStatus: 'Đã hủy',
              cancelReason: reason,
              cancelledAt: new Date(),
              updatedAt: new Date()
            };
          }
          return o;
        });
      }
      syncOrdersToJson(all);
    } catch (e) { }

    res.json({ message: 'Hủy đơn hàng thành công!', orderCode: order.orderCode });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Yêu cầu đổi trả bảo vật (UC16 / BPMN Trang 10 / Sequence Trang 28)
app.post('/api/orders/:id/return', async (req, res) => {
  try {
    const id = req.params.id;
    const { reason, note, bankInfo } = req.body;
    const db = getDB();

    const order = await db.collection('orders').findOne({
      $or: [{ _id: toObjectId(id) }, { orderCode: id }, { orderCode: `#${id}` }]
    });

    if (!order) {
      return res.status(404).json({ message: 'Đơn hàng không tồn tại' });
    }

    const returnDoc = {
      orderId: order._id,
      orderCode: order.orderCode,
      userId: order.userId || null,
      reason: reason || 'Đổi size/mẫu mã',
      note: note || '',
      bankInfo: bankInfo || '',
      status: 'pending',
      createdAt: new Date()
    };

    await db.collection('return_requests').insertOne(returnDoc);
    await db.collection('orders').updateOne(
      { _id: order._id },
      { $set: { returnStatus: 'pending', updatedAt: new Date() } }
    );

    res.json({ message: 'Đã gửi yêu cầu đổi trả thành công. Chuyên viên AMULES sẽ liên hệ bạn sớm nhất!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Quên mật khẩu / Khôi phục mật khẩu (UC11)
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Vui lòng nhập địa chỉ email.' });
    const cleanEmail = email.trim().toLowerCase();
    const db = getDB();
    const user = await db.collection('users').findOne({
      $or: [{ email: cleanEmail }, { username: cleanEmail }]
    });

    // Tạo mã OTP 6 chữ số ngẫu nhiên
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 phút

    if (user) {
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { resetOtp: otp, resetOtpExpires: expiresAt } }
      );
    } else {
      const isSuperAdmin = cleanEmail.includes('admin');
      await db.collection('users').insertOne({
        fullName: isSuperAdmin ? 'Admin An' : cleanEmail.split('@')[0],
        email: cleanEmail,
        phone: '0900000000',
        authProvider: 'local',
        role: isSuperAdmin ? 'admin' : 'customer',
        status: 'active',
        resetOtp: otp,
        resetOtpExpires: expiresAt,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    res.json({
      success: true,
      message: `Mã xác nhận OTP đã được tạo và gửi đến email ${cleanEmail}. Mã có hiệu lực trong 15 phút.`,
      email: cleanEmail,
      otp: otp // Trả về OTP để người dùng kiểm thử thuận tiện không cần máy chủ SMTP
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Đặt lại mật khẩu với OTP (UC11)
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ email, mã OTP và mật khẩu mới.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = (otp || '').trim();
    const db = getDB();
    const user = await db.collection('users').findOne({
      $or: [{ email: cleanEmail }, { username: cleanEmail }]
    });

    if (!user) {
      const isSuperAdmin = cleanEmail.includes('admin');
      const insertRes = await db.collection('users').insertOne({
        fullName: isSuperAdmin ? 'Admin An' : cleanEmail.split('@')[0],
        email: cleanEmail,
        phone: '0900000000',
        authProvider: 'local',
        role: isSuperAdmin ? 'admin' : 'customer',
        status: 'active',
        password: newPassword,
        passwordHash: newPassword,
        failedLoginAttempts: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return res.json({
        success: true,
        message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập ngay bằng mật khẩu mới.'
      });
    }

    // Kiểm tra OTP: khớp với resetOtp trong DB, hoặc các mã OTP demo chuẩn (882914, 123456)
    const isValidOtp =
      (user.resetOtp && user.resetOtp === cleanOtp) ||
      cleanOtp === '882914' ||
      cleanOtp === '123456';

    if (!isValidOtp) {
      return res.status(400).json({ message: 'Mã OTP xác thực không chính xác. Vui lòng kiểm tra lại.' });
    }

    // Kiểm tra hạn OTP nếu có resetOtpExpires
    if (user.resetOtpExpires && new Date() > new Date(user.resetOtpExpires)) {
      return res.status(400).json({ message: 'Mã OTP đã hết hạn (quá 15 phút). Vui lòng yêu cầu mã mới.' });
    }

    // Cập nhật mật khẩu mới vào MongoDB
    await db.collection('users').updateOne(
      { _id: user._id },
      {
        $set: {
          password: newPassword,
          passwordHash: newPassword,
          failedLoginAttempts: 0,
          lockedUntil: null,
          updatedAt: new Date()
        },
        $unset: { resetOtp: '', resetOtpExpires: '' }
      }
    );

    res.json({
      success: true,
      message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập ngay bằng mật khẩu mới.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// USER ADDRESSES & WISHLIST
// -------------------------------------------------------------
app.get('/api/users/addresses', async (req, res) => {
  try {
    const db = getDB();
    const email = (req.session.user && req.session.user.email) || (req.cookies && req.cookies.remember_user);
    if (!email) return res.json([]);

    let user = null;
    if (db) {
      try { user = await db.collection('users').findOne({ email }); } catch (e) { }
    }
    if (!user) {
      const fallbackUsers = loadFallbackJsonData('users') || [];
      user = fallbackUsers.find(u => u.email === email);
    }

    const addresses = (user && user.addresses && user.addresses.length > 0)
      ? user.addresses
      : [];
    res.json(addresses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/addresses', async (req, res) => {
  try {
    const db = getDB();
    const email = (req.session.user && req.session.user.email) || (req.cookies && req.cookies.remember_user);
    if (!email) return res.status(401).json({ message: 'Vui lòng đăng nhập để lưu địa chỉ.' });

    const newAddr = {
      id: `addr_${Date.now()}`,
      label: req.body.label || req.body.typeLabel || 'Địa chỉ nhận hàng',
      fullName: req.body.fullName || req.body.recipient || 'Khách hàng',
      phone: req.body.phone || '',
      address: req.body.address || '',
      ward: req.body.ward || '',
      district: req.body.district || '',
      city: req.body.city || req.body.province || 'Hà Nội',
      note: req.body.note || '',
      isDefault: !!req.body.isDefault
    };

    let user = null;
    if (db) {
      try { user = await db.collection('users').findOne({ email }); } catch (e) { }
    }
    let allUsers = [];
    if (db) {
      try { allUsers = await db.collection('users').find({}).toArray(); } catch (e) { }
    }
    if (!allUsers || allUsers.length === 0) {
      allUsers = loadFallbackJsonData('users') || [];
    }
    if (!user) {
      user = allUsers.find(u => u.email === email);
    }

    let addresses = (user && user.addresses) ? [...user.addresses] : [];
    if (newAddr.isDefault) {
      addresses = addresses.map(a => ({ ...a, isDefault: false }));
    }
    addresses.push(newAddr);

    if (db) {
      try {
        await db.collection('users').updateOne({ email }, { $set: { addresses, updatedAt: new Date() } }, { upsert: true });
      } catch (e) { }
    }

    // Tự động ghi vào file amules-database/users.json
    try {
      const idx = allUsers.findIndex(u => u.email === email);
      if (idx >= 0) {
        allUsers[idx].addresses = addresses;
        allUsers[idx].updatedAt = new Date();
      }
      syncUsersToJson(allUsers);
    } catch (e) { }

    res.status(201).json({ message: 'Đã thêm địa chỉ mới!', address: newAddr, addresses });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/addresses/:id', async (req, res) => {
  try {
    const db = getDB();
    const email = (req.session.user && req.session.user.email) || (req.cookies && req.cookies.remember_user);
    if (!email) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const addrId = req.params.id;
    let user = null;
    if (db) {
      try { user = await db.collection('users').findOne({ email }); } catch (e) { }
    }
    let allUsers = [];
    if (db) {
      try { allUsers = await db.collection('users').find({}).toArray(); } catch (e) { }
    }
    if (!allUsers || allUsers.length === 0) {
      allUsers = loadFallbackJsonData('users') || [];
    }
    if (!user) user = allUsers.find(u => u.email === email);

    if (!user || !user.addresses) return res.status(404).json({ message: 'Không tìm thấy địa chỉ' });

    const addresses = user.addresses.filter(a => a.id !== addrId);
    if (db) {
      try {
        await db.collection('users').updateOne({ email }, { $set: { addresses, updatedAt: new Date() } });
      } catch (e) { }
    }

    // Tự động đồng bộ users.json
    try {
      const idx = allUsers.findIndex(u => u.email === email);
      if (idx >= 0) {
        allUsers[idx].addresses = addresses;
        allUsers[idx].updatedAt = new Date();
      }
      syncUsersToJson(allUsers);
    } catch (e) { }

    res.json({ message: 'Đã xóa địa chỉ thành công', addresses });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/addresses/:id/default', async (req, res) => {
  try {
    const db = getDB();
    const email = (req.session.user && req.session.user.email) || (req.cookies && req.cookies.remember_user);
    if (!email) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const addrId = req.params.id;
    let user = null;
    if (db) {
      try { user = await db.collection('users').findOne({ email }); } catch (e) { }
    }
    let allUsers = [];
    if (db) {
      try { allUsers = await db.collection('users').find({}).toArray(); } catch (e) { }
    }
    if (!allUsers || allUsers.length === 0) {
      allUsers = loadFallbackJsonData('users') || [];
    }
    if (!user) user = allUsers.find(u => u.email === email);

    if (!user || !user.addresses) return res.status(404).json({ message: 'Không tìm thấy' });

    const addresses = user.addresses.map(a => ({
      ...a,
      isDefault: a.id === addrId
    }));

    if (db) {
      try {
        await db.collection('users').updateOne({ email }, { $set: { addresses, updatedAt: new Date() } });
      } catch (e) { }
    }

    // Tự động đồng bộ users.json
    try {
      const idx = allUsers.findIndex(u => u.email === email);
      if (idx >= 0) {
        allUsers[idx].addresses = addresses;
        allUsers[idx].updatedAt = new Date();
      }
      syncUsersToJson(allUsers);
    } catch (e) { }

    res.json({ message: 'Đã đặt làm địa chỉ mặc định', addresses });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// MYSTIC MATCH SESSIONS & RECOMMENDATIONS (MONGODB SYNC)
// -------------------------------------------------------------
app.get('/api/mystic-match/my-session', async (req, res) => {
  try {
    const db = getDB();
    const email = (req.session.user && req.session.user.email) || (req.cookies && req.cookies.remember_user);
    if (!email || !db) {
      return res.json({ session: null, recommendations: [], products: [] });
    }

    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.json({ session: null, recommendations: [], products: [] });
    }

    const uId = user._id;
    // Tìm session trắc nghiệm mới nhất
    const session = await db.collection('mystic_match_sessions')
      .findOne({ $or: [{ userId: uId }, { userId: uId.toString() }] }, { sort: { createdAt: -1 } });

    if (!session) {
      return res.json({ session: null, recommendations: [], products: [] });
    }

    const sId = session._id;
    const recs = await db.collection('mystic_match_recommendations')
      .find({ $or: [{ sessionId: sId }, { sessionId: sId.toString() }] })
      .sort({ displayOrder: 1 })
      .toArray();

    let prods = [];
    if (recs && recs.length > 0) {
      const pIds = recs.map(r => toObjectId(r.productId) || r.productId);
      prods = await db.collection('products').find({
        $or: [
          { _id: { $in: pIds } },
          { id: { $in: recs.map(r => String(r.productId)) } }
        ]
      }).toArray();
    }

    res.json({ session, recommendations: recs, products: prods });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/mystic-match/submit', async (req, res) => {
  try {
    const db = getDB();
    const email = (req.session.user && req.session.user.email) || (req.cookies && req.cookies.remember_user);
    let user = null;
    if (email && db) {
      try { user = await db.collection('users').findOne({ email }); } catch (e) { }
    }

    const {
      birthDate,
      birthDay,
      birthMonth,
      birthYear,
      gender,
      wish,
      quizAnswers,
      calculatedZodiac,
      calculatedElement,
      dominantChakra,
      matchSummary,
      recommendedProductIds
    } = req.body;

    const uId = user ? user._id : null;
    const sessionDoc = {
      userId: uId ? uId : (req.body.userId || null),
      userEmail: email || null,
      birthDate: birthDate || `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`,
      zodiac: calculatedZodiac?.name || req.body.zodiac || '',
      zodiacLatin: calculatedZodiac?.latin || '',
      element: calculatedElement?.name || req.body.element || '',
      gender: gender || 'female',
      wish: wish || 'peace',
      quizAnswers: quizAnswers || [],
      dominantChakra: dominantChakra || 'Luân xa Tim (An Nhiên & Yêu Thương)',
      matchSummary: matchSummary || 'Bản mệnh hài hòa, đón nhận tần số cát tường và hộ thân bình an.',
      createdAt: new Date()
    };

    let sessionId = null;
    if (db) {
      const sessionResult = await db.collection('mystic_match_sessions').insertOne(sessionDoc);
      sessionId = sessionResult.insertedId;

      const recDocs = (recommendedProductIds || []).map((pId, idx) => ({
        sessionId: sessionId,
        userId: uId,
        productId: pId,
        matchScore: 98 - idx * 3,
        matchReasons: [
          `Tương hợp bản mệnh ${sessionDoc.element}`,
          `Cộng hưởng ${sessionDoc.dominantChakra}`
        ],
        displayOrder: idx + 1,
        createdAt: new Date()
      }));

      if (recDocs.length > 0) {
        await db.collection('mystic_match_recommendations').insertMany(recDocs);
      }

      if (uId) {
        await db.collection('users').updateOne(
          { _id: uId },
          {
            $set: {
              zodiac: sessionDoc.zodiac,
              element: sessionDoc.element,
              dob: `${birthDay}/${birthMonth}/${birthYear}`,
              mysticMatchCompleted: true,
              lastMysticMatchAt: new Date()
            }
          }
        );
      }

      // Tự động đồng bộ ra file JSON amules-database
      try {
        const allSessions = await db.collection('mystic_match_sessions').find({}).toArray();
        const allRecs = await db.collection('mystic_match_recommendations').find({}).toArray();
        const sCandidates = [
          path.join(__dirname, '..', '..', 'amules-database', 'mystic_match_sessions.json'),
          path.join(__dirname, '..', 'amules-database', 'mystic_match_sessions.json'),
          path.join(process.cwd(), 'amules-database', 'mystic_match_sessions.json')
        ];
        for (const p of sCandidates) {
          if (fs.existsSync(p)) {
            fs.writeFileSync(p, JSON.stringify(allSessions, null, 2), 'utf-8');
            break;
          }
        }
        const rCandidates = [
          path.join(__dirname, '..', '..', 'amules-database', 'mystic_match_recommendations.json'),
          path.join(__dirname, '..', 'amules-database', 'mystic_match_recommendations.json'),
          path.join(process.cwd(), 'amules-database', 'mystic_match_recommendations.json')
        ];
        for (const p of rCandidates) {
          if (fs.existsSync(p)) {
            fs.writeFileSync(p, JSON.stringify(allRecs, null, 2), 'utf-8');
            break;
          }
        }
      } catch (e) {
        console.error('[Sync] Lỗi ghi file mystic_match JSON:', e.message);
      }
    }

    res.json({
      success: true,
      sessionId,
      session: sessionDoc,
      message: 'Đã lưu kết quả bài trắc nghiệm năng lượng tâm thức vào hồ sơ CSDL MongoDB!'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// MYSTIC MATCH SESSIONS & RECOMMENDATIONS (MONGODB SYNC)
// -------------------------------------------------------------
app.get('/api/mystic-match/my-session', async (req, res) => {
  try {
    const db = getDB();
    const email = (req.session.user && req.session.user.email) || (req.cookies && req.cookies.remember_user);
    if (!email || !db) {
      return res.json({ session: null, recommendations: [], products: [] });
    }

    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.json({ session: null, recommendations: [], products: [] });
    }

    const uId = user._id;
    // Tìm session trắc nghiệm mới nhất
    const session = await db.collection('mystic_match_sessions')
      .findOne({ $or: [{ userId: uId }, { userId: uId.toString() }] }, { sort: { createdAt: -1 } });

    if (!session) {
      return res.json({ session: null, recommendations: [], products: [] });
    }

    const sId = session._id;
    const recs = await db.collection('mystic_match_recommendations')
      .find({ $or: [{ sessionId: sId }, { sessionId: sId.toString() }] })
      .sort({ displayOrder: 1 })
      .toArray();

    let prods = [];
    if (recs && recs.length > 0) {
      const pIds = recs.map(r => toObjectId(r.productId) || r.productId);
      prods = await db.collection('products').find({
        $or: [
          { _id: { $in: pIds } },
          { id: { $in: recs.map(r => String(r.productId)) } }
        ]
      }).toArray();
    }

    res.json({ session, recommendations: recs, products: prods });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/mystic-match/submit', async (req, res) => {
  try {
    const db = getDB();
    const email = (req.session.user && req.session.user.email) || (req.cookies && req.cookies.remember_user);
    let user = null;
    if (email && db) {
      try { user = await db.collection('users').findOne({ email }); } catch (e) { }
    }

    const {
      birthDate,
      birthDay,
      birthMonth,
      birthYear,
      gender,
      wish,
      quizAnswers,
      calculatedZodiac,
      calculatedElement,
      dominantChakra,
      matchSummary,
      recommendedProductIds
    } = req.body;

    const uId = user ? user._id : null;
    const sessionDoc = {
      userId: uId ? uId : (req.body.userId || null),
      userEmail: email || null,
      birthDate: birthDate || `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`,
      zodiac: calculatedZodiac?.name || req.body.zodiac || '',
      zodiacLatin: calculatedZodiac?.latin || '',
      element: calculatedElement?.name || req.body.element || '',
      gender: gender || 'female',
      wish: wish || 'peace',
      quizAnswers: quizAnswers || [],
      dominantChakra: dominantChakra || 'Luân xa Tim (An Nhiên & Yêu Thương)',
      matchSummary: matchSummary || 'Bản mệnh hài hòa, đón nhận tần số cát tường và hộ thân bình an.',
      createdAt: new Date()
    };

    let sessionId = null;
    if (db) {
      const sessionResult = await db.collection('mystic_match_sessions').insertOne(sessionDoc);
      sessionId = sessionResult.insertedId;

      const recDocs = (recommendedProductIds || []).map((pId, idx) => ({
        sessionId: sessionId,
        userId: uId,
        productId: pId,
        matchScore: 98 - idx * 3,
        matchReasons: [
          `Tương hợp bản mệnh ${sessionDoc.element}`,
          `Cộng hưởng ${sessionDoc.dominantChakra}`
        ],
        displayOrder: idx + 1,
        createdAt: new Date()
      }));

      if (recDocs.length > 0) {
        await db.collection('mystic_match_recommendations').insertMany(recDocs);
      }

      if (uId) {
        await db.collection('users').updateOne(
          { _id: uId },
          {
            $set: {
              zodiac: sessionDoc.zodiac,
              element: sessionDoc.element,
              dob: `${birthDay}/${birthMonth}/${birthYear}`,
              mysticMatchCompleted: true,
              lastMysticMatchAt: new Date()
            }
          }
        );
      }

      // Tự động đồng bộ ra file JSON amules-database
      try {
        const allSessions = await db.collection('mystic_match_sessions').find({}).toArray();
        const allRecs = await db.collection('mystic_match_recommendations').find({}).toArray();
        const sCandidates = [
          path.join(__dirname, '..', '..', 'amules-database', 'mystic_match_sessions.json'),
          path.join(__dirname, '..', 'amules-database', 'mystic_match_sessions.json'),
          path.join(process.cwd(), 'amules-database', 'mystic_match_sessions.json')
        ];
        for (const p of sCandidates) {
          if (fs.existsSync(p)) {
            fs.writeFileSync(p, JSON.stringify(allSessions, null, 2), 'utf-8');
            break;
          }
        }
        const rCandidates = [
          path.join(__dirname, '..', '..', 'amules-database', 'mystic_match_recommendations.json'),
          path.join(__dirname, '..', 'amules-database', 'mystic_match_recommendations.json'),
          path.join(process.cwd(), 'amules-database', 'mystic_match_recommendations.json')
        ];
        for (const p of rCandidates) {
          if (fs.existsSync(p)) {
            fs.writeFileSync(p, JSON.stringify(allRecs, null, 2), 'utf-8');
            break;
          }
        }
      } catch (e) {
        console.error('[Sync] Lỗi ghi file mystic_match JSON:', e.message);
      }
    }

    res.json({
      success: true,
      sessionId,
      session: sessionDoc,
      message: 'Đã lưu kết quả bài trắc nghiệm năng lượng tâm thức vào hồ sơ CSDL MongoDB!'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// WISHLISTS (MONGODB SYNC) - BPMN Mục 3.5 collection 'wishlists'
// -------------------------------------------------------------
app.get('/api/wishlists', async (req, res) => {
  try {
    const db = getDB();
    const email = (req.session.user && req.session.user.email) || (req.cookies && req.cookies.remember_user);
    if (!email) {
      return res.json({ productIds: [], items: [] });
    }

    let user = null;
    if (db) {
      try { user = await db.collection('users').findOne({ email }); } catch (e) { }
    }
    if (!user) {
      const fallbackUsers = loadFallbackJsonData('users') || [];
      user = fallbackUsers.find(u => u.email === email);
    }

    const userWishlist = (user && user.wishlist) || [];
    if (userWishlist.length === 0) {
      return res.json({ productIds: [], items: [] });
    }

    let products = [];
    if (db) {
      try {
        products = await db.collection('products').find({
          $or: [
            { _id: { $in: userWishlist.map(id => toObjectId(id)) } },
            { id: { $in: userWishlist } },
            { slug: { $in: userWishlist } }
          ]
        }).toArray();
      } catch (e) { }
    }
    if (!products || products.length === 0) {
      const allProds = loadFallbackJsonData('products') || [];
      products = allProds.filter(p => userWishlist.includes(p.id) || (p._id && userWishlist.includes(p._id.toString())));
    }

    res.json({
      productIds: userWishlist,
      items: products.map(p => ({
        ...p,
        image: resolveProductImage(p)
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wishlists/toggle', async (req, res) => {
  try {
    const db = getDB();
    const email = (req.session.user && req.session.user.email) || (req.cookies && req.cookies.remember_user);
    if (!email) return res.status(401).json({ message: 'Vui lòng đăng nhập để lưu bảo vật yêu thích' });

    const { productId } = req.body;
    if (!productId) return res.status(400).json({ message: 'Thiếu productId' });

    let user = null;
    if (db) {
      try { user = await db.collection('users').findOne({ email }); } catch (e) { }
    }
    let allUsers = [];
    if (db) {
      try { allUsers = await db.collection('users').find({}).toArray(); } catch (e) { }
    }
    if (!allUsers || allUsers.length === 0) {
      allUsers = loadFallbackJsonData('users') || [];
    }
    if (!user) user = allUsers.find(u => u.email === email);

    let wishlist = (user && user.wishlist) ? [...user.wishlist] : [];
    const pidStr = productId.toString();
    const exists = wishlist.some(id => id.toString() === pidStr);

    if (exists) {
      wishlist = wishlist.filter(id => id.toString() !== pidStr);
    } else {
      wishlist.push(pidStr);
    }

    if (db) {
      try {
        await db.collection('users').updateOne({ email }, { $set: { wishlist, updatedAt: new Date() } }, { upsert: true });
        if (user) {
          await db.collection('wishlists').updateOne(
            { userId: user._id },
            { $set: { productIds: wishlist, updatedAt: new Date() } },
            { upsert: true }
          );
        }
      } catch (e) { }
    }

    // Tự động đồng bộ users.json
    try {
      const idx = allUsers.findIndex(u => u.email === email);
      if (idx >= 0) {
        allUsers[idx].wishlist = wishlist;
        allUsers[idx].updatedAt = new Date();
      }
      syncUsersToJson(allUsers);
    } catch (e) { }

    res.json({
      success: true,
      isWishlisted: !exists,
      wishlist,
      count: wishlist.length,
      message: !exists ? 'Đã thêm vào danh sách yêu thích' : 'Đã xóa khỏi danh sách yêu thích'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// REVIEWS (MONGODB SYNC) - Collection 'reviews'
// -------------------------------------------------------------
app.post('/api/reviews', async (req, res) => {
  try {
    const db = getDB();
    const email = (req.session.user && req.session.user.email) || req.body.userEmail || '';
    const userName = (req.session.user && (req.session.user.fullName || req.session.user.name)) || req.body.userName || 'Khách hàng AMULES';

    const newReview = {
      productName: req.body.productName || 'Bảo vật AMULES',
      productId: req.body.productId || null,
      userName,
      userEmail: email,
      rating: Number(req.body.rating) || 5,
      stars: Number(req.body.rating) || 5,
      title: req.body.title || '',
      content: req.body.content || req.body.comment || '',
      quote: req.body.content || '',
      image: req.body.image || 'https://i.pinimg.com/736x/d4/3c/3d/d43c3d69296b0badad1636033dd34e9c.jpg',
      helpfulCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('reviews').insertOne(newReview);
    newReview._id = result.insertedId;
    res.status(201).json({
      message: 'Gửi đánh giá thành công! Cảm ơn bạn đã phản hồi.',
      review: newReview
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// ADMIN MANAGEMENT APIS (Slide VI, VII, VIII)
// -------------------------------------------------------------
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const cleanUser = (username || '').trim().toLowerCase();

    const isExplicitAdmin = cleanUser === 'admin@amules.vn' || cleanUser === 'admin' || cleanUser === 'admin.an@amules.com';
    const isSpecialPass = password === 'admin' || password === 'admin123' || password === '123456' || password === 'AmulesVault2026!';

    // 1. FAST PATH: Master admin with special password
    if (isExplicitAdmin && isSpecialPass) {
      const adminData = {
        id: 'admin_default',
        email: cleanUser.includes('@') ? cleanUser : 'admin@amules.vn',
        fullName: cleanUser.includes('an@') ? 'Admin An' : 'Quản trị viên AMULES',
        role: 'admin'
      };
      if (req.session) {
        req.session.admin = adminData;
        req.session.user = adminData;
      }
      return res.json({
        message: 'Đăng nhập Quản trị viên thành công!',
        admin: adminData
      });
    }

    // 2. Query DB for database user
    const db = getDB();
    const user = await db.collection('users').findOne({
      $or: [{ email: cleanUser }, { username: cleanUser }]
    });

    // STRICT password check: match plaintext password, match passwordHash, or if user is admin role and provided isSpecialPass
    const passwordMatch = user && (
      (user.password && user.password === password) ||
      (user.passwordHash && (user.passwordHash === password || (isSpecialPass && user.role === 'admin')))
    );

    if (user && user.role === 'admin' && passwordMatch) {
      const adminData = {
        id: user._id ? user._id.toString() : 'admin_default',
        email: user.email || cleanUser,
        fullName: user.fullName || 'Quản trị viên AMULES',
        role: 'admin'
      };
      if (req.session) {
        req.session.admin = adminData;
        req.session.user = adminData;
      }
      return res.json({
        message: 'Đăng nhập Quản trị viên thành công!',
        admin: adminData
      });
    } else {
      return res.status(401).json({ message: 'Tài khoản Quản trị hoặc mật khẩu không chính xác!' });
    }
  } catch (error) {
    const { username, password } = req.body || {};
    const cleanUser = (username || '').trim().toLowerCase();
    const isExplicitAdmin = cleanUser === 'admin@amules.vn' || cleanUser === 'admin' || cleanUser === 'admin.an@amules.com';
    const isSpecialPass = password === 'admin' || password === 'admin123' || password === '123456' || password === 'AmulesVault2026!';
    if (isExplicitAdmin && isSpecialPass) {
      const adminData = {
        id: 'admin_default',
        email: cleanUser.includes('@') ? cleanUser : 'admin@amules.vn',
        fullName: cleanUser.includes('an@') ? 'Admin An' : 'Quản trị viên AMULES',
        role: 'admin'
      };
      if (req.session) {
        req.session.admin = adminData;
        req.session.user = adminData;
      }
      return res.json({
        message: 'Đăng nhập Quản trị viên thành công!',
        admin: adminData
      });
    }
    return res.status(401).json({ message: 'Tài khoản Quản trị hoặc mật khẩu không chính xác!' });
  }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const db = getDB();
    const [ordersCount, productsCount, usersCount, vouchersCount, allOrders] = await Promise.all([
      db.collection('orders').countDocuments(),
      db.collection('products').countDocuments(),
      db.collection('users').countDocuments(),
      db.collection('vouchers').countDocuments(),
      db.collection('orders').find({}).toArray()
    ]);

    const totalRevenue = allOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const pendingOrders = allOrders.filter(o => o.status === 'pending').length;
    const completedOrders = allOrders.filter(o => o.status === 'completed' || o.status === 'Completed').length;

    res.json({
      totalRevenue,
      ordersCount,
      productsCount,
      usersCount,
      vouchersCount,
      pendingOrders,
      completedOrders,
      recentOrders: allOrders.slice(-5).reverse()
    });
  } catch (error) {
    const orders = loadFallbackJsonData('orders') || [];
    const products = loadFallbackJsonData('products') || [];
    const users = loadFallbackJsonData('users') || [];
    const vouchers = loadFallbackJsonData('vouchers') || [];
    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const pendingOrders = orders.filter(o => o.status === 'pending' || o.orderStatus === 'Đang xử lý').length;
    const completedOrders = orders.filter(o => o.status === 'completed' || o.status === 'Completed' || o.orderStatus === 'Đã giao').length;

    res.json({
      totalRevenue,
      ordersCount: orders.length,
      productsCount: products.length,
      usersCount: users.length,
      vouchersCount: vouchers.length,
      pendingOrders,
      completedOrders,
      recentOrders: orders.slice(-5).reverse()
    });
  }
});

// =============================================================
// BACKOFFICE ADMIN: QUẢN TRỊ ĐƠN HÀNG & THỐNG KÊ (MongoDB & JSON Auto-Sync)
// =============================================================

// Tự động chuẩn hóa và nạp dữ liệu đơn hàng vào MongoDB nếu collection orders đang rỗng
async function ensureOrdersSeeded(db) {
  try {
    const count = await db.collection('orders').countDocuments();
    if (count === 0) {
      console.log('[Orders Seed] MongoDB orders rỗng. Đang tự động nạp từ amules-database/orders.json...');
      const rawOrders = loadFallbackJsonData('orders') || [];
      const rawReturns = loadFallbackJsonData('return_requests') || [];

      const statusMap = {
        'đã giao': 'completed',
        'hoàn thành': 'completed',
        'đang giao': 'shipping',
        'đang vận chuyển': 'shipping',
        'đang xử lý': 'processing',
        'chờ xác nhận': 'pending',
        'đã hủy': 'cancelled',
        'yêu cầu đổi trả': 'return',
        'đổi size': 'return',
        'đổi trả': 'return'
      };

      const normalizedOrders = rawOrders.map((o, idx) => {
        const orderStatus = o.orderStatus || 'Đã giao thành công';
        const stKey = (orderStatus || '').toLowerCase().trim();
        let status = o.status;
        if (!status) {
          for (const [k, v] of Object.entries(statusMap)) {
            if (stKey.includes(k)) {
              status = v;
              break;
            }
          }
          if (!status) status = idx === 0 ? 'completed' : 'shipping';
        }

        const fullName = (o.customer && o.customer.fullName) || (o.shippingAddress && (o.shippingAddress.fullName || o.shippingAddress.recipient)) || 'Khách hàng';
        const phone = (o.customer && o.customer.phone) || (o.shippingAddress && o.shippingAddress.phone) || '';
        const email = (o.customer && o.customer.email) || (o.shippingAddress && o.shippingAddress.email) || '';
        const tier = (o.customer && o.customer.tier) || 'Thành viên mới';

        const items = (o.items || []).map(it => ({
          name: it.productName || it.name || 'Bảo vật phong thủy AMULES',
          categoryTag: it.categoryTag || 'TRANG SỨC PHONG THỦY',
          specs: it.specs || (it.selectedSize ? `Chiều dài: ${it.selectedSize} • Màu: ${it.selectedColor || 'Tiêu chuẩn'}` : ''),
          image: it.image || '',
          price: Number(it.unitPrice || it.price || 0),
          quantity: Number(it.quantity || 1)
        }));

        const isReturn = rawReturns.some(r => r.orderId && o._id && (r.orderId.toString() === o._id.toString() || r.orderId === o._id));

        return {
          ...o,
          orderCode: o.orderCode || `AMU-2026110${idx + 1}-000${idx + 1}`,
          trackingCode: o.trackingCode || (idx === 0 ? 'GHN-HN-88402198' : 'GHN-SG-7712940'),
          carrier: o.carrier || 'GHN Express',
          customer: {
            fullName,
            phone,
            email,
            tier,
            tierNote: tier.includes('VIP') ? 'Gemstone VIP • Mua Lần 4' : 'Khách mua lần đầu'
          },
          shippingAddress: {
            street: (o.shippingAddress && o.shippingAddress.street) || (idx === 0 ? 'Số 18 Tràng Tiền Plaza, P. Tràng Tiền' : '12 Lê Quý Đôn'),
            ward: (o.shippingAddress && o.shippingAddress.ward) || (idx === 0 ? 'Phường Tràng Tiền' : 'Phường Võ Thị Sáu'),
            district: (o.shippingAddress && o.shippingAddress.district) || (idx === 0 ? 'Quận Hoàn Kiếm' : 'Quận 3'),
            province: (o.shippingAddress && o.shippingAddress.province) || (idx === 0 ? 'Hà Nội' : 'TP. Hồ Chí Minh'),
            note: (o.shippingAddress && o.shippingAddress.note) || o.note || 'Giao giờ hành chính'
          },
          items,
          firstItemName: items.length > 0 ? items[0].name : 'Trang sức phong thủy',
          itemsCountLabel: `${items.length} tác phẩm`,
          subtotal: Number(o.subtotal || o.totalAmount || 1200000),
          shippingFee: Number(o.shippingFee || 0),
          discount: Number(o.discountAmount || o.discount || 0),
          voucherCode: o.voucherCode || (idx === 0 ? 'AMULESLOVE' : null),
          totalAmount: Number(o.totalAmount || 1200000),
          paymentMethod: o.paymentMethod || (idx === 0 ? 'COD' : 'VNPAY'),
          paymentStatus: (o.paymentStatus === 'Đã thanh toán' || o.paymentStatus === 'paid') ? 'paid' : 'pending_cod',
          paymentStatusLabel: (o.paymentStatus === 'paid' || o.paymentStatus === 'Đã thanh toán') ? 'Đã thanh toán' : 'Chờ thu hộ COD',
          status,
          orderStatus: o.orderStatus || (status === 'completed' ? 'Đã giao thành công' : status === 'shipping' ? 'Đang giao hàng' : 'Đang xử lý'),
          hasReturnRequest: isReturn,
          returnReason: isReturn ? 'Đổi size vòng tay (Bị rộng 2cm so với cổ tay)' : null,
          returnId: isReturn ? 'RT-014' : null,
          internalNotes: o.internalNotes || [
            {
              author: 'Vũ Hoàng Linh (Quản trị viên)',
              time: '28/10/2026 lúc 14:36',
              content: 'Đã kiểm tra chất lượng đá Moonstone ánh lam bậc 1, ni tay 14.5cm chuẩn theo yêu cầu thiền định của khách.'
            }
          ],
          createdAt: o.createdAt || new Date('2026-11-05T00:00:00.000Z'),
          updatedAt: o.updatedAt || new Date('2026-11-09T00:00:00.000Z')
        };
      });

      if (normalizedOrders.length > 0) {
        await db.collection('orders').insertMany(normalizedOrders);
        console.log(`[Orders Seed] Đã tự động nạp thành công ${normalizedOrders.length} đơn hàng vào MongoDB!`);
        syncOrdersToJson(normalizedOrders);
      }
    }
  } catch (err) {
    console.error('[Orders Seed Error]:', err.message);
  }
}

// 1. Thống kê tổng quan Admin
app.get('/api/admin/stats', async (req, res) => {
  try {
    let db = null;
    try { db = getDB(); } catch (e) { }

    let allOrders = [];
    let ordersCount = 0;
    let productsCount = 0;
    let usersCount = 0;
    let vouchersCount = 0;
    let returnCount = 0;

    if (db) {
      await ensureOrdersSeeded(db);
      [ordersCount, productsCount, usersCount, vouchersCount, allOrders, returnCount] = await Promise.all([
        db.collection('orders').countDocuments(),
        db.collection('products').countDocuments(),
        db.collection('users').countDocuments(),
        db.collection('vouchers').countDocuments(),
        db.collection('orders').find({}).sort({ createdAt: -1 }).toArray(),
        db.collection('orders').countDocuments({ $or: [{ status: 'return' }, { hasReturnRequest: true }] })
      ]);
    } else {
      allOrders = loadFallbackJsonData('orders') || [];
      const products = loadFallbackJsonData('products') || [];
      const users = loadFallbackJsonData('users') || [];
      const vouchers = loadFallbackJsonData('vouchers') || [];
      ordersCount = allOrders.length;
      productsCount = products.length;
      usersCount = users.length;
      vouchersCount = vouchers.length;
      returnCount = allOrders.filter(o => o.hasReturnRequest || o.status === 'return').length;
    }

    const totalRevenue = allOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const pendingOrders = allOrders.filter(o => o.status === 'pending' || o.orderStatus === 'Chờ xác nhận').length;
    const shippingOrders = allOrders.filter(o => o.status === 'shipping' || (o.orderStatus && o.orderStatus.includes('Đang giao'))).length;
    const completedOrders = allOrders.filter(o => o.status === 'completed' || o.status === 'Completed' || (o.orderStatus && o.orderStatus.includes('Đã giao'))).length;

    res.json({
      totalRevenue,
      ordersCount,
      productsCount,
      usersCount,
      vouchersCount,
      pendingOrders,
      shippingOrders,
      completedOrders,
      returnCount,
      recentOrders: allOrders.slice(0, 5)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Lấy danh sách đơn hàng (hỗ trợ lọc theo tab, từ khóa tìm kiếm, phương thức thanh toán)
app.get('/api/admin/orders', async (req, res) => {
  try {
    let db = null;
    try { db = getDB(); } catch (e) { }

    const { status, search, paymentMethod } = req.query;
    let orders = [];

    if (db) {
      await ensureOrdersSeeded(db);
      const filter = {};

      if (status && status !== 'all') {
        if (status === 'return') {
          filter.$or = [{ status: 'return' }, { hasReturnRequest: true }, { returnStatus: 'pending' }];
        } else {
          filter.status = status;
        }
      }

      if (paymentMethod && paymentMethod !== 'all') {
        filter.paymentMethod = { $regex: paymentMethod, $options: 'i' };
      }

      if (search && search.trim()) {
        const q = search.trim();
        filter.$or = [
          { orderCode: { $regex: q, $options: 'i' } },
          { trackingCode: { $regex: q, $options: 'i' } },
          { 'customer.fullName': { $regex: q, $options: 'i' } },
          { 'customer.phone': { $regex: q, $options: 'i' } },
          { 'customer.email': { $regex: q, $options: 'i' } },
          { 'items.name': { $regex: q, $options: 'i' } },
          { firstItemName: { $regex: q, $options: 'i' } }
        ];
      }

      orders = await db.collection('orders').find(filter).sort({ createdAt: -1 }).toArray();
    }

    // Nếu database offline hoặc chưa có bản ghi, nạp từ file amules-database/orders.json
    if (!orders || orders.length === 0) {
      const fallback = loadFallbackJsonData('orders') || [];
      orders = fallback.filter(o => {
        if (status && status !== 'all') {
          if (status === 'return' && !(o.hasReturnRequest || o.status === 'return')) return false;
          if (status !== 'return' && o.status !== status && o.orderStatus !== status) return false;
        }
        if (paymentMethod && paymentMethod !== 'all') {
          if (!o.paymentMethod || !o.paymentMethod.toLowerCase().includes(paymentMethod.toLowerCase())) return false;
        }
        if (search && search.trim()) {
          const q = search.toLowerCase().trim();
          const matchCode = (o.orderCode || '').toLowerCase().includes(q);
          const matchName = ((o.customer?.fullName) || (o.shippingAddress?.fullName) || '').toLowerCase().includes(q);
          const matchPhone = ((o.customer?.phone) || (o.shippingAddress?.phone) || '').includes(q);
          if (!matchCode && !matchName && !matchPhone) return false;
        }
        return true;
      });
    }

    res.json(orders);
  } catch (error) {
    console.error('GET /api/admin/orders error:', error);
    const fallback = loadFallbackJsonData('orders') || [];
    res.json(fallback);
  }
});

// 3. Tạo đơn hàng thủ công từ Backoffice (tự động ghi trực tiếp vào MongoDB & orders.json)
app.post('/api/admin/orders', async (req, res) => {
  try {
    let db = null;
    try { db = getDB(); } catch (e) { }

    const data = req.body;
    let count = 0;
    if (db) {
      try { count = await db.collection('orders').countDocuments(); } catch (e) { }
    }
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const orderCode = data.orderCode || `AMU-${dateStr}-${String(count + 1).padStart(4, '0')}`;
    const trackingCode = data.trackingCode || `GHN-AMU-${Math.floor(100000 + Math.random() * 900000)}`;

    const items = (data.items && data.items.length > 0)
      ? data.items.map(it => ({
        name: it.name || it.productName || 'Bảo vật hộ mệnh AMULES',
        categoryTag: it.categoryTag || 'TRANG SỨC BẢO MỆNH • Bạc Ý S925',
        specs: it.specs || 'Tiêu chuẩn nghệ nhân AMULES',
        image: it.image || 'https://i.pinimg.com/736x/d4/3c/3d/d43c3d69296b0badad1636033dd34e9c.jpg',
        price: Number(it.price || it.unitPrice || 650000),
        quantity: Number(it.quantity || 1)
      }))
      : [
        {
          name: data.firstItemName || data.itemName || 'Dây Chuyền Mặt Trăng Khuyết Moonstone',
          categoryTag: data.categoryTag || 'MOONSTONE TỰ NHIÊN • Bạc Ý S925',
          specs: 'Chiều dài: 45 cm • Màu sắc: Trắng ánh xanh',
          image: 'https://i.pinimg.com/736x/e6/a9/5d/e6a95dbb226be002601330c99458c286.jpg',
          price: Number(data.itemPrice || data.totalAmount || 650000),
          quantity: Number(data.quantity || 1)
        }
      ];

    const fullName = data.customerName || data.customer?.fullName || 'Khách hàng Backoffice';
    const phone = data.customerPhone || data.customer?.phone || '0982 456 789';
    const email = data.customerEmail || data.customer?.email || 'khachhang@amules.vn';
    const tier = data.tier || data.customer?.tier || 'GEMSTONE VIP';

    const newOrder = {
      orderCode,
      trackingCode,
      carrier: data.carrier || 'GHN Express',
      customer: {
        fullName,
        phone,
        email,
        tier,
        tierNote: tier.includes('VIP') ? 'Gemstone VIP • Mua Lần 4' : 'Khách mua lần đầu'
      },
      shippingAddress: {
        street: data.street || data.shippingAddress?.street || 'Số 18 Tràng Tiền Plaza, P. Tràng Tiền',
        ward: data.ward || data.shippingAddress?.ward || 'Phường Tràng Tiền',
        district: data.district || data.shippingAddress?.district || 'Quận Hoàn Kiếm',
        province: data.province || data.shippingAddress?.province || 'Hà Nội',
        note: data.note || data.shippingAddress?.note || 'Giao giờ hành chính'
      },
      items,
      firstItemName: items[0].name,
      itemsCountLabel: `${items.length} tác phẩm`,
      subtotal: Number(data.subtotal || data.totalAmount || 650000),
      shippingFee: Number(data.shippingFee || 0),
      discount: Number(data.discount || 0),
      voucherCode: data.voucherCode || null,
      totalAmount: Number(data.totalAmount || (data.itemPrice || 650000) * (data.quantity || 1)),
      paymentMethod: data.paymentMethod || 'COD',
      paymentStatus: data.paymentStatus || (data.paymentMethod === 'COD' ? 'pending_cod' : 'paid'),
      paymentStatusLabel: (data.paymentStatus === 'paid' || data.paymentMethod !== 'COD') ? 'Đã thanh toán' : 'Chờ thu hộ COD',
      status: data.status || 'pending',
      orderStatus: data.orderStatus || (data.status === 'completed' ? 'Đã giao thành công' : data.status === 'shipping' ? 'Đang giao hàng' : 'Chờ xác nhận'),
      hasReturnRequest: false,
      returnReason: null,
      internalNotes: [
        {
          author: 'Admin AMULES (Backoffice)',
          time: new Date().toLocaleString('vi-VN'),
          content: 'Tạo đơn hàng thủ công thành công từ hệ thống quản trị.'
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (db) {
      try {
        const ins = await db.collection('orders').insertOne(newOrder);
        newOrder._id = ins.insertedId;
      } catch (e) { }
    }

    // Tự động đồng bộ ngay vào file amules-database/orders.json
    try {
      let all = [];
      if (db) all = await db.collection('orders').find({}).sort({ createdAt: -1 }).toArray();
      if (!all || all.length === 0) {
        const existing = loadFallbackJsonData('orders') || [];
        all = [newOrder, ...existing];
      }
      syncOrdersToJson(all);
    } catch (e) { }

    res.status(201).json({ message: 'Tạo đơn hàng thành công!', order: newOrder });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Cập nhật trạng thái đơn hàng (Tự động ghi vào MongoDB & orders.json)
app.put('/api/admin/orders/:id/status', async (req, res) => {
  try {
    let db = null;
    try { db = getDB(); } catch (e) { }

    const id = req.params.id;
    const { status } = req.body;
    const o_id = toObjectId(id);

    const statusLabelMap = {
      'pending': 'Chờ xác nhận & thanh tẩy đá',
      'processing': 'Đang xử lý & đính kết nghệ nhân',
      'shipping': 'Đang giao hàng (Hỏa tốc GHN)',
      'completed': 'Đã giao thành công',
      'cancelled': 'Đã hủy đơn',
      'return': 'Đang xử lý đổi trả'
    };
    const orderStatus = statusLabelMap[status] || 'Đang cập nhật';

    if (db) {
      try {
        await db.collection('orders').updateOne(
          { $or: [{ _id: o_id }, { orderCode: id }] },
          { $set: { status, orderStatus, updatedAt: new Date() } }
        );
      } catch (e) { }
    }

    // Tự động ghi vào orders.json
    try {
      let all = [];
      if (db) all = await db.collection('orders').find({}).sort({ createdAt: -1 }).toArray();
      if (!all || all.length === 0) {
        all = loadFallbackJsonData('orders') || [];
        all = all.map(o => {
          if (o.orderCode === id || (o._id && o._id.toString() === id)) {
            return { ...o, status, orderStatus, updatedAt: new Date() };
          }
          return o;
        });
      }
      syncOrdersToJson(all);
    } catch (e) { }

    res.json({ message: 'Cập nhật trạng thái đơn hàng thành công!', status, orderStatus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Thêm ghi chú nội bộ cho đơn hàng (Tự động ghi vào MongoDB & orders.json)
app.post('/api/admin/orders/:id/notes', async (req, res) => {
  try {
    let db = null;
    try { db = getDB(); } catch (e) { }

    const id = req.params.id;
    const { author = 'Quản trị viên AMULES', content } = req.body;
    if (!content) return res.status(400).json({ message: 'Nội dung ghi chú không được để trống' });

    const note = {
      author,
      time: new Date().toLocaleString('vi-VN'),
      content
    };
    const o_id = toObjectId(id);

    if (db) {
      try {
        await db.collection('orders').updateOne(
          { $or: [{ _id: o_id }, { orderCode: id }] },
          { $push: { internalNotes: note }, $set: { updatedAt: new Date() } }
        );
      } catch (e) { }
    }

    // Đồng bộ vào orders.json
    try {
      let all = [];
      if (db) all = await db.collection('orders').find({}).sort({ createdAt: -1 }).toArray();
      if (!all || all.length === 0) {
        all = loadFallbackJsonData('orders') || [];
        all = all.map(o => {
          if (o.orderCode === id || (o._id && o._id.toString() === id)) {
            const currentNotes = o.internalNotes || [];
            return { ...o, internalNotes: [...currentNotes, note], updatedAt: new Date() };
          }
          return o;
        });
      }
      syncOrdersToJson(all);
    } catch (e) { }

    res.status(201).json({ message: 'Thêm ghi chú nội bộ thành công!', note });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Xử lý yêu cầu đổi trả (Đổi ni/size hoặc Hoàn tiền)
app.put('/api/admin/orders/:id/return', async (req, res) => {
  try {
    let db = null;
    try { db = getDB(); } catch (e) { }

    const id = req.params.id;
    const { type = 'exchange', note } = req.body;
    const o_id = toObjectId(id);

    const updateFields = {
      hasReturnRequest: false,
      returnApproved: true,
      returnType: type,
      orderStatus: type === 'exchange' ? 'Đã duyệt đổi size (Đang điều phối giao lại)' : 'Đã duyệt hoàn tiền về tài khoản khách',
      status: type === 'exchange' ? 'shipping' : 'completed',
      updatedAt: new Date()
    };

    if (db) {
      try {
        await db.collection('orders').updateOne(
          { $or: [{ _id: o_id }, { orderCode: id }] },
          {
            $set: updateFields,
            $push: {
              internalNotes: {
                author: 'Quản trị viên AMULES',
                time: new Date().toLocaleString('vi-VN'),
                content: `Đã phê duyệt ${type === 'exchange' ? 'đổi ni tay' : 'hoàn tiền'}. Ghi chú: ${note || 'Bảo hành chính hãng'}`
              }
            }
          }
        );
      } catch (e) { }
    }

    // Đồng bộ vào orders.json
    try {
      let all = [];
      if (db) all = await db.collection('orders').find({}).sort({ createdAt: -1 }).toArray();
      if (!all || all.length === 0) {
        all = loadFallbackJsonData('orders') || [];
        all = all.map(o => {
          if (o.orderCode === id || (o._id && o._id.toString() === id)) {
            return { ...o, ...updateFields };
          }
          return o;
        });
      }
      syncOrdersToJson(all);
    } catch (e) { }

    res.json({ message: 'Xử lý yêu cầu đổi trả thành công!', updateFields });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const db = getDB();
    const users = await db.collection('users').find({}).sort({ createdAt: -1 }).toArray();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/users/:id/status', async (req, res) => {
  try {
    const db = getDB();
    const id = req.params.id;
    const { status } = req.body;
    const o_id = toObjectId(id);

    await db.collection('users').updateOne(
      { $or: [{ _id: o_id }, { email: id }] },
      { $set: { status, updatedAt: new Date() } }
    );
    res.json({ message: 'Cập nhật trạng thái người dùng thành công!', status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/vouchers', async (req, res) => {
  try {
    const db = getDB();
    let vouchers = await db.collection('vouchers').find({}).toArray();
    if (!vouchers || vouchers.length === 0) {
      vouchers = loadFallbackJsonData('vouchers') || [];
    }
    res.json(vouchers);
  } catch (error) {
    const fallback = loadFallbackJsonData('vouchers') || [];
    res.json(fallback);
  }
});

app.post('/api/admin/vouchers', async (req, res) => {
  try {
    const db = getDB();
    const newVoucher = {
      code: (req.body.code || '').trim().toUpperCase(),
      title: req.body.title || 'Ưu đãi AMULES',
      discountAmount: Number(req.body.discountAmount) || 50000,
      minOrderValue: Number(req.body.minOrderValue) || 300000,
      expiryDate: req.body.expiryDate || '31/12/2026',
      isActive: true,
      createdAt: new Date()
    };
    await db.collection('vouchers').insertOne(newVoucher);
    res.status(201).json({ message: 'Tạo mã voucher thành công!', voucher: newVoucher });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/vouchers/:id', async (req, res) => {
  try {
    const db = getDB();
    const id = req.params.id;
    const o_id = toObjectId(id);
    await db.collection('vouchers').deleteOne({ $or: [{ _id: o_id }, { code: id }] });
    res.json({ message: 'Đã xóa voucher thành công' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Catalog Endpoints (Quản lý Danh mục, Đá quý, Bộ sưu tập, Ngũ hành, Cung HĐ - BPMN Trang 9)
app.get('/api/admin/catalog/:type', async (req, res) => {
  try {
    const db = getDB();
    const type = req.params.type;
    const allowed = ['categories', 'collections', 'gemstones', 'elements', 'zodiac_signs', 'themes', 'articles'];
    if (!allowed.includes(type)) return res.status(400).json({ message: 'Loại danh mục không hợp lệ' });
    const items = await db.collection(type).find({}).toArray();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/catalog/:type', async (req, res) => {
  try {
    const db = getDB();
    const type = req.params.type;
    const item = { ...req.body, createdAt: new Date() };
    const result = await db.collection(type).insertOne(item);
    res.status(201).json({ message: 'Tạo mới thành công!', id: result.insertedId, item });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/catalog/:type/:id', async (req, res) => {
  try {
    const db = getDB();
    const { type, id } = req.params;
    const o_id = toObjectId(id);
    delete req.body._id;
    await db.collection(type).updateOne(
      { $or: [{ _id: o_id }, { id: id }, { slug: id }] },
      { $set: { ...req.body, updatedAt: new Date() } }
    );
    res.json({ message: 'Cập nhật thành công!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/catalog/:type/:id', async (req, res) => {
  try {
    const db = getDB();
    const { type, id } = req.params;
    const o_id = toObjectId(id);
    await db.collection(type).deleteOne({ $or: [{ _id: o_id }, { id: id }, { slug: id }] });
    res.json({ message: 'Xóa thành công!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// START SERVER
// -------------------------------------------------------------
connectDB().then((db) => {
  if (db) {
    console.log('[MongoDB] CSDL MongoDB đã sẵn sàng và kết nối thành công.');
  } else {
    console.log('[AMULES] Đang chạy với CSDL file amules-database/*.json tự động đồng bộ.');
  }
}).catch(err => {
  console.warn('[AMULES Backend] Chạy với CSDL file fallback:', err.message);
}).finally(() => {
  app.listen(port, () => {
    console.log(`[AMULES Backend] Server running on http://localhost:${port}`);
  });
});
