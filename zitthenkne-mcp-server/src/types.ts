/**
 * Định nghĩa kiểu dữ liệu cho các document Firestore của Zitthenkne.
 * Cấu trúc suy ra từ mã nguồn web app (features/quiz/*).
 */

/** Một câu hỏi trắc nghiệm trong một bộ đề. */
export interface QuizQuestion {
  /** Nội dung câu hỏi. */
  question: string;
  /** Danh sách đáp án. Web app dùng `answers` hoặc `options`. */
  answers?: string[];
  options?: string[];
  /** Chỉ số (0-based) của đáp án đúng trong mảng answers/options. */
  correctAnswerIndex?: number;
  /** Giải thích cho từng đáp án (cùng thứ tự với answers/options). */
  optionExplanations?: string[];
  /** Giải thích chung cho câu hỏi (nếu có). */
  explanation?: string;
  /** Ghi chú học tập/lâm sàng. */
  note?: string;
  /** Kiến thức mở rộng. */
  expanded?: string;
  /** Nguồn tham khảo đối chiếu. */
  source?: string;
  /** Mã ca lâm sàng — các câu cùng caseId dùng chung một tình huống. */
  caseId?: string;
  /** Nội dung tình huống/ca lâm sàng dùng chung. */
  caseText?: string;
  /** Tiêu đề ngắn của ca lâm sàng. */
  caseTitle?: string;
  /** Ca mở dần: thông tin bổ sung của ca, lộ ra từ câu này trở đi. */
  caseReveal?: string;
  /** 'essay' = câu tự luận (answers rỗng). */
  type?: "essay";
  /** Tự luận: đáp án mẫu (markdown). */
  modelAnswer?: string;
  /** Tự luận: barem — ý { text, points, keywords?, partial?, critical? } hoặc nhóm { group, max?, items }. */
  keyPoints?: (StoredKeyPoint | { group: string; max?: number; items: StoredKeyPoint[] })[];
  /** Điểm tối đa của câu trong bài (trọng số). */
  maxScore?: number;
  /** Tự luận: kiểu ô trả lời (text / short / list / fields / table). */
  answerFormat?: { kind: string; count?: number; labels?: (string | { label?: string; hint?: string; size?: string; unit?: string })[]; columns?: string[]; rows?: number | string[]; placeholder?: string };
}

/** Một bộ đề trắc nghiệm. */
export interface QuizSet {
  id: string;
  /** UID của người tạo (Firebase Auth). */
  userId: string;
  title: string;
  questionCount: number;
  questions: QuizQuestion[];
  /** Có công khai hay không. */
  isPublic: boolean;
  /** ID thư mục chứa bộ đề, hoặc null nếu ở thư mục gốc. */
  folderId: string | null;
  /** Thời điểm tạo (ISO string sau khi chuẩn hóa). */
  createdAt: string | null;
}

/** Thư mục để tổ chức các bộ đề. */
export interface QuizFolder {
  id: string;
  userId: string;
  name?: string;
  title?: string;
  createdAt: string | null;
}

/** Kết quả của một lần làm bài. */
export interface QuizResult {
  id: string;
  userId: string;
  quizId: string;
  quizTitle: string;
  score: number;
  totalQuestions: number;
  /** Phần trăm đúng (0-100). */
  percentage: number;
  /** Thời gian làm bài (giây). */
  timeTaken: number;
  completedAt: string | null;
}

/** Thống kê tổng hợp của một người dùng. */
export interface UserStats {
  userId: string;
  totalAttempts: number;
  averagePercentage: number;
  bestPercentage: number;
  totalQuestionsAnswered: number;
  perfectScores: number;
  quizSetsCreated: number;
}

export interface StoredKeyPoint { text: string; points?: number; keywords?: string[]; partial?: number; critical?: boolean; field?: number; order?: string[] }
