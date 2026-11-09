# QA & Security report — Office Hub (contract v0.3)

Ghi lại bởi Leader từ báo cáo của team QA, 2026-11-09 (subagent không được phép tự ghi file báo cáo). Test suite: `tests/e2e`.

## Kết luận: GO có điều kiện cho 2 tuần chạy thử Tripflix

Lõi an toàn chịu được tấn công thật. Phải sửa 4 điểm chặn trước ngày 1.

**Đã đứng vững**
- Token agent bị từ chối (403 `human_only`) trên cả 25 route của người. MCP có đúng 5 tool, chỉ tạo nháp. `reply_draft` chỉ dùng được ở phía người nhận.
- Hiển thị (C13): nháp, tiêu đề, nội dung, sự kiện, SSE, handoff, audit và MCP không lộ ra người ngoài hay admin.
- Tách workspace: workspace thứ hai cùng việc đổi slug/id trên mọi route không lộ gì. RLS ở tầng DB giữ được.
- Token chỉ lưu sha256 và hiện một lần. Thu hồi có hiệu lực ngay. CSRF, CORS, session fixation và logout đều đúng. Giới hạn tần suất dùng chung giữa API và MCP, gửi batch JSON-RPC cũng không lách được.
- `audit_log` và `events` chỉ thêm. Text độc hại (script, onerror, onload, `javascript:`) hiển thị thành chữ thường. Prompt injection được gắn nhãn `untrusted` trên mọi kênh tới agent.

**Điểm chặn trước ngày 1:** SEC-06, SEC-04, SEC-09, và cấu hình `GITHUB_WEBHOOK_SECRET`.

## Số lượng
- Lỗi đang mở: Critical 0 · High 2 · Medium 5 · Low 8. SEC-06 thành Critical nếu dev-login còn bật khi chạy thử.
- Đã sửa trong lúc review: 1 High, 1 Medium, 4 Low, mỗi lỗi có test hồi quy.
- Test: vitest `tests/e2e/api` 137 test (118 test hành vi đúng, 19 test `.fails` ghi nhận lỗi đang mở). Playwright 10 spec đều qua.

## Lỗi đang mở

| ID | Mức | Thành phần | Tái hiện | Cách sửa | Team |
|---|---|---|---|---|---|
| SEC-06 | High | `apps/api/src/config.ts`, `.env.example` | `GET /auth/dev-members` không cần đăng nhập trả về mọi member id. `POST /auth/dev-login` tạo session cho bất kỳ ai. `SESSION_SECRET` mặc định, webhook secret rỗng, không chặn khi `NODE_ENV=production`. | Không cho khởi động ở production khi bật dev-login, dùng secret mặc định hoặc thiếu webhook secret. `.env.example` để `DEV_LOGIN_ENABLED=false`. | Backend + Leader |
| SEC-04 | High | `packages/db/src/secrets.ts` | URL DB có mật khẩu, `sk_live_`, JWT, `Bearer <hex>`, `oh_agent_…` trả 201 và bị lưu. | Thêm luật cho các mẫu này và `npm_`. | Backend |
| SEC-03 | Med | `scanText` | Ký tự zero-width hoặc fullwidth chèn giữa key lách được bộ quét. | NFKC, bỏ `\p{Cf}`, quét thêm một bản đã bỏ dấu phân cách. | Backend |
| SEC-09 | Med | `github.ts`, `TaskChip` | Webhook có `html_url: "javascript:…"` được lưu và render thành `<a href>`, tức XSS khi bấm. | Chỉ cho `https?://` ở server và ở UI. | Backend + Design/UI |
| BUG-03 | Med | `ingestGithub` (CON-03) | Tiêu đề PR chứa key vẫn tạo task. | Quét trước khi upsert, trả 200, ghi audit `secret_rejected` không kèm nội dung. | Backend |
| SEC-08 | Med | webhook | Một secret chung ký được cho mọi `workspaceId` (AUD-04 yêu cầu 401). | Secret riêng cho từng workspace. | Backend |
| SEC-10 | Med | `buildHandoff` | Nội dung quyết định có `\n## FORGED-SECTION` tạo ra heading giả trong handoff. | Escape xuống dòng, trích dẫn từng mục, gắn nguồn. | Backend |
| SEC-11 | Low | SSE | Agent bên nhận gọi `reply_draft` thì người hỏi vẫn nhận event `change` (chỉ lộ thời điểm). | Không phát event cho người hỏi với thay đổi chỉ ở bản nháp. | Backend |
| SEC-05 | Low | Web, API | Thiếu CSP, `frame-ancestors`, `X-Content-Type-Options`. | Thêm header bảo mật. | Frontend + Backend |
| SEC-07 | Low | MCP | Body 5 MB vẫn được nhận. | `bodyLimit`. | Backend |
| SEC-12 | Low | webhook | Không có `X-GitHub-Delivery` thì gửi lại 2 lần thành 2 event. | Bắt buộc delivery id hoặc chống trùng. | Backend |
| SEC-14 | Low | audit | Mọi GET đều ghi audit. Route của người và `/auth/*` không có giới hạn tần suất. Session 7 ngày không có idle timeout. | Lấy mẫu audit đọc, rate-limit `/auth/*`. | Backend |
| BUG-01 | Low | validate | `\u0000` trong text gây lỗi 500. | Chặn NUL, trả 400. | Backend |
| BUG-02 | Low | webhook | Body `null` đã ký gây lỗi 500. | Trả 400. | Backend |
| OPS-01 | Low | dữ liệu dev | Dữ liệu test lẫn vào DB dev (workspace và agent của QA, hàng trăm thành viên test). | DB riêng cho test, seed lại trước khi chạy thử. | Backend + Leader |

## Đã sửa trong lúc review
SEC-01 (High, handoff lộ yêu cầu của người khác) · SEC-02 (timeline handoff) · SEC-13 (giới hạn tần suất tách theo process) · BUG-04/05/06 (route trong contract v0.3).

## Chưa test được
GitHub OAuth, https và cookie `Secure`, hành vi khi `NODE_ENV=production`, nhắc hạn (REQ-10, NTF-04), NTF-03/05, hook CLI chạy trong Claude Code thật, race khi bấm đúp, tải lớn, độ trễ SSE, connector Jira/CI.

## Chạy
```
pnpm --filter @officehub/e2e test:api
pnpm --filter @officehub/e2e test:ui
OH_QA_STRICT=1 pnpm --filter @officehub/e2e test:api   # chạy 19 test lỗi đang mở như test thường
```
Khi một test `known(...)` bắt đầu qua, đổi nó thành `it(...)`.
