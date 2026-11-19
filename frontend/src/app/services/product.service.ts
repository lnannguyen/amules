import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, retry, tap, timeout } from 'rxjs/operators';

export interface IProduct {
  _id?: any;
  id?: string;
  name: string;
  code?: string;
  productCode?: string;
  slug?: string;
  price: number;
  originalPrice?: number;
  compareAtPrice?: number | null;
  stone?: string;
  material?: string;
  gemstoneId?: string;
  gemstoneIds?: any[];
  categoryId?: string;
  categoryName?: string;
  category?: string;
  element?: string;
  elementIds?: any[];
  compatibleElements?: string[];
  compatibleZodiacs?: string[];
  inStock?: boolean;
  isFeatured?: boolean;
  status?: string;
  zodiacIds?: any[];
  theme?: string;
  badge?: string;
  sold?: string | number;
  image: string;
  images?: string[];
  sizes?: string[];
  colors?: string[];
  liked?: boolean;
  stock?: number;
  description?: string;
  shortDescription?: string;
  ratingAverage?: number;
  reviewCount?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private readonly API = '/api/products';

  // Signals for state management (Chapter III & IV)
  products = signal<IProduct[]>([]);
  featuredProducts = signal<IProduct[]>([]);
  selectedProduct = signal<IProduct | null>(null);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');

  constructor(private _http: HttpClient) {}

  getProducts(query?: any): Observable<IProduct[]> {
    this.isLoading.set(true);
    let url = this.API;
    if (query) {
      const params = new URLSearchParams();
      Object.keys(query).forEach(k => {
        if (query[k] !== undefined && query[k] !== null && query[k] !== '') {
          params.append(k, query[k]);
        }
      });
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    return this._http.get<IProduct[]>(url).pipe(
      timeout(8000),
      map(items => (items || []).map(p => {
        if (p.element) {
          const parts = p.element.split(/&|,|\+/).map(s => s.trim()).filter(Boolean);
          const uniq = [...new Set(parts)];
          p.element = uniq.length > 0 ? (uniq.length === 1 ? uniq[0] : uniq.join(' & ')) : p.element;
        }
        return p;
      })),
      tap(items => {
        if (items && items.length > 0) {
          const hasNarrowingFilter = query && (
            query.category || query.element || query.gemstone || query.material ||
            query.search || query.minPrice || query.maxPrice || query.inStock
          );
          if (!hasNarrowingFilter || this.products().length === 0) {
            this.products.set(items);
          }
        }
        this.isLoading.set(false);
      }),
      catchError(err => {
        this.isLoading.set(false);
        return of([]);
      })
    );
  }

  getProductById(id: string): Observable<IProduct> {
    const cached = this.products().find(p => p.id === id || p._id === id || p.slug === id);
    if (cached) {
      return of(cached);
    }
    return this._http.get<IProduct>(`${this.API}/${id}`).pipe(
      timeout(3000),
      retry(1),
      catchError(this.handleError)
    );
  }

  getProductBySlug(slug: string): Observable<IProduct> {
    const cached = this.products().find(p => p.slug === slug || p.id === slug || p._id === slug);
    if (cached) {
      return of(cached);
    }
    return this._http.get<IProduct>(`${this.API}/${slug}`).pipe(
      timeout(3000),
      retry(1),
      catchError(this.handleError)
    );
  }

  createProduct(product: Partial<IProduct>): Observable<IProduct> {
    return this._http.post<IProduct>(this.API, product).pipe(
      catchError(this.handleError)
    );
  }

  updateProduct(id: string, product: Partial<IProduct>): Observable<IProduct> {
    return this._http.put<IProduct>(`${this.API}/${id}`, product).pipe(
      catchError(this.handleError)
    );
  }

  deleteProduct(id: string): Observable<any> {
    return this._http.delete<any>(`${this.API}/${id}`).pipe(
      catchError(this.handleError)
    );
  }

  private handleError(error: HttpErrorResponse) {
    console.error('API Error:', error.message);
    const msg = error.error?.message || error.message || 'Lỗi kết nối máy chủ backend.';
    return throwError(() => new Error(msg));
  }
}
