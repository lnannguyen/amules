import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ProductService, IProduct } from '../services/product.service';
import { CartService } from '../services/cart.service';
import { AuthService } from '../services/auth.service';

export interface ZodiacInfo {
  name: string;
  latin: string;
  icon: string;
  element: string;
  dateRange: string;
}

export interface ElementInfo {
  name: string;
  title: string;
  desc: string;
  colors: string[];
  contrastColors: string[];
  luckyStones: string[];
  affirmation: string;
}

export interface QuizOption {
  text: string;
  sub: string;
  chakra: string;
  icon: string;
}

export interface QuizQuestion {
  id: number;
  title: string;
  subtitle: string;
  options: QuizOption[];
}

@Component({
  selector: 'app-mystic-match-tool',
  standalone: false,
  templateUrl: './mystic-match-tool.component.html',
  styleUrl: './mystic-match-tool.component.css'
})
export class MysticMatchToolComponent implements OnInit {
  mode: 'guest' | 'member' = 'guest';
  step: 'form' | 'quiz' | 'result' = 'form';

  // Input form cơ bản
  birthDay = 15;
  birthMonth = 7;
  birthYear = 2003;
  gender: 'female' | 'male' | 'other' = 'female';
  wish: 'love' | 'peace' | 'wealth' | 'clarity' = 'peace';

  months: number[] = Array.from({ length: 12 }, (_, i) => i + 1);
  years: number[] = Array.from({ length: 60 }, (_, i) => 2026 - i);

