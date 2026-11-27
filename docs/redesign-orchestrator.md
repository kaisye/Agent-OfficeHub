# Office Hub v0.6: một người điều phối nhiều agent

Trạng thái: **bản thiết kế chờ duyệt** (27/11/2026). Chưa có code nào đổi theo bản này.

## 1. Đổi gì, vì sao

Bản v0.5 được thiết kế cho **một nhóm 3–15 người, mỗi người có agent riêng**. Thực tế bây giờ là **một người (Phong) điều phối 6 agent**. Mỗi agent giữ một vai trò, đúng như cách repo này đã được xây (xem bảng phân vùng trong `docs/ARCHITECTURE.md`).

Những cái giữ nguyên vì vẫn đúng:
- Người duyệt mọi lần gửi và mọi quyết định.
- Tin của bên khác là dữ liệu, không phải lệnh.
- Không lưu secret.
- Mỗi agent một token, có phạm vi.
- Audit chỉ thêm, không sửa.

Những cái đổi:
- Hai bên của một yêu cầu giờ là **hai agent**, không còn là hai người.
- Người đứng ở giữa với vai trò **cổng duyệt**.
- Bảng hiện **6 bàn vai trò**, không còn hiện đồng nghiệp.

## 2. Mapping vai trò → agent

Mỗi team trong ARCHITECTURE trở thành **một vai trò (seat)** cố định trên bảng. Mỗi vai trò có thể có nhiều phiên agent (Claude Code, Codex…), mỗi phiên một token. Tất cả các phiên chung một thẻ trạng thái và một hộp thư.

| Vai trò | Agent làm gì | Vùng sở hữu (chỉ được ghi ở đây) | Bàn giao | Đợt |
|---|---|---|---|---|
| **Leader** | Giữ contract, chốt kiến trúc, nhận yêu cầu đổi contract | `packages/shared/**`, file config gốc, `docs/ARCHITECTURE.md`, `docs/proposal.md` | `docs/ARCHITECTURE.md` | 0 |
| **Business** | PRD, user story, ma trận quyền, luồng yêu cầu, dữ liệu seed | `docs/business/**` | `docs/business/HANDOFF.md` | 1 |
| **Design** | Token thương hiệu, linh vật, UI kit | `packages/brand/**`, `packages/ui/**`, `docs/design/**` | `docs/design/HANDOFF.md` | 1 |
| **Backend** | DB, API, MCP, hook agent | `packages/db/**`, `apps/api/**`, `apps/mcp/**`, `apps/agent-hooks/**`, `docs/tech/**` | `docs/tech/HANDOFF.md` | 1 |
| **Frontend** | Web app | `apps/web/**` | `apps/web/HANDOFF.md` | 2 |
| **QA & Security** | Test E2E, kiểm bảo mật, báo cáo | `tests/e2e/**`, `docs/qa/**` | `docs/qa/REPORT.md` | 3 |
| **Điều phối (người)** | Giao việc, duyệt mọi tin qua lại, ghi quyết định, thu hồi token | Toàn quyền đọc; ghi qua web | — | — |

Cột "Đợt" lấy đúng thứ tự trong ARCHITECTURE. Bảng dùng cột này để chỉ ra vai trò nào đang chờ vai trò nào.

## 3. Luồng yêu cầu mới: agent ↔ agent, đi qua người

Mỗi bên của một yêu cầu là một **Party**: `{ kind: "agent", roleId }` hoặc `{ kind: "human" }`. Có 3 loại luồng.

**A. Agent hỏi agent** (ví dụ Frontend hỏi Backend tên route). Đây là luồng chính.
1. Frontend soạn nháp (`send_request`, receiver là `role:backend`). Trạng thái `draft`.
2. **Người duyệt chuyển** (`send`): sửa nếu cần, rồi bấm Chuyển. Trạng thái `sent`. Backend thấy yêu cầu trong inbox.
3. Backend soạn trả lời (`reply_draft`). Trạng thái `reply_drafted`.
4. **Người duyệt trả lời** (`send_reply`). Trạng thái `replied`. Frontend thấy câu trả lời.
5. **Người đóng** (`accept`), **hoặc hỏi lại** (`follow_up`, quay về bước 3).

Giống v0.5 ở chỗ 4/6 bước chỉ người bấm. Khác ở chỗ cả hai phía duyệt đều là cùng một người.

**B. Người giao việc cho agent** (`asker = human`). Bạn tạo yêu cầu thẳng tới một vai trò, trạng thái `sent` ngay. Agent trả lời bằng nháp, bạn duyệt.

**C. Agent hỏi người** (`receiver = human`). Agent soạn nháp, bạn duyệt chuyển rồi tự trả lời. Hai bước có thể gộp làm một: bấm "Trả lời luôn" trên nháp.

**Loại yêu cầu** (trường mới `kind`). Mỗi loại có mẫu nội dung riêng:
- `question`: hỏi thông tin.
- `contract_change`: đổi contract, luôn gửi tới Leader. Thay cho mục "Contract change requests" trong HANDOFF.
- `review`: nhờ xem PR hoặc thiết kế.
- `handoff`: báo đã bàn giao.
- `blocker`: đang kẹt, cần vai trò khác.

**Hàng chờ duyệt** là màn hình chính của người. Hàng chờ gồm mọi nháp `draft` và `reply_drafted`, cùng các yêu cầu `replied` chờ đóng, sắp xếp theo độ gấp (`blocker` lên đầu).

## 4. Quyết định

