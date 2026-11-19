import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CartService, CartItem } from '../services/cart.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-cart',
  standalone: false,
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.css'
})
export class CartComponent implements OnInit {
  voucherCode = '';
  voucherMsg = '';
  voucherError = '';
  applyingVoucher = false;

  constructor(
    public _cartService: CartService,
    public _authService: AuthService,
    private _router: Router
  ) {}

  ngOnInit(): void {
    if (!this._authService.isLoggedIn()) {
      this._router.navigate(['/login'], { queryParams: { returnUrl: '/cart' } });
    }
  }

  get cartItems(): CartItem[] {
    return this._cartService.cartItems();
  }

  get selectedItems(): CartItem[] {
    return this._cartService.selectedItems();
  }

  get selectedCount(): number {
    return this._cartService.selectedCount();
  }

  get isAllSelected(): boolean {
    return this._cartService.isAllSelected();
  }

  get subtotal(): number {
    return this._cartService.subtotal();
  }

  get shippingFee(): number {
    return this._cartService.shippingFee();
  }

  get discount(): number {
    return this._cartService.discount();
  }

  get totalAmount(): number {
    return this._cartService.totalAmount();
  }

  toggleItemSelect(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    this._cartService.toggleItemSelect(index, input ? input.checked : undefined);
  }

  toggleSelectAll(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input) {
      this._cartService.toggleSelectAll(input.checked);
    }
  }

  updateQuantity(index: number, quantity: number): void {
    this._cartService.updateQuantity(index, quantity).subscribe({ error: () => {} });
  }

  removeItem(index: number): void {
    const item = this.cartItems[index];
    const name = item ? `"${item.name}"` : 'sản phẩm này';
    if (confirm(`Bạn có chắc muốn xóa ${name} khỏi giỏ hàng?`)) {
      this._cartService.removeItem(index).subscribe({ error: () => {} });
    }
  }

  removeSelected(): void {
    if (this.selectedCount === 0) return;
    if (confirm(`Bạn có chắc muốn xóa ${this.selectedCount} sản phẩm đã chọn khỏi giỏ hàng?`)) {
      this._cartService.removeSelected().subscribe({ error: () => {} });
    }
  }

  clearCart(): void {
    if (confirm('Bạn có chắc muốn xóa tất cả sản phẩm khỏi giỏ hàng?')) {
      this._cartService.clearCart();
    }
  }

  onApplyVoucher(): void {
    if (!this.voucherCode.trim()) return;
    this.applyingVoucher = true;
    this.voucherMsg = '';
    this.voucherError = '';

    this._cartService.applyVoucher(this.voucherCode).subscribe({
      next: (res) => {
        this.applyingVoucher = false;
        this.voucherMsg = res.message || 'Áp dụng mã giảm giá thành công!';
      },
      error: (err) => {
        this.applyingVoucher = false;
        this.voucherError = err.message || 'Mã ưu đãi không hợp lệ.';
      }
    });
  }

  removeVoucher(): void {
    this._cartService.removeVoucher();
    this.voucherCode = '';
    this.voucherMsg = '';
    this.voucherError = '';
  }

  goToCheckout(): void {
    if (this.selectedCount === 0) {
      alert('Vui lòng tích chọn ít nhất 1 bảo vật để tiến hành đặt hàng!');
      return;
    }
    this._router.navigate(['/checkout']);
  }
}