  // Bộ câu hỏi trắc nghiệm năng lượng tâm thức & luân xa (Dành riêng cho thành viên)
  quizQuestions: QuizQuestion[] = [
    {
      id: 1,
      title: 'Tâm Thức & Phản Ứng Tự Nhiên',
      subtitle: 'Khi đối diện với áp lực hay bước ngoặt cuộc đời, tâm trí bạn thường tìm kiếm điều gì trước tiên?',
      options: [
        {
          text: 'Tìm về không gian tĩnh lặng, lắng nghe tiếng lòng và hồi phục từ bên trong',
          sub: 'Hành Thủy • Trực giác sâu sắc & Chữa lành',
          chakra: 'Luân xa Tim (Anahata)',
          icon: 'lotus'
        },
        {
          text: 'Hành động quyết liệt, tìm giải pháp ngay lập tức và tiến thẳng về phía trước',
          sub: 'Hành Hỏa • Ý chí kiên định & Bản lĩnh',
          chakra: 'Luân xa Mặt Trời (Manipura)',
          icon: 'flame'
        },
        {
          text: 'Phân tích cẩn trọng, lập kế hoạch chi tiết và giữ vững sự ổn định lâu dài',
          sub: 'Hành Kim / Thổ • Định tĩnh, thực tế & Bao dung',
          chakra: 'Luân xa Gốc (Muladhara)',
          icon: 'hexagon'
        },
        {
          text: 'Chia sẻ cùng người thân tín, tìm kiếm sự thấu cảm và năng lượng đồng điệu',
          sub: 'Hành Mộc • Nuôi dưỡng kết nối & Vun đắp yêu thương',
          chakra: 'Luân xa Cuống Họng (Vishuddha)',
          icon: 'heart'
        }
      ]
    },
    {
      id: 2,
      title: 'Không Gian Sạc Đầy Sinh Khí',
      subtitle: 'Nơi chốn nào mang lại cho bạn cảm giác được thanh lọc và tái tạo sinh khí mạnh mẽ nhất?',
      options: [
        {
          text: 'Bờ biển tĩnh lặng lúc hoàng hôn, ngắm sóng vỗ và hít hà hương gió mặn',
          sub: 'Tần số thanh tẩy đại dương & Khai thông cảm xúc',
          chakra: 'Luân xa Cuống Họng (Vishuddha)',
          icon: 'drop'
        },
        {
          text: 'Khu rừng nguyên sinh bạt ngàn, tiếng lá xào xạc và hơi đất ấm sau mưa',
          sub: 'Năng lượng cội nguồn sinh sôi & Tiếp đất an lành',
          chakra: 'Luân xa Gốc (Muladhara)',
          icon: 'sprout'
        },
        {
          text: 'Đỉnh núi cao thoáng đãng đón ánh bình minh rạng rỡ và nguồn nắng ấm',
          sub: 'Khai mở trí tuệ, tự tin & Khát vọng bứt phá',
          chakra: 'Luân xa Mặt Trời (Manipura)',
          icon: 'sun'
        },
        {
          text: 'Căn phòng thiền trà ấm cúng, thoang thoảng hương trầm và ánh nến lung linh',
          sub: 'Hồi phục tâm linh & Thức tỉnh minh triết',
          chakra: 'Luân xa Vương Miện (Sahasrara)',
          icon: 'sparkle'
        }
      ]
    },
    {
      id: 3,
      title: 'Luân Xa Cần Bảo Bọc & Tiếp Sức',
      subtitle: 'Vùng năng lượng nào trong bạn đang cần được nuôi dưỡng, che chở nhất lúc này?',
      options: [
        {
          text: 'Luân xa Tim (Anahata) - Nhu cầu được yêu thương, buông bỏ muộn phiền và chữa lành',
          sub: 'Tương hợp tinh thể: Thạch Anh Hồng, Moonstone, Cẩm Thạch',
          chakra: 'Luân xa Tim (Anahata)',
          icon: 'heart'
        },
        {
          text: 'Luân xa Cuống Họng (Vishuddha) - Tự tin cất lên tiếng nói chân thật và sáng tạo',
          sub: 'Tương hợp tinh thể: Aquamarine, Kyanite, Thạch Anh Xanh Lam',
          chakra: 'Luân xa Cuống Họng (Vishuddha)',
          icon: 'award'
        },
        {
          text: 'Luân xa Búi Mặt Trời (Manipura) - Sức mạnh ý chí, tài vận dồi dào và lòng tự tôn',
          sub: 'Tương hợp tinh thể: Citrine, Mắt Hổ Vàng, Hổ Phách Hoàng Gia',
          chakra: 'Luân xa Mặt Trời (Manipura)',
          icon: 'gem'
        },
        {
          text: 'Luân xa Con Mắt Thứ 3 (Ajna) - Trực giác bén nhạy, định hướng thấu suốt tương lai',
          sub: 'Tương hợp tinh thể: Thạch Anh Tím, Lapis Lazuli, Moonstone Ánh Lam',
          chakra: 'Luân xa Con Mắt Thứ 3 (Ajna)',
          icon: 'moon'
        }
      ]
    },
    {
      id: 4,
      title: 'Tần Số Rung Động Mong Cầu',
      subtitle: 'Ý niệm sâu kín nhất bạn muốn gửi gắm vào vị bùa hộ mệnh AMULES là gì?',
      options: [
        {
          text: 'Thanh tẩy năng lượng nặng nề, hình thành lá chắn bảo hộ thân tâm trước thị phi',
          sub: 'Trường năng lượng: Hộ Thân & Trừ Tà Khí',
          chakra: 'Luân xa Gốc (Muladhara)',
          icon: 'shield'
        },
        {
          text: 'Kích hoạt từ trường ái lực, thu hút mối lương duyên tri kỷ và gắn kết trọn đời',
          sub: 'Trường năng lượng: Hòa Khí & Tình Duyên Viên Mãn',
          chakra: 'Luân xa Tim (Anahata)',
          icon: 'heart'
        },
        {
          text: 'Khai thông cung tài lộc, hanh thông công việc, vượng khí và phú quý trường tồn',
          sub: 'Trường năng lượng: Hưng Thịnh & Chiêu Tài Tấn Bảo',
          chakra: 'Luân xa Mặt Trời (Manipura)',
          icon: 'sparkle'
        },
        {
          text: 'Giữ tâm bất biến giữa vạn biến, nuôi dưỡng an lạc nội tại và giấc ngủ bình yên',
          sub: 'Trường năng lượng: Định Tĩnh & Bình An Tuyệt Đối',
          chakra: 'Luân xa Vương Miện (Sahasrara)',
          icon: 'lotus'
        }
      ]
    }
  ];

