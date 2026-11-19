import { ChangeDetectorRef, Component } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Cross-field validation: mật khẩu và nhập lại mật khẩu phải trùng nhau
export function passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
  const pass = group.get('password')?.value;
  const confirm = group.get('confirmPass')?.value;
  return pass === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-register',
  standalone: false,
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
  showPassword = false;
  showConfirm = false;
  submitting = false;
  errorMsg = '';

  public regForm: FormGroup = new FormGroup({
    fullName: new FormControl('', [Validators.required, Validators.minLength(2)]),
    email: new FormControl('', [Validators.required, Validators.email]),
    phone: new FormControl('', [Validators.required, Validators.pattern(/^0\d{9}$/)]),
    password: new FormControl('', [
      Validators.required,
      Validators.minLength(8),
      Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)
    ]),
    confirmPass: new FormControl('', [Validators.required]),
    agree: new FormControl(false, [Validators.requiredTrue]),
    newsletter: new FormControl(false)
  }, { validators: passwordMatchValidator });

  showGoogleModal = false;
  googleFullName = '';
  googleEmail = '';
  googlePhone = '';
  googlePassword = '';
  googleConfirmPassword = '';
  showGooglePassword = false;
  showGoogleConfirm = false;
  googleSubmitting = false;
  googleError = '';
  googleClientId = '357340138878-4tj8dbnk5osk0n07ltvp7209781qdqlf.apps.googleusercontent.com';

  constructor(
    private _auth: AuthService,
    private _router: Router,
    private _cdr: ChangeDetectorRef
  ) { }

  // Lối tắt để template viết gọn: f['email']
  get f() { return this.regForm.controls; }

  // Độ mạnh mật khẩu: 0 -> 4
  get strength(): number {
    const v: string = this.f['password'].value ?? '';
    let s = 0;
    if (v.length >= 8) s++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) s++;
    if (/\d/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v)) s++;
    return s;
  }
  get strengthText(): string {
    return ['Chưa nhập mật khẩu', 'Mật khẩu yếu', 'Mật khẩu vừa', 'Mật khẩu khá', 'Mật khẩu mạnh'][this.strength];
  }
  get strengthBadge(): string {
    return ['', 'Yếu', 'Vừa', 'Mạnh', 'Rất mạnh'][this.strength];
  }
  // Dấu tick xanh ở ô xác nhận khi 2 mật khẩu khớp
  get passwordsMatch(): boolean {
    const c = this.f['confirmPass'].value;
    return !!c && c === this.f['password'].value;
  }

  onRegister() {
    if (this.regForm.invalid) {
      this.regForm.markAllAsTouched();
      return;
    }
    const v = this.regForm.value;
    this.submitting = true;
    this.errorMsg = '';
    this._auth.register({
      fullName: v.fullName, email: v.email, phone: v.phone,
      password: v.password, newsletter: v.newsletter
    }).subscribe({
      next: () => this._router.navigate(['/account/profile']),
      error: (err: Error) => {
        this.errorMsg = err.message;
        this.submitting = false;
        this._cdr.detectChanges();
      }
    });
  }

  onGoogle(): void {
    this.googleError = '';
    this.showGoogleModal = true;
  }

  closeGoogleModal(): void {
    this.showGoogleModal = false;
    this.googleError = '';
  }

  openRealGoogleAuth(): void {
    const origin = (typeof window !== 'undefined' && window.location.origin) ? window.location.origin : 'http://localhost:4200';
    const redirectUri = encodeURIComponent(origin);
    const scope = encodeURIComponent('email profile openid');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.googleClientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}&prompt=select_account`;
    window.location.href = authUrl;
  }

  registerWithGoogle(): void {
    this.googleError = '';
    const fullName = (this.googleFullName || '').trim();
    const email = (this.googleEmail || '').trim().toLowerCase();
    const phone = (this.googlePhone || '').trim();
    const password = (this.googlePassword || '').trim();
    const confirmPass = (this.googleConfirmPassword || '').trim();

    if (!fullName || fullName.length < 2) {
      this.googleError = 'Vui lòng nhập Họ và tên của bạn (tối thiểu 2 ký tự).';
      return;
    }
    if (!email || !email.includes('@') || !email.includes('.')) {
      this.googleError = 'Vui lòng cung cấp địa chỉ email hợp lệ.';
      return;
    }
    if (!password || password.length < 6) {
      this.googleError = 'Vui lòng nhập mật khẩu bảo mật (tối thiểu 6 ký tự).';
      return;
    }
    if (password !== confirmPass) {
      this.googleError = 'Mật khẩu xác nhận không trùng khớp.';
      return;
    }

    this.googleSubmitting = true;
    const googleUser = {
      fullName,
      email,
      phone: phone || undefined,
      password,
      authProvider: 'google'
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('amules_remembered_google_email', email);
    }

    this._auth.loginWithGoogle(googleUser).subscribe({
      next: () => {
        this.googleSubmitting = false;
        this.showGoogleModal = false;
        this._router.navigate(['/account/profile']);
      },
      error: (err: any) => {
        this.googleSubmitting = false;
        this.googleError = err?.message || 'Không thể đăng ký tài khoản. Vui lòng kiểm tra lại thông tin.';
        this._cdr.detectChanges();
      }
    });
  }
}
