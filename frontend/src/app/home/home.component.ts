import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ProductService, IProduct } from '../services/product.service';
import { MasterDataService, ICategory, ICollection, IArticle } from '../services/master-data.service';

interface ProductItem {
  id?: string;
  slug?: string;
  name: string;
  stone: string;
  price: number;
  sold: string;
  badge: string;
  element: string;
  image: string;
  liked: boolean;
}

@Component({
  selector: 'app-home',
  standalone: false,
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit, OnDestroy {
  private _destroy$ = new Subject<void>();
  // 5 the cam ket duoi banner
  perks = [
    { icon: 'check-circle', title: '100% Tự nhiên', sub: 'Đá quý tuyển chọn' },
    { icon: 'gift', title: 'Hộp nhung may mắn', sub: 'Trọn vẹn tâm tình' },
    { icon: 'infinity', title: 'Bảo hành trọn đời', sub: 'Yên tâm sử dụng' },
    { icon: 'exchange', title: 'Đổi trả 7 ngày', sub: 'Minh bạch & an tâm' },
    { icon: 'lotus', title: 'Tư vấn bản mệnh', sub: 'Năng lượng hộ thân' }
  ];

  categories: ICategory[] = [];

  elements = [
    { tag: 'Kim', icon: 'sun', title: 'Sáng suốt & Khởi đầu', desc: 'Tập trung tinh thần, khơi mở trí tuệ minh triết và thu hút luồng khí hanh thông.', stones: 'Thạch anh trắng, Moonstone', dot: '#c9a24b' },
    { tag: 'Mộc', icon: 'sprout', title: 'Tái sinh & An yên', desc: 'Hòa gần những vết nứt cảm xúc, vỗ về tâm hồn và ươm mầm sinh khí tươi mới.', stones: 'Aventurine, Cẩm thạch xanh', dot: '#7a5a1a' },
    { tag: 'Thủy', icon: 'drop', title: 'Trực giác & Dòng chảy', desc: 'Khai mở linh cảm nhạy bén, giúp tâm trí mềm mại thích ứng trước mọi biến thiên.', stones: 'Aquamarine, Thạch anh đen', dot: '#8a2c6b' },
    { tag: 'Hỏa', icon: 'flame', title: 'Nhiệt huyết & Tỏa sáng', desc: 'Thắp sáng niềm đam mê bất tận, sức quyến rũ tự nhiên và can đảm theo đuổi ước vọng.', stones: 'Thạch anh hồng, Garnet hồng', dot: '#d16a95' },
    { tag: 'Thổ', icon: 'hexagon', title: 'Vững vàng & Thịnh vượng', desc: 'Điểm tựa của sự ổn định, tích lũy may mắn, vượng tài lộc và nuôi dưỡng hộ thân.', stones: 'Thạch anh vàng Citrine, Mắt hổ', dot: '#e0b048' }
  ];

  products: ProductItem[] = [];
  collections: ICollection[] = [];
  posts: IArticle[] = [];

  email = '';
  subscribed = false;

  constructor(
    private _productService: ProductService,
    private _masterDataService: MasterDataService
  ) { }

  ngOnInit(): void {
    // 1. Tải danh mục từ MongoDB API
    this._masterDataService.getCategories().pipe(takeUntil(this._destroy$)).subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.categories = data;
        }
      },
      error: () => { }
    });

    // 2. Tải sản phẩm thật từ MongoDB API
    this._productService.getProducts().pipe(takeUntil(this._destroy$)).subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          // Lọc chỉ lấy các kiệt tác trang sức thực thụ (loại trừ các gói hộp quà phụ kiện)
          const jewelryOnly = data.filter(p => !(p as any).isGiftPackage && p.category !== 'Set quà tặng');
          const sourceList = jewelryOnly.length >= 4 ? jewelryOnly : data;

          this.products = sourceList.slice(0, 8).map(p => ({
            id: p.id || (p._id ? p._id.toString() : ''),
            slug: p.slug || p.id || 'lac-tay-hoi-tho-bien-xanh',
            name: p.name,
            stone: p.stone || 'Đá tự nhiên',
            price: p.price,
            sold: p.sold ? `${p.sold}+` : '100+',
            badge: p.badge || 'Nổi bật',
            element: p.element || '',
            image: p.image || (p.images && p.images[0]) || 'https://i.pinimg.com/736x/d4/3c/3d/d43c3d69296b0badad1636033dd34e9c.jpg',
            liked: false
          }));
        }
      },
      error: () => { }
    });

    // 3. Tải bộ sưu tập từ MongoDB API
    this._masterDataService.getCollections().pipe(takeUntil(this._destroy$)).subscribe({
      next: (cols) => {
        if (cols && cols.length > 0) {
          this.collections = cols.map(c => ({
            name: c.name,
            tag: c.tag || '',
            desc: c.desc || (c as any).description || '',
            image: c.coverImage || c.image || ''
          }));
        }
      },
      error: () => { }
    });

    // 4. Tải bài viết từ MongoDB API
    this._masterDataService.getArticles().pipe(takeUntil(this._destroy$)).subscribe({
      next: (articles) => {
        if (articles && articles.length > 0) {
          this.posts = articles.slice(0, 3).map((a, idx) => ({
            ...a,
            image: a.image || a.thumbnail || '',
            tag: a.tag || a.category || 'Cẩm nang năng lượng',
            read: a.read || '5 phút đọc',
            date: a.date || '12 Tháng 10, 2025'
          }));
        }
      },
      error: () => { }
    });
  }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
  }

  toggleLike(p: ProductItem) { p.liked = !p.liked; }
  subscribe() { if (this.email.includes('@')) { this.subscribed = true; } }

  onImgError(event: any): void {
    if (event && event.target) {
      event.target.src = 'https://i.pinimg.com/736x/d4/3c/3d/d43c3d69296b0badad1636033dd34e9c.jpg';
    }
  }
}