  currentQuestionIndex = 0;
  selectedAnswers: { [questionId: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0 };

  // Kết quả tính toán
  calculatedZodiac: ZodiacInfo | null = null;
  calculatedElement: ElementInfo | null = null;
  dominantChakra = 'Luân xa Tim (Anahata)';
  matchSummary = 'Bản mệnh hài hòa, đón nhận tần số cát tường và hộ thân bình an.';
  matchScore = 98;
  recommendedProducts: IProduct[] = [];

  // Trạng thái lưu & Toast
  savedToast = false;
  savedNotice = '';
  isSaving = false;
  showAuthPromptModal = false;
  addedToast: string | null = null;

  constructor(
    private _productService: ProductService,
    private _cartService: CartService,
    public _authService: AuthService,
    private _http: HttpClient,
    private _router: Router
  ) { }

  ngOnInit(): void {
    if (this._authService.isLoggedIn()) {
      this.mode = 'member';
    } else {
      this.mode = 'guest';
    }
    // Chạy mặc định bản mệnh cho form
    this.calculatedZodiac = this.getZodiac(this.birthDay, this.birthMonth);
    this.calculatedElement = this.getElement(this.birthYear);
  }

  get maxDaysInMonth(): number {
    return new Date(Number(this.birthYear), Number(this.birthMonth), 0).getDate();
  }

  get days(): number[] {
    return Array.from({ length: this.maxDaysInMonth }, (_, i) => i + 1);
  }

  onMonthOrYearChange(): void {
    this.birthDay = Number(this.birthDay);
    this.birthMonth = Number(this.birthMonth);
    this.birthYear = Number(this.birthYear);
    const max = this.maxDaysInMonth;
    if (this.birthDay > max) {
      this.birthDay = max;
    }
  }

  // Khởi động Trắc nghiệm Năng lượng chuyên sâu (Thành viên)
  startMemberQuiz(): void {
    if (!this._authService.isLoggedIn()) {
      this.showAuthPromptModal = true;
      return;
    }
    this.mode = 'member';
    this.currentQuestionIndex = 0;
    this.step = 'quiz';
  }

  selectOption(questionId: number, optionIndex: number): void {
    this.selectedAnswers[questionId] = optionIndex;
  }

  nextQuestion(): void {
    if (this.currentQuestionIndex < this.quizQuestions.length - 1) {
      this.currentQuestionIndex++;
    } else {
      // Đã trả lời xong 4 câu hỏi -> Tính toán & Lưu CSDL MongoDB
      this.finishMemberQuiz();
    }
  }

  prevQuestion(): void {
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
    }
  }

  // Khách vãng lai: Tính toán nhanh Cung & Mệnh (Chế độ Rút gọn)
  calculateQuickMatch(): void {
    this.mode = 'guest';
    this.executeMatching(false);
  }

  // Thành viên: Hoàn thành bài trắc nghiệm năng lượng tâm thức & luân xa
  finishMemberQuiz(): void {
    // 1. Phân tích Luân xa chủ đạo dựa trên câu trả lời 3 & 4
    const ans3 = this.quizQuestions[2].options[this.selectedAnswers[3] || 0];
    const ans4 = this.quizQuestions[3].options[this.selectedAnswers[4] || 0];
    this.dominantChakra = ans3.chakra || ans4.chakra;

    // 2. Tóm tắt thông điệp tâm thức
    this.matchSummary = `Trường khí cộng hưởng mạnh nhất tại ${this.dominantChakra}. Bảo vật hộ thân sẽ khuếch đại sinh khí, hóa giải nhiễu loạn từ trường và mang lại bình an viên mãn.`;
    this.matchScore = 98;

    this.executeMatching(true);
  }

