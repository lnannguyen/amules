import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ProductService, IProduct } from '../services/product.service';

interface IThemeItem {
  name: string;
  slug: string;
  tag?: string;
  description: string;
  image: string;
  productCodes?: string[];
  productIds?: any[];
}

const DEFAULT_THEMES: IThemeItem[] = [
  {
    name: 'Tình yêu & Kết nối',
    slug: 'tinh-yeu-ket-noi',
    tag: 'TÌNH DUYÊN & HÀN GẮN',
    description: 'Thạch anh hồng dịu dàng, khơi mở luồng yêu thương thuần khiết và gắn kết tâm hồn tri kỷ.',
    image: 'https://i.pinimg.com/736x/47/9c/df/479cdf269b5b50948b8aef6103b475ed.jpg',
    productCodes: ['AM-RQ020', 'AM-CH002']
  },
  {
    name: 'Bình an & Cân bằng',
    slug: 'binh-an-can-bang',
    tag: 'TĨNH TÂM & NĂNG LƯỢNG',
    description: 'Aquamarine và Moonstone làm dịu tâm trí, giữ sự tĩnh tại, thông suốt trước mọi thử thách.',
    image: 'https://i.pinimg.com/736x/d4/3c/3d/d43c3d69296b0badad1636033dd34e9c.jpg',
    productCodes: ['AM-AQ001', 'AM-MS042', 'AM-CH001', 'AM-AQ003']
  },
  {
    name: 'Tự tin & Tỏa sáng',
    slug: 'tu-tin-toa-sang',
    tag: 'DŨNG KHÍ & TỎA SÁNG',
    description: 'Citrine thắp sáng nguồn năng lượng thái dương, tiếp thêm dũng khí và sức hút rực rỡ.',
    image: 'https://i.pinimg.com/736x/8b/56/4e/8b564e66f5a26e5a7761873879e15a44.jpg',
    productCodes: ['AM-CT005', 'AM-CH003']
  },
  {
    name: 'Tài lộc & May mắn',
    slug: 'tai-loc-may-man',
    tag: 'THỊNH VƯỢNG & TÀI LỘC',
    description: 'Thạch anh tóc vàng và Ngọc Bích chiêu cảm vận may tài chính và thịnh vượng bền lâu.',
    image: 'https://i.pinimg.com/736x/11/72/72/117272714c69b2d8ddb16167812f80eb.jpg',
    productCodes: ['AM-RQ021', 'AM-CH004']
  },
  {
    name: 'Trực giác & Trí tuệ',
    slug: 'truc-giac-tri-tue',
    tag: 'MINH TRIẾT & TRỰC GIÁC',
    description: 'Amethyst thanh tẩy tư duy, khơi mở luân xa con mắt thứ ba cho trực giác nhạy bén.',
    image: 'https://i.pinimg.com/736x/ec/d7/ae/ecd7aed714bc1bb78a5763df4735c05c.jpg',
    productCodes: ['AM-AM008', 'AM-CH005']
  },
  {
    name: 'Bảo hộ & Trừ tà',
    slug: 'bao-ho-tru-ta',
    tag: 'BẢO VỆ & THANH TẨY',
    description: 'Obsidian và Tourmaline đen tạo lớp màng bảo hộ vững chắc, đẩy lùi ám khí và tiêu cực.',
    image: 'https://i.pinimg.com/736x/67/6f/76/676f7614d93ee44fa73ec0b2b8e88e1e.jpg',
    productCodes: ['AM-OB012', 'AM-TM001']
  }
];

@Component({
  selector: 'app-themes',
  standalone: false,
  templateUrl: './themes.component.html',
  styleUrl: './themes.component.css'
})
export class ThemesComponent implements OnInit {
  themes: IThemeItem[] = [...DEFAULT_THEMES];
  selectedTheme: IThemeItem | null = null;
  allProducts: IProduct[] = [];
  products: IProduct[] = [];
  loading = false;
  private _routeSlug = '';

  constructor(
    private _route: ActivatedRoute,
    private _router: Router,
    private _http: HttpClient,
    private _productService: ProductService,
    private _cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this._route.params.subscribe(params => {
      this._routeSlug = (params['slug'] || '').toLowerCase();
      this.syncSelectedTheme();
      if (this.selectedTheme) {
        this.filterProductsForTheme(this.selectedTheme);
      }
      this._cdr.detectChanges();
    });

    this.loading = true;

    // 1. Lấy danh sách sản phẩm từ ProductService
    this._productService.getProducts().subscribe({
      next: (prods) => {
        if (prods && prods.length > 0) {
          this.allProducts = prods;
          if (this.selectedTheme) {
            this.filterProductsForTheme(this.selectedTheme);
          }
        } else {
          this.allProducts = [];
        }
        this.loading = false;
        this._cdr.detectChanges();
      },
      error: () => {
        this.allProducts = [];
        this.loading = false;
        this._cdr.detectChanges();
      }
    });

    // 2. Đồng bộ chủ đề từ API backend trực tiếp từ MongoDB CSDL
    this._http.get<any[]>('/api/themes').subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.themes = data.map(t => {
            const slug = t.slug || '';
            return {
              name: t.name,
              slug: slug,
              tag: t.tag || this.getThemeTag(slug),
              description: t.description || t.desc || 'Chủ đề bảo vật phong thủy AMULES.',
              image: t.image || t.coverImage || t.bannerImage || '',
              productCodes: t.productCodes || [],
              productIds: t.productIds || []
            };
          });
        }

