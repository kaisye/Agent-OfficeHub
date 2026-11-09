# Ma trận phân quyền

Nguồn: `Routes` và `McpTools` (`packages/shared/src/api.ts`), `canTransition` (`request.ts`), 8 luật an toàn trong `docs/proposal.md`.

Ký hiệu: **Có** = cho phép; **Không** = từ chối (mã lỗi); "—" = không áp dụng. "Member (self)" = trên dữ liệu của chính mình hoặc yêu cầu mà mình là một bên; "Member (người khác)" = dữ liệu của thành viên khác.

Luật nền: (R1) tin người khác tới agent bọc `untrusted`; (R2) không đường agent→agent; (R3) hành động ra ngoài chỉ phiên người; (R4) quét secret mọi trường văn bản; (R5) token mỗi agent, có scope, thu hồi riêng; (R6) RLS workspace — truy cập workspace khác trả 404; (R7) audit chỉ thêm; (R8) rate limit mỗi agent.

Mọi cột đều chịu: R6 (workspace khác → 404), R4 (secret → 422 `secret_detected`) ở route ghi có văn bản, và cookie hợp lệ (người) / token chưa thu hồi (agent).

## 1. HTTP routes (`Routes`)

Agent chỉ xác thực được ở MCP và `/agent/*`; mọi route dưới đây (cookie `oh_session`) từ chối token agent (R3, R5). Ngoại lệ không phải người: `githubWebhook` dùng chữ ký.

| Route | Admin | Member (self) | Member (người khác) | Agent (scope của chủ) | Lý do |
|---|---|---|---|---|---|
| `POST /auth/dev-login` | Có, chỉ khi `DEV_LOGIN_ENABLED`; ngược lại 404 | Như admin | — | Không (401) | Môi trường dev; tắt ở production |
| `GET /auth/github` | Có | Có | — | Không | Đăng nhập người; chỉ Member đã tạo sẵn |
| `GET /me` | Có (của mình) | Có | Không có tham số | Không | Phiên người |
| `POST /auth/logout` | Có | Có | — | Không | — |
| `GET /w/:slug/board` | Có | Có | — (board chung workspace) | Không; dùng MCP `read_board` | Thấy toàn bộ thẻ, Việc, sự kiện; `openRequests`: member chỉ các yêu cầu mình là một bên, admin tất cả (giả định, xem HANDOFF) |
| `GET /w/:slug/stream` (SSE) | Có | Có | — | Không | Realtime chỉ của workspace mình (R6); event lọc theo quyền như board |
| `PUT /w/:slug/status` | Có (thẻ của mình) | Có (thẻ của mình) | Không (không có tham số `memberId`) | Không; dùng MCP `post_status` | Thẻ chỉ ghi bởi chủ hoặc agent của chủ; admin không ghi hộ |
| `PUT /w/:slug/me/mascot` | Có (của mình) | Có (của mình) | Không | Không | Danh tính của từng người; admin không đổi hộ |
| `GET /w/:slug/requests` | Có: tất cả yêu cầu (chỉ đọc) | Có: yêu cầu mình là asker/receiver; nháp chưa gửi của mình | Không thấy yêu cầu của cặp khác; không thấy nháp (`sentById=null`) của người khác | Không; dùng `list_inbox` | Riêng tư giữa hai bên; nháp luôn riêng tư với phía còn lại |
| `POST /w/:slug/requests` (createRequest) | Có (mình là asker, tạo `draft`) | Có (tạo `draft`) | Không thể tạo thay (asker = chủ phiên) | Không; dùng `send_request` | Chỉ tạo nháp; gửi là bước riêng (R3). Quét secret (R4) |
| `POST /w/:slug/requests/:id/actions` `send` | Chỉ nếu là asker; ngược lại `wrong_side` | Có nếu là asker và `draft` | Không (`wrong_side`) | Không (`human_only`) | `TRANSITIONS.send`: humanOnly, side asker, from draft |
| ... `draft_reply` | Chỉ nếu là receiver | Có nếu là receiver, from sent\|reply_drafted | Không (`wrong_side`) | Không ở route này; có qua MCP `reply_draft` | `humanOnly:false`, side receiver; người cũng được tự soạn |
| ... `send_reply` | Chỉ nếu là receiver | Có nếu là receiver, from sent\|reply_drafted | Không (`wrong_side`) | Không (`human_only`) | humanOnly, side receiver |
| ... `accept` | Chỉ nếu là asker | Có nếu là asker và `replied` | Không (`wrong_side`) | Không (`human_only`) | humanOnly, side asker, from replied |
| ... `follow_up` | Chỉ nếu là asker | Có nếu là asker và `replied` | Không (`wrong_side`) | Không (`human_only`) | humanOnly, side asker; về `sent` |
| ... `cancel` | Chỉ nếu là asker | Có nếu là asker, from draft\|sent\|reply_drafted | Không (`wrong_side`) | Không (`human_only`) | humanOnly, side asker; không hủy được khi `replied`/`closed`/`cancelled` (`invalid_state`) |
| `GET /w/:slug/decisions` | Có | Có | — (sổ chung workspace) | Không | Quyết định là tri thức chung; hiện chưa có tool MCP đọc quyết định (xem HANDOFF) |
| `POST /w/:slug/decisions` | Có | Có | — | Không (`human_only`); không có tool MCP | Chỉ người ghi (`decidedById` là Member, không bao giờ agent); R4 quét secret |
| `GET /w/:slug/agents` | Có: mọi agent trong workspace (để thu hồi) | Có: agent của mình | Không thấy agent người khác | Không | Chỉ metadata; không bao giờ có token đầy đủ (chỉ `tokenPrefix`) |
| `POST /w/:slug/agents` | Có (cho chính mình; không có `ownerId` trong body) | Có (cho chính mình) | Không tạo hộ | Không | R5: token gắn chủ; agent không tự tạo agent (R2). Token trả đúng 1 lần |
| `DELETE /w/:slug/agents/:id` | Có: mọi agent trong workspace | Có: agent của mình | Không (`forbidden`) | Không (agent không tự thu hồi hay thu hồi agent khác) | R5 thu hồi riêng; admin cắt quyền khi khẩn cấp |
| `GET /w/:slug/tasks/:id/handoff` | Có | Có | — | Không (không có tool) | Nội dung theo quyền xem yêu cầu như `GET requests`; không có nháp của người khác (giả định) |
| `POST /hooks/github/:workspaceId` | Không dùng phiên; xác thực bằng chữ ký webhook | — | — | Không | Connector, không phải người/agent; chữ ký sai 401; quét secret (R4) |
| `GET /w/:slug/audit` | Có | Không (`forbidden`) | Không | Không | Audit chỉ-thêm (R7); admin-only |

