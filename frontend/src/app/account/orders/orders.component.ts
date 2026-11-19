import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

interface OrderProduct {
  elementTag: string;
  name: string;
  variant: string;
  qty: number;
  price: number;
  oldPrice?: number;
  image: string;
}

interface OrderRecord {
  id: string;
  code: string;
  date: string;
  statusKey: 'shipping' | 'completed' | 'cancelled' | 'pending' | 'processing';
  statusLabel: string;
  statusIcon: string;
  transitBanner?: {
    title: string;
    sub: string;
    badge: string;
  };
  items: OrderProduct[];
  total: number;
  paymentMethod: string;
  shippingNote: string;
  canReview?: boolean;
}

@Component({
  selector: 'app-orders',
  standalone: false,
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css'
})
export class OrdersComponent implements OnInit {
  activeTab = 'all';
  searchQuery = '';
  timeRange = '6m';

  orders: OrderRecord[] = [];

  tabs = [
    { key: 'all', label: 'Tất cả (0)' },
    { key: 'pending', label: 'Chờ xác nhận (0)' },
    { key: 'processing', label: 'Đang xử lý (0)' },
    { key: 'shipping', label: 'Đang giao (0)', dot: false },
    { key: 'completed', label: 'Đã giao (0)' },
    { key: 'cancelled', label: 'Đã hủy (0)' }
  ];

  get totalSpent(): number {
    return this.orders.reduce((sum, o) => sum + (o.total || 0), 0);
  }

  get completedCount(): number {
    return this.orders.filter(o => o.statusKey === 'completed').length;
  }

  constructor(
    private _http: HttpClient,
    private _auth: AuthService,
    private _cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this._http.get<any[]>('/api/orders', { withCredentials: true }).subscribe({
      next: (apiOrders) => {
        if (apiOrders && apiOrders.length > 0) {
          this.orders = apiOrders.map(o => {
            const st = (o.status || '').toLowerCase();
            const statusKey: any = (st === 'completed' || st.includes('giao'))
              ? (st === 'shipping' ? 'shipping' : 'completed')
              : (st === 'cancelled' ? 'cancelled' : (st === 'processing' ? 'processing' : 'pending'));

            return {
              id: o.orderCode || o._id,
              code: '#' + (o.orderCode || o._id),
              date: new Date(o.createdAt || Date.now()).toLocaleDateString('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
              }),
              statusKey,
              statusLabel: o.orderStatus || (statusKey === 'completed' ? 'Đã giao hàng thành công' : 'Đang xử lý & thanh tẩy đá'),
              statusIcon: statusKey === 'completed' ? 'check-circle' : 'truck',
              items: (o.items || []).map((i: any) => ({
                elementTag: i.elementTag || i.element || 'Bảo vật ngũ hành',
                name: i.name || i.productName || 'Bảo vật phong thủy',
                variant: i.specs || `Kích thước: ${i.size || 'Tiêu chuẩn'}`,
                qty: Number(i.quantity || 1),
                price: Number(i.price || i.unitPrice || 0),
                image: i.image || ''
              })),
              total: Number(o.totalAmount || 0),
              paymentMethod: o.paymentMethod === 'COD' ? 'Thanh toán khi nhận hàng (COD)' : `Đã thanh toán qua ${o.paymentMethod || 'VNPay'}`,
              shippingNote: o.carrier || 'Giao Hàng Nhanh (GHN Express)'
            };
          });
        } else {
          this.orders = [];
        }
        this.updateTabs();
        this._cdr.detectChanges();
      },
      error: () => {
        this.orders = [];
        this.updateTabs();
        this._cdr.detectChanges();
      }
    });
  }

  private updateTabs(): void {
    this.tabs = [
      { key: 'all', label: `Tất cả (${this.orders.length})` },
      { key: 'pending', label: `Chờ xác nhận (${this.orders.filter(o => o.statusKey === 'pending').length})` },
      { key: 'processing', label: `Đang xử lý (${this.orders.filter(o => o.statusKey === 'processing').length})` },
      { key: 'shipping', label: `Đang giao (${this.orders.filter(o => o.statusKey === 'shipping').length})`, dot: this.orders.some(o => o.statusKey === 'shipping') },
      { key: 'completed', label: `Đã giao (${this.orders.filter(o => o.statusKey === 'completed').length})` },
      { key: 'cancelled', label: `Đã hủy (${this.orders.filter(o => o.statusKey === 'cancelled').length})` }
    ];
  }

  get filteredOrders(): OrderRecord[] {
    return this.orders.filter(o => {
      const matchTab = this.activeTab === 'all' || o.statusKey === this.activeTab;
      const q = this.searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        o.code.toLowerCase().includes(q) ||
        o.items.some(i => i.name.toLowerCase().includes(q));
      return matchTab && matchSearch;
    });
  }
}
