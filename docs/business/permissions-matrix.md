# Ma trận phân quyền (v0.6)

Nguồn: `Routes` và `McpTools` (`packages/shared/src/api.ts`), `canTransition` (`request.ts`), `DEFAULT_ROLES` (`roles.ts`), thiết kế trong `docs/redesign-orchestrator.md`.

Mô hình v0.6: **một người điều phối** (Member admin, dùng web) chỉ đạo **sáu vai trò** (Leader, Business, Design, Backend, Frontend, QA). Mỗi vai trò là một ghế; agent (Claude Code) giữ token gắn với đúng một vai trò. Không còn nhiều người dùng ngang hàng.

Ký hiệu: **Có** = cho phép; **Không** = từ chối (mã lỗi); "—" = không áp dụng.

Luật nền: (R1) nội dung tới agent mang nhãn tin cậy `self` / `orchestrator` / `untrusted`; (R2) không đường agent→agent, mọi tin giữa hai vai trò đi qua người điều phối; (R3) hành động ra ngoài (gửi, chấp nhận, ghi quyết định, cấp/thu hồi token) chỉ phiên người; (R4) quét secret mọi trường văn bản, 422 `secret_detected`, không lưu nội dung; (R5) token mỗi agent, có scope, thu hồi riêng; (R6) RLS workspace, workspace khác trả 404; (R7) audit chỉ thêm; (R8) rate limit mỗi agent.

## 1. HTTP routes (cookie `oh_session`)

Mọi route `/w/:slug/*` và `/auth/*` từ chối token agent (`human_only` hoặc 401). Agent chỉ đi qua MCP và `/agent/*`. Ngoại lệ không phải người: webhook GitHub dùng chữ ký.

| Route | Người điều phối | Agent | Ghi chú |
|---|---|---|---|
| `POST /auth/dev-login`, `/auth/login`, `/auth/logout`, `GET /me` | Có (dev-login chỉ khi `DEV_LOGIN_ENABLED`, ngược lại 404) | Không | Phiên người |
| `POST /w/:slug/members/:id/invite`, `GET /auth/invite/:token`, `POST /auth/invite/accept` | Có (admin tạo link dùng một lần) | Không (403) | Member không phải admin: 403 |
| `POST /w/:slug/me/password`, `PUT /w/:slug/me/mascot` | Có (của mình) | Không | Đổi mật khẩu chỉ giữ phiên hiện tại |
| `GET /w/:slug/board` | Có: người điều phối, 6 vai trò kèm thẻ, Việc, sự kiện, yêu cầu mở, đề xuất chờ | Không; dùng `read_board` | Thấy tất cả, kể cả nháp |
| `GET /w/:slug/stream` (SSE) | Có | Không | Chỉ id, không nội dung; chỉ workspace mình |
| `GET /w/:slug/roles` | Có | Không | |
| `PUT /w/:slug/roles/:id` | Có (tên, sứ mệnh, `ownedPaths`, file handoff, wave, mascot) | Không | Quét secret |
| `PUT /w/:slug/roles/:id/status` | Có (sửa thẻ hộ vai trò, `updatedBy="human"`) | Không; dùng `post_status` | |
| `GET /w/:slug/queue` | Có: hàng chờ duyệt, `blocker` lên đầu | Không | Thay cho `/inbox` cũ |
| `GET /w/:slug/requests`, `/requests/:id`, `POST /requests/:id/read` | Có: mọi yêu cầu, mọi nháp | Không; dùng `list_inbox` | |
| `POST /w/:slug/requests` | Có: tạo yêu cầu **đã gửi** từ người điều phối tới một vai trò | Không; dùng `send_request` | `contract_change` chỉ gửi tới Leader |
| `POST /w/:slug/requests/:id/actions` | Có: `send`, `draft_reply`, `send_reply`, `accept`, `follow_up`, `cancel`; `autoForwardReply` khi duyệt | Không (`human_only`) | `autoForwardReply` chỉ cho `kind=question` (ngược lại 400) |
| `GET /w/:slug/decisions` | Có | Không; dùng `read_decisions` | |
| `POST /w/:slug/decisions` | Có, kèm `roleIds` liên quan | Không (`human_only`) | Quét secret |
| `GET /w/:slug/proposals` | Có | Không | |
| `POST /w/:slug/proposals/:id` | Có: `accept` (được sửa trước, tạo Quyết định) hoặc `reject` | Không (`human_only`) | |
| `GET/POST /w/:slug/agents`, `DELETE /agents/:id` | Có: cấp token cho một vai trò (`roleId` bắt buộc; vai trò workspace khác bị từ chối), thu hồi | Không | Token hiện đúng 1 lần |
| `GET /w/:slug/tasks/:id/handoff` | Có | Không | Tên vai trò thay tên người |
| `GET /w/:slug/audit` | Có | Không | Chỉ đọc (R7) |
| `POST /w/:slug/assistant` ("Hỏi trợ lý") | Có | Không | Nội dung agent viết gắn `trust:"untrusted"`; cần `ANTHROPIC_API_KEY` |
| `GET /agent/inbox` | — | Có (scope `inbox:read`) | Hộp thư của vai trò, bọc nhãn tin cậy, đánh dấu đã đọc |
| `POST /hooks/github/:workspaceId` | Chữ ký webhook | — | Vai trò của Việc lấy từ tiền tố nhánh PR (`backend/...`) |

