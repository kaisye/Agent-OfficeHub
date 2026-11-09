# Business team — HANDOFF

## 1. Đã làm

| File | Nội dung |
|---|---|
| `PRD.md` | Vấn đề, 4 persona, mục tiêu/ngoài mục tiêu, MVP vs sau, 4 chỉ số + 2 điều kiện dừng với cách đo từ trường dữ liệu |
| `user-stories.md` | 83 story / 10 epic: P0 = 53, P1 = 21, P2 = 9; AC Given/When/Then; quy ước mã lỗi và rate limit |
| `permissions-matrix.md` | Mọi route trong `Routes` (tách `actOnRequest` theo 6 action) và 5 MCP tool × admin/member (self, người khác)/agent; đối chiếu `canTransition` và 8 luật |
| `request-flow.md` | Trạng thái, ai bấm gì, ai thấy gì, thông báo, lịch nhắc quá hạn, nhãn tiếng Việt |
| `mascot-brief.md` | Brief cho Design: lý do, mood↔presence, người vs agent, điều cấm |
| `seed-tripflix.json` | 1 workspace, 7 member, 7 thẻ (đủ 6 presence), 8 Việc, 15 event, 6 yêu cầu (đủ 6 status), 3 quyết định, 2 agent |
| `scripts/validate-seed.ts` | Parse mọi thực thể bằng zod của `@officehub/shared`, kiểm tham chiếu chéo, trùng id, phủ status/presence |

Chạy kiểm tra seed (từ gốc repo, sau `pnpm install`):
`node node_modules/.pnpm/vite-node@2.1.9/node_modules/vite-node/vite-node.mjs docs/business/scripts/validate-seed.ts` → "OK: seed hợp lệ, 0 lỗi" (đã chạy). Thay thế: `pnpm dlx tsx docs/business/scripts/validate-seed.ts`.

## 2. Giả định đã dùng

| # | Giả định | Ảnh hưởng |
|---|---|---|
| A1 | Pilot: workspace và Member tạo sẵn bằng seed/CLI; mời qua link là P1 | ONB-04 P0, ONB-05 P1 |
| A2 | Member chỉ thấy yêu cầu mình là một bên; admin thấy tất cả (chỉ đọc). Nháp (`sentById=null`) chỉ tác giả/chủ thấy; server phải lọc message nháp khỏi phía còn lại | Ma trận, REQ-04/05/11 |
| A3 | `Board.openRequests` cũng áp quy tắc A2 (lọc theo người xem) | Ma trận |
| A4 | Admin không bấm hộ ai (`canTransition` cho `wrong_side`); admin duy nhất thêm: xem audit, xem/thu hồi mọi agent | AUD-06 |
| A5 | Cross-workspace trả 404, không 403 | Quy ước |
| A6 | `send_reply` được bấm thẳng từ `sent` (có `body`) | REQ-06 |
| A7 | `authoredBy` giữ nguyên `agent` khi người sửa nháp; `editedBeforeSend=true` | Metric M4 |
| A8 | Quá hạn là nhãn suy ra, không phải trạng thái; không bao giờ tự đóng | request-flow |
| A9 | Giờ làm việc T2–T6 09:00–12:00, 13:00–18:00 ICT | Nhắc, M2 |
| A10 | Rate limit số liệu là đề xuất (agent 60/phút, `post_status` 6/phút, nháp 20/giờ, tối đa 10 mở; người 120/phút, `createRequest` 30/giờ) | AGT-09, AUD-07 |
| A11 | Secret bị chặn vẫn ghi 1 dòng audit metadata (loại, actor, route), không nội dung, không băm | AUD-01 |
| A12 | Gói bàn giao: yêu cầu `closed` cho mọi thành viên; yêu cầu mở chỉ tiêu đề + trạng thái nếu người xem không phải một bên | HOF-02 |
| A13 | Seed: Minh, Lan, Huy, Ngọc và mọi `githubLogin` là placeholder; `tokenPrefix` giả | seed |
| A14 | Thông báo pilot chỉ in-app, suy ra từ trạng thái và event | Epic 8 |

## 3. Contract change requests (`packages/shared`)

