# Luồng yêu cầu (Request lifecycle)

Nguồn: `packages/shared/src/request.ts`. Từ khoá: **Hỏi** = asker (người hỏi); **Nhận** = receiver (người nhận). Chỉ người bấm các nút in đậm; agent chỉ soạn nháp.

## 1. Sơ đồ trạng thái

```
            soạn (người / agent hỏi)
                    │
                 [draft] ──────────── Hủy (Hỏi) ───────────────┐
                    │ **Gửi** (Hỏi)                              │
                    ▼                                            │
 ┌─────────────► [sent] ──── Hủy (Hỏi) ──────────────────────────┤
 │                 │  soạn trả lời (người / agent Nhận)           │
 │                 ▼                                              ▼
 │          [reply_drafted] ── Hủy (Hỏi) ───────────────► [cancelled]
 │                 │ **Gửi trả lời** (Nhận)  (cũng bấm được từ [sent])
 │                 ▼
 │             [replied] ──── **Chấp nhận** (Hỏi) ──► [closed]
 └── **Hỏi lại** (Hỏi) ◄─┘
```

"Quá hạn" không phải trạng thái: là nhãn suy ra khi `status` ∈ {sent, reply_drafted, replied} và `dueAt` < now.

## 2. Bảng chuyển trạng thái (khớp `TRANSITIONS`)

| Hành động | Từ | Đến | Ai bấm | Agent làm được? | Event |
|---|---|---|---|---|---|
| (tạo nháp) | — | draft | Hỏi (người) hoặc agent của Hỏi (`send_request`) | Có (nháp) | `request.created` |
| `send` | draft | sent | Hỏi, người | Không | `request.sent` |
| `draft_reply` | sent, reply_drafted | reply_drafted | Nhận, người hoặc agent của Nhận (`reply_draft`) | Có (nháp) | `request.reply_drafted` |
| `send_reply` | sent, reply_drafted | replied | Nhận, người | Không | `request.replied` |
| `accept` | replied | closed | Hỏi, người | Không | `request.closed` |
| `follow_up` | replied | sent | Hỏi, người | Không | `request.followed_up` |
| `cancel` | draft, sent, reply_drafted | cancelled | Hỏi, người | Không | `request.cancelled` |

Quy tắc dữ liệu: `follow_up`, `draft_reply`, và `send_reply` từ `sent` bắt buộc có `body`; `send` có thể kèm `body` để gửi bản đã sửa (khi khác bản nháp → `editedBeforeSend=true`). Không có hành động từ `closed`/`cancelled`.

## 3. Mỗi bên thấy gì và bấm gì

| Trạng thái | Hỏi thấy | Nhận thấy | Nút của Hỏi | Nút của Nhận |
|---|---|---|---|---|
| draft | Nháp của mình (nếu agent soạn: huy hiệu bot, "Nháp từ agent") | Không thấy | **Gửi**, Sửa, Hủy | — |
| sent | "Đã gửi, chờ {Nhận}" | "Chờ bạn trả lời", nội dung câu hỏi | Hủy | Soạn trả lời / Nhờ agent soạn, **Gửi trả lời** (nhập trực tiếp) |
| reply_drafted | Vẫn "Đã gửi, chờ {Nhận}" (không thấy nháp trả lời) | Nháp trả lời (có huy hiệu bot nếu agent soạn) | Hủy | Sửa nháp, **Gửi trả lời** |
| replied | "Đã có trả lời" + nội dung | "Đã trả lời, chờ {Hỏi} chấp nhận" | **Chấp nhận**, **Hỏi lại** | — (xem lại) |
| closed | "Đã xong" | "Đã xong" | — | — |
| cancelled | "Đã hủy" | "Đã hủy" (nếu từng thấy), nội dung cũ vẫn đọc | — | — |

Ghi chú: nháp (`sentById=null`) chỉ tác giả/chủ thấy. Admin không bấm hộ ai; admin chỉ xem.

## 4. Thông báo (trigger)

