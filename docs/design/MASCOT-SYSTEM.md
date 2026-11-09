# Hệ linh vật — 6 Desk Buddies

Hợp đồng (`@officehub/shared` v0.4): `Mascot = { buddy: "milo" | "sage" | "pip" | "blu" | "mocha" | "fern" }`. Nhiều thành viên có thể dùng chung một buddy; **thẻ tên** phân biệt họ.

| Buddy | Vai trò minh hoạ | Đặc điểm |
|---|---|---|
| Milo | Điều phối & lập kế hoạch | Cognac, kính, sổ |
| Sage | Nghiên cứu & tổng hợp | Forest, tai nghe, laptop |
| Pip | Nội dung & sáng tạo | Cream, beret, bút |
| Blu | Code & sản phẩm | Cobalt, túi đeo |
| Mocha | Kiểm tra & phản biện | Walnut, cốc gốm |
| Fern | Kiến thức & tài liệu | Terracotta, cây xanh |

Metadata: `BUDDIES` (tên, vai trò, token màu, tông nền) trong `packages/brand/src/buddies.ts`.

## Ảnh
Pose tĩnh (front idle) có alpha, cắt sát viền. Mỗi buddy có `{buddy}-512.webp`, `{buddy}-128.webp`, `{buddy}-256.png` (dự phòng) trong `packages/brand/assets/mascots/` (mỗi file < 120 KB; bản gốc 1.2 MB không commit). Tạo lại bằng `pnpm --filter @officehub/brand build:mascots <thư mục PNG gốc>`. `mascotSrc(buddy, size)` trả URL (web phục vụ ở `/mascots/`, đồng bộ từ package khi build).

## Tâm trạng (từ trạng thái)
`PRESENCE_TO_MOOD` → huy hiệu nhỏ trên pose tĩnh **cộng** nhãn chữ tiếng Việt (không bao giờ chỉ dùng màu):

| Presence | Mood | Duy hiệu | Nhãn |
|---|---|---|---|
| working | focused | ● | đang làm |
| waiting | waiting | … | đang chờ |
| blocked | worried | ! | bị kẹt |
| reviewing | curious | ? | đang xem |
| idle | relaxed | ✓ | rảnh |
| offline | sleeping | zzz (ảnh giảm bão hoà) | ngoại tuyến |

Nội dung do agent soạn mang huy hiệu bot "agent soạn" (Cobalt, góc dưới trái).

## Dùng
`<Mascot mascot={member.mascot} presence={status.presence} size={48} />`; thêm `decorative` khi tên đã hiện bên cạnh. Ảnh dùng `<img>` + `object-fit: contain`, alt tiếng Việt ("Linh vật Milo, đang làm").
