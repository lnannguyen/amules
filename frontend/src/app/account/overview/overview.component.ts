import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-account-overview',
  standalone: false,
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css'
})
export class OverviewComponent implements OnInit {
  user = {
    name: '',
    email: '',
    phone: '',
    tier: 'Thành viên mới',
    points: 0,
    wishlistCount: 0,
    orderCount: 0,
    addressCount: 0
  };

  recentOrder: any = null;

  constructor(
    private _auth: AuthService,
    private _http: HttpClient
  ) {}

  ngOnInit(): void {
    // 1. Đồng bộ thông tin người dùng từ AuthService / Profile MongoDB
    const u = this._auth.currentUser();
    if (u) {
      this.user.name = u.fullName || u.name || '';
      this.user.email = u.email || '';
      this.user.phone = u.phone || '';
      this.user.tier = u.tier || 'Thành viên mới';
      this.user.points = u.points !== undefined ? Number(u.points) : 0;
    }

    this._http.get<any>('/api/auth/profile', { withCredentials: true }).subscribe({
      next: (res) => {
        if (res && res.user) {
          const usr = res.user;
          this.user.name = usr.fullName || this.user.name;
          this.user.email = usr.email || this.user.email;
          if (usr.phone) this.user.phone = usr.phone;
          if (usr.tier) this.user.tier = usr.tier;
          if (usr.points !== undefined) this.user.points = Number(usr.points);
        }
      },
      error: () => {}
    });

    // 2. Đồng bộ danh sách đơn hàng thật từ MongoDB
    this._http.get<any[]>('/api/orders', { withCredentials: true }).subscribe({
      next: (orders) => {
        if (orders && orders.length > 0) {
          this.user.orderCount = orders.length;
          const top = orders[0];
          this.recentOrder = {
            code: '#' + (top.orderCode || top._id),
            date: new Date(top.createdAt || Date.now()).toLocaleDateString('vi-VN'),
            status: top.orderStatus || (top.status === 'shipping' ? 'Đang giao hàng • Hỏa tốc' : 'Đang xử lý & thanh tẩy đá'),
            total: top.totalAmount || 0,
            itemCount: (top.items && top.items.length) || 1
          };
        } else {
          this.user.orderCount = 0;
          this.recentOrder = null;
        }
      },
      error: () => {
        this.user.orderCount = 0;
        this.recentOrder = null;
      }
    });

    // 3. Đồng bộ sổ địa chỉ từ MongoDB
    this._http.get<any[]>('/api/users/addresses', { withCredentials: true }).subscribe({
      next: (addrs) => {
        if (addrs) this.user.addressCount = addrs.length;
      },
      error: () => {
        this.user.addressCount = 0;
      }
    });

    // 4. Đồng bộ danh sách yêu thích từ MongoDB
    this._http.get<any>('/api/wishlists', { withCredentials: true }).subscribe({
      next: (w) => {
        if (w) this.user.wishlistCount = w.productIds?.length || w.items?.length || 0;
      },
      error: () => {
        this.user.wishlistCount = 0;
      }
    });
  }
}

// Backward compatibility alias for router/module
export { OverviewComponent as AccountOverviewPlaceholderComponent };
export { OverviewComponent as OverviewPlaceholderComponent };