| Sự kiện | Gửi cho | Nội dung | Kênh (pilot: in-app) |
|---|---|---|---|
| `request.created` bởi agent | Chủ agent | "Agent soạn nháp: {title}. Xem và gửi." | Badge + danh sách |
| `request.sent` | Nhận | "{Hỏi} hỏi bạn: {title}" | Badge + SSE |
| `request.reply_drafted` bởi agent | Chủ agent (Nhận) | "Agent soạn nháp trả lời cho {title}." | Badge |
| `request.replied` | Hỏi | "{Nhận} đã trả lời: {title}" | Badge + SSE |
| `request.followed_up` | Nhận | "{Hỏi} hỏi lại: {title}" | Badge + SSE |
| `request.closed` | Nhận | "{Hỏi} đã chấp nhận câu trả lời" (nhẹ, không badge đỏ) | Danh sách |
| `request.cancelled` (đã gửi) | Nhận | "{Hỏi} đã hủy yêu cầu: {title}" | Badge |
| Nhắc (mục 5) | Theo bảng nhắc | Theo bảng nhắc | Badge + SSE |
| Nháp bị chặn (secret) | Người/chủ agent gửi | "Tin chưa được lưu vì có thể chứa bí mật." | Thông báo ngay |

Không thông báo cho bên kia khi chỉ có nháp (draft, reply_drafted).

## 5. Lịch nhắc quá hạn (đề xuất)

Giờ làm việc: T2–T6, 09:00–12:00 và 13:00–18:00 ICT (8 giờ/ngày). Nhắc chỉ gửi trong giờ làm việc; mốc rơi ngoài giờ dời sang 09:00 ngày làm việc kế tiếp. Mỗi mốc gửi đúng 1 lần. Không bao giờ tự đóng, tự hủy, hay tự đổi trạng thái.

**A. Request `sent` (chờ Nhận), có `dueAt`**

| Mốc | Gửi cho | Nội dung |
|---|---|---|
| `dueAt` − 1 giờ làm việc | Nhận | "Sắp đến hạn: {title} (còn 1 giờ)." |
| `dueAt` (quá hạn) | Nhận và Hỏi | Nhận: "Đã quá hạn: {Hỏi} đang chờ bạn." Hỏi: "Quá hạn: {Nhận} chưa trả lời. Bạn có thể nhắn trực tiếp hoặc hủy." |
| `dueAt` + 4 giờ làm việc | Nhận và Hỏi | Nhắc lần 2, cùng nội dung, thêm "đã quá hạn 4 giờ" |
| `dueAt` + 1 ngày làm việc | Nhận và Hỏi, thêm admin (bản tóm tắt) | "Quá hạn 1 ngày." Admin: "Yêu cầu {title} giữa {Hỏi} và {Nhận} đang quá hạn." |
| Mỗi ngày làm việc lúc 09:00, tối đa 5 ngày | Nhận và Hỏi | Nhắc gộp trong "Việc chờ" buổi sáng |
| Sau đó: mỗi thứ Hai 09:00 | Hỏi và admin | "Yêu cầu vẫn mở {n} ngày: tiếp tục chờ, hủy, hoặc nhờ người khác?" (không nhắc Nhận nữa để tránh ồn, vẫn thấy trong "Chờ bạn trả lời") |

**B. Request `sent`, không có `dueAt` (mốc mềm, không gắn "Quá hạn")**

| Mốc | Gửi cho | Nội dung |
|---|---|---|
| `sent` + 2 giờ làm việc (khớp mục tiêu M2) | Nhận | "{Hỏi} đang chờ bạn từ 2 giờ." |
| `sent` + 1 ngày làm việc | Nhận và Hỏi | "Yêu cầu chưa có trả lời sau 1 ngày." |
| Sau đó như A (mỗi ngày tối đa 3 ngày, rồi hàng tuần) | — | — |

**C. Request `reply_drafted` (nháp chờ Nhận bấm gửi)**

| Mốc | Gửi cho | Nội dung |
|---|---|---|
| nháp + 30 phút | Nhận | "Bạn có nháp trả lời chưa gửi." |
| nháp + 2 giờ làm việc | Nhận | Nhắc lần 2 |
| quá hạn | Nhận và Hỏi | như A (Hỏi chỉ biết "chờ", không biết có nháp) |

**D. Request `replied` (chờ Hỏi chấp nhận/hỏi lại)**

| Mốc | Gửi cho | Nội dung |
|---|---|---|
| `replied` + 4 giờ làm việc | Hỏi | "{Nhận} đã trả lời. Chấp nhận hoặc hỏi lại?" |
| `replied` + 1 ngày làm việc, 3 ngày | Hỏi | Nhắc; sau 3 ngày chỉ hiện trong "Việc chờ" |

**E. Request `draft` (chưa gửi)**

| Mốc | Gửi cho | Nội dung |
|---|---|---|
| nháp + 1 ngày làm việc | Chủ nháp | "Nháp chưa gửi: {title}." Không nhắc lại; nháp không tự xoá. |