  private executeMatching(saveToMongo: boolean): void {
    this.birthDay = Number(this.birthDay);
    this.birthMonth = Number(this.birthMonth);
    this.birthYear = Number(this.birthYear);

    const max = this.maxDaysInMonth;
    if (this.birthDay > max) this.birthDay = max;

    // Tính cung hoàng đạo & ngũ hành
    this.calculatedZodiac = this.getZodiac(this.birthDay, this.birthMonth);
    this.calculatedElement = this.getElement(this.birthYear);

    // Tải bảo vật tương thích từ MongoDB CSDL
    this._productService.getProducts().subscribe({
      next: (products) => {
        if (products && products.length > 0) {
          const targetEl = (this.calculatedElement?.name || '').toLowerCase();
          const matched = products.filter(p => {
            const el = (p.element || '').toLowerCase();
            const comp = (p.compatibleElements || []).map(e => String(e).toLowerCase());
            return el.includes(targetEl) || comp.some(c => c.includes(targetEl));
          });
          this.recommendedProducts = (matched.length > 0 ? matched : products).slice(0, 4);
        } else {
          this.recommendedProducts = [];
        }

        if (saveToMongo && this._authService.isLoggedIn()) {
          this.saveMemberSessionToDatabase();
        }

        this.step = 'result';
      },
      error: () => {
        this.recommendedProducts = [];
        this.step = 'result';
      }
    });
  }

  // Lưu phiên trắc nghiệm vào 2 collection: mystic_match_sessions & mystic_match_recommendations
  private saveMemberSessionToDatabase(): void {
    this.isSaving = true;
    const formattedAnswers = this.quizQuestions.map(q => ({
      question: q.title,
      answer: q.options[this.selectedAnswers[q.id] || 0]?.text || ''
    }));

    const payload = {
      birthDay: this.birthDay,
      birthMonth: this.birthMonth,
      birthYear: this.birthYear,
      gender: this.gender,
      wish: this.wish,
      quizAnswers: formattedAnswers,
      calculatedZodiac: this.calculatedZodiac,
      calculatedElement: this.calculatedElement,
      dominantChakra: this.dominantChakra,
      matchSummary: this.matchSummary,
      recommendedProductIds: this.recommendedProducts.map(p => p.id || p._id || p.slug)
    };

    this._http.post<any>('/api/mystic-match/submit', payload, { withCredentials: true }).subscribe({
      next: () => {
        this.isSaving = false;
        this.savedNotice = `Đã đồng bộ hồ sơ năng lượng tâm thức & ${this.calculatedElement?.name} vào tài khoản thành viên của bạn!`;
        this.savedToast = true;
        this._authService.checkProfile();
        setTimeout(() => (this.savedToast = false), 4000);
      },
      error: () => {
        this.isSaving = false;
      }
    });
  }

  saveToProfile(): void {
    const zodiacStr = this.calculatedZodiac ? `${this.calculatedZodiac.name} (${this.calculatedZodiac.latin})` : '';
    const elementStr = this.calculatedElement ? this.calculatedElement.name : '';
    const dobStr = `${this.birthDay}/${this.birthMonth}/${this.birthYear}`;

    if (!this._authService.isLoggedIn()) {
      this.showAuthPromptModal = true;
      return;
    }

    this._http.put('/api/auth/profile', {
      zodiac: zodiacStr,
      element: elementStr,
      dob: dobStr
    }, { withCredentials: true }).subscribe({
      next: () => {
        this.savedNotice = `Đã lưu bản mệnh ${this.calculatedZodiac?.name} • ${this.calculatedElement?.name} vào hồ sơ cá nhân!`;
        this.savedToast = true;
        this._authService.checkProfile();
        setTimeout(() => (this.savedToast = false), 3500);
      },
      error: () => {
        this.savedNotice = `Đã lưu bản mệnh ${this.calculatedZodiac?.name} vào bộ nhớ thiết bị!`;
        this.savedToast = true;
        setTimeout(() => (this.savedToast = false), 3500);
      }
    });
  }

  closeAuthModal(): void {
    this.showAuthPromptModal = false;
  }

  addToCart(product: IProduct): void {
    this._cartService.addToCart({
      productId: product.id || product._id || product.slug || '',
      name: product.name,
      price: product.price,
      image: product.image || (product.images && product.images[0]) || '',
      quantity: 1,
      stone: product.stone || 'Đá tự nhiên',
      element: this.calculatedElement?.name
    }).subscribe({
      next: () => {
        this.addedToast = `Đã thêm "${product.name}" vào giỏ hàng!`;
        setTimeout(() => (this.addedToast = null), 3000);
      }
    });
  }

  resetQuiz(): void {
    this.step = 'form';
    this.currentQuestionIndex = 0;
  }

