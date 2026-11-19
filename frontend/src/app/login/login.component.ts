import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  user = { email: '', password: '', remember: false };
  showPassword = false;
  submitting = false;
  googleSubmitting = false;
  showGoogleModal = false;
  errorMsg = '';

  googleClientId = '357340138878-4tj8dbnk5osk0n07ltvp7209781qdqlf.apps.googleusercontent.com';

  customGoogleEmail = '';
  customGoogleName = '';
  googleError = '';

  get isCartRedirect(): boolean {
    return this._route.snapshot.queryParams['returnUrl'] === '/cart';
  }

  constructor(
    private _auth: AuthService,
    private _route: ActivatedRoute,
    private _router: Router,
    private _cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    // Tự động điền email gần nhất của người dùng nếu có trong thiết bị này
    if (typeof localStorage !== 'undefined') {
      const savedEmail = localStorage.getItem('amules_remembered_google_email');
      if (savedEmail) {
        this.customGoogleEmail = savedEmail;
      }
    }

    // Xử lý khi Google OAuth chuyển hướng về với token
    if (typeof window !== 'undefined' && window.location.hash && window.location.hash.includes('access_token')) {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      if (accessToken) {
        this.googleSubmitting = true;
        this.showGoogleModal = true;
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
          .then(res => res.json())
          .then(profile => {
            if (profile && profile.email) {
              const googleUser = {
                email: profile.email,
                fullName: profile.name || profile.email.split('@')[0],
                avatar: profile.picture || '',
                authProvider: 'google'
              };
              this._auth.loginWithGoogle(googleUser).subscribe({
                next: () => {
                  this.googleSubmitting = false;
                  this.showGoogleModal = false;
                  window.history.replaceState({}, document.title, window.location.pathname);
                  this._router.navigate(['/']);
                },
                error: () => {
                  this.googleSubmitting = false;
                  this._router.navigate(['/']);
                }
              });
            }
          })
          .catch(() => {
            this.googleSubmitting = false;
            this.showGoogleModal = false;
          });
      }
    }
  }

  openRealGoogleAuth(): void {
    const origin = (typeof window !== 'undefined' && window.location.origin) ? window.location.origin : 'http://localhost:4200';
    const redirectUri = encodeURIComponent(origin);
    const scope = encodeURIComponent('email profile openid');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.googleClientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}&prompt=select_account`;
    window.location.href = authUrl;
  }

  // Đăng nhập trực tiếp bằng tài khoản chọn từ CSDL
  selectDbAccount(account: any): void {
    this.googleSubmitting = true;
    this._auth.loginWithGoogle(account).subscribe({
      next: () => {
        this.googleSubmitting = false;
        this.showGoogleModal = false;
        this._router.navigate(['/account/profile']);
      },
      error: () => {
        this.googleSubmitting = false;
        this.showGoogleModal = false;
        this._router.navigate(['/account/profile']);
      }
    });
  }

  // Đăng nhập nhanh với email Google của người dùng
  loginWithCustomEmail(): void {
    this.googleError = '';
    const raw = (this.customGoogleEmail || '').trim().toLowerCase();
    if (!raw || !raw.includes('@') || !raw.includes('.')) {
      this.googleError = 'Vui lòng nhập địa chỉ email Google hợp lệ (ví dụ: anan265464@gmail.com).';
      return;
    }
    this.googleSubmitting = true;
    const namePart = raw.split('@')[0];
    const capitalized = namePart.charAt(0).toUpperCase() + namePart.slice(1);
    const resolvedName = this.customGoogleName.trim() || ((raw === 'anan265464@gmail.com') ? 'Thu An' : capitalized);

    const googleUser = {
      email: raw,
      fullName: resolvedName,
      authProvider: 'google'
    };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('amules_remembered_google_email', raw);
    }
    this._auth.loginWithGoogle(googleUser).subscribe({
      next: () => {
        this.googleSubmitting = false;
        this.showGoogleModal = false;
        this._router.navigate(['/account/profile']);
      },
      error: (err: any) => {
        this.googleSubmitting = false;
        this.googleError = err?.message || 'Đăng nhập Google thất bại. Vui lòng kiểm tra lại email.';
        this._cdr.detectChanges();
      }
    });
  }

  getMonogram(name?: string): string {
    if (!name) return 'AM';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  onLogin(form: NgForm) {
    if (form.invalid) { return; }
    this.submitting = true;
    this.errorMsg = '';
    const returnUrl = this._route.snapshot.queryParams['returnUrl'] || '/';
    this._auth.login(this.user).subscribe({
      next: () => this._router.navigateByUrl(returnUrl),
      error: (err: Error) => {
        this.errorMsg = err.message;
        this.submitting = false;
        this._cdr.detectChanges();
      }
    });
  }

  onGoogle() {
    this.googleError = '';
    this.showGoogleModal = true;
  }

  closeGoogleModal() {
    this.showGoogleModal = false;
    this.googleError = '';
  }
}
