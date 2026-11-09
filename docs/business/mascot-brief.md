# Mascot — brief cho Design

Đây là brief nghiệp vụ, không phải thiết kế. Design quyết định hình dáng, nét vẽ, bảng màu; brief nêu mục đích, ràng buộc, và điều không được xảy ra.

## 1. Vì sao mỗi người có mascot

| Lý do | Hệ quả cho thiết kế |
|---|---|
| Danh tính: 7 người, tên viết tắt dễ lẫn; hình thì nhớ nhanh | Mỗi người nhận ra từ xa (thẻ, hàng yêu cầu, sự kiện) dù không đọc tên |
| Ấm áp: công cụ phối hợp dễ thành bảng lạnh; nhóm cần cảm giác "có người đang ở đó" | Dáng thân thiện, không trẻ con; không dùng cho đánh giá hiệu suất |
| Đọc hiện diện (presence) trong 1 giây: ai đang làm, chờ, kẹt | Mood phải đọc được ở cỡ nhỏ (24–32 px) cạnh nhãn chữ |
| Không cần tải ảnh: sinh từ `Mascot{species,palette,accessory,seed}` | Cùng input → cùng SVG, chạy phía server, client, và ảnh cho bot |
| Phân biệt người và agent (xem mục 3) | Có lớp huy hiệu riêng, không phải một mascot thứ hai |

Trait hợp lệ cho pilot: species ∈ blob, cat, owl, bot, fox, bear; palette ∈ sunrise, ocean, forest, grape, coral, slate, sand; accessory tuỳ chọn (headphones, glasses, cap, beret, scarf, hoặc null); `seed` chỉ tạo biến thể nhỏ. Seed Tripflix dùng 7 mascot khác nhau để Design thử.

## 2. Mood ↔ PresenceState

Theo `PRESENCE_TO_MOOD` (`packages/shared/src/api.ts`). Nhãn chữ bắt buộc đi kèm.

| `PresenceState` | Mood | Nhãn chữ (UI) | Ý nghĩa nghiệp vụ | Gợi ý biểu cảm (Design tự quyết) |
|---|---|---|---|---|
| working | focused | Đang làm | Đang xử lý một Việc | Tập trung, ít cử động |
| waiting | waiting | Đang chờ | Chờ người khác (`waitingOn`) | Kiên nhẫn; có thể hiển thị mascot người được chờ |
| blocked | worried | Bị kẹt | Cần giúp | Lo lắng nhẹ; cần nổi bật hơn các mood khác, nhưng không báo động |
| reviewing | curious | Đang xem | Review PR/đọc yêu cầu | Tò mò, nhìn vào |
| idle | relaxed | Rảnh | Online, chưa có việc | Thư giãn |
| offline | sleeping | Ngoại tuyến | Không online | Ngủ; giảm độ nổi bật |

Yêu cầu: 6 mood phân biệt được ở cỡ nhỏ kể cả khi in đơn sắc; mọi loài và phụ kiện cùng hỗ trợ đủ 6 mood; animation có phiên bản tĩnh khi `prefers-reduced-motion`.

## 3. Người và "agent thay mặt người"

Nguyên tắc: agent không phải một thành viên. Agent là công cụ của chủ; hành động của agent luôn được thể hiện **trên mascot của chủ**, không có mascot riêng cho agent.

| Tình huống | Cách hiển thị |
|---|---|
| Nội dung do người soạn (`authoredBy="human"`) | Mascot của người, không huy hiệu |
| Nội dung do agent soạn (`authoredBy="agent"`) | Mascot của chủ + **huy hiệu bot nhỏ** ở góc, kèm chữ "Agent soạn" |
| Nháp agent chưa duyệt (`sentById=null`) | Như trên + chữ "Nháp"; kiểu hiển thị khác hẳn tin đã gửi (viền nét đứt hoặc tương đương, không chỉ đổi màu) |
| Nháp agent đã được chủ gửi | Giữ huy hiệu bot + thêm "đã duyệt bởi {tên}" |
| Nháp agent chủ đã sửa (`editedBeforeSend=true`) | Huy hiệu bot + "Đã chỉnh sửa" |
| Thẻ trạng thái do agent cập nhật (`updatedBy="agent"`) | Mascot của chủ + huy hiệu bot nhỏ; mood vẫn theo `presence` |
| Agent đã thu hồi | Nội dung cũ giữ huy hiệu bot (lịch sử), thêm "token đã thu hồi" khi xem chi tiết |

