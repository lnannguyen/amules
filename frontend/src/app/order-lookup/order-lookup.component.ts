import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-order-lookup',
  standalone: false,
  templateUrl: './order-lookup.component.html',
  styleUrl: './order-lookup.component.css'
})
export class OrderLookupComponent {
  orderCode = '';
  contact = '';
  loading = false;
  errorMsg = '';
  successMsg = '';

  searchedOrder: any = null;

  // Cancel modal state
  showCancelModal = false;
  cancelReason = 'Đổi ý không muốn mua nữa';
  customCancelReason = '';
  cancelling = false;

  constructor(private _http: HttpClient) {}

  onSearch(): void {
    if (!this.orderCode.trim() || !this.contact.trim()) {
      this.errorMsg = 'Vui lòng nhập đầy đủ Mã đơn hàng và Email/Số điện thoại đặt hàng.';
      return;
    }
    this.errorMsg = '';
    this.successMsg = '';
    this.loading = true;
    this.searchedOrder = null;

    this._http.post<any>('/api/orders/lookup', {
      orderCode: this.orderCode.trim(),
      contact: this.contact.trim()
    }).subscribe({
      next: (order) => {
        this.loading = false;
        this.searchedOrder = order;
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err.error?.message || 'Không tìm thấy thông tin đơn hàng với thông tin đã nhập.';
      }
    });
  }

  isCancelable(): boolean {
    if (!this.searchedOrder) return false;
    const st = (this.searchedOrder.status || '').toLowerCase();
    const ost = (this.searchedOrder.orderStatus || '').toLowerCase();
    return st === 'pending' || st === 'đã đặt' || st === 'chờ thanh toán' || ost === 'đã đặt' || ost === 'chờ thanh toán';
  }

  openCancelModal(): void {
    this.showCancelModal = true;
  }

  closeCancelModal(): void {
    this.showCancelModal = false;
  }

  confirmCancel(): void {
    if (!this.searchedOrder) return;
    this.cancelling = true;
    const finalReason = this.cancelReason === 'other' ? this.customCancelReason : this.cancelReason;

    const id = this.searchedOrder.orderCode || this.searchedOrder._id;
    this._http.put<any>(`/api/orders/${id}/cancel`, { reason: finalReason }).subscribe({
      next: (res) => {
        this.cancelling = false;
        this.showCancelModal = false;
        this.searchedOrder.status = 'cancelled';
        this.searchedOrder.orderStatus = 'Đã hủy';
        this.searchedOrder.cancelReason = finalReason;
        this.successMsg = 'Hủy đơn hàng thành công! Đơn hàng đã được chuyển sang trạng thái Đã hủy.';
      },
      error: (err) => {
        this.cancelling = false;
        this.errorMsg = err.error?.message || 'Không thể hủy đơn hàng vào lúc này. Vui lòng kiểm tra lại trạng thái đơn hàng hoặc liên hệ CSKH AMULES.';
      }
    });
  }
}
