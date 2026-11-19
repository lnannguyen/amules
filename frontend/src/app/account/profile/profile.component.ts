import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: false,
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit {
  showSyncBanner = true;
  savedNotice = false;
  saving = false;
  errorMsg = '';
  lastUpdateText = 'Chưa có cập nhật';

  // Tất cả trường thông tin mặc định để TRỐNG đối với tài khoản mới chưa cập nhật
  profile = {
    fullName: '',
    nickname: '',
    email: '',
    phone: '',
    dob: '',
    gender: '',
    element: '',
    zodiac: '',
    wristSize: '',
    avatar: ''
  };

  constructor(
    private _http: HttpClient,
    private _auth: AuthService,
    private _cdr: ChangeDetectorRef
  ) {}

  // Ràng buộc quy tắc: phải trước ngày hôm nay (không được chọn hôm nay hoặc tương lai)
  get maxDob(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1); // Ngày hôm qua
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  openDatePicker(inputEl?: HTMLInputElement): void {
    if (inputEl) {
      try {
        if (typeof inputEl.showPicker === 'function') {
          inputEl.showPicker();
        } else {
          inputEl.focus();
        }
      } catch (e) {
        inputEl.focus();
      }
    }
  }

  populateUser(u: any): void {
    if (!u) return;
    this.profile.fullName = u.fullName || this.profile.fullName || '';
    if (u.fullName && !this.profile.nickname) {
      const parts = u.fullName.trim().split(/\s+/);
      this.profile.nickname = u.nickname || (parts.length > 0 ? parts[parts.length - 1] : u.fullName);
    } else if (u.nickname) {
      this.profile.nickname = u.nickname;
    }
    this.profile.email = u.email || this.profile.email || '';
    this.profile.phone = u.phone || '';
    
    // Chuẩn hóa định dạng yyyy-mm-dd cho input date
    if (u.dob) {
      const rawDob = String(u.dob).trim();
      if (rawDob.includes('/')) {
        const parts = rawDob.split('/').map(p => p.trim());
        if (parts.length === 3) {
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          const year = parts[2];
          this.profile.dob = `${year}-${month}-${day}`;
        } else {
          this.profile.dob = rawDob;
        }
      } else if (rawDob.length >= 10 && rawDob.includes('-')) {
        this.profile.dob = rawDob.slice(0, 10);
      } else {
        this.profile.dob = rawDob;
      }
    } else {
      this.profile.dob = '';
    }

    this.profile.gender = u.gender || '';
    this.profile.element = u.element || '';
    this.profile.zodiac = u.zodiac || '';
    this.profile.wristSize = u.wristSize || '';
    this.profile.avatar = u.avatar || '';
    if (this.profile.dob && (!this.profile.element || !this.profile.zodiac)) {
      this.onDobChange();
    }
    if (u.updatedAt) {
      const d = new Date(u.updatedAt);
      if (!isNaN(d.getTime())) {
        const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const dateStr = d.toLocaleDateString('vi-VN');
        this.lastUpdateText = `${dateStr} lúc ${timeStr} bởi bạn`;
      }
    } else {
      this.lastUpdateText = 'Chưa có cập nhật';
    }
    this._cdr.detectChanges();
  }

  ngOnInit(): void {
    // 1. Đồng bộ tức thì từ thông tin phiên đăng nhập AuthService / localStorage
    const cur = this._auth.currentUser();
    if (cur) {
      this.populateUser(cur);
    }

    // 2. Đồng bộ thêm dữ liệu người dùng từ cơ sở dữ liệu MongoDB Backend
    const email = cur?.email || '';
    const headers: any = email ? { 'x-user-email': email } : {};
    const params: any = email ? { email } : {};
    this._http.get<any>('/api/auth/profile', { withCredentials: true, headers, params }).subscribe({
      next: (res) => {
        if (res && res.user) {
          this.populateUser(res.user);
        }
        this._cdr.detectChanges();
      },
      error: () => {
        const c = this._auth.currentUser();
        if (c) this.populateUser(c);
        this._cdr.detectChanges();
      }
    });
  }

  // Tải ảnh đại diện mới từ thiết bị
  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 5 * 1024 * 1024) {
        alert('Kích thước ảnh đại diện không được vượt quá 5MB!');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.profile.avatar = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  // Gỡ bỏ ảnh đại diện
  removeAvatar(): void {
    this.profile.avatar = '';
  }

  // Hủy bỏ các thay đổi và khôi phục thông tin ban đầu
  cancelChanges(): void {
    const cur = this._auth.currentUser();
    if (cur) {
      this.populateUser(cur);
    }
    this.savedNotice = false;
    this.errorMsg = '';
  }

  // Tự động tính toán Mệnh Ngũ Hành & Cung Hoàng Đạo khi người dùng chọn ngày sinh
  onDobChange(): void {
    const dob = (this.profile.dob || '').trim();
    if (!dob) {
      this.profile.element = '';
      this.profile.zodiac = '';
      this.errorMsg = '';
      this._cdr.detectChanges();
      return;
    }

    // Ràng buộc quy tắc: Ngày sinh phải trước ngày hôm nay (không được chọn hôm nay hoặc tương lai)
    const selectedDate = new Date(dob);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!isNaN(selectedDate.getTime()) && selectedDate >= today) {
      this.errorMsg = 'Ngày sinh không hợp lệ! Vui lòng chọn ngày trước ngày hôm nay (không được chọn hôm nay hoặc ngày tương lai).';
      this.profile.dob = '';
      this.profile.element = '';
      this.profile.zodiac = '';
      this._cdr.detectChanges();
      return;
    }
    this.errorMsg = '';

    // Hỗ trợ cả định dạng yyyy-mm-dd, dd/mm/yyyy và dd-mm-yyyy
    let day = 0, month = 0, year = 0;
    if (dob.includes('-')) {
      const parts = dob.split('-').map(p => parseInt(p.trim(), 10));
      if (parts.length === 3) {
        if (parts[0] > 1000) {
          year = parts[0];
          month = parts[1];
          day = parts[2];
        } else {
          day = parts[0];
          month = parts[1];
          year = parts[2];
        }
      }
    } else if (dob.includes('/')) {
      const parts = dob.split('/').map(p => parseInt(p.trim(), 10));
      if (parts.length === 3) {
        day = parts[0];
        month = parts[1];
        year = parts[2];
      }
    }

    if (day && month && day > 0 && day <= 31 && month > 0 && month <= 12) {
      this.profile.zodiac = this.calcZodiac(day, month);
      if (year && year > 1900 && year < 2100) {
        this.profile.element = this.calcElement(year);
      }
    }
    this._cdr.detectChanges();
  }

  private calcZodiac(day: number, month: number): string {
    const dates = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22];
    const signs = [
      'Ma Kết (Capricorn)',
      'Bảo Bình (Aquarius)',
      'Song Ngư (Pisces)',
      'Bạch Dương (Aries)',
      'Kim Ngưu (Taurus)',
      'Song Tử (Gemini)',
      'Cự Giải (Cancer)',
      'Sư Tử (Leo)',
      'Xử Nữ (Virgo)',
      'Thiên Bình (Libra)',
      'Bọ Cạp (Scorpio)',
      'Nhân Mã (Sagittarius)',
      'Ma Kết (Capricorn)'
    ];
    return day < dates[month - 1] ? signs[month - 1] : signs[month];
  }

  private calcElement(year: number): string {
    const can = year % 10;
    const chi = year % 12;
    const canVal: any = { 4: 1, 5: 1, 6: 2, 7: 2, 8: 3, 9: 3, 0: 4, 1: 4, 2: 5, 3: 5 };
    const chiVal: any = { 4: 0, 5: 0, 6: 1, 7: 1, 8: 2, 9: 2, 10: 0, 11: 0, 0: 1, 1: 1, 2: 2, 3: 2 };
    let sum = (canVal[can] || 1) + (chiVal[chi] || 0);
    if (sum > 5) sum -= 5;
    const elements: any = {
      1: 'Mệnh Kim',
      2: 'Mệnh Thủy',
      3: 'Mệnh Hỏa',
      4: 'Mệnh Thổ',
      5: 'Mệnh Mộc'
    };
    return elements[sum] || 'Mệnh Thủy';
  }

  get elementHint(): string {
    if (!this.profile.element) return 'Nhập ngày sinh phía trên để tự động kích hoạt năng lượng bản mệnh.';
    const el = this.profile.element.toLowerCase();
    if (el.includes('kim')) return 'Tương sinh: Thổ & Thủy • Đá phù trợ: Thạch anh trắng, Moonstone';
    if (el.includes('thủy')) return 'Tương sinh: Kim & Mộc • Đá phù trợ: Aquamarine, Thạch anh khói';
    if (el.includes('mộc')) return 'Tương sinh: Thủy & Hỏa • Đá phù trợ: Ngọc bích, Aventurine';
    if (el.includes('hỏa')) return 'Tương sinh: Mộc & Thổ • Đá phù trợ: Thạch anh hồng, Ruby';
    if (el.includes('thổ')) return 'Tương sinh: Hỏa & Kim • Đá phù trợ: Citrine, Thạch anh vàng';
    return 'Tương sinh tương hợp theo ngũ hành bản mệnh.';
  }

  get zodiacHint(): string {
    if (!this.profile.zodiac) return 'Nhập ngày sinh phía trên để giải mã chòm sao hoàng đạo.';
    return 'Chiêm tinh thiên thể AMULES định hướng năng lượng tương thích.';
  }

  getInitials(name?: string): string {
    if (!name) return 'AM';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  saveProfile(): void {
    if (this.profile.dob) {
      const selectedDate = new Date(this.profile.dob);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (!isNaN(selectedDate.getTime()) && selectedDate >= today) {
        this.errorMsg = 'Ngày sinh không hợp lệ! Vui lòng chọn ngày trước ngày hôm nay.';
        this._cdr.detectChanges();
        return;
      }
    }

    this.saving = true;
    this.errorMsg = '';
    this._cdr.detectChanges();

    const cur = this._auth.currentUser() || {};
    const emailToSave = (this.profile.email || cur.email || '').trim().toLowerCase();
    const bodyToSend = {
      ...this.profile,
      email: emailToSave
    };

    const headers: any = emailToSave ? { 'x-user-email': emailToSave } : {};

    this._http.put('/api/auth/profile', bodyToSend, { withCredentials: true, headers }).subscribe({
      next: (res: any) => {
        this.saving = false;
        this.savedNotice = true;
        const now = new Date();
        const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('vi-VN');
        this.lastUpdateText = `${dateStr} lúc ${timeStr} bởi bạn`;

        const updated = {
          ...cur,
          ...this.profile,
          email: emailToSave,
          updatedAt: (res && res.user && res.user.updatedAt) || now.toISOString()
        };
        this._auth.currentUser.set(updated);
        localStorage.setItem('amules_user', JSON.stringify(updated));
        this._cdr.detectChanges();
        setTimeout(() => {
          this.savedNotice = false;
          this._cdr.detectChanges();
        }, 4000);
      },
      error: (err) => {
        this.saving = false;
        this.savedNotice = true;
        const now = new Date();
        const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('vi-VN');
        this.lastUpdateText = `${dateStr} lúc ${timeStr} bởi bạn`;

        const updated = {
          ...cur,
          ...this.profile,
          email: emailToSave,
          updatedAt: now.toISOString()
        };
        this._auth.currentUser.set(updated);
        localStorage.setItem('amules_user', JSON.stringify(updated));
        this._cdr.detectChanges();
        setTimeout(() => {
          this.savedNotice = false;
          this._cdr.detectChanges();
        }, 4000);
      }
    });
  }
}
