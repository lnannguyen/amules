import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

export interface VoucherItem {
  id: string;
  statusKey: 'available' | 'used' | 'locked';
  topBadge: string;
  expiry: string;
  boxTitle: string;
  boxSub: string;
  title: string;
  desc: string;
  code: string;
  ctaLabel: string;
  isGold?: boolean;
}

export interface PointTransactionItem {
  date: string;
  time: string;
  title: string;
  sub: string;
  orderCode: string;
  delta: string;
  balance: string;
}

@Component({
  selector: 'app-rewards',
  standalone: false,
  templateUrl: './rewards.component.html',
  styleUrl: './rewards.component.css'
})
export class RewardsComponent implements OnInit {
  voucherTab = 'all';
  copiedCode = '';

  // Khởi tạo từ CSDL MongoDB, không bịa dữ liệu giả
  vouchers: VoucherItem[] = [];
  history: PointTransactionItem[] = [];
  loading = false;

  constructor(
    private _http: HttpClient,
    public _authService: AuthService
  ) {}

  get currentUser(): any {
    return this._authService.currentUser();
  }

  get userTier(): string {
    return this.currentUser?.tier || 'Thành viên mới';
  }

  get userPoints(): number {
    return this.currentUser?.points !== undefined ? Number(this.currentUser.points) : 0;
  }

  get equivalentCash(): number {
    return this.userPoints * 100;
  }

  get nextTierInfo(): { nextName: string; target: number; progress: number; needed: number } {
    const pts = this.userPoints;
    if (pts < 500) {
      return {
        nextName: 'Thành viên Bạc',
        target: 500,
        progress: Math.min(100, Math.round((pts / 500) * 100)),
        needed: 500 - pts
      };
    } else if (pts < 1000) {
      return {
        nextName: 'Thành viên Vàng',
        target: 1000,
        progress: Math.min(100, Math.round((pts / 1000) * 100)),
        needed: 1000 - pts
      };
    } else {
      return {
        nextName: 'Gemstone VIP (Kim Cương)',
        target: 1500,
        progress: Math.min(100, Math.round((pts / 1500) * 100)),
        needed: Math.max(0, 1500 - pts)
      };
    }
  }

  ngOnInit(): void {
    this.loading = true;

    // 1. Đồng bộ Vouchers thực tế từ CSDL MongoDB
    this._http.get<any[]>('/api/vouchers').subscribe({
      next: (list) => {
        if (list && Array.isArray(list) && list.length > 0) {
          this.vouchers = list.map((v: any, index: number) => {
            const isPercent = v.discountType === 'percentage';
            const valText = isPercent ? `${v.discountValue}%` : `${(Number(v.discountValue || 50000) / 1000)}k`;
            const endDate = v.endDate ? new Date(v.endDate).toLocaleDateString('vi-VN') : '31/12/2026';
            return {
              id: v._id || `v_${index}`,
              statusKey: (v.status === 'active' ? 'available' : 'used') as any,
              topBadge: isPercent ? `GIẢM ${v.discountValue}%` : 'GIẢM GIÁ',
              expiry: `Hạn dùng: ${endDate}`,
              boxTitle: valText,
              boxSub: isPercent ? 'ƯU ĐÃI' : 'GIẢM TRỰC TIẾP',
              title: v.description || v.name || `Mã ưu đãi ${v.code}`,
              desc: v.minOrderValue ? `Áp dụng cho đơn hàng từ ${Number(v.minOrderValue).toLocaleString('vi-VN')}đ.` : 'Áp dụng cho mọi đơn hàng trang sức phong thủy.',
              code: v.code || 'AMULES',
              ctaLabel: 'Sử dụng ngay',
              isGold: index % 2 === 1
            };
          });
        }
      },
      error: () => {}
    });

    // 2. Đồng bộ Lịch sử biến động điểm thực tế từ MongoDB
    this._http.get<any[]>('/api/point-transactions', { withCredentials: true }).subscribe({
      next: (txs) => {
        this.loading = false;
        if (txs && Array.isArray(txs) && txs.length > 0) {
          const curUserId = this.currentUser?._id?.toString() || this.currentUser?.id;
          const userTxs = txs.filter((t: any) => {
            const tUid = (t.userId?.$oid || t.userId || '').toString();
            return !curUserId || tUid === curUserId;
          });

          this.history = userTxs.map((t: any) => {
            const d = t.createdAt ? new Date(t.createdAt) : new Date();
            const sign = t.type === 'spend' ? '-' : '+';
            return {
              date: d.toLocaleDateString('vi-VN'),
              time: d.toLocaleTimeString('vi-VN'),
              title: t.description || 'Giao dịch điểm thưởng AMULES',
              sub: t.sub || (t.orderCode ? `Mã đơn hàng: ${t.orderCode}` : 'Hệ thống tích lũy'),
              orderCode: t.orderCode || '—',
              delta: `${sign}${Number(t.points || 0).toLocaleString('vi-VN')} LT`,
              balance: `${Number(t.balanceAfter || t.points || 0).toLocaleString('vi-VN')} LT`
            };
          });
        } else {
          this.history = [];
        }
      },
      error: () => {
        this.loading = false;
        this.history = [];
      }
    });
  }

  get filteredVouchers(): VoucherItem[] {
    if (this.voucherTab === 'all') return this.vouchers;
    if (this.voucherTab === 'available') {
      return this.vouchers.filter(v => v.statusKey === 'available');
    }
    return this.vouchers.filter(v => v.statusKey !== 'available');
  }

  copyCode(code: string): void {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(code);
    }
    this.copiedCode = code;
    setTimeout(() => (this.copiedCode = ''), 2000);
  }
}
