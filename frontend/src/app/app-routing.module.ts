import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout.component';
import { HomeComponent } from './home/home.component';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { ProductListComponent } from './products/product-list/product-list.component';
import { ProductDetailComponent } from './products/product-detail/product-detail.component';
import { CartComponent } from './cart/cart.component';
import { CheckoutComponent } from './checkout/checkout.component';
import { OrderSuccessComponent } from './checkout/order-success/order-success.component';
import { MysticMatchToolComponent } from './mystic-match/mystic-match-tool.component';
import { CollectionsComponent } from './collections/collections.component';
import { ThemesComponent } from './themes/themes.component';
import { ArticlesComponent } from './articles/articles.component';
import { AboutComponent } from './about/about.component';
import { GiftsComponent } from './gifts/gifts.component';

import { AccountLayoutComponent } from './account/account-layout/account-layout.component';
import { OverviewComponent } from './account/overview/overview.component';
import { ProfileComponent } from './account/profile/profile.component';
import { AddressesComponent } from './account/addresses/addresses.component';
import { OrdersComponent } from './account/orders/orders.component';
import { OrderDetailComponent } from './account/order-detail/order-detail.component';
import { WishlistComponent } from './account/wishlist/wishlist.component';
import { ReviewsComponent } from './account/reviews/reviews.component';
import { MysticMatchComponent } from './account/mystic-match/mystic-match.component';
import { RewardsComponent } from './account/rewards/rewards.component';
import { SecurityComponent } from './account/security/security.component';

import { AdminLayoutComponent } from './admin/admin-layout/admin-layout.component';
import { AdminLoginComponent } from './admin/admin-login/admin-login.component';
import { AdminDashboardComponent } from './admin/admin-dashboard/admin-dashboard.component';
import { AdminProductsComponent } from './admin/admin-products/admin-products.component';
import { AdminOrdersComponent } from './admin/admin-orders/admin-orders.component';
import { AdminVouchersComponent } from './admin/admin-vouchers/admin-vouchers.component';
import { AdminUsersComponent } from './admin/admin-users/admin-users.component';
import { AdminCatalogComponent } from './admin/admin-catalog/admin-catalog.component';
import { OrderLookupComponent } from './order-lookup/order-lookup.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { checkoutGuard } from './guards/checkout.guard';

const routes: Routes = [
  {
    path: 'admin/login',
    component: AdminLoginComponent,
    title: 'Đăng nhập Quản trị viên - AMULES'
  },
  {
    path: 'admin',
    component: AdminLayoutComponent,
    canActivate: [adminGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: AdminDashboardComponent, title: 'Bảng điều khiển - Admin AMULES' },
      { path: 'products', component: AdminProductsComponent, title: 'Quản lý Sản phẩm - Admin AMULES' },
      { path: 'catalog', component: AdminCatalogComponent, title: 'Danh mục & BST - Admin AMULES' },
      { path: 'orders', component: AdminOrdersComponent, title: 'Quản lý Đơn hàng - Admin AMULES' },
      { path: 'vouchers', component: AdminVouchersComponent, title: 'Quản lý Voucher & Khuyến mãi - Admin AMULES' },
      { path: 'content', component: AdminVouchersComponent, title: 'Quản lý Nội dung & Bài viết - Admin AMULES' },
      { path: 'articles', redirectTo: 'content', pathMatch: 'full' },
      { path: 'marketing', redirectTo: 'vouchers', pathMatch: 'full' },
      { path: 'users', component: AdminUsersComponent, title: 'Quản lý Khách hàng - Admin AMULES' },
      { path: 'customers', redirectTo: 'users', pathMatch: 'full' }
    ]
  },
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', component: HomeComponent, title: 'AMULES - Trang chủ' },
      { path: 'products', component: ProductListComponent, title: 'Cửa hàng - AMULES' },
      { path: 'cua-hang', redirectTo: 'products', pathMatch: 'full' },
      { path: 'products/:slug', component: ProductDetailComponent, title: 'Chi tiết bảo vật - AMULES' },
      { path: 'cart', component: CartComponent, canActivate: [authGuard], title: 'Giỏ hàng bảo vật - AMULES' },
      { path: 'checkout', component: CheckoutComponent, canActivate: [checkoutGuard], title: 'Thanh toán & Đặt hàng - AMULES' },
      { path: 'order-success/:code', component: OrderSuccessComponent, title: 'Đặt hàng thành công - AMULES' },
      { path: 'order-lookup', component: OrderLookupComponent, title: 'Tra cứu đơn hàng vãng lai - AMULES' },
      { path: 'tra-cuu-don-hang', redirectTo: 'order-lookup', pathMatch: 'full' },
      { path: 'mystic-match', component: MysticMatchToolComponent, title: 'Mystic Match™ - Chiêm tinh & Phong thủy - AMULES' },
      { path: 'collections', component: CollectionsComponent, title: 'Bộ sưu tập độc bản - AMULES' },
      { path: 'collections/:slug', component: CollectionsComponent, title: 'Bộ sưu tập - AMULES' },
      { path: 'themes', component: ThemesComponent, title: 'Khám phá theo đá & chủ đề - AMULES' },
      { path: 'themes/:slug', component: ThemesComponent, title: 'Chủ đề bảo vật - AMULES' },
      { path: 'gifts', component: GiftsComponent, title: 'Quà tặng ý nghĩa - AMULES' },
      { path: 'articles', component: ArticlesComponent, title: 'Cẩm nang về đá - AMULES' },
      { path: 'articles/:slug', component: ArticlesComponent, title: 'Cẩm nang về đá - AMULES' },
      { path: 'about', component: AboutComponent, title: 'Về AMULES' },
      { path: 'login', component: LoginComponent, title: 'Đăng nhập - AMULES' },
      { path: 'register', component: RegisterComponent, title: 'Đăng ký - AMULES' },
      { path: 'forgot-password', component: ForgotPasswordComponent, title: 'Khôi phục mật khẩu - AMULES' },
      {
        path: 'account',
        component: AccountLayoutComponent,
        canActivate: [authGuard],
        children: [
          { path: '', redirectTo: 'profile', pathMatch: 'full' },
          { path: 'overview', component: OverviewComponent, title: 'Tổng quan tài khoản - AMULES' },
          { path: 'profile', component: ProfileComponent, title: 'Hồ sơ cá nhân - AMULES' },
          { path: 'addresses', component: AddressesComponent, title: 'Sổ địa chỉ - AMULES' },
          { path: 'orders', component: OrdersComponent, title: 'Lịch sử đơn hàng - AMULES' },
          { path: 'orders/:id', component: OrderDetailComponent, title: 'Chi tiết đơn hàng - AMULES' },
          { path: 'wishlist', component: WishlistComponent, title: 'Bảo vật yêu thích - AMULES' },
          { path: 'reviews', component: ReviewsComponent, title: 'Đánh giá của tôi - AMULES' },
          { path: 'mystic-match', component: MysticMatchComponent, title: 'Mystic Match của tôi - AMULES' },
          { path: 'rewards', component: RewardsComponent, title: 'Điểm & Ưu đãi - AMULES' },
          { path: 'security', component: SecurityComponent, title: 'Bảo mật tài khoản - AMULES' }
        ]
      }
    ]
  },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'top' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }