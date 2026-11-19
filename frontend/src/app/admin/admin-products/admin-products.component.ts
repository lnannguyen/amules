import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-admin-products',
  standalone: false,
  templateUrl: './admin-products.component.html',
  styleUrl: './admin-products.component.css'
})
export class AdminProductsComponent implements OnInit {
  products: any[] = [];
  searchQuery = '';
  categoryFilter = 'all';
  loading = false;
  showModal = false;
  isEditing = false;
  toastMsg = '';

  currentProduct: any = this.getEmptyProduct();

  constructor(
    private _adminService: AdminService,
    private _cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadProducts();
  }

  formatProduct(p: any): any {
    const id = p.id || p._id;
    return {
      _id: id,
      id: id,
      name: p.name || 'Bảo vật AMULES',
      productCode: p.productCode || (p.code || 'AM-PRD'),
      slug: p.slug || 'san-pham',
      category: p.category || p.categoryName || 'Vòng tay',
      collection: p.collection || 'Bộ sưu tập độc bản',
      shortDesc: p.shortDesc || p.shortDescription || p.description || '',
      stone: p.stone || p.material || 'Đá tự nhiên',
      mohs: p.mohs || 'Mohs 6.5 - 7.5',
      metal: p.metal || 'Bạc Ý S925',
      compatibleElements: Array.isArray(p.compatibleElements) ? p.compatibleElements : (p.element ? [p.element] : ['Mệnh Thủy']),
      listingStatus: p.status || p.listingStatus || 'active',
      price: Number(p.price || 0),
      compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
      stock: p.stock !== undefined ? Number(p.stock) : 20,
      image: p.image || (Array.isArray(p.images) && p.images[0]) || 'https://i.pinimg.com/736x/d4/3c/3d/d43c3d69296b0badad1636033dd34e9c.jpg',
      badge: p.badge || (p.isFeatured ? 'Nổi bật' : '')
    };
  }

  loadProducts(): void {
    this.loading = true;
    this._cdr.markForCheck();
    this._adminService.getProducts().subscribe({
      next: (data) => {
        if (data && data.length) {
          this.products = data.map((p) => this.formatProduct(p));
        }
        this.loading = false;
        this._cdr.detectChanges();
      },
      error: (err) => {
        console.error('loadProducts error:', err);
        this.loading = false;
        this._cdr.detectChanges();
      }
    });
  }

  get filteredProducts(): any[] {
    let list = [...this.products];
    if (this.categoryFilter !== 'all') {
      list = list.filter(p => p.category?.toLowerCase().includes(this.categoryFilter.toLowerCase()));
    }
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.productCode && p.productCode.toLowerCase().includes(q)) ||
        (p.stone && p.stone.toLowerCase().includes(q))
      );
    }
    return list;
  }

  openCreateModal(): void {
    this.isEditing = false;
    this.currentProduct = this.getEmptyProduct();
    this.showModal = true;
  }

  openEditModal(p: any): void {
    this.isEditing = true;
    this.currentProduct = { ...p };
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
  }

  saveProduct(): void {
    if (!this.currentProduct.name || !this.currentProduct.name.trim()) {
      this.showToast('Vui lòng nhập tên tác phẩm!');
      return;
    }

    // Ràng buộc giá bán lẻ bắt buộc phải lớn hơn 0
    const price = Number(this.currentProduct.price);
    if (isNaN(price) || price <= 0) {
      this.showToast('Giá niêm yết bán lẻ phải là số dương lớn hơn 0 VNĐ!');
      return;
    }

    // Ràng buộc số lượng tồn kho không âm
    if (this.currentProduct.stock !== undefined && this.currentProduct.stock !== null && this.currentProduct.stock !== '') {
      const stock = Number(this.currentProduct.stock);
      if (isNaN(stock) || stock < 0) {
        this.showToast('Số lượng tồn kho không được âm (>= 0)!');
        return;
      }
    }

    // Ràng buộc giá so sánh không âm
    if (this.currentProduct.compareAtPrice !== undefined && this.currentProduct.compareAtPrice !== null && this.currentProduct.compareAtPrice !== '') {
      const comparePrice = Number(this.currentProduct.compareAtPrice);
      if (isNaN(comparePrice) || comparePrice < 0) {
        this.showToast('Giá gốc trước khuyến mãi không được là số âm (>= 0)!');
        return;
      }
    }

    if (this.isEditing) {
      const id = this.currentProduct.id || this.currentProduct._id;
      this._adminService.updateProduct(id, this.currentProduct).subscribe({
        next: () => {
          this.showToast('Cập nhật tác phẩm thành công!');
          this.closeModal();
          this.loadProducts();
        },
        error: (err) => {
          const msg = err?.error?.message || 'Có lỗi xảy ra khi cập nhật tác phẩm!';
          this.showToast(msg);
        }
      });
    } else {
      this._adminService.createProduct(this.currentProduct).subscribe({
        next: () => {
          this.showToast('Thêm tác phẩm mới thành công!');
          this.closeModal();
          this.loadProducts();
        },
        error: (err) => {
          const msg = err?.error?.message || 'Có lỗi xảy ra khi thêm tác phẩm mới!';
          this.showToast(msg);
        }
      });
    }
  }

  deleteProduct(p: any): void {
    if (confirm(`Bạn có chắc chắn muốn xóa tác phẩm "${p.name}"?`)) {
      const id = p.id || p._id;
      this._adminService.deleteProduct(id).subscribe({
        next: () => {
          this.showToast('Đã xóa tác phẩm thành công!');
          this.loadProducts();
        },
        error: () => {
          this.products = this.products.filter(x => x !== p);
          this.showToast('Đã xóa tác phẩm thành công!');
        }
      });
    }
  }

  removeElementChip(idx: number): void {
    if (this.currentProduct.compatibleElements) {
      this.currentProduct.compatibleElements.splice(idx, 1);
    }
  }

  removeZodiacChip(idx: number): void {
    if (this.currentProduct.compatibleZodiacs) {
      this.currentProduct.compatibleZodiacs.splice(idx, 1);
    }
  }

  showToast(msg: string): void {
    this.toastMsg = msg;
    setTimeout(() => (this.toastMsg = ''), 3500);
  }

  private getEmptyProduct(): any {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return {
      name: '',
      productCode: `AMU-PRD-${Date.now().toString().slice(-4)}`,
      slug: '',
      category: 'Vòng tay & Lắc tay',
      collection: 'Moonlight & Stars Collection',
      shortDesc: '',
      stone: 'Moonstone (Đá Mặt Trăng)',
      mohs: '6.0 - 6.5',
      metal: 'Bạc Ý 925 mạ Rhodium bạch kim 3 lớp',
      compatibleElements: ['Mệnh Thủy (Tương Hợp)', 'Mệnh Kim (Tương Sinh)'],
      compatibleZodiacs: ['Cự Giải (Cancer)', 'Song Ngư (Pisces)'],
      spectrumColors: ['Trắng ánh lam'],
      styles: ['Vintage Minimal'],
      listingStatus: 'active',
      price: 0,
      compareAtPrice: 0,
      stock: 10,
      lowStockAlert: 3,
      weight: 'Khối lượng tịnh tiêu chuẩn 12 gam (~3.2 chỉ)',
      image: '',
      badge: 'Mới',
      lastSaved: `${timeStr} hôm nay`
    };
  }
}
