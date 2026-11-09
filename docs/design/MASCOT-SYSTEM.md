# Hệ linh vật (Mascot system)

Mỗi thành viên có một linh vật, sinh ra bằng thuật toán từ `Mascot { species, palette, accessory, seed }` (xem `@officehub/shared`). Không cần tải ảnh. Hàm thuần `renderMascot(traits, { mood, size, agentBadge?, title? })` trả về chuỗi SVG tự chứa (`role="img"`, `<title>` tiếng Việt, không id, không script), cùng đầu vào cho cùng đầu ra. Xem `packages/brand/preview/gallery.html`.

Phong cách chung: hình khối tròn, nét viền cùng độ dày màu đậm của bảng màu, mắt to, má hồng, bụng/mõm màu sáng. Viewbox 100×100.

## 1. Sáu loài (`species`)
| Key | Nhãn | Đặc trưng |
|---|---|---|
| `blob` | Bé Blob | Giọt tròn, chỏm tóc nhỏ (thay đổi theo seed) — loài mặc định/an toàn |
| `cat` | Mèo | Tai nhọn, ria, mõm sáng |
| `owl` | Cú | Tai chùm, mắt to trong vành sáng, mỏ cam |
| `bot` | Robot | Đầu vuông bo, ăng-ten, màn hình mặt, "tai" bu-lông |
| `fox` | Cáo | Mặt hình tim, tai nhọn cao, má sáng |
| `bear` | Gấu | Tai tròn, mõm sáng, mũi đậm |

Khoá lạ → rơi về `blob`.

## 2. Bảy bảng màu (`palette`)
Mỗi bảng có `base` (thân), `light` (bụng/mõm), `dark` (viền + nét mặt), `accent` (phụ kiện, mỏ/ăng-ten).
`sunrise` (cam vàng, bình minh), `ocean` (xanh biển), `forest` (xanh lá), `grape` (tím), `coral` (hồng san hô), `slate` (xám xanh), `sand` (cát). Khoá lạ → `sunrise`. Màu linh vật là danh tính cá nhân, **không mang nghĩa trạng thái**.

## 3. Phụ kiện (`accessory`)
`null`, `headphones` (tai nghe, dev đang "vào guồng"), `glasses` (kính tròn), `cap` (mũ lưỡi trai), `scarf` (khăn), `plant` (mầm cây trên đầu). Phụ kiện dùng màu `accent` của bảng màu; mầm cây luôn xanh lá. Khoá lạ → `null`.

## 4. Sáu tâm trạng (từ `PRESENCE_TO_MOOD`)
Mỗi mood khác nhau ở **hình dạng** (mắt, mày, miệng, nghiêng người, ký hiệu góc phải-trên), không chỉ màu.

| Mood | Từ presence | Mắt / mày | Miệng | Dáng | Ký hiệu | Lý do |
|---|---|---|---|---|---|---|
| `focused` | working | Mắt nhỏ đặc, mày thẳng chếch vào trong | Vạch ngang ngắn | Nghiêng nhẹ về trước | không | Nghiêm túc, không muốn bị làm phiền, nhưng không giận |
| `waiting` | waiting | Mắt tròn trắng, đồng tử liếc lên-phải | Lượn sóng nhẹ | Nghiêng sang phải | bong bóng "…" | Ngóng ai đó |
| `worried` | blocked | Mắt to, đồng tử nhỏ, mày xếch lên ở giữa | Cong xuống | Nghiêng trái, giọt mồ hôi (≥48px) | chip "!" đỏ gạch | Vướng, cần giúp — nổi bật nhất nhưng không báo động |
| `curious` | reviewing | Một mắt nhỏ, một mắt to, hai mày nhướn không đều | Nhếch lệch | Nghiêng đầu 8° | chip "?" | Đang xem xét/đọc |
| `relaxed` | idle | Mắt cười "^ ^" | Cười rộng | Thẳng, má hồng | ngôi sao nhỏ | Rảnh, sẵn sàng |
| `sleeping` | offline | Mắt nhắm cong xuống | Chấm "o" nhỏ | Xẹp và nghiêng nhẹ, mờ 88% | chip "zZ" | Ngoại tuyến |

Chip ký hiệu có nền trắng viền đậm nên đọc được trên cả nền sáng và tối.

## 5. Huy hiệu agent
`agentBadge: true` thêm chip tròn nhỏ hình robot (nền xanh khói `#2C5F86`, viền trắng) ở **góc phải-dưới**. Nghĩa: *nội dung/cập nhật này do agent của thành viên đó soạn*. Dùng khi: bản nháp yêu cầu/trả lời do agent soạn, status do agent đăng, tin trích dẫn từ agent. Không dùng cho Quyết định (chỉ người). Tiêu đề SVG thêm "(agent đã soạn)". Ở ≤32px chip to hơn tương đối (r=16 thay vì 13) để vẫn đọc được; ở 24px nên dùng nhãn chữ kèm theo.

## 6. Kích thước và mức chi tiết
| Size | Dùng ở | Giữ | Bỏ |
|---|---|---|---|
| 24 | Chip chờ-ai, trích dẫn | Hình khối, mắt, mày, miệng, ký hiệu mood, phụ kiện | Má hồng, bụng/mõm, ria, vành tai trong, điểm sáng mắt, giọt mồ hôi; nét dày hơn (4.6) |
| 32 | Danh sách yêu cầu, người hỏi→nhận | Như 24 + điểm sáng mắt | Má hồng, bụng/mõm, ria, giọt mồ hôi |
| 48 | Thẻ thành viên | Má hồng, bụng/mõm, ria, vành tai, giọt mồ hôi | — |
| 96 | Trạng thái rỗng, hồ sơ | Tất cả | — |
| 160 | Trang giới thiệu, hồ sơ lớn | Tất cả + vệt sáng thân, tàn nhang/chấm trán theo seed | — |

`seed % 3` chọn biến thể nhỏ (kiểu chỏm của blob; tàn nhang/chấm trán ở ≥96px). Kích thước bị kẹp trong 16–512.

## 7. `defaultMascotFor(memberId)`
Băm FNV-1a ổn định ⇒ loài, bảng màu, phụ kiện, seed. Dùng khi thành viên chưa chọn linh vật; ổn định giữa server/client.