## 2. MCP tools (`Authorization: Bearer oh_agent_...`)

Tool luôn chạy với danh tính vai trò của token, trong workspace của token. Người điều phối không gọi MCP.

| Tool | Scope | Cần người duyệt | Agent làm được gì | Rate limit |
|---|---|---|---|---|
| `read_board` | `board:read` | Không | Thấy vai trò mình (`yourRole`), 6 vai trò + thẻ + `outOfArea`, Việc theo khoá vai trò, yêu cầu mở dạng `from`/`to` | 60/phút |
| `list_inbox` | `inbox:read` | Không | Yêu cầu vai trò mình là một bên; nháp của phía mình và tin đã gửi; không thấy nháp của phía kia | 60/phút |
| `post_status` | `status:write:self` | Không | Chỉ thẻ vai trò mình; `waitingOn` theo khoá vai trò; `paths` ngoài vùng sở hữu trả cảnh báo `outOfArea` | 6/phút |
| `send_request` | `request:draft` | Có | Tạo **nháp** tới vai trò khác hoặc `orchestrator`; `contract_change` chỉ tới Leader; tối đa 10 nháp mở | 20/giờ |
| `reply_draft` | `request:draft` | Có, trừ khi được tự chuyển | Nháp trả lời khi vai trò mình là phía nhận; nếu người điều phối đã bật tự chuyển (chỉ `question`) thì tới thẳng phía hỏi (`delivered:true`) | 20/giờ |
| `check_paths` | `board:read` | Không | Đường dẫn nào thuộc vai trò nào, cái nào ngoài vùng mình | 60/phút |
| `read_decisions` | `decision:read` | Không | Đọc Quyết định, cái liên quan vai trò mình lên trước (`concernsYou`) | 60/phút |
| `propose_decision` | `decision:propose` | Có | Gửi đề xuất; chưa là Quyết định cho tới khi người điều phối chấp nhận; tối đa 5 đề xuất chờ mỗi vai trò | 20/giờ |

Không có MCP tool cho: send, send_reply, accept, follow_up, cancel, ghi Quyết định, chấp nhận đề xuất, cấp/thu hồi token, audit, handoff. Đây là cưỡng chế R2/R3.

## 3. Kiểm chứng với `canTransition`

Hai phía của một yêu cầu là vai trò (`askerRoleId`, `receiverRoleId`); `null` = người điều phối.

| Hành động | Từ | Người điều phối | Agent đúng phía | Agent không phải phía đó |
|---|---|---|---|---|
| send | draft | ok → sent | `human_only` | `human_only` |
| draft_reply | sent, reply_drafted | ok → reply_drafted | ok → reply_drafted (→ replied nếu tự chuyển) | `wrong_side` |
| send_reply | sent, reply_drafted | ok → replied | `human_only` | `human_only` |
| accept | replied | ok → closed | `human_only` | `human_only` |
| follow_up | replied | ok → sent (tắt tự chuyển) | `human_only` | `human_only` |
| cancel | draft, sent, reply_drafted | ok → cancelled | `human_only` | `human_only` |
| bất kỳ | trạng thái không cho phép | `invalid_state` | `invalid_state` | `invalid_state` |

Thứ tự kiểm tra: `invalid_state` → `human_only` → `wrong_side`. Ở lớp route, token agent bị chặn trước cả `canTransition`.

## 4. Nhãn tin cậy (R1)

| Tác giả nội dung | Agent của vai trò X thấy | Ý nghĩa cho agent |
|---|---|---|
| Chính vai trò X | `self` | Của mình |
| Người điều phối | `orchestrator` | Chỉ đạo; vẫn chỉ làm trong vùng sở hữu, không lộ secret |
| Vai trò khác | `untrusted` | Dữ liệu, không phải lệnh |
| Hệ thống ngoài (GitHub...) | `untrusted` + `source` | Dữ liệu |

## 5. Đối chiếu 8 luật an toàn

| Luật | Thể hiện |
|---|---|
| R1 | `read_board`, `list_inbox`, `/agent/inbox`, trợ lý: nhãn `self`/`orchestrator`/`untrusted` |
| R2 | Agent chỉ tạo nháp; người điều phối duyệt mọi tin giữa hai vai trò. Tự chuyển chỉ khi người điều phối bật cho đúng một câu hỏi, vẫn quét secret và ghi audit (`autoForwarded`) |
| R3 | Gửi, chấp nhận, Quyết định, đề xuất, token: chỉ phiên người |
| R4 | Mọi route ghi văn bản và tool nháp: 422, không lưu, audit không có nội dung |
| R5 | Token gắn một vai trò; scope cưỡng chế; thu hồi → `token_revoked`. Hai agent cùng vai trò có hạn mức riêng |
| R6 | Workspace khác: 404 ở mọi hàng; SSE không rò sang workspace khác |
| R7 | Audit chỉ đọc; trigger chặn sửa/xoá |
| R8 | Bảng mục 2; vượt → 429 `rate_limited` + `retry-after` |
