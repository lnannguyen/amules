import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { AuthService } from './auth.service';

export interface AdminStats {
  totalRevenue: number;
  ordersCount: number;
  productsCount: number;
  usersCount: number;
  vouchersCount: number;
  pendingOrders: number;
  completedOrders: number;
  recentOrders: any[];
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  currentAdmin = signal<any>(null);
  isAdminLoggedIn = signal<boolean>(false);

  constructor(
    private _http: HttpClient,
    private _authService: AuthService
  ) {
    const saved = localStorage.getItem('amules_admin');
    if (saved) {
      try {
        const admin = JSON.parse(saved);
        this.currentAdmin.set(admin);
        this.isAdminLoggedIn.set(true);
        if (!this._authService.currentUser()) {
          this._authService.currentUser.set(admin);
          this._authService.isLoggedIn.set(true);
          localStorage.setItem('amules_user', JSON.stringify(admin));
        }
      } catch (e) {}
    }
  }

  login(payload: { username: string; password: string }): Observable<any> {
    return this._http.post('/api/admin/login', payload, { withCredentials: true }).pipe(
      tap((res: any) => {
        if (res && res.admin) {
          this.currentAdmin.set(res.admin);
          this.isAdminLoggedIn.set(true);
          localStorage.setItem('amules_admin', JSON.stringify(res.admin));

          // Đồng bộ phiên tài khoản với giao diện mua sắm bên ngoài
          this._authService.currentUser.set(res.admin);
          this._authService.isLoggedIn.set(true);
          localStorage.setItem('amules_user', JSON.stringify(res.admin));
        }
      })
    );
  }

  logout(): void {
    this.currentAdmin.set(null);
    this.isAdminLoggedIn.set(false);
    localStorage.removeItem('amules_admin');
    if (this._authService.currentUser()?.role === 'admin') {
      this._authService.currentUser.set(null);
      this._authService.isLoggedIn.set(false);
      localStorage.removeItem('amules_user');
    }
  }

  getStats(): Observable<AdminStats> {
    return this._http.get<AdminStats>('/api/admin/stats', { withCredentials: true });
  }

  getOrders(status?: string, search?: string, paymentMethod?: string): Observable<any[]> {
    let url = '/api/admin/orders';
    const params: string[] = [];
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (paymentMethod && paymentMethod !== 'all') params.push(`paymentMethod=${encodeURIComponent(paymentMethod)}`);
    if (params.length) url += `?${params.join('&')}`;
    return this._http.get<any[]>(url, { withCredentials: true });
  }

  createOrder(orderData: any): Observable<any> {
    return this._http.post('/api/admin/orders', orderData, { withCredentials: true });
  }

  updateOrderStatus(id: string, status: string): Observable<any> {
    return this._http.put(`/api/admin/orders/${id}/status`, { status }, { withCredentials: true });
  }

  addInternalNote(orderId: string, author: string, content: string): Observable<any> {
    return this._http.post(`/api/admin/orders/${orderId}/notes`, { author, content }, { withCredentials: true });
  }

  approveReturn(orderId: string, type: 'exchange' | 'refund', note?: string): Observable<any> {
    return this._http.put(`/api/admin/orders/${orderId}/return`, { type, note }, { withCredentials: true });
  }

  getProducts(): Observable<any[]> {
    return this._http.get<any[]>('/api/products');
  }

  createProduct(product: any): Observable<any> {
    return this._http.post('/api/products', product, { withCredentials: true });
  }

  updateProduct(id: string, product: any): Observable<any> {
    return this._http.put(`/api/products/${id}`, product, { withCredentials: true });
  }

  deleteProduct(id: string): Observable<any> {
    return this._http.delete(`/api/products/${id}`, { withCredentials: true });
  }

  getUsers(): Observable<any[]> {
    return this._http.get<any[]>('/api/admin/users', { withCredentials: true });
  }

  updateUserStatus(id: string, status: string): Observable<any> {
    return this._http.put(`/api/admin/users/${id}/status`, { status }, { withCredentials: true });
  }

  getVouchers(): Observable<any[]> {
    return this._http.get<any[]>('/api/admin/vouchers', { withCredentials: true }).pipe(
      timeout(3000),
      catchError(() => this._http.get<any[]>('/api/vouchers').pipe(
        timeout(2000),
        catchError(() => of([]))
      ))
    );
  }

  createVoucher(voucher: any): Observable<any> {
    return this._http.post('/api/admin/vouchers', voucher, { withCredentials: true });
  }

  deleteVoucher(id: string): Observable<any> {
    return this._http.delete(`/api/admin/vouchers/${id}`, { withCredentials: true });
  }

  getArticles(): Observable<any[]> {
    return this._http.get<any[]>('/api/articles').pipe(
      timeout(3000),
      catchError(() => this._http.get<any[]>('/api/admin/catalog/articles').pipe(
        timeout(2000),
        catchError(() => of([]))
      ))
    );
  }

  createArticle(article: any): Observable<any> {
    return this._http.post('/api/admin/catalog/articles', article, { withCredentials: true });
  }

  updateArticle(id: string, article: any): Observable<any> {
    return this._http.put(`/api/admin/catalog/articles/${id}`, article, { withCredentials: true });
  }

  deleteArticle(id: string): Observable<any> {
    return this._http.delete(`/api/admin/catalog/articles/${id}`, { withCredentials: true });
  }

  getBanners(): Observable<any[]> {
    return this._http.get<any[]>('/api/banners').pipe(
      catchError(() => of([]))
    );
  }

  createBanner(banner: any): Observable<any> {
    return this._http.post('/api/banners', banner, { withCredentials: true });
  }

  updateBanner(id: string, banner: any): Observable<any> {
    return this._http.put(`/api/banners/${id}`, banner, { withCredentials: true });
  }

  deleteBanner(id: string): Observable<any> {
    return this._http.delete(`/api/banners/${id}`, { withCredentials: true });
  }
}