- Chỉ người ghi quyết định, như v0.5.
- Thêm tool `propose_decision`. Agent dùng tool này để đề xuất quyết định, có kèm lý do. Đề xuất vào hàng chờ duyệt; người bấm Ghi (có thể sửa trước) thì mới thành Quyết định. Đề xuất bị từ chối vẫn lưu lại trong audit.
- Quyết định có thể gắn vai trò liên quan, để agent của vai trò đó đọc được qua tool `read_decisions` (tool mới, chỉ đọc).

## 5. Chống agent đụng việc nhau

Đây là nỗi đau "nhiều nhánh cùng sửa `deploy/`". Khi một người chạy 6 agent song song, nỗi đau này lớn hơn trước.

- Vùng sở hữu của từng vai trò (cột ở mục 2) được lưu thành glob trong DB.
- Tool `check_paths(paths[])` trả về vai trò sở hữu từng đường dẫn. Agent gọi tool này trước khi sửa file ngoài vùng của mình; nếu đúng là cần sửa, agent soạn yêu cầu tới vai trò sở hữu thay vì tự sửa.
- `post_status` nhận thêm `paths` (các file đang sửa). Bảng cảnh báo khi hai vai trò cùng chạm một vùng, hoặc khi một vai trò sửa ngoài vùng của mình. Phần so nhánh trên GitHub trong "Hỏi trợ lý" được tái dùng cho việc này.

## 6. Luật an toàn sau khi đổi

| # | v0.5 | v0.6 |
|---|---|---|
| 1 | Tin người khác là `untrusted` | Tin của **vai trò khác** (và của GitHub) là `untrusted`. Tin của người điều phối gắn nhãn `orchestrator`: agent coi đó là chỉ đạo, nhưng vẫn chỉ hành động trong vùng của mình |
| 2 | Không có đường agent → agent | Agent → agent **chỉ qua cổng duyệt**: không tin nào tới inbox agent khác khi người chưa bấm. Vẫn không có tool ra lệnh agent khác |
| 3 | Hành động ra ngoài cần người duyệt | Giữ nguyên |
| 4 | Quét secret | Giữ nguyên |
| 5 | Token mỗi agent, có scope | Token gắn **vai trò**. Thêm scope `decision:propose` và `decision:read` |
| 6 | RLS theo workspace | Giữ nguyên (một workspace cho mỗi dự án) |
| 7 | Audit chỉ thêm | Giữ nguyên |
| 8 | Rate limit mỗi agent | Giữ nguyên, giới hạn tính theo vai trò |

## 7. Thay đổi kỹ thuật

**Contract** (`packages/shared`, bản v0.6):
- Thêm `Role` gồm `key`, `name`, `ownedPaths`, `handoffPath`, `wave`, `mascot`.
- `Agent` nhận thêm `roleId`; bỏ `ownerId`.
- `StatusCard` chuyển từ khoá theo member sang khoá theo role, thêm trường `paths`.
- `Request` dùng `asker`/`receiver` kiểu `Party`, thêm trường `kind`.
- `canTransition`: luật "bên nào" áp cho agent; người điều phối được làm mọi bước human-only.
- Thêm tool MCP `propose_decision`, `read_decisions`, `check_paths`.

**DB**, migration `0008_orchestrator.sql`:
- Bảng `roles`.
- `agents.role_id`.
- `status_cards.role_id`.
- `requests` thêm `asker_kind`/`asker_role_id`, `receiver_kind`/`receiver_role_id` và `kind`.
- Bảng `decision_proposals`.
- RLS cho các bảng mới.

**Web:**
- Bảng: 6 bàn vai trò cùng bàn điều phối.
- Màn "Chờ duyệt" làm trang chính.
- Ngăn chi tiết agent: token, vùng sở hữu, bàn giao.
- Bỏ màn mời thành viên và "simulate teammate".

**Seed:** workspace `office-hub-dev` gồm 6 vai trò (theo bảng ở mục 2) và một người điều phối, thay cho seed Tripflix 7 người.

**Đăng nhập:** giữ email + mật khẩu cho một người. Bỏ đường mời người mới khỏi UI; vẫn giữ lệnh `pnpm db:invite` để đặt lại mật khẩu.

## 8. Thứ tự làm

Mỗi bước có test riêng, xong thì deploy lên PC.

1. Leader: contract v0.6 và test `canTransition` mới.
2. Backend: migration 0008, services, API, 3 tool MCP mới, hook inbox theo vai trò.
3. Business: cập nhật ma trận quyền, luồng yêu cầu, seed.
4. Design + Frontend: bảng vai trò, hàng chờ duyệt, ngăn chi tiết agent.
5. QA: sửa E2E, thêm kịch bản Frontend → Backend → người duyệt, kiểm prompt injection giữa hai agent.
6. Deploy: `deploy/pc/up.sh`, tạo token cho 6 vai trò, cập nhật `docs/tech/agent-setup.md` (MCP trỏ tới `http://100.96.26.10:8788/mcp`).

## 9. Quyết định đã chốt (27/11/2026)

1. **Dữ liệu cũ trên PC:** xoá seed Tripflix và seed lại workspace `office-hub-dev`.
2. **Tin của người điều phối:** gắn nhãn `orchestrator`. Agent coi đó là chỉ đạo, nhưng vẫn chỉ làm trong vùng của mình.
3. **Duyệt gộp:** cho phép với yêu cầu loại `question`.
   - Khi bấm Chuyển, người có thể chọn "Tự chuyển câu trả lời". Khi đó, nháp trả lời của agent nhận được chuyển thẳng về người hỏi, không cần duyệt lần hai.
   - Nháp vẫn qua quét secret, và audit ghi rõ người đã duyệt trước.
   - Các loại yêu cầu khác luôn cần 2 lần duyệt.
