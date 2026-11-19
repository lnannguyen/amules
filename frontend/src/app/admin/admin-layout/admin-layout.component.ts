import { Component, HostListener, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-admin-layout',
  standalone: false,
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.css'
})
export class AdminLayoutComponent implements OnInit {
  navItems = [
    { label: 'Tổng quan', icon: 'grid', route: '/admin/dashboard' },
    { label: 'Sản phẩm', icon: 'gem', route: '/admin/products' },
    { label: 'Danh mục & Bộ sưu tập', icon: 'layers', route: '/admin/catalog' },
    { label: 'Đơn hàng', icon: 'package', route: '/admin/orders' },
    { label: 'Khách hàng', icon: 'user', route: '/admin/users' },
    { label: 'Khuyến mãi & Voucher', icon: 'sparkle', route: '/admin/vouchers' },
    { label: 'Quản lý nội dung', icon: 'book-open', route: '/admin/content' }
  ];

  adminName = 'Vũ Hoàng Linh';
  adminRole = 'QUẢN TRỊ VIÊN';
  adminInitial = 'VL';

  showNotifications = false;
  unreadNotifsCount = 3;

  notifications = [
    {
      id: 1,
      type: 'order',
      icon: 'package',
      title: 'Đơn hàng mới #AMU-2026-889',
      message: 'Khách hàng Trần Thu Hà vừa thanh toán thành công đơn hàng 1.250.000đ qua VNPay.',
      time: '12 phút trước',
      read: false,
      link: '/admin/orders'
    },
    {
      id: 2,
      type: 'user',
      icon: 'user',
      title: 'Thành viên mới đăng ký',
      message: 'Người dùng anan265464@gmail.com vừa hoàn tất tạo tài khoản thành viên.',
      time: '45 phút trước',
      read: false,
      link: '/admin/users'
    },
    {
      id: 3,
      type: 'stock',
      icon: 'alert-triangle',
      title: 'Cảnh báo tồn kho thấp',
      message: 'Bảo vật Vòng tay Đá Mặt Trăng Moonstone chỉ còn 2 chiếc trong kho.',
      time: '2 giờ trước',
      read: false,
      link: '/admin/products'
    },
    {
      id: 4,
      type: 'comment',
      icon: 'chat',
      title: 'Câu hỏi tư vấn phong thủy mới',
      message: 'Độc giả đặt câu hỏi dưới bài viết "Ý nghĩa của đá Amethyst".',
      time: '4 giờ trước',
      read: true,
      link: '/admin/content'
    }
  ];

  constructor(
    public adminService: AdminService,
    private _router: Router,
    private _http: HttpClient,
    private _cdr: ChangeDetectorRef
  ) {
    const admin = this.adminService.currentAdmin();
    if (admin && admin.fullName) {
      this.adminName = admin.fullName;
      const parts = admin.fullName.trim().split(' ');
      this.adminInitial = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].substring(0, 2).toUpperCase();
    }
  }

  ngOnInit(): void {
    this.fetchNotifications();
  }

  fetchNotifications(): void {
    this._http.get<any>('/api/admin/notifications', { withCredentials: true }).subscribe({
      next: (res) => {
        if (res && res.notifications && res.notifications.length > 0) {
          this.notifications = res.notifications;
          this.unreadNotifsCount = res.unreadCount !== undefined ? res.unreadCount : this.notifications.filter(n => !n.read).length;
          this._cdr.detectChanges();
        }
      },
      error: () => {}
    });
  }

  toggleNotifications(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.showNotifications = !this.showNotifications;
    this._cdr.detectChanges();
  }

  markAllAsRead(): void {
    this.notifications.forEach(n => (n.read = true));
    this.unreadNotifsCount = 0;
    this._cdr.detectChanges();
  }

  clickNotification(notif: any): void {
    notif.read = true;
    this.unreadNotifsCount = this.notifications.filter(n => !n.read).length;
    this.showNotifications = false;
    this._cdr.detectChanges();
    if (notif.link) {
      this._router.navigateByUrl(notif.link);
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.showNotifications) {
      this.showNotifications = false;
      this._cdr.detectChanges();
    }
  }

  onLogout(): void {
    this.adminService.logout();
    this._router.navigate(['/admin/login']);
  }
}
