# Demo môn học trên Render

Chỉ đưa **nội dung bên trong `src`** vào repository riêng. `app.py`, `render.yaml` và `requirements-render.txt` phải nằm ngay ở gốc repository. Không đưa cả `D:\ProjectML`, dataset, runs hoặc `.venv` lên GitHub.

## 1. Tạo repository GitHub

Tạo repository tên `yolo-class-demo` (có thể chọn Private). Với Git cài trên máy, mở terminal trong `src` và chạy lần lượt:

```powershell
git init
git add .
git status --short
git commit -m "Prepare YOLO classroom demo"
git branch -M main
git remote add origin https://github.com/TEN_TAI_KHOAN/yolo-class-demo.git
git push -u origin main
```

Thay `TEN_TAI_KHOAN` bằng tài khoản của bạn. GitHub có thể yêu cầu đăng nhập. `.gitignore` đã cho phép riêng `models/best.pt` đi cùng source. Model khoảng 52 MB: dùng Git push, không kéo thả file model qua trang upload của GitHub. Kiểm tra repository có `models/best.pt` trước khi deploy.

## 2. Tạo Web Service

Đăng nhập https://dashboard.render.com bằng GitHub. Chọn **New → Web Service**, kết nối repository mới và cấp quyền truy cập. Cấu hình thủ công:

| Mục | Giá trị |
| --- | --- |
| Language | Python 3 |
| Root Directory | để trống |
| Build Command | `pip install --no-cache-dir -r requirements-render.txt` |
| Start Command | `python run.py` |
| Health Check Path | `/health` |
| Instance Type | Free để thử trước |

File `.python-version` chọn Python 3.11. Không sử dụng Python mặc định của nền tảng nếu khác 3.11/3.12.

Thêm các biến môi trường giống `render.yaml`: `DEVICE=cpu`, `MAX_UPLOAD_MB=30`, `MAX_VIDEO_SECONDS=30`, `RESULT_TTL_SECONDS=600`, `OMP_NUM_THREADS=1`, `MKL_NUM_THREADS=1`, `YOLO_CONFIG_DIR=/tmp/yolo-config`. Không cần tự đặt `PORT`.

Hoặc chọn **New → Blueprint**, kết nối repository để Render đọc `render.yaml`; xem cấu hình và chọn triển khai. File này chọn Free, không khai báo database hoặc disk.

## 3. Kiểm tra

Sau khi deploy thành công, mở URL `https://<tên-dịch-vụ>.onrender.com`. Kiểm tra `/health`, tab Đánh giá, upload ảnh có phát hiện, rồi thử video ngắn và đồng bộ hai khung. Mở cùng URL bằng điện thoại để kiểm tra ngoài máy phát triển.

## Giới hạn demo

- Cấu hình cloud giới hạn 30 MB/file và 30 giây/video để thử nghiệm. CPU xử lý video có thể chậm.
- YOLOv8m + PyTorch có thể vượt RAM của gói Free; chưa kiểm chứng trên máy Linux Render. Nếu log báo hết bộ nhớ hoặc tiến trình bị kill thì gói Free chưa đủ cho model này. Không tự động chuyển sang gói trả phí.
- Dịch vụ Free ngủ sau 15 phút không có truy cập; lần mở tiếp theo phải chờ khởi động. Nên mở và chạy thử trước giờ trình bày.
- File kết quả là file tạm, không phải cache bền vững; mất khi restart/redeploy/ngủ. Chức năng nhận lại video cũ để tái sử dụng kết quả chưa được triển khai.
- Chạy một worker, một instance như `run.py`; không thêm `--workers`.

Thư viện cloud dùng bản CPU và OpenCV headless. Máy Windows tiếp tục dùng `requirements.txt`; `requirements-dev.txt` chỉ dành cho kiểm thử.

Tài liệu: https://render.com/docs/deploy-fastapi · https://render.com/docs/free · https://render.com/docs/python-version
