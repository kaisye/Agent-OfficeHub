# Luồng yêu cầu (v0.6)

Nguồn: `packages/shared/src/request.ts`, `packages/db/src/requests.ts`, thiết kế `docs/redesign-orchestrator.md`.

Từ khoá: **phía hỏi** (`askerRoleId`) và **phía nhận** (`receiverRoleId`) là **vai trò**; giá trị `null` nghĩa là người điều phối. Một yêu cầu luôn có ít nhất một phía là vai trò. Chỉ người điều phối bấm các nút in đậm; agent chỉ soạn nháp.

## 1. Ba luồng chính

| Luồng | Ví dụ | Đi như thế nào |
|---|---|---|
| A. Người điều phối → vai trò | Giao Backend làm route hàng chờ | Người điều phối tạo yêu cầu, nó **đã gửi** ngay (`sent`). Agent của vai trò soạn trả lời; người điều phối **Gửi trả lời** (thực chất là duyệt) rồi **Chấp nhận** |
| B. Vai trò → vai trò | Frontend hỏi Backend shape của route | Agent Frontend `send_request` → nháp chờ duyệt. Người điều phối **Gửi** (có thể bật "tự chuyển trả lời" nếu là `question`). Agent Backend `reply_draft`; nếu đã bật tự chuyển thì câu trả lời tới thẳng Frontend, nếu không thì chờ người điều phối **Gửi trả lời**. Người điều phối **Chấp nhận** hoặc **Hỏi lại** |
| C. Vai trò → người điều phối | Agent bị chặn, cần quyết định | Agent `send_request` với `to:"orchestrator"`, thường `kind=blocker`. Người điều phối **Gửi** (duyệt cho vào luồng) rồi tự trả lời, hoặc **Hủy** |

## 2. Loại yêu cầu (`kind`)

| Kind | Dùng khi | Ràng buộc |
|---|---|---|
| `question` | Hỏi thông tin | Loại duy nhất được tự chuyển trả lời |
| `contract_change` | Đổi contract trong `packages/shared` | Chỉ gửi tới Leader |
| `review` | Nhờ xem lại một thay đổi | |
| `handoff` | Bàn giao phần việc, kèm file HANDOFF của vai trò | |
| `blocker` | Bị chặn, không làm tiếp được | Lên đầu hàng chờ duyệt |

## 3. Sơ đồ trạng thái

```
        soạn (agent phía hỏi: nháp | người điều phối: đã gửi ngay)
                    │
                 [draft] ──────────── **Hủy** ─────────────────┐
                    │ **Gửi** (duyệt; tuỳ chọn tự chuyển)        │
                    ▼                                            │
 ┌─────────────► [sent] ──── **Hủy** ────────────────────────────┤
 │                 │  soạn trả lời (agent phía nhận)              │
 │                 ▼                                              ▼
 │          [reply_drafted] ── **Hủy** ──────────────────► [cancelled]
 │                 │ **Gửi trả lời** (duyệt)
 │                 │   hoặc tự chuyển (question, đã bật) ──┐
 │                 ▼                                        ▼
 │             [replied] ──── **Chấp nhận** ──► [closed]
 └── **Hỏi lại** ◄─┘  (tắt tự chuyển)
```

"Quá hạn" không phải trạng thái: là nhãn khi `status` ∈ {sent, reply_drafted, replied} và `dueAt` < now.

## 4. Bảng chuyển trạng thái (khớp `TRANSITIONS`)

| Hành động | Từ | Đến | Ai | Agent? | Event |
|---|---|---|---|---|---|
| (tạo) | — | draft (agent) / sent (người điều phối) | Agent phía hỏi (`send_request`) hoặc người điều phối | Có (nháp) | `request.created` (+ `request.sent`) |
| `send` | draft | sent | Người điều phối | Không | `request.sent` |
| `draft_reply` | sent, reply_drafted | reply_drafted, hoặc replied nếu tự chuyển | Agent phía nhận (`reply_draft`) hoặc người điều phối | Có | `request.reply_drafted` (+ `request.replied`) |
| `send_reply` | sent, reply_drafted | replied | Người điều phối | Không | `request.replied` |
| `accept` | replied | closed | Người điều phối | Không | `request.closed` |
| `follow_up` | replied | sent | Người điều phối | Không | `request.followed_up` |
| `cancel` | draft, sent, reply_drafted | cancelled | Người điều phối | Không | `request.cancelled` |

Quy tắc dữ liệu: `follow_up`, `draft_reply` và `send_reply` từ `sent` bắt buộc có `body`; `send`/`send_reply` có thể kèm `body` đã sửa (`editedBeforeSend=true`). Không có hành động từ `closed`/`cancelled`.

Tự chuyển trả lời (`autoForwardReply`): người điều phối bật khi bấm Gửi, chỉ cho `question`. Câu trả lời tự chuyển vẫn qua quét secret, ghi audit với `autoForwarded:true`, và `sentById` là người đã duyệt câu hỏi. `follow_up` tắt cờ này; muốn tự chuyển lần nữa phải bật lại.

