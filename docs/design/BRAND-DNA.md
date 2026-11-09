# Office Hub — Brand DNA (Desk Buddies — Warm Studio)

## 1. Cốt lõi
**"Một chỗ ấm áp để làm việc cùng nhau — mọi người thấy nhau đang làm gì, và con người luôn là người bấm nút."**
Nguồn: bộ nhận diện "Desk Buddies — Warm Studio" (người dùng cung cấp). Office Hub giữ nguyên mô hình sản phẩm (thành viên, yêu cầu, duyệt của con người) và chỉ thay lớp giao diện.

## 2. Tính cách
Ấm, điềm tĩnh, đáng tin, gọn. Không trẻ con, không "game hoá", không chấm đỏ khắp nơi. Agent chỉ SOẠN, người bấm gửi.

## 3. Màu (nguồn: `packages/brand/src/tokens.ts`)
| Token | Hex | Dùng |
|---|---|---|
| Cream | #F3EEE5 | chất liệu ấm, chữ trên nền tối |
| Cognac | #AC633B | nhấn nhẹ, nội dung từ người khác (chữ dùng bản đậm hơn #94502B để đạt AA) |
| Walnut | #594032 | gỗ, chi tiết thương hiệu, bóng đổ |
| **Forest** | #355B47 | **CTA chính (gửi / duyệt)**, đang chọn, online |
| **Cobalt** | #355BA6 | nội dung agent soạn (viền nét đứt), focus ring |
| Charcoal | #292C28 | chữ chính |
| Canvas | #F8F8F2 | nền ứng dụng |
| Border | #E5E4DA | đường phân cách |

Token ngữ nghĩa `--oh-*` / tiện ích `oh-*` giữ nguyên tên (bg, surface, primary = Forest, agent = Cobalt, untrusted = Cognac…); chỉ giá trị đổi. Bảng thô có ở `--oh-brand-*`, tông nội thất bản đồ ở `--oh-office-*`.

**Chế độ tối** (ấm, nền nâu than #1B1814, chữ Cream): primary #86C2A2, agent #8FAAE8. Mọi cặp chữ/nền kiểm AA (>= 4.5:1), viền điều khiển và focus >= 3:1 trong `tokens.test.ts`.

## 4. Hình & nhịp
- Bo góc: nút/ô nhập 10px, thẻ 16px, hộp thoại 20px. Khoảng cách 4 / 8 / 12 / 16 / 24 / 32.
- Bóng rất nhẹ, tông Walnut: `sm` 0 1px 2px, `md` 0 3px 18px, `lg` 0 15px 60px.
- Chữ: Be Vietnam Pro (có subset tiếng Việt), fallback system sans. Cỡ nhỏ nhất 12px (prototype dùng 8–11px, đã nâng để dễ đọc).
- Bố cục: sidebar cố định 232px, topbar 72px. Dưới 1020px ẩn panel "Hôm nay"; dưới 760px sidebar còn icon 68px, drawer toàn chiều ngang.
- Chuyển động nhẹ (xuất hiện panel, hover), tắt khi `prefers-reduced-motion`.

## 5. Biểu tượng
Dấu lá (hai chiếc lá Cream trên ô Forest, nghiêng nhẹ, chấm Cognac). Sinh bằng `pnpm --filter @officehub/brand build:icons` ra `icon.svg`, `favicon-32.png`, `apple-touch-icon.png` (180), `icon-512.png`.

## 6. Giọng điệu
Tiếng Việt tự nhiên, ngắn, chủ động ("Nháp agent của bạn · gửi Minh", "Minh hỏi bạn"). Mô tả hành động thật của nút, không dọa người dùng.

## 7. Truy cập
Trạng thái luôn có chữ + hình (không chỉ màu); icon-button có aria-label; overlay là role=dialog có focus trap, Escape đóng; lỗi form role=alert.