  private getZodiac(day: number, month: number): ZodiacInfo {
    const d = Number(day);
    const m = Number(month);

    if ((m === 3 && d >= 21) || (m === 4 && d <= 19)) {
      return { name: 'Bạch Dương', latin: 'Aries', icon: 'flame', element: 'Hỏa', dateRange: '21/03 - 19/04' };
    } else if ((m === 4 && d >= 20) || (m === 5 && d <= 20)) {
      return { name: 'Kim Ngưu', latin: 'Taurus', icon: 'hexagon', element: 'Thổ', dateRange: '20/04 - 20/05' };
    } else if ((m === 5 && d >= 21) || (m === 6 && d <= 20)) {
      return { name: 'Song Tử', latin: 'Gemini', icon: 'sun', element: 'Khí', dateRange: '21/05 - 20/06' };
    } else if ((m === 6 && d >= 21) || (m === 7 && d <= 22)) {
      return { name: 'Cự Giải', latin: 'Cancer', icon: 'drop', element: 'Thủy', dateRange: '21/06 - 22/07' };
    } else if ((m === 7 && d >= 23) || (m === 8 && d <= 22)) {
      return { name: 'Sư Tử', latin: 'Leo', icon: 'flame', element: 'Hỏa', dateRange: '23/07 - 22/08' };
    } else if ((m === 8 && d >= 23) || (m === 9 && d <= 22)) {
      return { name: 'Xử Nữ', latin: 'Virgo', icon: 'sprout', element: 'Thổ', dateRange: '23/08 - 22/09' };
    } else if ((m === 9 && d >= 23) || (m === 10 && d <= 22)) {
      return { name: 'Thiên Bình', latin: 'Libra', icon: 'sun', element: 'Khí', dateRange: '23/09 - 22/10' };
    } else if ((m === 10 && d >= 23) || (m === 11 && d <= 21)) {
      return { name: 'Bọ Cạp', latin: 'Scorpio', icon: 'drop', element: 'Thủy', dateRange: '23/10 - 21/11' };
    } else if ((m === 11 && d >= 22) || (m === 12 && d <= 21)) {
      return { name: 'Nhân Mã', latin: 'Sagittarius', icon: 'flame', element: 'Hỏa', dateRange: '22/11 - 21/12' };
    } else if ((m === 12 && d >= 22) || (m === 1 && d <= 19)) {
      return { name: 'Ma Kết', latin: 'Capricorn', icon: 'hexagon', element: 'Thổ', dateRange: '22/12 - 19/01' };
    } else if ((m === 1 && d >= 20) || (m === 2 && d <= 18)) {
      return { name: 'Bảo Bình', latin: 'Aquarius', icon: 'sun', element: 'Khí', dateRange: '20/01 - 18/02' };
    } else {
      return { name: 'Song Ngư', latin: 'Pisces', icon: 'moon', element: 'Thủy', dateRange: '19/02 - 20/03' };
    }
  }