## 5. Ai thấy gì

| Trạng thái | Người điều phối | Agent phía hỏi | Agent phía nhận |
|---|---|---|---|
| draft | Trong hàng chờ duyệt: Gửi / Sửa / Hủy | Nháp của mình | Không thấy |
| sent | "Chờ {vai trò nhận} trả lời" | "Đã gửi" | "Chờ bạn trả lời" + câu hỏi |
| reply_drafted | Trong hàng chờ duyệt: nháp trả lời, Gửi trả lời / Sửa | Vẫn "Đã gửi" (không thấy nháp) | Nháp trả lời của mình |
| replied | Chấp nhận / Hỏi lại | Câu trả lời | "Đã trả lời" |
| closed / cancelled | Lịch sử | Lịch sử | Lịch sử |

Nháp (`sentById=null`) chỉ phía soạn và người điều phối thấy. Nội dung vai trò khác viết luôn mang nhãn `untrusted` khi tới agent.

## 6. Hàng chờ duyệt (`GET /queue`)

Trang chính của người điều phối. Gồm: nháp yêu cầu của agent (`draft`), nháp trả lời (`reply_drafted`), câu trả lời chờ chấp nhận (`replied`), yêu cầu gửi tới người điều phối (`sent`, phía nhận `null`), và đề xuất Quyết định chờ. Thứ tự: `blocker` trước, rồi `contract_change`, `review`, `question`, `handoff`; trong cùng loại, cũ hơn lên trước. Có thể duyệt gộp nhiều mục; mỗi mục vẫn ghi audit riêng.

## 7. Thông báo và nhắc

| Sự kiện | Ai được báo | Kênh |
|---|---|---|
| Agent tạo nháp / nháp trả lời / đề xuất | Người điều phối | Badge hàng chờ + SSE |
| `request.sent`, `request.followed_up` | Agent phía nhận | `list_inbox`, hook Claude Code |
| `request.replied` | Agent phía hỏi (và người điều phối nếu phía hỏi là mình) | `list_inbox`, badge |
| `request.cancelled` | Agent phía nhận nếu đã thấy | `list_inbox` |
| Nháp bị chặn vì secret | Agent gửi (lỗi 422) | Trả về ngay, không lưu |

Nhắc quá hạn (`reminders.ts`): khi tới `dueAt`, rồi mỗi 24 giờ làm việc (T2–T6, 09:00–12:00 và 13:00–18:00, giờ Việt Nam), phát `request.reminded` và ghi audit. Không bao giờ tự đóng, tự hủy hay đổi trạng thái.

## 8. Nhãn và lỗi (tiếng Việt)

| Trạng thái / nhãn | Nhãn UI | Câu trợ giúp |
|---|---|---|
| draft | Chờ duyệt | {vai trò} muốn gửi cho {vai trò}. Xem rồi bấm Gửi. |
| sent | Đã gửi | Đang chờ {vai trò} trả lời. |
| reply_drafted | Trả lời chờ duyệt | {vai trò} đã soạn trả lời. Xem rồi bấm Gửi trả lời. |
| replied | Đã có trả lời | Chấp nhận để đóng, hoặc hỏi lại. |
| closed | Đã xong | |
| cancelled | Đã hủy | |
| autoForwarded | Tự chuyển | Câu trả lời đã tới thẳng phía hỏi vì bạn bật tự chuyển. |
| editedBeforeSend | Đã chỉnh sửa | Người điều phối đã sửa trước khi gửi. |
| overdue | Quá hạn | Quá hạn {thời gian}; yêu cầu vẫn mở. |

Lỗi: `human_only` → "Hành động này cần người điều phối bấm, agent không làm thay được." `wrong_side` → "Vai trò này không phải một phía của yêu cầu." `invalid_state` → "Yêu cầu đã chuyển sang bước khác, hãy tải lại." `secret_detected` → "Tin chưa được lưu: có vẻ chứa bí mật ({loại}). Bỏ giá trị đó và thử lại." `rate_limited` → "Thao tác quá nhanh, thử lại sau {n} giây."

## 9. Trường hợp biên

| Tình huống | Hành vi |
|---|---|
| Người điều phối hủy khi phía nhận đang có nháp | Nháp giữ trong lịch sử, không gửi đi |
| Hai tab cùng bấm | Lần sau nhận `invalid_state`; không nhân đôi message/event |
| Token agent bị thu hồi khi đang có nháp | Nháp giữ, vẫn gắn agent đã soạn; người điều phối vẫn gửi được |
| Agent tạo quá 10 nháp mở | 429 `rate_limited`, đợi người điều phối xử lý hàng chờ |
| Agent sửa file ngoài vùng sở hữu | `post_status` / `check_paths` trả `outOfArea`; bàn của vai trò hiện cảnh báo |
| Hỏi lại nhiều vòng | Mỗi vòng thêm message `follow_up` rồi `reply`; tự chuyển phải bật lại mỗi vòng |
