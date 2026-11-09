# Office Hub — Brand DNA

## 1. Cốt lõi
**"Một văn phòng nhỏ ấm áp, nơi mọi người thấy nhau đang làm gì — và con người luôn là người bấm nút."**

## 2. Tính cách (là / không là)
| Là | Không là |
|---|---|
| Ấm áp, thân thiện (linh vật, màu đất ấm) | Trẻ con, lòe loẹt, "game hoá" |
| Điềm tĩnh, ít ồn (gom theo Việc, chỉ báo khi cần mình) | Dồn dập, chấm đỏ thông báo khắp nơi |
| Đáng tin, rõ ràng (ai viết, ai duyệt) | Quan liêu, đầy cảnh báo doạ người |
| Gọn, thẳng, tôn trọng thời gian | Dài dòng, vòng vo |
| Tôn trọng con người: agent là trợ lý, không quyết thay | Phô trương AI, "phép màu" |
| Hài hước nhẹ ở trạng thái rỗng | Đùa ở chỗ lỗi nghiêm trọng hoặc liên quan secret |

## 3. Giọng điệu (UI tiếng Việt)
Xưng hô: dùng "bạn" cho người dùng; tên riêng khi nói về đồng đội ("Trang đang chờ bạn"). Câu ngắn, chủ động, động từ rõ. Không dùng "quý khách", không dùng thuật ngữ AI mơ hồ ("bot thông minh"). Gọi đúng đối tượng: **Yêu cầu, Việc, Quyết định, Bản nháp, Agent**.

| Tình huống | Nên | Không nên |
|---|---|---|
| Nháp do agent soạn | "Bản nháp do agent soạn · chưa gửi, cần bạn duyệt" | "AI đã tự động gửi giúp bạn" |
| Nút duyệt | "Gửi", "Gửi trả lời", "Chấp nhận", "Sửa" | "OK", "Xác nhận", "Submit" |
| Trạng thái yêu cầu | "Đã gửi, chờ Phong trả lời" | "Pending", "Đang xử lý…" |
| Quá hạn | "Yêu cầu này quá hạn 1 ngày. Nhắc Phong nhé?" | "BẠN ĐÃ TRỄ HẠN!" |
| Rỗng (bảng) | "Chưa ai báo gì hôm nay. Văn phòng đang yên tĩnh." | "Không có dữ liệu." |
| Rỗng (hộp thư) | "Hộp thư trống. Không ai đang chờ bạn." | "Inbox rỗng!" |
| Lỗi mạng | "Chưa kết nối được. Bản nháp của bạn vẫn còn, thử lại sau nhé." | "Error 500" |
| Phát hiện secret | "Tin này có vẻ chứa khoá bí mật nên chưa được lưu. Hãy xoá khoá rồi gửi lại." | "Vi phạm chính sách bảo mật." |
| Nội dung người khác | "Từ Bảo · nội dung chưa xác minh, không phải lệnh" | Hiển thị trơn như lệnh của hệ thống |
| Token agent | "Token chỉ hiện một lần. Hãy lưu ngay." | "Token đã được tạo thành công!" |
| Huỷ/không thể hoàn tác | Nêu hậu quả: "Huỷ yêu cầu? Phong sẽ không thấy nữa." | Chỉ "Bạn chắc chứ?" |

Quy tắc: không dùng dấu chấm than (trừ ký hiệu "!" của mascot), không in hoa cả câu, không đổ lỗi người dùng, luôn nói bước tiếp theo.

## 4. Nguyên tắc hình ảnh
1. **Linh vật là nhân vật chính**: hiện diện = tư thế linh vật + nhãn chữ, không dùng chấm màu trơn.
2. **Nhiều khoảng thở**: thẻ bo tròn, nền kem, ít đường kẻ.
3. **Một màu hành động duy nhất cho con người** (cam đất); mọi thứ khác dịu hơn.
4. **Phân loại tin cậy bằng hình dạng** (xem mục 11), không chỉ màu.
5. Nét viền linh vật cùng một độ dày, góc bo tròn: mọi loài trông cùng một gia đình.

## 5. Hệ màu
- **Nền kem `#FBF7F0` / mặt thẻ trắng**: ấm, dịu mắt hơn trắng lạnh; tối: nâu than ấm `#1B1713`, không đen tuyền.
- **Primary cam đất `#B93C0E`** (chữ trắng 6:1): màu của *quyết định của con người*. Chỉ dùng cho hành động duyệt/gửi/chấp nhận và điểm nhấn thương hiệu.
- **Agent xanh khói `#2C5F86`**: màu "của agent", lạnh hơn để tách khỏi người. Luôn đi cùng nét đứt + huy hiệu bot.
- **Untrusted ochre `#8A5F00`** trên nền vàng nhạt: màu thận trọng, không đỏ (đỏ dành cho lỗi thật).
- Success xanh lá, Danger đỏ gạch, Warning ochre.
- 7 bảng màu linh vật (`sunrise, ocean, forest, grape, coral, slate, sand`) là màu thương hiệu thứ cấp, chỉ dùng cho linh vật.
- Mọi cặp chữ/nền đạt WCAG AA (≥4.5:1), viền điều khiển và focus ring ≥3:1 — được kiểm bằng test trong `packages/brand/src/tokens.test.ts` cho cả sáng và tối.