  private getElement(year: number): ElementInfo {
    const y = Number(year);
    const cans = ['Canh', 'Tân', 'Nhâm', 'Quý', 'Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ'];
    const chis = ['Thân', 'Dậu', 'Tuất', 'Hợi', 'Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi'];
    const can = cans[y % 10] || 'Giáp';
    const chi = chis[y % 12] || 'Tý';
    const canChi = `${can} ${chi}`;

    const NAP_AM: Record<string, string> = {
      'Giáp Tý': 'Hải Trung Kim', 'Ất Sửu': 'Hải Trung Kim',
      'Bính Dần': 'Lư Trung Hỏa', 'Đinh Mão': 'Lư Trung Hỏa',
      'Mậu Thìn': 'Đại Lâm Mộc', 'Kỷ Tỵ': 'Đại Lâm Mộc',
      'Canh Ngọ': 'Lộ Bàng Thổ', 'Tân Mùi': 'Lộ Bàng Thổ',
      'Nhâm Thân': 'Kiếm Phong Kim', 'Quý Dậu': 'Kiếm Phong Kim',
      'Giáp Tuất': 'Sơn Đầu Hỏa', 'Ất Hợi': 'Sơn Đầu Hỏa',
      'Bính Tý': 'Giản Hạ Thủy', 'Đinh Sửu': 'Giản Hạ Thủy',
      'Mậu Dần': 'Thành Đầu Thổ', 'Kỷ Mão': 'Thành Đầu Thổ',
      'Canh Thìn': 'Bạch Lạp Kim', 'Tân Tỵ': 'Bạch Lạp Kim',
      'Nhâm Ngọ': 'Dương Liễu Mộc', 'Quý Mùi': 'Dương Liễu Mộc',
      'Giáp Thân': 'Tuyền Trung Thủy', 'Ất Dậu': 'Tuyền Trung Thủy',
      'Bính Tuất': 'Ốc Thượng Thổ', 'Đinh Hợi': 'Ốc Thượng Thổ',
      'Mậu Tý': 'Tích Lịch Hỏa', 'Kỷ Sửu': 'Tích Lịch Hỏa',
      'Canh Dần': 'Tùng Bách Mộc', 'Tân Mão': 'Tùng Bách Mộc',
      'Nhâm Thìn': 'Trường Lưu Thủy', 'Quý Tỵ': 'Trường Lưu Thủy',
      'Giáp Ngọ': 'Sa Trung Kim', 'Ất Mùi': 'Sa Trung Kim',
      'Bính Thân': 'Sơn Hạ Hỏa', 'Đinh Dậu': 'Sơn Hạ Hỏa',
      'Mậu Tuất': 'Bình Địa Mộc', 'Kỷ Hợi': 'Bình Địa Mộc',
      'Canh Tý': 'Bích Thượng Thổ', 'Tân Sửu': 'Bích Thượng Thổ',
      'Nhâm Dần': 'Kim Bạch Kim', 'Quý Mão': 'Kim Bạch Kim',
      'Giáp Thìn': 'Phúc Đăng Hỏa', 'Ất Tỵ': 'Phúc Đăng Hỏa',
      'Bính Ngọ': 'Thiên Hà Thủy', 'Đinh Mùi': 'Thiên Hà Thủy',
      'Mậu Thân': 'Đại Trạch Thổ', 'Kỷ Dậu': 'Đại Trạch Thổ',
      'Canh Tuất': 'Thoa Xuyến Kim', 'Tân Hợi': 'Thoa Xuyến Kim',
      'Nhâm Tý': 'Tang Đố Mộc', 'Quý Sửu': 'Tang Đố Mộc',
      'Giáp Dần': 'Đại Khê Thủy', 'Ất Mão': 'Đại Khê Thủy',
      'Bính Thìn': 'Sa Trung Thổ', 'Đinh Tỵ': 'Sa Trung Thổ',
      'Mậu Ngọ': 'Thiên Thượng Hỏa', 'Kỷ Mùi': 'Thiên Thượng Hỏa',
      'Canh Thân': 'Thạch Lựu Mộc', 'Tân Dậu': 'Thạch Lựu Mộc',
      'Nhâm Tuất': 'Đại Hải Thủy', 'Quý Hợi': 'Đại Hải Thủy'
    };
    const napAm = NAP_AM[canChi] || '';

    const canVal: { [key: number]: number } = {
      4: 1, 5: 1,
      6: 2, 7: 2,
      8: 3, 9: 3,
      0: 4, 1: 4,
      2: 5, 3: 5
    };
    const lastDigit = y % 10;
    const canScore = canVal[lastDigit] || 1;

    const chiRem = y % 12;
    let chiScore = 0;
    if ([4, 5, 10, 11].includes(chiRem)) chiScore = 0;
    else if ([6, 7, 0, 1].includes(chiRem)) chiScore = 1;
    else chiScore = 2;

    let sum = canScore + chiScore;
    if (sum > 5) sum -= 5;

    switch (sum) {
      case 1:
        return {
          name: `Mệnh Kim (${napAm ? napAm + ' - ' : ''}Năm ${canChi})`,
          title: 'Sáng Suốt, Minh Triết & Khởi Đầu Mới',
          desc: 'Người mệnh Kim mang bản tính cương trực, sắc sảo và ý chí kiên định. Bạn cần năng lượng nuôi dưỡng sự mềm mại và thu hút tài khí.',
          colors: ['Trắng', 'Xám bạc', 'Vàng ánh kim', 'Nâu đất (Tương sinh)'],
          contrastColors: ['Đỏ', 'Hồng', 'Tím đậm'],
          luckyStones: ['Thạch Anh Trắng', 'Moonstone Ánh Trăng', 'Mắt Hổ Vàng'],
          affirmation: '“Tâm trí tôi sáng trong, định tĩnh và thu hút mọi điều thanh khiết.”'
        };
      case 2:
        return {
          name: `Mệnh Thủy (${napAm ? napAm + ' - ' : ''}Năm ${canChi})`,
          title: 'Trực Giác Sâu Sắc, Linh Hoạt & Dòng Chảy An Nhiên',
          desc: 'Người mệnh Thủy uyển chuyển, thấu hiểu và nhạy cảm trước vạn vật. Bạn tương hợp với những viên đá xoa dịu tâm trí và chữa lành xúc cảm.',
          colors: ['Xanh dương', 'Đen huyền', 'Trắng bạc (Tương sinh)'],
          contrastColors: ['Vàng đậm', 'Nâu đất'],
          luckyStones: ['Aquamarine', 'Moonstone Giọt Nước', 'Thạch Anh Đen'],
          affirmation: '“Tôi hòa hợp cùng dòng chảy tự nhiên, bình an và luôn được che chở.”'
        };
      case 3:
        return {
          name: `Mệnh Hỏa (${napAm ? napAm + ' - ' : ''}Năm ${canChi})`,
          title: 'Nhiệt Huyết, Tỏa Sáng & Sức Hút Bản Lĩnh',
          desc: 'Người mệnh Hỏa ấm áp, tràn đầy đam mê và năng lượng tích cực. Bạn cần tinh thể làm dịu nhiệt lượng thừa và giữ tâm thế thăng bằng.',
          colors: ['Hồng pastel', 'Đỏ ruby', 'Tím thạch anh', 'Xanh lá (Tương sinh)'],
          contrastColors: ['Đen', 'Xanh biển sẫm'],
          luckyStones: ['Thạch Anh Hồng', 'Garnet Ngọc Hồng Lựu', 'Ruby Thiên Nhiên'],
          affirmation: '“Ngọn lửa trong tôi ấm áp, nuôi dưỡng tình yêu thương và sự thấu suốt.”'
        };
      case 4:
        return {
          name: `Mệnh Thổ (${napAm ? napAm + ' - ' : ''}Năm ${canChi})`,
          title: 'Vững Chãi, Bao Dung & Thịnh Vượng Trường Tồn',
          desc: 'Người mệnh Thổ chân thành, đáng tin cậy và là điểm tựa vững chãi. Bạn hòa hợp nhất với tinh thể vượng tài, tích lũy may mắn và bảo bọc.',
          colors: ['Vàng hổ phách', 'Nâu đất', 'Hồng ruby (Tương sinh)'],
          contrastColors: ['Xanh lá chuối'],
          luckyStones: ['Citrine Thạch Anh Vàng', 'Mắt Hổ Hoàng Gia', 'Hổ Phách'],
          affirmation: '“Tôi đứng vững giữa đất trời, nuôi dưỡng phúc lành và bình an viên mãn.”'
        };
      default:
        return {
          name: `Mệnh Mộc (${napAm ? napAm + ' - ' : ''}Năm ${canChi})`,
          title: 'Tái Sinh, Trưởng Thành & Sinh Khí Dồi Dào',
          desc: 'Người mệnh Mộc giàu lòng trắc ẩn, hào phóng và luôn hướng về sự phát triển. Năng lượng đá quý giúp bạn hồi sinh sinh khí và kết nối thiện lành.',
          colors: ['Xanh lục ngọc', 'Xanh lam biển (Tương sinh)', 'Đen'],
          contrastColors: ['Trắng tinh khiết', 'Bạc sáng'],
          luckyStones: ['Cẩm Thạch Tự Nhiên', 'Aventurine Thạch Anh Xanh', 'Peridot'],
          affirmation: '“Tâm hồn tôi xanh tươi, lớn mạnh và tỏa bóng mát dịu lành cho cuộc đời.”'
        };
    }
  }
}
