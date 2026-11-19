import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ProductService, IProduct } from '../../services/product.service';
import { MasterDataService } from '../../services/master-data.service';
import { CartService } from '../../services/cart.service';
import { AuthService } from '../../services/auth.service';
import { WishlistService } from '../../services/wishlist.service';

export function normalizeCategoryKey(input: string): string {
  if (!input) return '';
  const s = String(input).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
  if (s.includes('nhan') || s.includes('ring')) return 'nhan';
  if (s.includes('vong') || s.includes('lac') || s.includes('brace')) return 'vong-tay';
  if (s.includes('day') || s.includes('chuyen') || s.includes('neck')) return 'day-chuyen';
  if (s.includes('bong') || s.includes('hoa') || s.includes('tai') || s.includes('ear')) return 'bong-tai';
  if (s.includes('charm')) return 'charm';
  if (s.includes('qua') || s.includes('gift') || s.includes('combo') || s.includes('bo')) return 'set-qua';
  return s;
}

export function normalizeElementKey(input: string): string {
  if (!input) return '';
  const s = String(input).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
  if (s.includes('kim')) return 'kim';
  if (s.includes('moc')) return 'moc';
  if (s.includes('thuy')) return 'thuy';
  if (s.includes('hoa')) return 'hoa';
  if (s.includes('tho')) return 'tho';
  return '';
}

export interface FilterState {
  onlyInStock: boolean;
  category: string;
  element: string;
  gemstone: string;
  priceRange: string;
  material: string;
  search: string;
  sort: string;
}

@Component({
  selector: 'app-product-list',
  standalone: false,
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.css'
})
export class ProductListComponent implements OnInit {
  products: IProduct[] = [];
  allProducts: IProduct[] = [];

  categories: any[] = [
    { id: 'nhan', name: 'Nhẫn phong thủy', raw: 'Nhẫn' },
    { id: 'vong-tay', name: 'Vòng tay & Lắc', raw: 'Vòng tay' },
    { id: 'day-chuyen', name: 'Dây chuyền & Mặt đá', raw: 'Dây chuyền' },
    { id: 'bong-tai', name: 'Bông tai thanh tẩy', raw: 'Bông tai' },
    { id: 'charm', name: 'Charm đá năng lượng', raw: 'Charm đá' },
    { id: 'set-qua', name: 'Bộ trang sức tuyển chọn', raw: 'Set quà tặng' }
  ];

  elements: any[] = [
    { id: 'Kim', name: 'Mệnh Kim', dot: '#d4af37' },
    { id: 'Moc', name: 'Mệnh Mộc', dot: '#2e7d32' },
    { id: 'Thuy', name: 'Mệnh Thủy', dot: '#1976d2' },
    { id: 'Hoa', name: 'Mệnh Hỏa', dot: '#c2185b' },
    { id: 'Tho', name: 'Mệnh Thổ', dot: '#8d6e63' }
  ];

  gemstonePills: any[] = [
    { id: 'moonstone', label: 'Moonstone (Đá Mặt Trăng)', query: 'Moonstone' },
    { id: 'rose_quartz', label: 'Thạch Anh Hồng', query: 'Thạch anh hồng' },
    { id: 'aquamarine', label: 'Aquamarine Hải Lam', query: 'Aquamarine' },
    { id: 'amethyst', label: 'Amethyst Tím Thần', query: 'Amethyst' },
    { id: 'garnet', label: 'Garnet Ngọc Hồng Lựu', query: 'Garnet' },
    { id: 'pearl', label: 'Ngọc Trai Baroque', query: 'Ngọc trai' },
    { id: 'citrine', label: 'Citrine Vàng Thần Tài', query: 'Citrine' },
    { id: 'aventurine', label: 'Aventurine Ngọc Lam', query: 'Aventurine' },
    { id: 'fluorite', label: 'Fluorite Đa Sắc', query: 'Fluorite' }
  ];

  priceRanges = [
    { id: 'all', label: 'Tất cả mức giá' },
    { id: 'under_500', label: 'Dưới 500.000đ', min: 0, max: 499999 },
    { id: '500_1000', label: '500.000đ - 1.000.000đ', min: 500000, max: 1000000 },
    { id: '1000_2000', label: '1.000.000đ - 2.000.000đ', min: 1000000, max: 2000000 },
    { id: 'above_2000', label: 'Trên 2.000.000đ', min: 2000000, max: 99999999 }
  ];

