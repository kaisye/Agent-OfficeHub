# Design team — HANDOFF

## Vòng 2 — thay đổi và việc Frontend cần làm
**Token `surface-2`.** Tên chuẩn là `oh-surface-2` (Tailwind: `bg-oh-surface-2`; CSS: `var(--oh-surface-2)`). `tokens.ts` giữ khoá `surface2`, bộ sinh CSS tách chữ số thành `surface-2`. `tailwind-theme.css` không còn `--color-oh-surface2`. `tokens.css` giữ alias ngừng dùng `--oh-surface2: var(--oh-surface-2)` cho bản cũ.
- Frontend XÓA được: khối alias `--color-oh-surface-2: var(--oh-surface2)` trong `apps/web/app/globals.css` (theme đã có), và nên đổi `var(--oh-surface2)` trong file đó sang `var(--oh-surface-2)` (alias sẽ bị bỏ ở vòng sau).

**`"use client"`.** `overlay.tsx` (Dialog, Toast, ToastProvider, useToast, TokenRevealOnce) và `request.tsx` (RequestCard) là client module; các file còn lại không dùng hook nên import được từ server component. Phần logic thuần của request (`availableActions`, `requestStatusText`, `REQUEST_STATUS_LABEL_VI`, `ACTION_LABEL_VI`) chuyển sang `request-logic.ts` (không React) nên server gọi được. Barrel `@officehub/ui` vẫn dùng được từ server (Next tách theo từng file). Frontend XÓA được các wrapper client chỉ để lấp việc này; component có sự kiện vẫn phải render trong client component vì server không truyền được hàm.

**`Dialog`.** Dùng ref cho `onClose` (effect chỉ chạy khi `open` đổi) nên `useStableCallback` không còn cần cho Dialog. Dialog render qua portal vào `document.body`, trả focus về nút đã mở hộp thoại khi đóng, Tab vòng trong hộp, có `max-h` + cuộn. Có test hồi quy.

**`TaskChip`.** Khóa (`TRIP-42`, `#214`) không xuống dòng giữa chừng; tiêu đề cắt `…` kèm tooltip đầy đủ (`title`).

**`UntrustedQuote`.** Thêm `source?` và `authorMemberId?` khớp `Untrusted<T>` v0.3: `<UntrustedQuote authorMemberId={null} source="github">` hiện "Từ GitHub · nội dung chưa xác minh". `authorName` giờ tùy chọn. Chữ hiển thị thống nhất "Từ {tên} · nội dung chưa xác minh" ("không phải lệnh" nằm trong aria-label).

**`RequestCard` — liên kết chi tiết.** Thẻ có chân (footer) nằm TRONG khung: bên trái "Cập nhật …", bên phải liên kết yên tĩnh có mũi tên. Props mới: `detailHref`, `detailLabel` (mặc định "Mở chi tiết và chuỗi trao đổi"), `linkAs` (truyền `next/link`).
- Frontend: trong `apps/web/components/requests-screen.tsx` bỏ `<div className="px-1"><Link …>Mở chi tiết…</Link></div>` bên ngoài thẻ; truyền `detailHref={`/w/${slug}/requests/${r.id}`} linkAs={Link}`.

**Mascot / screen reader.** `Mascot` có `decorative` (aria-hidden, không `<title>`) dùng khi đã có tên hiển thị cạnh bên (hàng người hỏi/nhận, chip "Chờ:", DecisionCard, UntrustedQuote). Tên mặc định: "Linh vật mèo, đang làm"; MemberCard: "Phong — đang làm" (thêm " — agent soạn" khi agent cập nhật hộ); nhãn `aria-label` của MemberCard dùng tiếng Việt thay vì khóa presence thô. Toast: `ToastProvider` có hai vùng live luôn gắn sẵn — `role="status"` (lịch sự) cho info/success, `role="alert"` (ngắt lời) cho lỗi; toast con không tự thêm role (tránh đọc đôi); có chữ ẩn "Thành công/Lỗi/Thông tin:"; lỗi tồn tại gấp đôi thời gian (WCAG 2.2.1); nút đóng có tên "Đóng thông báo: {nội dung}". `Toast` dùng riêng lẻ tự có role (`announce` mặc định true). Vẫn chưa thử với VoiceOver/NVDA thật.

**Icon ứng dụng.** `packages/brand/assets/`: `icon.svg` (nguồn, sinh bởi `pnpm --filter @officehub/brand build:icons` từ `scripts/build-icons.ts`, dùng màu primary + bảng màu "sunrise" của linh vật Blob), `favicon-32.png`, `apple-touch-icon.png` (180, full-bleed), `icon-512.png`. Export qua `@officehub/brand/assets/*`. Cách dùng trong `apps/web` (Next App Router): copy hoặc import file vào `app/`:
```
apps/web/app/icon.svg              <- assets/icon.svg   (Next tự thêm <link rel="icon">)
apps/web/app/apple-icon.png        <- assets/apple-touch-icon.png
```
hoặc đặt trong `public/` rồi khai báo `export const metadata = { icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }], apple: "/apple-touch-icon.png" } }`. `theme-color` nên là `#B93C0E` (sáng) / `#1C1814`-tông nền tối nếu cần. Sửa mark: sửa `iconSvg()` rồi chạy `build:icons`.