## 2. MCP tools (`McpTools`)

Xác thực: `Authorization: Bearer oh_agent_...`. Người dùng không gọi MCP bằng cookie (lẫn lộn danh tính). Tool luôn chạy với danh tính chủ, trong workspace của agent (R5, R6).

| Tool | Scope cần | `humanApproval` | Admin (người) | Member (người) | Agent của admin/member | Ghi chú |
|---|---|---|---|---|---|---|
| `read_board` | `board:read` | false | Không (dùng web) | Không | Có nếu có scope; chuỗi người khác viết bọc `Untrusted` (R1); thiếu scope → `scope_missing` | Chỉ đọc |
| `list_inbox` | `inbox:read` | false | Không | Không | Có nếu có scope; chỉ yêu cầu chủ là asker/receiver; nháp của chủ và tin đã gửi; nội dung người khác bọc `Untrusted` (R1) | Không bao giờ trả nháp của người khác |
| `post_status` | `status:write:self` | false | Không | Không | Có, chỉ thẻ của chủ; `updatedBy="agent"` | Không có tham số id người khác; R4; rate limit 6/phút |
| `send_request` | `request:draft` | true | Không | Không | Có, chỉ tạo **nháp** `draft` với `askerId`=chủ; chủ bấm Gửi (`send`, human-only) | Trả `humanApproval:true`; limit 20/giờ, 10 nháp mở |
| `reply_draft` | `request:draft` | true | Không | Không | Có nếu chủ là receiver và request `sent`\|`reply_drafted`; tạo nháp trả lời; ngược lại `wrong_side`/`invalid_state` | Chủ bấm `send_reply` |

Không có MCP tool: send, send_reply, accept, follow_up, cancel, recordDecision, createAgent, revokeAgent, audit, handoff, đổi mascot. Đây là cưỡng chế R2/R3: agent không có đường tới hành động ra ngoài hay tới agent khác.

## 3. Kiểm chứng với `canTransition`

| Hành động | Trạng thái từ | Người đúng phía | Người khác phía (kể cả admin) | Agent chủ đúng phía | Agent chủ sai phía |
|---|---|---|---|---|---|
| send | draft | asker: ok → sent | `wrong_side` | `human_only` | `human_only` |
| draft_reply | sent, reply_drafted | receiver: ok → reply_drafted | `wrong_side` | ok → reply_drafted | `wrong_side` |
| send_reply | sent, reply_drafted | receiver: ok → replied | `wrong_side` | `human_only` | `human_only` |
| accept | replied | asker: ok → closed | `wrong_side` | `human_only` | `human_only` |
| follow_up | replied | asker: ok → sent | `wrong_side` | `human_only` | `human_only` |
| cancel | draft, sent, reply_drafted | asker: ok → cancelled | `wrong_side` | `human_only` | `human_only` |
| bất kỳ | trạng thái không cho phép | `invalid_state` (kiểm tra đầu tiên) | `invalid_state` | `invalid_state` | `invalid_state` |

Thứ tự kiểm tra của `canTransition`: `invalid_state` → `human_only` → `wrong_side`. Vì vậy agent gửi `send` vào request đã `sent` nhận `invalid_state` chứ không phải `human_only`; QA cần dùng đúng thứ tự khi viết kỳ vọng. Ở lớp route/MCP, token agent bị từ chối trước cả `canTransition` (route người chỉ nhận cookie).

## 4. Đối chiếu 8 luật an toàn

| Luật | Thể hiện trong ma trận |
|---|---|
| R1 untrusted | `read_board`, `list_inbox` bọc `Untrusted` |
| R2 không agent→agent | Không tool nào kích hoạt hoặc tác động agent khác; `createAgent`/`revokeAgent` người-only |
| R3 ra ngoài do người | send/send_reply/accept/follow_up/cancel/recordDecision: người-only, phiên cookie |
| R4 secret | Mọi route ghi văn bản và tool nháp: 422 `secret_detected` |
| R5 token | `createAgent` gắn chủ; scope cưỡng chế; `revokeAgent` riêng; token thu hồi → `token_revoked` |
| R6 RLS | Workspace khác: 404 ở mọi hàng |
| R7 audit | `audit` chỉ đọc, admin-only; không route sửa/xoá |
| R8 rate limit | Mọi tool agent; limit cụ thể trong `user-stories.md` |
