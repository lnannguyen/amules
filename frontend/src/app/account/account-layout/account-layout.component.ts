import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { WishlistService } from '../../services/wishlist.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: string;
}

@Component({
  selector: 'app-account-layout',
  standalone: false,
  templateUrl: './account-layout.component.html',
  styleUrl: './account-layout.component.css'
})
export class AccountLayoutComponent implements OnInit {
  user = {
    name: '',
    tier: 'Thành viên mới',
    points: '0 LT',
    nextTierNote: 'Khởi đầu tích lũy năng lượng bảo mệnh',
    progress: 0,
    avatar: ''
  };

  navItems: NavItem[] = [
    { label: 'Tổng quan tài khoản', icon: 'grid', route: '/account/overview' },
    { label: 'Hồ sơ cá nhân', icon: 'user', route: '/account/profile' },
    { label: 'Sổ địa chỉ', icon: 'pin', route: '/account/addresses' },
    { label: 'Lịch sử đơn hàng', icon: 'receipt', route: '/account/orders' },
    { label: 'Bảo vật yêu thích', icon: 'heart', route: '/account/wishlist' },
    { label: 'Đánh giá của tôi', icon: 'star', route: '/account/reviews' },
    { label: 'Mystic Match', icon: 'sparkle', route: '/account/mystic-match' },
    { label: 'Điểm & Ưu đãi', icon: 'gem', route: '/account/rewards' },
    { label: 'Bảo mật tài khoản', icon: 'lock', route: '/account/security' }
  ];

  currentCrumb = 'Hồ sơ cá nhân';

  constructor(
    private router: Router,
    private _authService: AuthService,
    private _wishlistService: WishlistService,
    private _http: HttpClient
  ) {
    if (!this._authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.syncUser();
    this.updateCrumb(this.router.url);
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => this.updateCrumb(e.urlAfterRedirects || e.url));
  }

  ngOnInit(): void {
    this.syncUser();
    this.syncBadges();
  }

  getInitials(name?: string): string {
    if (!name) return 'AM';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  private syncUser(): void {
    const current = this._authService.currentUser();
    if (current) {
      this.user.name = current.fullName || current.name || 'Thành viên AMULES';
      this.user.avatar = current.avatar || '';
      this.user.tier = current.tier || 'Thành viên mới';
      const pts = current.points !== undefined ? Number(current.points) : 0;
      this.user.points = `${pts.toLocaleString('vi-VN')} LT`;
      this.user.progress = Math.min(100, Math.round((pts / 1000) * 100));
      this.user.nextTierNote = pts > 0
        ? `Tích lũy thêm ${Math.max(0, 500 - pts)} điểm để lên hạng Bạc`
        : 'Khởi đầu tích lũy năng lượng bảo mệnh';
    }
  }

  private syncBadges(): void {
    // 1. Wishlist badge
    const wishCount = this._wishlistService.count();
    const wishItem = this.navItems.find(i => i.route === '/account/wishlist');
    if (wishItem) {
      wishItem.badge = wishCount > 0 ? `${wishCount} món` : undefined;
    }

    // 2. Orders badge
    this._http.get<any[]>('/api/orders', { withCredentials: true }).subscribe({
      next: (orders) => {
        const orderItem = this.navItems.find(i => i.route === '/account/orders');
        if (orderItem) {
          orderItem.badge = (orders && orders.length > 0) ? `${orders.length} đơn` : undefined;
        }
      },
      error: () => { }
    });

    // 3. Addresses badge
    this._http.get<any[]>('/api/users/addresses', { withCredentials: true }).subscribe({
      next: (addrs) => {
        const addrItem = this.navItems.find(i => i.route === '/account/addresses');
        if (addrItem) {
          addrItem.badge = (addrs && addrs.length > 0) ? `${addrs.length}` : undefined;
        }
      },
      error: () => { }
    });
  }

  private updateCrumb(url: string) {
    if (url.includes('/orders/')) {
      this.currentCrumb = 'Lịch sử đơn hàng  ›  Chi tiết đơn hàng';
      return;
    }
    const found = this.navItems.find(i => url.startsWith(i.route));
    this.currentCrumb = found ? found.label : 'Hồ sơ cá nhân';
  }

  logout() {
    this._authService.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login'])
    });
  }
}