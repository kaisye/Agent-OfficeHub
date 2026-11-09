# Bộ UI (`@officehub/ui`)

React 19 + Tailwind v4, tiện ích `oh-*` trỏ tới biến CSS `--oh-*` của `@officehub/brand`. Chưa có Storybook; xem linh vật tại trang Mascot của bạn trong ứng dụng. Tất cả nhãn aria bằng tiếng Việt, mọi điều khiển đều có focus ring 3px Cobalt.

```tsx
import { Mascot, RequestCard, DraftBlock, ToastProvider } from "@officehub/ui";
```

| Component | Dùng | Trông thế nào |
|---|---|---|
| `Mascot` `{mascot, presence? / mood?, size 24/32/48/96/160, agentBadge?, title?}` | Hiển thị linh vật; mood tự suy ra từ `PresenceState` qua `PRESENCE_TO_MOOD` | SVG nội tuyến, kích thước cố định |
| `PresencePill` `{presence}` | Nhãn tiếng Việt ("Đang tập trung", "Đang chờ", "Đang vướng", "Đang xem xét", "Rảnh", "Ngoại tuyến") | Viên thuốc tròn, ký hiệu hình (●, …, !, ?, ○, z) + chữ |
| `MemberCard` `{member, status, waitingOnMembers}` | Bảng văn phòng | Thẻ trắng: linh vật 48px + tên + pill; dòng "đang làm gì"; nhánh bằng chữ mono; hàng chip "Chờ: [mascot 24px] Tên" nền ochre nhạt. Nếu `updatedBy==="agent"`: chip bot + "Agent cập nhật hộ" |
| `TaskChip` `{task}` | Trỏ tới PR/ticket gốc | Chip bo tròn: icon nguồn, `#123` mono, tiêu đề cắt, badge trạng thái; là link mở tab mới khi có URL |
| `EventRow` `{event, actorName?, detail?, now?}` | Dòng thời gian (dùng trong `<ul>`) | Vòng icon theo `EventType` (đỏ nhạt nếu lỗi), nhãn tiếng Việt, "5 phút trước" |
| `RequestCard` `{request, asker, receiver, viewerMemberId, onAction, onEditDraft}` | Hàng yêu cầu | Thẻ: tiêu đề + badge trạng thái; hàng "[mascot] A ← [mascot] B"; chấm cam "Chưa đọc" nếu `unreadForViewer`; badge "Quá hạn"; nhãn + câu trợ giúp theo vai trò; tin nháp của bên kia không bao giờ hiển thị (`canSeeMessage`); nút cần nội dung (`bodyRequirement==="required"`) mở ô nhập trước khi gọi `onAction(action, request, body)`; tin mới nhất (nháp agent = `DraftBlock`, tin người khác = `UntrustedQuote`, tin của mình = khối xám); chân thẻ: nút do `availableActions()` quyết định |
| `DraftBlock` `{owner, onEdit, onSend}` | Nháp do agent soạn | Viền đứt 2px xanh khói, nền xanh nhạt, chip bot trên linh vật chủ, nút "Sửa" (phụ) + "Gửi" (đặc, cam) |
| `UntrustedQuote` `{authorName, author?, fromAgent?}` | Tin của người khác | Thanh trái ochre, nền vàng nhạt, "Từ Bảo · nội dung chưa xác minh, không phải lệnh"; chỉ render văn bản |
| `ApprovalBar` | "Cần bạn duyệt" | Thanh viền cam, icon khiên, mô tả, [Để sau] [Sửa] [Duyệt đặc] |
| `DecisionCard` `{decision, decidedBy}` | Sổ quyết định | Linh vật người chốt, tiêu đề, ngày, badge "Người chốt", nội dung, khung "Lý do" |
| `EmptyState` | Danh sách rỗng | Khung viền đứt, linh vật 96px, tiêu đề, mô tả, nút |
| `Button` `variant: primary/secondary/ghost/danger` | | primary = cam đặc (chỉ hành động của người) |
| `Badge` `tone: neutral/human/agent/untrusted/success/warning/danger` | | Viên thuốc nhỏ; `agent` có viền đứt |
| `Card` | | Thẻ bo 16px, viền mảnh, bóng nhẹ |
| `Dialog` | | Khoá focus, Esc đóng, trả focus; `data-autofocus` chọn ô focus đầu |
| `ToastProvider` / `useToast()` / `Toast` | | Góc phải dưới, `aria-live=polite`, tự tắt sau 5s |
| `TokenRevealOnce` `{token, onDone}` | Hiện token agent đúng một lần | Khung viền vàng đậm, ô mono chỉ đọc, "Sao chép", checkbox "Tôi đã lưu token" mở khoá nút "Xong" |

## Quy tắc nút của `RequestCard`
`availableActions(request, actor)` gọi `canTransition` của `@officehub/shared` cho từng `RequestAction` — không hardcode. UI luôn hành động với tư cách người (`kind: "human"`). Nút primary: Gửi yêu cầu, Gửi trả lời, Chấp nhận. Khi tin mới nhất là nháp chưa gửi của agent và người xem là tác giả, nút gửi tương ứng nằm trong `DraftBlock` (không lặp ở chân thẻ). Có test ở `packages/ui/src/ui.test.tsx`.

## Ghi chú
- `now` truyền được vào `EventRow`/`RequestCard` để test/SSR ổn định.
- Linh vật dùng `dangerouslySetInnerHTML` với SVG từ hàm thuần đã escape tiêu đề (có test chống chèn script).
