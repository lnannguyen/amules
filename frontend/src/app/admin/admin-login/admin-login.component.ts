import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-admin-login',
  standalone: false,
  templateUrl: './admin-login.component.html',
  styleUrl: './admin-login.component.css'
})
export class AdminLoginComponent {
  credentials = {
    username: 'admin.an@amules.com',
    password: ''
  };
  rememberMe = true;
  submitting = false;
  showPassword = false;
  failedAttempts = 0;
  isLocked = false;
  lockoutTimer = 896; // ~14m56s in seconds
  errorMsg = '';
  timerInterval: any;

  constructor(
    private _adminService: AdminService,
    private _router: Router
  ) {}

  get formattedTimer(): string {
    const mins = Math.floor(this.lockoutTimer / 60);
    const secs = this.lockoutTimer % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  onLogin(): void {
    if (this.isLocked) {
      return;
    }
    if (!this.credentials.username || !this.credentials.password) {
      this.errorMsg = 'Vui lòng nhập tài khoản và mật khẩu bảo mật!';
      return;
    }

    this.submitting = true;
    this.errorMsg = '';

    this._adminService.login(this.credentials).subscribe({
      next: () => {
        this.submitting = false;
        this.failedAttempts = 0;
        this._router.navigate(['/admin/dashboard']);
      },
      error: (err) => {
        this.submitting = false;
        this.failedAttempts++;
        if (err.status === 403 || err.error?.locked || this.failedAttempts >= 5) {
          this.isLocked = true;
          this.errorMsg = err.error?.message || 'Tài khoản tạm khóa 15 phút do nhập sai mật khẩu quá 5 lần liên tiếp. Để bảo vệ tài sản và dữ liệu hệ thống AMULES, cổng quản trị tạm thời đình chỉ phiên đăng nhập này.';
          if (err.error?.remainingMinutes) {
            this.lockoutTimer = err.error.remainingMinutes * 60;
          }
          this.startLockoutCountdown();
        } else {
          this.errorMsg = err.error?.message || `Mật khẩu không chính xác (Thử lần ${this.failedAttempts}/5)`;
        }
      }
    });
  }

  startLockoutCountdown(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.lockoutTimer > 0) {
        this.lockoutTimer--;
      } else {
        this.isLocked = false;
        this.failedAttempts = 0;
        this.lockoutTimer = 900;
        this.errorMsg = '';
        clearInterval(this.timerInterval);
      }
    }, 1000);
  }

  requestOtp(): void {
    alert('Mã OTP 2FA khẩn cấp đã được gửi tới số điện thoại/email của Super Admin.');
  }
}
