# Office Hub — tóm tắt đề xuất (nguồn: bản phân tích 09/11/2026)

Office Hub (tên tạm) là workspace mã nguồn mở. Agent của từng thành viên đọc trạng thái thật của nhóm và trao đổi yêu cầu có cấu trúc. Con người duyệt mọi quyết định và mọi hành động ra ngoài. Bản đầu chạy thử 2 tuần với nhóm Tripflix 7 người (đã biết tên: Phong, Trang, Bảo).

## Vấn đề (6 nỗi đau, ví dụ thật ngày 09/11)
| Nỗi đau | Ví dụ | Hậu quả |
|---|---|---|
| Chuyển ngữ cảnh bằng tay | Tin của Trang, Bảo dán vào phiên agent, copy ngược ra Messenger (~10 lần/ngày) | Mất thời gian; dán nhầm lệnh commit |
| Hỏi trạng thái | Trang hỏi PR số mấy, server ghim tag gì | Người hỏi chờ, người trả lời dừng việc |
| Quyết định thất lạc | Chốt tách tag theo app, giảm bộ đếm bình luận khi ẩn — rải rác trong chat | Người sau không biết vì sao |
| Không rõ ai chờ ai | Bảo chờ key OpenAI, Phong chờ Trang báo tên biến | Việc đứng không ai thấy |
| Secret đi qua chat | Key DeepSeek/OpenAI | Lộ key |
| Agent đụng việc nhau | Nhiều nhánh cùng sửa `deploy/` | Xung đột |

## Sản phẩm
Là: bảng trạng thái realtime từ hệ thống thật (PR, CI, ticket, deploy); hàng yêu cầu có cấu trúc; sổ quyết định (chỉ người chốt, có lý do); cổng MCP cho agent trong phạm vi quyền của chủ.
Không là: app chat mới; nơi agent tự quyết; thay Jira/Linear; nơi chứa secret.
Cho ai: nhóm phần mềm 3–15 người, một số dùng agent lập trình (Claude Code, Codex, Gemini CLI). Người không dùng agent tham gia đầy đủ qua web.

## 7 đối tượng
Workspace, Thành viên, Agent, Việc (trỏ tới ticket/PR gốc), Sự kiện (chỉ thêm), Yêu cầu, Quyết định (chỉ người). Gói bàn giao = bản tóm tắt sinh từ Sự kiện + Yêu cầu + Quyết định của một Việc.

## Luồng yêu cầu: 6 bước, 4 bước chỉ người bấm
Soạn (người/agent) → Gửi (người hỏi) → Soạn trả lời (người/agent bên nhận) → Gửi trả lời (người nhận) → Chấp nhận / Hỏi lại (người hỏi). Quá hạn thì nhắc cả hai, không tự đóng.

## MCP tools
read_board, list_inbox, post_status (chỉ thẻ của chủ), send_request (nháp, chủ bấm gửi), reply_draft (nháp, chủ bấm gửi). Không có tool ghi Quyết định hay ra lệnh agent khác. Claude Code: hook SessionStart/UserPromptSubmit chèn yêu cầu chưa đọc vào ngữ cảnh.

## 8 luật an toàn (cài cứng)
1. Tin người khác = dữ liệu, gắn nhãn "untrusted" + tên người viết.
2. Không có đường agent ra lệnh agent.
3. Hành động ra ngoài phải người duyệt — gắn phiên đăng nhập người, không gắn token agent.
4. Không chứa secret: quét kiểu gitleaks lúc nhận, khớp thì từ chối cả tin, không lưu.
5. Mỗi agent một token, gắn chủ, có phạm vi (board:read, status:write:self, request:draft...). Thu hồi riêng.
6. Row-level security theo workspace trong DB.
7. Nhật ký kiểm tra chỉ thêm.
8. Giới hạn tần suất mỗi agent.

## Đo thành công (2 tuần thử)
Số lần copy chat↔agent giảm ≥50%; thời gian hỏi→trả lời trung vị <2 giờ làm việc; câu hỏi trạng thái trong chat giảm ≥50%; ≥60% bản nháp agent "gửi luôn". Điều kiện dừng: secret lọt hoặc agent làm theo tin người khác chưa duyệt.

## Rủi ro chính
Kéo trễ Tripflix; prompt injection; nhóm không bỏ thói quen chat (→ thông báo và nút duyệt đưa vào chat đang dùng); agent quá ồn (→ gom theo Việc, chỉ báo khi cần mình); hãng lớn làm theo; phụ thuộc Supabase.
