import { isApiError } from "./api/types";

/** Vietnamese message for any error, following docs/business/request-flow.md section 6 and BRAND-DNA voice. */
export function errorMessage(e: unknown, ctx: { otherName?: string } = {}): string {
  if (!isApiError(e)) return "Có lỗi xảy ra. Thử lại sau nhé.";
  switch (e.code) {
    case "secret_detected": {
      const rule = e.rule;
      return `Tin có vẻ chứa key${rule ? ` (${rule})` : ""}. Không lưu gì. Hãy gửi key qua kênh bí mật.`;
    }
    case "human_only":
      return "Hành động này cần bạn bấm trực tiếp, agent không làm thay được.";
    case "wrong_side":
      return "Hành động này không dành cho vai trò của bạn trong yêu cầu.";
    case "invalid_state":
      return "Yêu cầu đã chuyển sang bước khác, hãy tải lại.";
    case "rate_limited":
      return "Thao tác quá nhanh, thử lại sau ít giây.";
    case "network":
      return "Chưa kết nối được. Bản nháp của bạn vẫn còn, thử lại sau nhé.";
    case "unauthenticated":
    case "token_revoked":
      return "Phiên đăng nhập đã hết. Đăng nhập lại nhé.";
    case "forbidden":
      return ctx.otherName ? `Bạn chưa có quyền làm việc này với ${ctx.otherName}.` : "Bạn chưa có quyền làm việc này.";
    case "not_found":
      return "Không tìm thấy mục này.";
    case "validation_failed":
      return e.message || "Thông tin chưa hợp lệ, kiểm tra lại nhé.";
    default:
      return e.message || "Có lỗi xảy ra. Thử lại sau nhé.";
  }
}
