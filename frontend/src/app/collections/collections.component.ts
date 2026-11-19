import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MasterDataService } from '../services/master-data.service';
import { ProductService, IProduct } from '../services/product.service';

const DEFAULT_COLLECTIONS = [
  {
    name: 'Mystical Vintage',
    slug: 'mystical-vintage',
    tag: 'Cổ điển & Huyền bí',
    desc: 'Phong cách cổ điển huyền bí.',
    image: 'https://i.pinimg.com/736x/d2/c1/cd/d2c1cd50bee4cf66b8a095b253a55beb.jpg'
  },
  {
    name: 'Moon & Stars',
    slug: 'moon-and-stars',
    tag: 'Thiên thể & Chiêm tinh',
    desc: 'Bộ sưu tập lấy cảm hứng từ mặt trăng và tinh tú.',
    image: 'https://i.pinimg.com/736x/53/a4/0f/53a40fcf65d77d5dcc8a9efcb531ac32.jpg'
  },
  {
    name: 'Nàng Thơ (The Muse)',
    slug: 'nang-tho',
    tag: 'Dịu dàng & Lãng mạn',
    desc: 'Vẻ đẹp dịu dàng, lãng mạn.',
    image: 'https://i.pinimg.com/736x/88/cc/a9/88cca9873ac223970e511970e84f478d.jpg'
  }
];

@Component({
  selector: 'app-collections',
  standalone: false,
  templateUrl: './collections.component.html',
  styleUrl: './collections.component.css'
})
export class CollectionsComponent implements OnInit {
  collections: any[] = [...DEFAULT_COLLECTIONS];
  featuredProducts: IProduct[] = [];
  allProducts: IProduct[] = [];
  selectedCollection: any = null;
  private _routeSlug = '';

  constructor(
    private _route: ActivatedRoute,
    private _router: Router,
    private _masterDataService: MasterDataService,
    private _productService: ProductService,
    private _cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this._route.params.subscribe(params => {
      this._routeSlug = (params['slug'] || '').toLowerCase();
      this.syncSelectedCollection();
      this.filterProductsForCollection();
      this._cdr.detectChanges();
    });

    // 1. Nạp danh sách bộ sưu tập trực tiếp từ MongoDB CSDL
    this._masterDataService.getCollections().subscribe({
      next: (list) => {
        if (list && list.length > 0) {
          this.collections = list.map(c => ({
            name: c.name,
            tag: c.tag || ((c.slug || '').includes('moon') ? 'Thiên thể & Chiêm tinh' : (c.slug || '').includes('mystic') ? 'Cổ điển & Huyền bí' : 'Dịu dàng & Lãng mạn'),
            desc: c.desc || (c as any).description || '',
            image: c.image || (c as any).coverImage || '',
            slug: c.slug || c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
          }));
        }
        this.syncSelectedCollection();
        this.filterProductsForCollection();
        this._cdr.detectChanges();
      },
      error: () => {
        this.syncSelectedCollection();
        this.filterProductsForCollection();
        this._cdr.detectChanges();
      }
    });

    // 2. Nạp sản phẩm thật từ MongoDB API
    this._productService.getProducts().subscribe({
      next: (products) => {
        if (products && products.length > 0) {
          this.allProducts = products;
        } else {
          this.allProducts = [];
        }
        this.filterProductsForCollection();
        this._cdr.detectChanges();
      },
      error: () => {
        this.allProducts = [];
        this._cdr.detectChanges();
      }
    });
  }

  private syncSelectedCollection(): void {
    if (this._routeSlug && this.collections.length > 0) {
      const found = this.collections.find(c =>
        (c.slug && c.slug.toLowerCase() === this._routeSlug) ||
        c.name.toLowerCase().includes(this._routeSlug) ||
        this._routeSlug.includes(c.name.toLowerCase())
      );
      this.selectedCollection = found || null;
    } else {
      // Khi ở URL /collections (không có slug), không hiển thị chi tiết mà chỉ hiện danh sách
      this.selectedCollection = null;
    }
  }

  goToCollection(col: any): void {
    this._router.navigate(['/collections', col.slug]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  backToCollections(): void {
    this._router.navigate(['/collections']);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  getProductCount(col: any): number {
    if (!col || !this.allProducts.length) return 0;
    const name = (col.name || '').toLowerCase();
    const slug = (col.slug || '').toLowerCase();
    return this.allProducts.filter(p => {
      const pName = (p.name || '').toLowerCase();
      const pStone = (p.stone || '').toLowerCase();
      const pCol = ((p as any).collection || '').toLowerCase();

      if (slug.includes('moon') || name.includes('moon') || name.includes('sao') || name.includes('tinh tú')) {
        return pName.includes('moonstone') || pName.includes('tinh tú') || pStone.includes('moonstone') || pCol.includes('moon') || pName.includes('celestial');
      }
      if (slug.includes('muse') || name.includes('muse') || name.includes('nàng thơ')) {
        return pName.includes('merlia') || pName.includes('hơi thở') || pName.includes('baroque') || pName.includes('venus') || pCol.includes('muse');
      }
      if (slug.includes('mystic') || name.includes('mystic') || name.includes('vintage') || name.includes('cổ điển')) {
        return pName.includes('amethyst') || pName.includes('khói') || pName.includes('bảo tháp') || pName.includes('kim tự tháp') || pCol.includes('mystic');
      }
      return false;
    }).length || 3;
  }

  private filterProductsForCollection(): void {
    if (!this.selectedCollection || this.allProducts.length === 0) {
      this.featuredProducts = [];
      return;
    }

    const name = (this.selectedCollection.name || '').toLowerCase();
    const slug = (this.selectedCollection.slug || '').toLowerCase();

    let filtered = this.allProducts.filter(p => {
      const pName = (p.name || '').toLowerCase();
      const pStone = (p.stone || '').toLowerCase();
      const pCol = ((p as any).collection || '').toLowerCase();

      if (slug.includes('moon') || name.includes('moon') || name.includes('sao') || name.includes('tinh tú')) {
        return pName.includes('moonstone') || pName.includes('tinh tú') || pStone.includes('moonstone') || pCol.includes('moon') || pName.includes('celestial');
      }
      if (slug.includes('muse') || name.includes('muse') || name.includes('nàng thơ')) {
        return pName.includes('merlia') || pName.includes('hơi thở') || pName.includes('baroque') || pName.includes('venus') || pCol.includes('muse');
      }
      if (slug.includes('mystic') || name.includes('mystic') || name.includes('vintage') || name.includes('cổ điển')) {
        return pName.includes('amethyst') || pName.includes('khói') || pName.includes('bảo tháp') || pName.includes('kim tự tháp') || pCol.includes('mystic');
      }
      return true;
    });

    if (filtered.length === 0) {
      filtered = this.allProducts;
    }
    this.featuredProducts = filtered;
  }
}