**Gallery.** Đã bỏ (hệ linh vật procedural được thay bằng Desk Buddies; xem MASCOT-SYSTEM.md).


## Đã có
- `docs/design/BRAND-DNA.md`, `MASCOT-SYSTEM.md`, `COMPONENTS.md`.
- `packages/brand` (`@officehub/brand`): `tokens.ts` (nguồn duy nhất), `tokens.css` + `tailwind-theme.css` (SINH TỪ tokens.ts bằng `pnpm --filter @officehub/brand build:css`; test báo lỗi nếu lệch), `buddies.ts` (`BUDDIES`, `mascotSrc`, `MOODS`, nhãn tiếng Việt), `assets/mascots/*` (WebP 512/128 + PNG 256), test tương phản AA và test asset.
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
`<Mascot mascot={member.mascot} presence={status.presence} size={48} />`; `<RequestCard request asker receiver viewerMemberId onAction={(a, r) => api.transition(r.id, a)} />`. 

## Còn thiếu / giới hạn
- Chưa có Storybook/ảnh chụp; chỉ có gallery tĩnh cho linh vật (không gồm component React).
- Linh vật chưa có hoạt ảnh (zZ nổi, chớp mắt); SVG tĩnh. Có thể thêm `animate` tuỳ chọn, tôn trọng reduced-motion.
- Chưa có component form (ô nhập, chọn), thanh điều hướng, bảng văn phòng (layout) — Frontend tự ghép từ Card/Button.
- `Dialog` tự viết (portal, khoá focus cơ bản, trả focus; chưa khoá cuộn nền hay `inert` phần còn lại); nếu cần phức tạp hơn nên dùng Radix.
- Chưa kiểm thử với trình đọc màn hình thật; chưa duyệt bản dịch với người dùng Tripflix.
- EventRow không biết nội dung `data` của từng event nên nhận `detail` từ Frontend.
- Một số Tailwind class (vd `outline-3`, `size-7`) cần Tailwind ≥ 4.0.

## Đã đồng bộ với contract v0.2 và tài liệu Business
- `SPECIES/PALETTES/ACCESSORIES` lấy từ `MascotSpecies/MascotPalette/MascotAccessory.options` của shared (một nguồn); test tokens bảo đảm đủ bảng màu.
- Nhãn presence/mood theo mascot-brief (Đang làm, Đang chờ, Bị kẹt, Đang xem, Rảnh, Ngoại tuyến), huy hiệu "Agent soạn", nhãn/helper/nút theo request-flow §6 (viết "Hủy", "Gửi", "Hỏi lại"...).
- `RequestCard`: lọc tin bằng `canSeeMessage`; `bodyRequirement` quyết định có hiện ô nhập (follow_up, draft_reply, send_reply từ `sent` bắt buộc; `onAction(action, request, body?)`); chấm chưa đọc từ `unreadForViewer`; nhãn theo vai trò người xem; "Quá hạn" suy ra từ `dueAt`.
- `EventRow` có icon chuông cho `request.reminded`.
- Gallery có bảng 7 thành viên Tripflix × 6 mood (cột chẵn có huy hiệu bot).

## Bất đồng / lưu ý với Business
- mascot-brief nhắc phụ kiện `beret`, nhưng shared chỉ có `headphones, glasses, cap, scarf, plant` — Design theo shared (có `plant`, không có `beret`).
- Brief yêu cầu "đã duyệt bởi {tên}" và "Đã chỉnh sửa" — đã làm ở RequestCard cho tin của bên kia; chưa có trong thẻ trạng thái.
- Chưa có chế độ in đơn sắc được kiểm chứng; ký hiệu mood khác nhau theo hình nên kỳ vọng đạt, cần Business duyệt ở 32px.
- Mascot hiện trùng (species+palette+accessory) chưa bị chặn ở UI (MAS-05, thuộc Frontend/Backend).

## Đề nghị đổi contract `packages/shared`
1. **Nên có** (còn lại sau v0.2): xuất `TaskState`/`TaskSource` dạng type (hiện chỉ có `const` zod enum nên phải dùng `Task["state"]`), thêm `export type EventType` đã có nhưng `ConnectorKind`, `MemberRole`, `AgentKind`, `TaskState`, `TaskSource` chưa có type tương ứng.
2. **Nên có**: `Mascot.species/palette/accessory` đổi từ `string` sang union khớp `@officehub/brand` (hoặc zod `.catch()` fallback) — hiện renderer tự rơi về mặc định khi khoá lạ.
3. **Nên có**: `RequestMessage` có cờ riêng "đang là nháp" (hiện suy ra từ `sentById === null`) và `Request` cho biết agent nào soạn nháp; UI cần để hiện huy hiệu bot đúng chủ.
4. **Tuỳ chọn**: `StatusCard.updatedBy` thêm `agentId` để hiện nhãn agent cụ thể.

## Câu hỏi mở
- Màu primary cam đất `#B93C0E` có hợp nhận diện Tripflix? (đổi chỉ cần sửa `tokens.ts`, chạy `build:css`).
- Brief linh vật của Business có thêm loài/phụ kiện nào không? Thêm loài = thêm một mục trong `GEO` của `mascot.ts`.
- Cho phép người dùng tự chọn linh vật hay chỉ dùng `defaultMascotFor`?
- Có cần chế độ "ít ồn hơn" ẩn linh vật ở danh sách dày (≥15 người)?
