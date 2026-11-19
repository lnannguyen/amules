import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CartService } from '../../services/cart.service';
import { AuthService } from '../../services/auth.service';
import { WishlistService } from '../../services/wishlist.service';

@Component({
  selector: 'app-header',
  standalone: false,
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  announcement = 'Một món trang sức nhỏ, một ý nghĩa dành riêng cho bạn. Miễn phí vận chuyển toàn quốc cho đơn hàng từ 500.000đ';
  keyword = '';
  showUserDropdown = false;

  menu = [
    { label: 'Trang chủ', link: '/' },
    { label: 'Cửa hàng', link: '/products' },
    { label: 'Khám phá theo đá', link: '/themes' },
    { label: 'Bộ sưu tập', link: '/collections' },
    { label: 'Mystic Match', link: '/mystic-match' },
    { label: 'Quà tặng', link: '/gifts' },
    { label: 'Cẩm nang về đá', link: '/articles' },
    { label: 'Về AMULES', link: '/about' }
  ];

  constructor(
    public _cartService: CartService,
    public _authService: AuthService,
    public _wishlistService: WishlistService,
    private _router: Router
  ) { }

  get wishCount(): number {
    return this._wishlistService.count();
  }

  get cartCount(): number {
    return this._cartService.cartCount();
  }

  get accountLink(): string {
    return this._authService.isLoggedIn() ? '/account/overview' : '/login';
  }

  onCartClick(event: Event): void {
    if (!this._authService.isLoggedIn()) {
      event.preventDefault();
      this._router.navigate(['/login'], { queryParams: { returnUrl: '/cart' } });
    }
  }

  toggleDropdown(event?: Event): void {
    if (event) event.stopPropagation();
    this.showUserDropdown = !this.showUserDropdown;
  }

  closeDropdown(): void {
    this.showUserDropdown = false;
  }

  onLogout(): void {
    this.showUserDropdown = false;
    this._authService.logout().subscribe({
      next: () => this._router.navigate(['/login']),
      error: () => this._router.navigate(['/login'])
    });
  }

  onSearch(): void {
    if (this.keyword && this.keyword.trim()) {
      this._router.navigate(['/products'], { queryParams: { search: this.keyword.trim() } });
    } else {
      this._router.navigate(['/products']);
    }
  }
}
