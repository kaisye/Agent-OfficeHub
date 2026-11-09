# Office Hub — PRD v0.1 (pilot Tripflix)

Nguồn: `docs/proposal.md`, hợp đồng trong `packages/shared`. Ngày: 09/11/2026. Chủ sở hữu: Business team.

## 1. Vấn đề

Nhóm phần mềm có người dùng agent lập trình (Claude Code, Codex, Gemini CLI) và người không dùng. Phối hợp vẫn qua chat, kéo theo 6 nỗi đau:

| # | Nỗi đau | Ví dụ ngày 09/11 | Office Hub giải bằng |
|---|---|---|---|
| 1 | Chuyển ngữ cảnh bằng tay | Dán tin của Trang/Bảo vào phiên agent, copy ngược ra Messenger (~10 lần/ngày) | Hàng yêu cầu có cấu trúc; agent đọc `list_inbox`, soạn nháp qua `reply_draft` |
| 2 | Hỏi trạng thái | "PR số mấy?", "server ghim tag gì?" | Bảng trạng thái từ PR/CI/ticket thật + thẻ trạng thái từng người |
| 3 | Quyết định thất lạc | Tách tag theo app, giảm bộ đếm bình luận khi ẩn | Sổ quyết định (chỉ người ghi, có lý do) |
| 4 | Không rõ ai chờ ai | Bảo chờ key OpenAI; Phong chờ Trang báo tên biến | `StatusCard.waitingOn` + yêu cầu có hạn, nhắc quá hạn |
| 5 | Secret đi qua chat | Key DeepSeek/OpenAI | Quét secret lúc nhận, từ chối cả tin, không lưu |
| 6 | Agent đụng việc nhau | Nhiều nhánh cùng sửa `deploy/` | Thẻ trạng thái + Việc hiển thị ai đang sửa gì (phát hiện sớm, không tự giải quyết) |

## 2. Người dùng và persona

| Persona | Mô tả | Việc cần làm | Nỗi đau chính | Dùng gì |
|---|---|---|---|---|
| **P1 — Dev dùng agent nhiều** (Phong) | Chạy Claude Code cả ngày, nhiều nhánh | Để agent đọc bảng, soạn nháp yêu cầu/trả lời; mình chỉ duyệt và bấm gửi | Copy chat ↔ agent; dán nhầm lệnh | Web + MCP (token riêng) + hook SessionStart/UserPromptSubmit |
| **P2 — Dev không dùng agent** (Trang) | Làm việc bằng IDE + chat | Hỏi/đáp, xem trạng thái, ghi quyết định, không cần cài gì | Phải hỏi "PR số mấy"; sợ bị bỏ ngoài luồng agent | Chỉ web, đủ mọi chức năng người |
| **P3 — Trưởng nhóm / Admin** (Phong, vai `admin`) | Quản workspace, kết nối GitHub, quản agent | Thấy việc đứng ở đâu, thu hồi token, xem nhật ký | Không biết ai chờ ai; lo agent làm bậy | Web: bảng, audit, quản agent |
| **P4 — Người mới giữa sprint** (vd. Ngọc) | Vào nhóm đang chạy, thiếu ngữ cảnh | Hiểu Việc đang làm, vì sao chọn cách này, ai phụ trách | Phải hỏi từng người | Bảng, sổ quyết định, gói bàn giao |

Người dùng gián tiếp: agent (không phải persona; là công cụ của chủ, không có quyền quyết định).

## 3. Mục tiêu và ngoài mục tiêu

| Mục tiêu (pilot 2 tuần) | Ngoài mục tiêu |
|---|---|
| Giảm copy chat↔agent, hỏi trạng thái, thời gian hỏi→trả lời | App chat mới / thay Messenger |
| Mọi hành động ra ngoài do người bấm (rule 3) | Agent tự quyết, tự gửi, tự ghi quyết định |
| Người không dùng agent vẫn dùng đủ | Thay Jira/Linear (Việc chỉ trỏ tới nguồn) |
| Không lọt secret, không agent làm theo tin chưa duyệt | Lưu secret / vault (chỉ chặn) |
| Dữ liệu mẫu và hợp đồng đủ để QA tự động hóa | Multi-tenant SaaS, billing, SSO doanh nghiệp |

## 4. Phạm vi

| Hạng mục | MVP pilot (P0) | Sau pilot (P1/P2) |
|---|---|---|
| Workspace/thành viên | 1 workspace Tripflix, thành viên tạo sẵn bằng seed/CLI, đăng nhập GitHub (dev login khi dev) | Mời qua link, nhiều workspace, chuyển vai |
| Bảng | Board 1 màn: thẻ 7 người, Việc, 50 sự kiện gần nhất, yêu cầu mở; SSE realtime | Lọc theo area, lịch sử presence |
| Mascot | Sinh từ `Mascot`, 6 mood theo `PRESENCE_TO_MOOD`, chọn/đổi mascot | Phụ kiện mở khoá, mascot cho bot thông báo |
| Yêu cầu | Toàn bộ 6 hành động, quá hạn có nhắc, không tự đóng | Từ chối/đổi người nhận, sửa hạn, mẫu yêu cầu |
| Quyết định | Ghi (người), xem, gắn Việc | Sửa/thay thế quyết định, liên kết quyết định ↔ yêu cầu |
| Agent/token | Tạo (hiện token 1 lần), phạm vi, thu hồi, 5 MCP tool, hook Claude Code | Xoay token, nhiều agent mỗi người nâng cao, hết hạn token |
| Connector | GitHub webhook (PR, issue, CI) | Jira, CI riêng, deploy |
| Thông báo | In-app (badge + SSE), nhắc quá hạn | Email, đẩy vào chat đang dùng (giảm rủi ro "không bỏ thói quen chat") |
| Gói bàn giao | Markdown sinh theo Việc | Xuất PDF, gói theo sprint |
| Audit/an toàn | Nhật ký chỉ thêm, 8 luật an toàn, rate limit | Xuất audit, cảnh báo bất thường |

