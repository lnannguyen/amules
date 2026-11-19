import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-security',
  standalone: false,
  templateUrl: './security.component.html',
  styleUrl: './security.component.css'
})
export class SecurityComponent {
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  showCurrent = false;
  showNew = false;
  showConfirm = false;

  twoFactorEnabled = true;
  passwordSaved = false;
  saving = false;
  errorMsg = '';

  sessions = [
    {
      id: 1,
      icon: 'laptop',
      device: 'MacBook Pro • Chrome 124',
      location: 'Hà Nội, Việt Nam',
      current: true,
      time: 'Hiện tại (Đang hoạt động)'
    },
    {
      id: 2,
      icon: 'smartphone',
      device: 'iPhone 15 Pro • Safari',
      location: 'Hà Nội, Việt Nam • 2 giờ trước',
      current: false,
      time: ''
    }
  ];

  constructor(
    private _http: HttpClient,
    public _auth: AuthService
  ) {}

  get userPoints(): number {
    return this._auth.currentUser()?.points || 0;
  }

  get maskedPhone(): string {
    const p = this._auth.currentUser()?.phone || '0982456789';
    if (p.length >= 7) {
      return p.substring(0, 3) + ' **** ' + p.substring(p.length - 3);
    }
    return p;
  }

  get passwordStrength(): number {
    const p = this.newPassword;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  }

  updatePassword() {
    if (!this.newPassword || this.newPassword !== this.confirmPassword) {
      this.errorMsg = 'Mật khẩu xác nhận không trùng khớp!';
      return;
    }
    this.saving = true;
    this.errorMsg = '';
    const email = this._auth.currentUser()?.email || 'lananh.gemini@gmail.com';

    this._http.put('/api/auth/password', {
      email,
      currentPassword: this.currentPassword,
      newPassword: this.newPassword
    }, { withCredentials: true }).subscribe({
      next: () => {
        this.saving = false;
        this.passwordSaved = true;
        this.currentPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
        setTimeout(() => (this.passwordSaved = false), 3500);
      },
      error: (err) => {
        this.saving = false;
        this.errorMsg = err.error?.message || 'Không thể đổi mật khẩu. Vui lòng kiểm tra lại.';
      }
    });
  }

  revokeSession(id: number) {
    this.sessions = this.sessions.filter(s => s.id !== id);
  }

  revokeAllOther() {
    this.sessions = this.sessions.filter(s => s.current);
  }

  totpNotice = '';
  configureTotp() {
    this.totpNotice = 'Đang kích hoạt quy trình QR TOTP...';
    setTimeout(() => this.totpNotice = '', 3500);
  }
}