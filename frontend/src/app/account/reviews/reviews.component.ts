import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-reviews',
  standalone: false,
  templateUrl: './reviews.component.html',
  styleUrl: './reviews.component.css'
})
export class ReviewsComponent implements OnInit {
  activeTab: 'pending' | 'submitted' = 'pending';
  rating = 5;
  reviewTitle = '';
  reviewContent = '';
  submittedSuccess = false;
  submitting = false;

  selectedPendingItem: any = null;
  pendingReviews: any[] = [];
  submittedReviews: any[] = [];

  ratingLabels: Record<number, string> = {
    1: '1 sao - Cần cải thiện',
    2: '2 sao - Tạm ổn',
    3: '3 sao - Hài lòng',
    4: '4 sao - Rất tốt',
    5: '5 sao - Tuyệt vời'
  };

  constructor(
    private _http: HttpClient,
    private _auth: AuthService,
    private _cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    const user = this._auth.currentUser();
    const userEmail = (user?.email || '').toLowerCase();
    const userName = user?.fullName || user?.name || '';

    // 1. Tải danh sách đánh giá từ API
    this._http.get<any[]>('/api/reviews', { withCredentials: true }).subscribe({
      next: (list) => {
        if (list && list.length > 0) {
          const userReviews = list.filter(r => {
            const reEmail = (r.userEmail || '').toLowerCase();
            const reAuthor = (r.author || r.userName || '').toLowerCase();
            return (userEmail && reEmail === userEmail) ||
                   (userName && reAuthor.includes(userName.toLowerCase()));
          });

          this.submittedReviews = userReviews.map(r => ({
            id: r._id,
            productName: r.productName || 'Bảo vật phong thủy AMULES',
            image: r.image || r.images?.[0] || 'https://i.pinimg.com/736x/d4/3c/3d/d43c3d69296b0badad1636033dd34e9c.jpg',
            date: r.createdAt ? new Date(r.createdAt).toLocaleDateString('vi-VN') : (r.date || 'Gần đây'),
            stars: r.stars || r.rating || 5,
            quote: `“${r.content || r.comment || r.quote || r.title || 'Sản phẩm tuyệt vời!'}”`,
            helpfulCount: r.helpfulCount || 0
          }));
        } else {
          this.submittedReviews = [];
        }
        this._cdr.detectChanges();
      },
      error: () => {
        this.submittedReviews = [];
        this._cdr.detectChanges();
      }
    });

    // 2. Tải đơn hàng đã hoàn tất để tìm sản phẩm chờ đánh giá thật
    this._http.get<any[]>('/api/orders', { withCredentials: true }).subscribe({
      next: (orders) => {
        const completed = (orders || []).filter(o => {
          const st = (o.status || o.orderStatus || '').toLowerCase();
          return st === 'completed' || st.includes('thành công') || st.includes('đã giao');
        });

        const pendingItems: any[] = [];
        completed.forEach(o => {
          (o.items || []).forEach((it: any) => {
            pendingItems.push({
              orderId: o._id || o.orderCode,
              orderCode: o.orderCode || o._id,
              date: new Date(o.createdAt || Date.now()).toLocaleDateString('vi-VN'),
              productId: it.productId || it._id,
              name: it.name || it.productName || 'Bảo vật AMULES',
              image: it.image || 'https://i.pinimg.com/736x/d4/3c/3d/d43c3d69296b0badad1636033dd34e9c.jpg',
              stoneTag: it.stoneTag || it.stone || 'Đá tự nhiên'
            });
          });
        });

        this.pendingReviews = pendingItems;
        if (this.pendingReviews.length > 0) {
          this.selectedPendingItem = this.pendingReviews[0];
        }
        this._cdr.detectChanges();
      },
      error: () => {
        this.pendingReviews = [];
        this._cdr.detectChanges();
      }
    });
  }

  setRating(star: number) {
    this.rating = star;
  }

  submitReview() {
    if (!this.reviewContent.trim() || !this.selectedPendingItem) return;
    this.submitting = true;

    const user = this._auth.currentUser();
    const payload = {
      productId: this.selectedPendingItem.productId,
      productName: this.selectedPendingItem.name,
      rating: this.rating,
      title: this.reviewTitle || 'Trải nghiệm bảo vật AMULES',
      content: this.reviewContent,
      image: this.selectedPendingItem.image,
      userEmail: user?.email || '',
      userName: user?.fullName || user?.name || ''
    };

    this._http.post<any>('/api/reviews', payload, { withCredentials: true }).subscribe({
      next: (res) => {
        this.submitting = false;
        this.submittedSuccess = true;
        this.submittedReviews.unshift({
          productName: payload.productName,
          image: payload.image,
          date: 'Hôm nay',
          stars: this.rating,
          quote: `“${this.reviewContent}”`,
          helpfulCount: 0
        });
        // Bỏ sản phẩm đã đánh giá khỏi danh sách chờ
        this.pendingReviews = this.pendingReviews.filter(p => p !== this.selectedPendingItem);
        this.selectedPendingItem = this.pendingReviews[0] || null;
        this.reviewTitle = '';
        this.reviewContent = '';
        this._cdr.detectChanges();
      },
      error: () => {
        this.submitting = false;
        this._cdr.detectChanges();
      }
    });
  }
}