Dừng nhắc ngay khi: trạng thái chuyển (reply gửi, closed, cancelled), hoặc đã nhắc đủ số lần. Ghi nhắc vào audit (không phải event nghiệp vụ). Khi `follow_up`, lịch tính lại như một `sent` mới (mốc mềm B, trừ khi có `dueAt` mới).

## 6. Nhãn và câu trợ giúp (tiếng Việt)

| Trạng thái / nhãn | Nhãn UI (≤ 20 ký tự) | Câu trợ giúp (1 dòng) | Hiển thị cho |
|---|---|---|---|
| draft (người soạn) | Bản nháp | Chưa gửi, chỉ mình bạn thấy. | Hỏi |
| draft (agent soạn) | Nháp từ agent | Agent đã soạn giúp bạn; xem lại rồi bấm Gửi. | Hỏi |
| sent | Đã gửi | Đang chờ {tên} trả lời. | Hỏi |
| sent | Chờ bạn trả lời | {tên} đang chờ bạn; soạn hoặc nhờ agent soạn nháp. | Nhận |
| reply_drafted | Nháp trả lời | Đã có nháp, xem lại rồi bấm Gửi trả lời. | Nhận |
| reply_drafted | Đã gửi | Đang chờ {tên} trả lời. | Hỏi |
| replied | Đã có trả lời | Chấp nhận để đóng, hoặc hỏi lại nếu chưa đủ. | Hỏi |
| replied | Đã trả lời | Đang chờ {tên} chấp nhận. | Nhận |
| closed | Đã xong | {tên} đã chấp nhận câu trả lời. | Cả hai |
| cancelled | Đã hủy | Người hỏi đã hủy; không cần trả lời nữa. | Cả hai |
| overdue (huy hiệu) | Quá hạn | Quá hạn {thời gian}; đã nhắc cả hai, yêu cầu vẫn mở. | Cả hai |
| soft-due (nhãn nhẹ) | Chờ lâu | Chưa có trả lời sau {thời gian}. | Cả hai |
| authoredBy=agent | Agent soạn | Do agent của {tên} soạn, {tên} đã duyệt. | Cả hai (sau khi gửi) |
| editedBeforeSend | Đã chỉnh sửa | {tên} đã sửa nháp trước khi gửi. | Cả hai |

| Nút | Nhãn | Chú thích |
|---|---|---|
| send | Gửi | "Chỉ khi bạn bấm, yêu cầu mới tới {tên}." |
| draft_reply | Soạn trả lời | "Tự soạn hoặc nhờ agent soạn nháp." |
| send_reply | Gửi trả lời | "Câu trả lời tới {tên} khi bạn bấm." |
| accept | Chấp nhận | "Đóng yêu cầu." |
| follow_up | Hỏi lại | "Gửi lại cho {tên} kèm câu hỏi thêm." |
| cancel | Hủy yêu cầu | Hộp xác nhận: "Hủy yêu cầu này? {tên} sẽ được báo nếu đã nhận." |

Thông báo lỗi: `human_only` → "Hành động này cần bạn bấm trực tiếp, agent không làm thay được." `wrong_side` → "Hành động này dành cho {người hỏi/người nhận}." `invalid_state` → "Yêu cầu đã chuyển sang bước khác, hãy tải lại." `secret_detected` → "Tin chưa được lưu: có vẻ chứa bí mật ({loại}). Bỏ giá trị đó và thử lại." `rate_limited` → "Thao tác quá nhanh, thử lại sau {n} giây."

## 7. Trường hợp biên

| Tình huống | Hành vi |
|---|---|
| Nhận trả lời sau khi quá hạn | Chấp nhận bình thường, nhắc chuyển sang bên Hỏi (mục D) |
| Hỏi hủy khi Nhận đang có nháp | Nháp giữ trong lịch sử, không gửi đi; Nhận được báo hủy |
| Hai người cùng bấm (đua) | Người đến sau nhận `invalid_state` ở lần tải lại; không nhân đôi message/event |
| Agent của Nhận bị thu hồi khi đang có nháp | Nháp giữ, vẫn gắn "Agent soạn"; người Nhận vẫn gửi được |
| Nhận không muốn/không thể trả lời | Hiện tại chỉ trả lời kèm gợi ý người khác (chưa có `decline`/`reassign`, xem HANDOFF) |
| Hỏi lại nhiều vòng | Mỗi vòng thêm message `follow_up` rồi `reply`; metric M2 tính từng vòng |