Huy hiệu bot: một biểu tượng duy nhất cho mọi loại agent (Claude Code, Codex, Gemini CLI, other); loại agent hiển thị bằng chữ khi di chuột hoặc ở chi tiết, không bằng huy hiệu khác nhau. Huy hiệu phải nhìn thấy được ở 24 px và không trùng với species `bot` (một người có thể chọn loài "bot"; phân biệt bằng hình dạng huy hiệu và nhãn chữ).

## 4. Điều không bao giờ được xảy ra

| # | Cấm | Vì sao |
|---|---|---|
| 1 | Mascot hay hoạt ảnh gợi ý agent đã hành động khi chưa có người duyệt (vd. mascot "gật đầu/đã gửi" trên nháp; dấu tick trên nháp) | Phá luật 3: hành động ra ngoài do người duyệt |
| 2 | Chỉ dùng màu để truyền nghĩa (presence, nháp/đã gửi, quá hạn, agent/người) | Khả năng tiếp cận; người mù màu |
| 3 | Mascot của agent thành một "thành viên" riêng, có tên, có thẻ trạng thái riêng | Agent không có danh tính xã hội; trách nhiệm thuộc chủ |
| 4 | Hai thành viên cùng workspace có mascot giống hệt (species+palette+accessory) | Nhầm người; chặn ở MAS-05 (P1) |
| 5 | Dùng mood để đánh giá năng suất hoặc làm bảng xếp hạng | Mục đích là đọc hiện diện |
| 6 | Mood "worried" bị diễn giải như lỗi hệ thống | Nhãn chữ "Bị kẹt" luôn đi kèm; lỗi hệ thống dùng thành phần khác |
| 7 | Mascot trong thông báo ngoài web thiếu huy hiệu bot khi nội dung do agent soạn | Giữ nhất quán |
| 8 | Hiệu ứng nhấp nháy nhanh (>3 lần/giây) | An toàn động kinh |

## 5. Quy tắc tiếp cận và tương thích

| Mục | Yêu cầu |
|---|---|
| Nhãn | Mọi mascot có `aria-label`: "{tên}, {nhãn presence}" + ", agent soạn" khi có huy hiệu |
| Tương phản | Mascot và huy hiệu đạt tương phản đủ trên cả nền sáng/tối |
| Kích thước | 24, 32, 48, 96 px đều đọc được |
| Hiệu ứng | Có bản tĩnh; không dựa chuyển động để truyền nghĩa |
| Ngôn ngữ | Nhãn tiếng Việt; không chữ trong ảnh mascot |
| Xuất ra | SVG chuỗi (server) và PNG cho thông báo ngoài web (P2) |

## 6. Đầu ra mong đợi từ Design

| Hạng mục | Mô tả |
|---|---|
| Bộ mascot | 6 species × 7 palette × accessory × 6 mood (có thể tham số hoá) |
| Huy hiệu bot | 1 bộ, 24/16 px |
| Trạng thái nháp | Kiểu hiển thị riêng cho tin nháp, đã gửi, đã sửa |
| Trang thử | Một trang liệt kê 7 người trong `seed-tripflix.json` ở đủ 6 mood, với và không có huy hiệu bot |
| Quy tắc dùng | Tài liệu ngắn: cỡ, khoảng cách, cách đặt nhãn chữ |

Tiêu chí kiểm tra do Business duyệt: bảng 6 mood đọc được ở 32 px đơn sắc; không trạng thái nào chỉ phân biệt bằng màu; người nhìn mới hiểu "agent soạn, người duyệt" trong ≤5 giây không cần giải thích.
