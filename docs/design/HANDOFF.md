# Design team — HANDOFF

## Đã có
- `docs/design/BRAND-DNA.md`, `MASCOT-SYSTEM.md`, `COMPONENTS.md`.
- `packages/brand` (`@officehub/brand`): `tokens.ts` (nguồn duy nhất), `tokens.css` + `tailwind-theme.css` (SINH TỪ tokens.ts bằng `pnpm --filter @officehub/brand build:css`; test báo lỗi nếu lệch), `mascot.ts` (`renderMascot`, `SPECIES`, `PALETTES`, `ACCESSORIES`, `MOODS`, `defaultMascotFor`, nhãn tiếng Việt), test tương phản AA, `preview/gallery.html` (mở trực tiếp bằng trình duyệt; tái tạo bằng `pnpm --filter @officehub/brand gallery`).
- `packages/ui` (`@officehub/ui`): Mascot, PresencePill, MemberCard, TaskChip, EventRow, RequestCard (+ `availableActions`), DraftBlock, UntrustedQuote, ApprovalBar, DecisionCard, EmptyState, Button, Badge, Card, Dialog, Toast/ToastProvider/useToast, TokenRevealOnce, Icon, `relativeTimeVi`.

## Frontend nối token + Tailwind thế nào
Trong `apps/web/app/globals.css` (đường dẫn `@source` tính từ file CSS đó; chỉnh cho đúng):
```css
@import "tailwindcss";
@import "@officehub/brand/tokens.css";
@import "@officehub/brand/tailwind-theme.css";
@source "../../../packages/ui/src";
```
- Cần `@tailwindcss/postcss` (Next) như thường lệ; Next phải `transpilePackages: ["@officehub/ui", "@officehub/brand", "@officehub/shared"]` vì các gói export thẳng `.ts/.tsx`.
- Font: thêm `<link rel="stylesheet" href={googleFontsHref}>` (export từ brand) hoặc dùng `next/font/google` cho "Be Vietnam Pro" (subset `vietnamese`, `latin`) + "JetBrains Mono", rồi đặt `--oh-font-sans`/`--oh-font-mono` nếu muốn.
- Tối: tự theo hệ thống; ép tay bằng `<html data-theme="dark|light">`.
- Class tiện ích: `bg-oh-surface`, `text-oh-ink-muted`, `border-oh-border`, `rounded-oh-md`, `shadow-oh-md`, `text-oh-sm`, `animate-oh-pop`.
- Ứng dụng cần `html { lang="vi" }`.

## Cách dùng nhanh
`<Mascot mascot={member.mascot} presence={status.presence} size={48} />`; `<RequestCard request asker receiver viewerMemberId onAction={(a, r) => api.transition(r.id, a)} />`. Server gọi `renderMascot` trực tiếp cho ảnh bot/email nếu cần.

## Còn thiếu / giới hạn
- Chưa có Storybook/ảnh chụp; chỉ có gallery tĩnh cho linh vật (không gồm component React).
- Linh vật chưa có hoạt ảnh (zZ nổi, chớp mắt); SVG tĩnh. Có thể thêm `animate` tuỳ chọn, tôn trọng reduced-motion.
- Chưa có component form (ô nhập, chọn), thanh điều hướng, bảng văn phòng (layout) — Frontend tự ghép từ Card/Button.
- `Dialog` tự viết (khoá focus cơ bản, không portal); nếu cần phức tạp hơn nên dùng Radix.
- Chưa kiểm thử với trình đọc màn hình thật; chưa duyệt bản dịch với người dùng Tripflix.
- EventRow không biết nội dung `data` của từng event nên nhận `detail` từ Frontend.
- Một số Tailwind class (vd `outline-3`, `size-7`) cần Tailwind ≥ 4.0.

## Đề nghị đổi contract `packages/shared`
1. **Nên có**: xuất `TaskState`/`TaskSource` dạng type (hiện chỉ có `const` zod enum nên phải dùng `Task["state"]`), thêm `export type EventType` đã có nhưng `ConnectorKind`, `MemberRole`, `AgentKind`, `TaskState`, `TaskSource` chưa có type tương ứng.
2. **Nên có**: `Mascot.species/palette/accessory` đổi từ `string` sang union khớp `@officehub/brand` (hoặc zod `.catch()` fallback) — hiện renderer tự rơi về mặc định khi khoá lạ.
3. **Nên có**: `RequestMessage` có cờ riêng "đang là nháp" (hiện suy ra từ `sentById === null`) và `Request` cho biết agent nào soạn nháp; UI cần để hiện huy hiệu bot đúng chủ.
4. **Tuỳ chọn**: `StatusCard.updatedBy` thêm `agentId` để hiện nhãn agent cụ thể.

## Câu hỏi mở
- Màu primary cam đất `#B93C0E` có hợp nhận diện Tripflix? (đổi chỉ cần sửa `tokens.ts`, chạy `build:css`).
- Brief linh vật của Business có thêm loài/phụ kiện nào không? Thêm loài = thêm một mục trong `GEO` của `mascot.ts`.
- Cho phép người dùng tự chọn linh vật hay chỉ dùng `defaultMascotFor`?
- Có cần chế độ "ít ồn hơn" ẩn linh vật ở danh sách dày (≥15 người)?