        this.syncSelectedTheme();
        if (this.selectedTheme) {
          this.filterProductsForTheme(this.selectedTheme);
        }
        this.loading = false;
        this._cdr.detectChanges();
      },
      error: () => {
        if (!this.themes || this.themes.length === 0) {
          this.themes = [...DEFAULT_THEMES];
        }
        this.syncSelectedTheme();
        this.loading = false;
        this._cdr.detectChanges();
      }
    });
  }

  private syncSelectedTheme(): void {
    if (this._routeSlug && this.themes.length > 0) {
      const found = this.themes.find(th => th.slug === this._routeSlug);
      this.selectedTheme = found || null;
    } else {
      // Khi ở URL /themes (không có slug), không hiển thị chi tiết mà chỉ hiện danh sách
      this.selectedTheme = null;
    }
  }

  goToTheme(t: IThemeItem): void {
    this._router.navigate(['/themes', t.slug]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  backToThemes(): void {
    this._router.navigate(['/themes']);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  getProductCountForTheme(theme: IThemeItem): number {
    if (!theme || !this.allProducts.length) return 0;
    const codes = theme.productCodes || [];
    const slug = theme.slug || '';

    const matched = this.allProducts.filter(p => {
      const pCode = p.productCode || p.code || '';
      if (codes.includes(pCode)) return true;

      const pId = String(p.id || p._id || '');
      if (theme.productIds && theme.productIds.some(id => String(id?.$oid || id) === pId)) {
        return true;
      }

      const pName = (p.name || '').toLowerCase();
      const pStone = (p.stone || '').toLowerCase();
      const pDesc = (p.description || '').toLowerCase();
      const full = `${pName} ${pStone} ${pDesc}`;

      if (slug === 'tinh-yeu-ket-noi') return full.includes('venus') || full.includes('hồng') || full.includes('tình duyên') || full.includes('rose quartz');
      if (slug === 'binh-an-can-bang') return full.includes('biển xanh') || full.includes('aquamarine') || full.includes('moonstone') || full.includes('hải lam');
      if (slug === 'tu-tin-toa-sang') return full.includes('citrine') || full.includes('ánh dương') || full.includes('thái dương');
      if (slug === 'may-man-co-hoi') return full.includes('aventurine') || full.includes('may mắn') || full.includes('cỏ bốn cánh');
      if (slug === 'chua-lanh-thu-gian') return full.includes('amethyst') || full.includes('tím khói') || full.includes('thanh tẩy');
      if (slug === 'tinh-ban-gan-ket') return full.includes('ngọc bích') || full.includes('nephrite');
      if (slug === 'nang-luong-sang-tao') return full.includes('fluorite') || full.includes('sáng tạo');
      if (slug === 'qua-tang-y-nghia') return full.includes('hộp nhung') || full.includes('quà');
      return false;
    });

    return matched.length || 3;
  }

  filterProductsForTheme(theme: IThemeItem): void {
    if (!theme) return;
    const codes = theme.productCodes || [];
    const slug = theme.slug || '';

    if (!this.allProducts || this.allProducts.length === 0) {
      this.products = [];
      return;
    }

    let matched = this.allProducts.filter(p => {
      const pCode = p.productCode || p.code || '';
      if (codes.includes(pCode)) return true;

      const pId = String(p.id || p._id || '');
      if (theme.productIds && theme.productIds.some(id => String(id?.$oid || id) === pId)) {
        return true;
      }

      const pName = (p.name || '').toLowerCase();
      const pStone = (p.stone || '').toLowerCase();
      const pDesc = (p.description || '').toLowerCase();
      const full = `${pName} ${pStone} ${pDesc}`;

      if (slug === 'tinh-yeu-ket-noi') return full.includes('venus') || full.includes('hồng') || full.includes('tình duyên') || full.includes('rose quartz');
      if (slug === 'binh-an-can-bang') return full.includes('biển xanh') || full.includes('aquamarine') || full.includes('moonstone') || full.includes('hải lam');
      if (slug === 'tu-tin-toa-sang') return full.includes('citrine') || full.includes('ánh dương') || full.includes('thái dương');
      if (slug === 'may-man-co-hoi') return full.includes('aventurine') || full.includes('may mắn') || full.includes('cỏ bốn cánh');
      if (slug === 'chua-lanh-thu-gian') return full.includes('amethyst') || full.includes('tím khói') || full.includes('thanh tẩy');
      if (slug === 'tinh-ban-gan-ket') return full.includes('ngọc bích') || full.includes('nephrite');
      if (slug === 'nang-luong-sang-tao') return full.includes('fluorite') || full.includes('sáng tạo');
      if (slug === 'qua-tang-y-nghia') return full.includes('hộp nhung') || full.includes('quà');
      return false;
    });

    if (matched.length === 0) {
      matched = this.allProducts.slice(0, 6);
    }

    this.products = matched;
  }

  private getThemeTag(slug: string): string {
    const tagMap: Record<string, string> = {
      'tinh-yeu-ket-noi': 'TÌNH DUYÊN & HÀN GẮN',
      'binh-an-can-bang': 'TĨNH TÂM & NĂNG LƯỢNG',
      'tu-tin-toa-sang': 'DŨNG KHÍ & BẢN LĨNH',
      'may-man-co-hoi': 'TÀI LỘC & VẬN KHÍ',
      'chua-lanh-thu-gian': 'THANH TẨY & AN YÊN',
      'tinh-ban-gan-ket': 'TRI KỶ & BỀN VỮNG',
      'nang-luong-sang-tao': 'TRỰC GIÁC & CẢM HỨNG',
      'qua-tang-y-nghia': 'TRAO GỬI YÊU THƯƠNG'
    };
    return tagMap[slug] || 'CHỦ ĐỀ NĂNG LƯỢNG';
  }
}