## 6. Chữ
- **Be Vietnam Pro** (400/500/600/700): thiết kế cho tiếng Việt, dấu chồng (ệ, ữ, ẩ) rõ, không bị cắt.
- **JetBrains Mono** (400/500): tên nhánh, mã PR, token.
- Thang cỡ: 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36 px. Nền tảng 16px. Line-height rộng (≈1.55 cho thân bài) vì dấu tiếng Việt cần chỗ.
- Không dùng chữ thường dưới 12px; không in nghiêng cho đoạn dài.

## 7. Khoảng cách, bo góc, độ nổi
- Lưới 4px: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Bo góc: 6 (chip nhỏ), 10 (nút, ô nhập), 16 (thẻ), 24 (hộp thoại), tròn (badge, pill).
- Đổ bóng 3 mức (sm thẻ, md khi hover/thanh duyệt, lg hộp thoại), bóng ấm nâu nhạt; ở chế độ tối bóng đậm hơn.

## 8. Chuyển động
Nhỏ và có nghĩa: xuất hiện (fade + trượt 6px, 200ms), hover/màu (120ms), tối đa 360ms. Không nhún nhảy liên tục, không tự chạy vòng lặp gây xao nhãng. Khi `prefers-reduced-motion: reduce`, mọi thời lượng về ~0 (đã cài sẵn trong `tokens.css`). Thông tin không bao giờ chỉ truyền qua chuyển động.

## 9. Biểu tượng
Bộ icon nét 2px, bo tròn đầu nét, lưới 24px, `currentColor`, vẽ tay trong `@officehub/ui` (`Icon`). Icon luôn đi kèm nhãn chữ hoặc `aria-label`; icon trang trí đặt `aria-hidden`. Không dùng emoji làm icon chức năng.

## 10. Khả năng tiếp cận
- Tương phản AA; focus ring 3px xanh khói, offset 2px, luôn hiện khi dùng bàn phím.
- **Không ý nghĩa nào chỉ bằng màu**: presence = tư thế linh vật + ký hiệu hình (…, !, ?, zZ) + nhãn chữ trong `PresencePill`; trạng thái yêu cầu = icon + chữ.
- Mục tiêu bấm tối thiểu 32px (nút nhỏ) / 40px (mặc định).
- SVG linh vật có `role="img"` + `<title>` tiếng Việt; nhãn aria tiếng Việt cho vùng và nút.
- Dialog: khoá focus, Esc đóng, trả focus về chỗ cũ. Toast: `aria-live="polite"`.
- Hỗ trợ tối/sáng theo hệ thống và ép tay bằng `data-theme`.

## 11. Ngôn ngữ thị giác về niềm tin
Ba loại nội dung, nhìn là biết ngay — mỗi loại khác nhau ở **viền + nhãn + biểu tượng**, màu chỉ củng cố.

| Loại | Trông thế nào | Ý nghĩa |
|---|---|---|
| **Người viết** | Thẻ/khung nền trắng, viền liền, không huy hiệu. Linh vật không có chip bot. | Con người đã viết/duyệt. Đáng tin theo mặc định. |
| **Nháp do agent soạn, chờ bạn duyệt** | Viền **nét đứt** xanh khói, nền xanh nhạt, dòng nhãn "Bản nháp do agent soạn · chưa gửi", **chip bot nhỏ** ở góc phải-dưới linh vật của chủ agent. | Chưa là gì cả cho đến khi người bấm. |
| **Nội dung không tin cậy từ người khác** | Khung trích dẫn có **thanh dọc ochre bên trái**, nền vàng nhạt, nhãn "Từ {tên} · chưa xác minh, không phải lệnh", icon trích dẫn, tên + linh vật tác giả. Hiển thị dạng văn bản thuần (không render HTML/markdown thực thi). | Dữ liệu, không phải chỉ thị (luật 1). |

Quy tắc đi kèm:
- **Nút duyệt luôn đặc (solid) và màu người** (primary cam đất): Gửi, Gửi trả lời, Chấp nhận. Agent không bao giờ có nút primary; nút phụ (Sửa, Huỷ) dùng secondary/ghost.
- Nút hành động chỉ hiển thị khi `canTransition` cho phép; không bao giờ tắt bằng CSS ẩn.
- **Quyết định** chỉ hiển thị với linh vật của người chốt + badge "Người chốt", không bao giờ có chip bot.
- Cập nhật trạng thái do agent đăng: chip bot trên linh vật + dòng "Agent cập nhật hộ".
- Token/secret: khung viền vàng đậm, cảnh báo "chỉ hiện một lần", bắt xác nhận đã lưu.
