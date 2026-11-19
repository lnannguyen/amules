import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-order-detail',
  standalone: false,
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.css'
})
export class OrderDetailComponent implements OnInit {
  orderCode = '';
  orderDate = '';
  channel = 'Website AMULES Trực Tuyến';
  orderStatus = 'Đang tải thông tin...';
  isCancelled = false;
  isReturned = false;

  recipientName = '';
  recipientPhone = '';
  recipientAddress = '';
  carrier = 'Giao Hàng Nhanh (GHN Express)';
  shippingNote = '';
  trackingCode = '';

  totalAmount = 0;
  subtotal = 0;
  shippingFee = 0;
  discount = 0;
  paymentMethod = 'COD';
  paymentStatus = 'Chưa thanh toán';
  transactionCode = '';

  // Cancel modal
  showCancelModal = false;
  cancelReason = 'Đổi ý không muốn mua nữa';
  customCancelReason = '';
  cancelling = false;

  // Return modal
  showReturnModal = false;
  returnReason = 'Kích thước không vừa (muốn đổi size)';
  returnNote = '';
  returning = false;

  toastMsg = '';

  steps = [
    { status: 'done', badge: 'HOÀN THÀNH', title: 'Đã đặt hàng', time: '' },
    { status: 'done', badge: 'HOÀN THÀNH', title: 'Đã chuyển hàng', time: '' },
    { status: 'active', badge: 'ĐANG XỬ LÝ', title: 'Đang giao hàng', time: '' },
    { status: 'pending', badge: 'CHỜ NHẬN', title: 'Giao thành công', time: '' }
  ];

  items: any[] = [];

  gifts = [
    'Hộp nhung hoàng gia & Thiệp an lành viết tay',
    'Túi thơm thảo mộc thanh tẩy đá tự nhiên'
  ];

  constructor(
    private _route: ActivatedRoute,
    private _http: HttpClient
  ) {}

  ngOnInit(): void {
    const id = this._route.snapshot.paramMap.get('id') || this._route.snapshot.paramMap.get('code');
    if (id) {
      this.orderCode = id.startsWith('#') ? id : `#${id}`;
      this._http.get<any>(`/api/orders/${id.replace('#', '')}`).subscribe({
        next: (order) => {
          if (order) {
            this.orderCode = `#${order.orderCode || id}`;
            this.orderDate = new Date(order.createdAt || Date.now()).toLocaleDateString('vi-VN', {
              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            const st = (order.status || order.orderStatus || '').toLowerCase();
            if (st === 'cancelled' || st.includes('hủy')) {
              this.isCancelled = true;
              this.orderStatus = 'Đã hủy';
              this.steps.forEach(s => s.status = 'pending');
            } else if (st === 'completed' || st.includes('đã giao') || st.includes('thành công')) {
              this.orderStatus = 'Giao thành công';
              this.steps.forEach(s => s.status = 'done');
            } else if (st === 'shipping' || st.includes('đang giao')) {
              this.orderStatus = 'Đang giao hàng';
              this.steps[0].status = 'done';
              this.steps[1].status = 'done';
              this.steps[2].status = 'active';
              this.steps[3].status = 'pending';
            } else {
              this.orderStatus = order.orderStatus || 'Đang xử lý';
              this.steps[0].status = 'done';
              this.steps[1].status = 'active';
              this.steps[2].status = 'pending';
              this.steps[3].status = 'pending';
            }

            if (order.trackingCode) {
              this.trackingCode = order.trackingCode;
            }
            if (order.carrier) {
              this.carrier = order.carrier;
            }

            this.totalAmount = Number(order.totalAmount || 0);
            this.subtotal = Number(order.subtotal || this.totalAmount);
            this.discount = Number(order.discount || 0);
            this.shippingFee = Number(order.shippingFee || 0);

            this.paymentMethod = order.paymentMethod || 'COD';
            this.paymentStatus = (this.paymentMethod === 'COD' && this.orderStatus !== 'Giao thành công')
              ? 'Thanh toán khi nhận hàng'
              : 'Đã hoàn tất thanh toán';
            this.transactionCode = order.transactionCode || order.paymentId || (this.paymentMethod !== 'COD' ? `VNP_${order.orderCode || id}` : '');

            if (order.items && order.items.length > 0) {
              this.items = order.items.map((i: any) => ({
                name: i.name || i.productName || 'Bảo vật phong thủy',
                element: i.element || i.elementTag || 'Bảo vật phong thủy',
                spec: i.specs || (i.size ? `Kích thước: ${i.size}` : 'Tiêu chuẩn'),
                qty: (i.quantity || 1).toString().padStart(2, '0'),
                price: Number(i.price || i.unitPrice || 0),
                image: i.image || 'https://i.pinimg.com/736x/d4/3c/3d/d43c3d69296b0badad1636033dd34e9c.jpg'
              }));
            }

            if (order.customer || order.shippingAddress) {
              this.recipientName = order.customer?.fullName || order.shippingAddress?.fullName || order.shippingAddress?.recipient || '';
              this.recipientPhone = order.customer?.phone || order.shippingAddress?.phone || '';
              const s = order.shippingAddress;
              if (s) {
                this.recipientAddress = s.address || `${s.street || ''}, ${s.ward || ''}, ${s.district || ''}, ${s.city || s.province || ''}`;
                this.shippingNote = s.note || order.note || 'Giao giờ hành chính, gọi trước 15 phút.';
              }
            }
          }
        },
        error: () => {
          this.orderStatus = 'Không tìm thấy đơn hàng';
        }
      });
    }
  }

  printInvoice() {
    window.print();
  }

  openCancelModal(): void {
    this.showCancelModal = true;
  }

  closeCancelModal(): void {
    this.showCancelModal = false;
  }

  confirmCancel(): void {
    const finalReason = this.cancelReason === 'Khác' ? this.customCancelReason : this.cancelReason;
    if (!finalReason) return;

    this.cancelling = true;
    const cleanId = this.orderCode.replace('#', '');
    this._http.put<any>(`/api/orders/${cleanId}/cancel`, { reason: finalReason }).subscribe({
      next: () => {
        this.cancelling = false;
        this.showCancelModal = false;
        this.isCancelled = true;
        this.orderStatus = 'Đã hủy';
        this.toastMsg = 'Đã hủy đơn hàng thành công.';
        setTimeout(() => this.toastMsg = '', 4000);
      },
      error: (err) => {
        this.cancelling = false;
        this.toastMsg = err.error?.message || 'Không thể hủy đơn hàng vào lúc này.';
        setTimeout(() => this.toastMsg = '', 4000);
      }
    });
  }

  openReturnModal(): void {
    this.showReturnModal = true;
  }

  closeReturnModal(): void {
    this.showReturnModal = false;
  }

  confirmReturn(): void {
    if (!this.returnReason) return;
    this.returning = true;
    const cleanId = this.orderCode.replace('#', '');
    this._http.post<any>('/api/return-requests', {
      orderId: cleanId,
      reason: this.returnReason,
      note: this.returnNote
    }).subscribe({
      next: () => {
        this.returning = false;
        this.showReturnModal = false;
        this.isReturned = true;
        this.toastMsg = 'Đã gửi yêu cầu đổi trả thành công. Chuyên viên AMULES sẽ liên hệ bạn.';
        setTimeout(() => this.toastMsg = '', 4000);
      },
      error: (err) => {
        this.returning = false;
        this.toastMsg = err.error?.message || 'Không thể gửi yêu cầu đổi trả vào lúc này.';
        setTimeout(() => this.toastMsg = '', 4000);
      }
    });
  }
}