  materialOptions = [
    { id: 'bac_925', label: 'Bạc Ý 925 xi bạch kim cao cấp', query: 'Bạc 925' },
    { id: 'vang_hong', label: 'Mạ vàng hồng Champagne 18K', query: 'Vàng hồng' },
    { id: 'bac_s999', label: 'Bạc nguyên chất kháng khuẩn S999', query: 'S999' },
    { id: 'tibetan', label: 'Dây sợi đan tay phong thủy Tibetan', query: 'Tibetan' }
  ];

  filters: FilterState = {
    onlyInStock: false,
    category: '',
    element: '',
    gemstone: '',
    priceRange: 'all',
    material: '',
    search: '',
    sort: 'newest'
  };

  loading = true;
  addedToast: string | null = null;

  constructor(
    private _productService: ProductService,
    private _masterDataService: MasterDataService,
    private _cartService: CartService,
    private _authService: AuthService,
    private _wishlistService: WishlistService,
    private _route: ActivatedRoute,
    private _router: Router,
    private _http: HttpClient
  ) {}

  ngOnInit(): void {
    // 1. Tải danh mục thực tế từ CSDL MongoDB
    this._http.get<any[]>('/api/categories').subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.categories = data.map(c => ({
            id: c.slug || c._id,
            name: c.name.includes('phong thủy') || c.name.includes('&') ? c.name : (c.name === 'Nhẫn' ? 'Nhẫn phong thủy' : c.name === 'Vòng tay' ? 'Vòng tay & Lắc' : c.name === 'Dây chuyền' ? 'Dây chuyền & Mặt đá' : c.name === 'Bông tai' ? 'Bông tai thanh tẩy' : c.name === 'Charm đá' ? 'Charm đá năng lượng' : c.name === 'Set quà tặng' ? 'Bộ trang sức tuyển chọn' : c.name),
            raw: c.name
          }));
        }
      }
    });

    // 2. Tải ngũ hành thực tế từ MongoDB
    this._http.get<any[]>('/api/elements').subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          const dotMap: Record<string, string> = {
            'kim': '#d4af37',
            'mộc': '#2e7d32',
            'thủy': '#1976d2',
            'hỏa': '#c2185b',
            'thổ': '#8d6e63'
          };
          this.elements = data.map(e => {
            const short = e.name.replace('Mệnh', '').trim();
            const norm = short.toLowerCase();
            return {
              id: short,
              name: e.name.startsWith('Mệnh') ? e.name : `Mệnh ${e.name}`,
              dot: dotMap[norm] || '#80235c'
            };
          });
        }
      }
    });

    // 3. Tải danh sách đá quý từ MongoDB
    this._http.get<any[]>('/api/gemstones').subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.gemstonePills = data.map(g => ({
            id: g.slug || g._id,
            label: g.name,
            query: g.name
          }));
        }
      }
    });

    // 4. Luôn tải danh sách TOÀN BỘ sản phẩm của cửa hàng để tính badge và phục vụ lọc
    this._http.get<IProduct[]>('/api/products').subscribe({
      next: (items) => {
        if (items && Array.isArray(items)) {
          this.allProducts = items;
          this.applyFilters();
        }
      },
      error: () => {
        this.loading = false;
      }
    });

    // 5. Lắng nghe query parameters từ URL
    this._route.queryParams.subscribe(params => {
      const catParam = params['category'] || params['cat'];
      if (catParam) {
        this.filters.category = catParam;
      } else {
        this.filters.category = '';
      }

      this.filters.element = params['element'] || '';
      this.filters.gemstone = params['gemstone'] || '';
      this.filters.material = params['material'] || '';
      this.filters.priceRange = params['priceRange'] || 'all';
      this.filters.onlyInStock = params['inStock'] === 'true';
      this.filters.search = params['search'] || '';
      this.filters.sort = params['sort'] || 'newest';

      this.applyFilters();
    });
  }

  // Áp dụng bộ lọc tức thì trên allProducts
  applyFilters(): void {
    if (this.allProducts.length === 0) {
      return;
    }
    this.products = this.filterLocalProducts(this.allProducts, this.filters);
    this.loading = false;
  }

  // Cập nhật router URL tương ứng với trạng thái lọc hiện tại
  updateQueryParams(): void {
    const q: any = {};
    if (this.filters.category) q.category = this.filters.category;
    if (this.filters.element) q.element = this.filters.element;
    if (this.filters.gemstone) q.gemstone = this.filters.gemstone;
    if (this.filters.material) q.material = this.filters.material;
    if (this.filters.priceRange && this.filters.priceRange !== 'all') q.priceRange = this.filters.priceRange;
    if (this.filters.onlyInStock) q.inStock = true;
    if (this.filters.search && this.filters.search.trim()) q.search = this.filters.search.trim();
    if (this.filters.sort && this.filters.sort !== 'newest') q.sort = this.filters.sort;

    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: q
    });
  }

  // --- Helpers for Active Filter Chips ---
  get hasActiveFilters(): boolean {
    return (
      this.filters.onlyInStock ||
      !!this.filters.category ||
      !!this.filters.element ||
      !!this.filters.gemstone ||
      !!this.filters.material ||
      (this.filters.priceRange && this.filters.priceRange !== 'all') ||
      !!this.filters.search
    );
  }

  get activeCategoryLabel(): string {
    if (!this.filters.category) return '';
    const key = normalizeCategoryKey(this.filters.category);
    const found = this.categories.find(c => normalizeCategoryKey(c.raw) === key || normalizeCategoryKey(c.name) === key);
    return found ? found.name : this.filters.category;
  }

  get activeElementLabel(): string {
    if (!this.filters.element) return '';
    const key = normalizeElementKey(this.filters.element);
    const found = this.elements.find(e => normalizeElementKey(e.id) === key || normalizeElementKey(e.name) === key);
    return found ? found.name : `Mệnh ${this.filters.element}`;
  }

  get activeGemstoneLabel(): string {
    if (!this.filters.gemstone) return '';
    const s = this.filters.gemstone.toLowerCase();
    const found = this.gemstonePills.find(g => (g.query && g.query.toLowerCase() === s) || (g.label && g.label.toLowerCase().includes(s)));
    return found ? found.label : this.filters.gemstone;
  }

  get activePriceLabel(): string {
    const found = this.priceRanges.find(p => p.id === this.filters.priceRange);
    return found ? found.label : this.filters.priceRange;
  }

  get activeMaterialLabel(): string {
    if (!this.filters.material) return '';
    const s = this.filters.material.toLowerCase();
    const found = this.materialOptions.find(m => (m.query && m.query.toLowerCase() === s) || (m.label && m.label.toLowerCase().includes(s)));
    return found ? found.label : this.filters.material;
  }

  isCategoryActive(catRaw: string): boolean {
    if (!this.filters.category) return false;
    return normalizeCategoryKey(this.filters.category) === normalizeCategoryKey(catRaw);
  }

  isElementActive(elemId: string): boolean {
    if (!this.filters.element) return false;
    return normalizeElementKey(this.filters.element) === normalizeElementKey(elemId);
  }

  isGemstoneActive(g: any): boolean {
    if (!this.filters.gemstone) return false;
    const s = this.filters.gemstone.toLowerCase();
    return (g.query && g.query.toLowerCase() === s) || (g.label && g.label.toLowerCase().includes(s)) || (g.id && g.id.toLowerCase() === s);
  }

  // --- Dynamic Counter Helpers (Lấy dữ liệu trực tiếp từ MongoDB) ---
  getCategoryCount(catRaw: string): number {
    const targetKey = normalizeCategoryKey(catRaw);
    return this.allProducts.filter(p => {
      const pKey = normalizeCategoryKey(p.category || p.categoryName || p.name || '');
      return pKey === targetKey;
    }).length;
  }

  getElementCount(elemKey: string): number {
    const targetKey = normalizeElementKey(elemKey);
    return this.allProducts.filter(p => {
      const pEls = (p.element || '').toLowerCase();
      const pComp = (p.compatibleElements || []).map(c => String(c).toLowerCase()).join(' ');
      const pAll = `${pEls} ${pComp}`;
      const eKey = normalizeElementKey(pAll);
      return eKey === targetKey || pAll.includes(targetKey);
    }).length;
  }

  // --- Selection Toggles (Đồng bộ trực tiếp qua Router URL) ---
  toggleCategory(catRaw: string): void {
    const curKey = normalizeCategoryKey(this.filters.category);
    const newKey = normalizeCategoryKey(catRaw);
    this.filters.category = (curKey === newKey) ? '' : catRaw;
    this.updateQueryParams();
  }

  toggleElement(elemId: string): void {
    const curKey = normalizeElementKey(this.filters.element);
    const newKey = normalizeElementKey(elemId);
    this.filters.element = (curKey === newKey) ? '' : elemId;
    this.updateQueryParams();
  }

  toggleGemstone(gemQuery: string): void {
    this.filters.gemstone = (this.filters.gemstone.toLowerCase() === gemQuery.toLowerCase()) ? '' : gemQuery;
    this.updateQueryParams();
  }

  toggleMaterial(matQuery: string): void {
    this.filters.material = (this.filters.material.toLowerCase() === matQuery.toLowerCase()) ? '' : matQuery;
    this.updateQueryParams();
  }

  setPriceRange(rangeId: string): void {
    this.filters.priceRange = (this.filters.priceRange === rangeId) ? 'all' : rangeId;
    this.updateQueryParams();
  }

  // --- Dismiss Actions for Active Chips ---
  removeCategory(): void {
    this.filters.category = '';
    this.updateQueryParams();
  }

  removeElement(): void {
    this.filters.element = '';
    this.updateQueryParams();
  }

  removeGemstone(): void {
    this.filters.gemstone = '';
    this.updateQueryParams();
  }

  removePrice(): void {
    this.filters.priceRange = 'all';
    this.updateQueryParams();
  }

  removeMaterial(): void {
    this.filters.material = '';
    this.updateQueryParams();
  }

  removeInStock(): void {
    this.filters.onlyInStock = false;
    this.updateQueryParams();
  }

  removeSearch(): void {
    this.filters.search = '';
    this.updateQueryParams();
  }

  resetFilters(): void {
    this.filters = {
      onlyInStock: false,
      category: '',
      element: '',
      gemstone: '',
      priceRange: 'all',
      material: '',
      search: '',
      sort: 'newest'
    };
    this.updateQueryParams();
  }

  onFilterChange(): void {
    this.updateQueryParams();
  }

  formatElement(el?: string): string {
    if (!el) return '';
    const parts = el.split(/&|\+|,|\bvà\b/i)
      .map(p => p.replace(/mệnh/gi, '').trim())
      .filter(Boolean);
    const unique = [...new Set(parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))];
    if (unique.length === 0) return el;
    return unique.map(m => `Mệnh ${m}`).join(' & ');
  }

  getElementsList(el?: string): string[] {
    if (!el) return [];
    const parts = el.split(/&|\+|,|\bvà\b/i)
      .map(p => p.replace(/mệnh/gi, '').trim())
      .filter(Boolean);
    const unique = [...new Set(parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))];
    return unique.map(m => `Mệnh ${m}`);
  }

  normalizeProductImage(p: IProduct): string {
    if (p.image && p.image.startsWith('http')) return p.image;
    if (p.images && p.images.length > 0 && p.images[0].startsWith('http')) return p.images[0];
    return 'https://i.pinimg.com/736x/d4/3c/3d/d43c3d69296b0badad1636033dd34e9c.jpg';
  }

  // Bộ lọc tức thời (0ms latency) - Áp dụng chính xác quy luật lọc và sắp xếp
  filterLocalProducts(pool: IProduct[], f: FilterState): IProduct[] {
    let list = [...pool];

    // 1. Chỉ hiện còn hàng
    if (f.onlyInStock) {
      list = list.filter(p => (p.stock !== undefined ? p.stock > 0 : true));
    }

    // 2. Lọc theo danh mục chuẩn hóa
    if (f.category) {
      const targetCatKey = normalizeCategoryKey(f.category);
      list = list.filter(p => {
        const pKey = normalizeCategoryKey(p.category || p.categoryName || p.name || '');
        return pKey === targetCatKey;
      });
    }

    // 3. Lọc theo Mệnh ngũ hành (Kim, Mộc, Thủy, Hỏa, Thổ) chuẩn CSDL MongoDB
    if (f.element) {
      const targetElemKey = normalizeElementKey(f.element);
      list = list.filter(p => {
        const pEls = (p.element || '').toLowerCase();
        const pComp = (p.compatibleElements || []).map(c => String(c).toLowerCase()).join(' ');
        const pAll = `${pEls} ${pComp}`;
        const eKey = normalizeElementKey(pAll);
        return eKey === targetElemKey || pAll.includes(targetElemKey);
      });
    }

    // 4. Lọc theo Loại đá quý
    if (f.gemstone) {
      const gNorm = f.gemstone.toLowerCase().trim();
      list = list.filter(p => {
        const stoneStr = (p.stone || '').toLowerCase();
        const nameStr = (p.name || '').toLowerCase();
        const descStr = (p.description || '').toLowerCase();
        return stoneStr.includes(gNorm) || nameStr.includes(gNorm) || descStr.includes(gNorm);
      });
    }

    // 5. Lọc theo Chất liệu kim hoàn
    if (f.material) {
      const mNorm = f.material.toLowerCase().trim();
      list = list.filter(p => (p.material || '').toLowerCase().includes(mNorm));
    }

    // 6. Lọc theo Khoảng giá
    const pr = this.priceRanges.find(p => p.id === f.priceRange);
    if (pr && pr.id !== 'all') {
      list = list.filter(p => {
        const price = Number(p.price || 0);
        return price >= (pr.min ?? 0) && price <= (pr.max ?? Infinity);
      });
    }

    // 7. Lọc theo Từ khóa tìm kiếm
    if (f.search && f.search.trim()) {
      const s = f.search.trim().toLowerCase();
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(s) ||
        (p.stone || '').toLowerCase().includes(s) ||
        (p.description || '').toLowerCase().includes(s) ||
        (p.productCode || p.code || '').toLowerCase().includes(s)
      );
    }

    // 8. Sắp xếp chặt chẽ theo lựa chọn
    if (f.sort === 'price_asc') {
      list.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (f.sort === 'price_desc') {
      list.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    } else if (f.sort === 'rating') {
      list.sort((a, b) => Number(b.ratingAverage || 0) - Number(a.ratingAverage || 0));
    } else if (f.sort === 'popular') {
      list.sort((a, b) => (parseInt(String(b.sold || '0')) || 0) - (parseInt(String(a.sold || '0')) || 0));
    } else if (f.sort === 'featured') {
      list.sort((a, b) => (b.badge ? 1 : 0) - (a.badge ? 1 : 0));
    }

    return list.map(p => ({
      ...p,
      image: this.normalizeProductImage(p)
    }));
  }

  fetchProducts(): void {
    this.applyFilters();
  }

  addToCart(product: IProduct, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this._cartService.addToCart({
      productId: product.id || product._id || product.slug || '',
      name: product.name,
      price: product.price,
      originalPrice: product.compareAtPrice || product.price,
      image: product.image || 'https://i.pinimg.com/736x/d4/3c/3d/d43c3d69296b0badad1636033dd34e9c.jpg',
      quantity: 1,
      stone: product.stone || 'Đá tự nhiên',
      size: (product.sizes && product.sizes[0]) || '15 cm'
    }).subscribe({
      next: () => {
        this.addedToast = `Đã thêm "${product.name}" vào giỏ hàng!`;
        setTimeout(() => (this.addedToast = null), 3000);
      }
    });
  }

  toggleLike(product: IProduct, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    if (!this._authService.isLoggedIn()) {
      this._router.navigate(['/login'], { queryParams: { returnUrl: '/account/wishlist' } });
      return;
    }
    const added = this._wishlistService.toggleItem(product);
    product.liked = added;
    this.addedToast = added ? `Đã thêm "${product.name}" vào yêu thích!` : `Đã bỏ yêu thích "${product.name}"`;
    setTimeout(() => (this.addedToast = null), 2500);
  }
}