## 5. Chỉ số thành công và cách đo từ mô hình dữ liệu

Giờ làm việc dùng để tính: 09:00–12:00 và 13:00–18:00 (ICT), T2–T6 (cấu hình theo workspace; hiện chưa có trường, xem `HANDOFF.md`). Đường cơ sở: 3 ngày làm việc trước pilot, tự khai.

| # | Chỉ số (mục tiêu) | Nguồn dữ liệu | Công thức | Ghi chú / giới hạn |
|---|---|---|---|---|
| M1 | Copy chat↔agent giảm ≥50% | **Không đo được hoàn toàn từ DB** (copy xảy ra ngoài hệ thống). Đo thay thế: (a) khảo sát tự khai đầu/cuối pilot (đếm số lần/ngày); (b) proxy: `RequestMessage` có `authoredBy='agent'` và `sentById` khác null mỗi ngày = số lần "copy" đã được thay thế | (a) 1 − (tuần 2 / baseline); (b) số tin agent đã gửi / ngày | Chốt (a) là chỉ số chính, (b) là bằng chứng |
| M2 | Thời gian hỏi→trả lời, trung vị <2 giờ làm việc | `HubEvent` type `request.sent` (và `request.followed_up` cho vòng hỏi lại) → `request.replied` cùng `Request.id` (trong `data.requestId`, xem HANDOFF) | median(working_hours(replied.time − sent.time)); yêu cầu chưa trả lời tính đến `now` (censored); loại `cancelled` | Mỗi vòng hỏi lại tính một mẫu riêng |
| M3 | Câu hỏi trạng thái trong chat giảm ≥50% | **Không có trong DB.** Đếm tay mẫu tin nhắn nhóm (cùng 2 ngày/tuần) + khảo sát. Proxy: số lần mở board (cần log truy cập, `Routes.board` request count từ API log) | 1 − (tuần 2 / baseline) | Cần người đếm: giao QA/PM |
| M4 | ≥60% bản nháp agent "gửi luôn" | `RequestMessage` | tử = count(`authoredBy='agent'` AND `sentById` NOT NULL AND `editedBeforeSend=false`); mẫu = count(`authoredBy='agent'` AND `sentById` NOT NULL) | Báo kèm "tỉ lệ bỏ nháp" = nháp agent trong request `cancelled` hoặc không bao giờ gửi / tổng nháp agent. Quy ước: sửa dù 1 ký tự → `editedBeforeSend=true`, `authoredBy` vẫn `agent` |
| S1 | Điều kiện dừng: secret lọt | Quét định kỳ (job gitleaks-style) trên mọi cột text (`title`, `body`, `rationale`, `doing`, `Request.messages.body`) + báo cáo tay | count(match) > 0 → dừng pilot | Số từ chối lúc nhận (audit `secret_rejected`) là chỉ số khoẻ, không phải lỗi |
| S2 | Điều kiện dừng: agent làm theo tin người khác chưa duyệt | Không tự phát hiện được. Kiểm tra: red-team có kịch bản (QA) + người dùng bấm "báo cáo" (cần nơi lưu, xem HANDOFF) + soát `audit` các ghi của agent theo nội dung tin vừa đọc | ≥1 ca xác nhận → dừng | Luật 1 (nhãn untrusted) và 2 (không đường agent→agent) giảm rủi ro |

Chỉ số phụ (không phải điều kiện dừng):

| Chỉ số | Cách đo |
|---|---|
| Tỉ lệ yêu cầu quá hạn | count(status ∈ sent, reply_drafted, replied AND `dueAt` < now) / count(open có `dueAt`) |
| Yêu cầu gắn Việc | count(`taskId` NOT NULL) / count(requests) |
| Người dùng hoạt động/ngày | số `actorMemberId` distinct trong `HubEvent` mỗi ngày |
| Độ phủ agent | số `Agent` không `revokedAt` có `lastSeenAt` trong 24h / số thành viên |
| Quyết định ghi/tuần | count(`HubEvent.type='decision.recorded'`) |
| Tuổi thẻ trạng thái | now − `StatusCard.updatedAt` (thẻ cũ >4 giờ làm việc = lệch) |
| Vòng hỏi lại | count(`request.followed_up`) / count(`request.closed`) |

## 6. Ràng buộc và rủi ro

| Rủi ro (proposal) | Biện pháp trong sản phẩm |
|---|---|
| Kéo trễ Tripflix | Chỉ P0; seed cho dev/QA chạy ngay |
| Prompt injection | Rule 1, 2, 3; QA red-team |
| Nhóm không bỏ thói quen chat | Thông báo gọn, nút duyệt trong web; kênh chat để P2 |
| Agent quá ồn | Gom theo Việc; chỉ báo khi cần "mình" |
| Phụ thuộc Supabase | Đã chọn Postgres + SSE (ARCHITECTURE) |

## 7. Tài liệu liên quan

`user-stories.md` (câu chuyện + AC), `permissions-matrix.md`, `request-flow.md`, `mascot-brief.md`, `seed-tripflix.json`, `HANDOFF.md`.