| # | Thay đổi | Vì sao (story bị chặn/yếu) | Mức |
|---|---|---|---|
| C1 | `Agent.tokenPrefix`: định nghĩa là 8 ký tự đầu của **phần ngẫu nhiên** sau `oh_agent_` (hoặc đổi thành 12 ký tự đầu của cả chuỗi). Hiện 8 ký tự đầu của `oh_agent_<token>` luôn là `oh_agent`, vô dụng để phân biệt token | AGT-01, AGT-08 | Nên làm trước pilot |
| C2 | `EventType` thêm `request.reminded` (hoặc ghi nhắc vào audit và nói rõ không vào Event) và nên có `agent.created`, `agent.revoked` nếu muốn lên board | NTF-04, REQ-10 | P0 nếu nhắc phải truy vết |
| C3 | Thêm `requestId` vào quy ước `HubEvent.data` cho `request.*` (và `decisionId` cho `decision.recorded`); hiện `data` là `record(unknown)` không chuẩn hoá | Chỉ số M2, M4 cần nối event ↔ request | P0 |
| C4 | `ApiError.error.code`: liệt kê enum mã lỗi: `unauthenticated`, `token_revoked`, `forbidden`, `scope_missing`, `human_only`, `wrong_side`, `invalid_state`, `not_found`, `secret_detected`, `validation_failed`, `rate_limited` (kèm `retryAfterSec`) | QA tự động hóa phân biệt lỗi | P0 |
| C5 | Định nghĩa schema audit: `AuditEntry{id, workspaceId, time, actorMemberId, actorAgentId, kind, target, meta}` và `kind` enum (`secret_rejected`, `agent_denied`, `rate_limited`, `token_revoked_use`, ...). `Routes.audit` hiện không có `res` | AUD-02/03, S1, S2 | P0 |
| C6 | `Routes.actOnRequest`: ghi rõ `body` bắt buộc cho `draft_reply`, `follow_up`, `send_reply` từ `sent` (refine theo `action`); cho phép `send` kèm `body` để gửi bản đã sửa | REQ-03/05/06/08 | P0 |
| C7 | Quyết định: `rationale` phải `min(1)` ở `recordDecision` (hiện cho rỗng) | DEC-01 | P0 |
| C8 | Thông báo / chưa đọc: thêm `readAt` theo (member, request) hoặc route `GET /w/:slug/inbox` trả mục chưa đọc (hook SessionStart cần "chưa đọc") | AGT-10, NTF-01 | P0 nếu hook phải đúng "chưa đọc"; có thể P1 |
| C9 | Request: thêm `RequestAction` `decline` (hoặc `reassign` kèm `newReceiverId`) cho receiver | REQ-12 | P1 |
| C10 | Route sửa yêu cầu: `PATCH /w/:slug/requests/:id` đổi `dueAt` (asker) và sửa nháp (tác giả) | REQ-13, REQ-03 | P1 |
| C11 | Route mời/thành viên và connector: `POST /w/:slug/invites`, `GET /w/:slug/members`, `PUT /w/:slug/connectors`, `PUT /w/:slug/members/:id/role`; hiện chỉ có seed | ONB-05, ONB-07 | P1 |
| C12 | `Workspace` thêm cấu hình giờ làm việc (`workHours`, `timezone`) để tính nhắc và M2 | request-flow mục 5 | P1 (tạm dùng mặc định A9) |
| C13 | `Board.openRequests` trả dạng đã lọc theo người xem; nêu rõ phía server redact message nháp | A2, A3 | P0 (là luật server, cần ghi vào contract) |
| C14 | Tool MCP đọc quyết định (`read_decisions`, scope `board:read`) để agent trích lý do khi soạn nháp; hiện agent không đọc được sổ quyết định | AGT, DEC-02 | P1 |
| C15 | `Decision`: thêm `supersededById` (nullable) | DEC-04 | P2 |
| C16 | `AgentScope` giữ nguyên; thêm `Agent.expiresAt` | AGT-12 | P2 |
| C17 | `MascotMood`/`Mascot`: không đổi; nên có enum chung `species`/`palette` trong shared (hiện chuỗi tự do, brand quyết) để backend validate MAS-02 | MAS-02 | P1 |

Ghi chú test hiện có: `request.test.ts` mô tả "4 human-only steps (+cancel)" nhưng `HUMAN_ONLY_ACTIONS` có 5 phần tử (send, send_reply, accept, follow_up, cancel); bài test khớp (liệt kê cả 5). Chỉ chú thích, không phải lỗi.

## 4. Câu hỏi mở cho người dùng

| # | Câu hỏi | Mặc định đang dùng |
|---|---|---|
| Q1 | Admin có được xem nội dung mọi yêu cầu, hay chỉ metadata? (riêng tư vs minh bạch "ai chờ ai") | Admin xem tất cả, chỉ đọc |
| Q2 | Member thường có thấy yêu cầu giữa hai người khác không (để thấy việc đứng ở đâu)? | Không; chỉ thấy qua `waitingOn` trên thẻ |
| Q3 | Pilot có cần email/chat ngoài web từ ngày 1? Rủi ro "nhóm không bỏ thói quen chat" | In-app trước, chat P2 |
| Q4 | Lịch nhắc có gồm admin ở mốc +1 ngày không? Có phiền Phong (vừa là admin vừa người dùng)? | Có, dạng tóm tắt |
| Q5 | Số cụ thể của M1/M3 đo thế nào, ai đếm tay (QA hay PM) và baseline ngày nào? | Khảo sát tự khai + đếm mẫu |
| Q6 | Quy tắc giờ làm việc và ngày nghỉ của Tripflix (T7?) | T2–T6, 8 giờ/ngày |
| Q7 | Một người có thể có nhiều agent cùng lúc không (Phong dùng cả Claude Code và Codex)? Hợp đồng cho phép; giới hạn mấy? | Cho phép, chưa giới hạn |
| Q8 | Với tin có secret trong webhook GitHub: từ chối bản ghi (CON-03) có chấp nhận được khi mất sự kiện PR đó? | Từ chối, trả 200, audit |
| Q9 | Ai được thu hồi agent: chủ và admin; đúng ý chưa? | Chủ và admin |
| Q10 | Tên và `githubLogin` thật của Minh, Lan, Huy, Ngọc (hiện bịa) | Placeholder |
| Q11 | Có cần nhãn "Cùng sửa deploy/" (BRD-06) trong pilot không, vì đây là nỗi đau số 6? Hiện P1 | P1 |

## 5. Lưu ý cho QA

- Thứ tự lỗi của `canTransition`: `invalid_state` → `human_only` → `wrong_side`.
- Request `env` trong seed là ca quá hạn (`dueAt` 08:00 ngày 09/11, `sent`); nên fake clock sau 09:00 để thử nhắc.
- Request `count` trong seed có đủ vòng: ask, reply (agent, đã sửa), follow_up, reply (người).
- Request `conflict` là nháp agent chưa gửi (`sentById=null`): người nhận không được thấy.
- Agent seed có `tokenPrefix` giả; không có token thật nào trong repo.
