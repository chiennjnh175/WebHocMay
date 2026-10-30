# YOLOv8m Web

Ứng dụng Python + FastAPI, HTML/CSS/JavaScript thuần. Không cần Docker, Node.js hoặc database.

## Chạy trên Windows

Cài Python 3.11 hoặc 3.12 (64-bit), mở terminal trong thư mục này:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe run.py
```

Mở http://localhost:8000. Nếu dùng Python 3.11, thay `py -3.12` bằng `py -3.11`.

Sau khi cài môi trường, có thể chạy `start.bat`. Script ưu tiên `.venv` bên trong thư mục source, sau đó tìm `.venv` ở thư mục cha nếu bạn giữ source trong dự án hiện tại.

## Sử dụng

1. Chọn file ảnh hoặc video.
2. Nhập trực tiếp vào ô **Conf** hoặc kéo thanh trượt để chọn `conf` như trong `predict.py` (mặc định `0.30`; phạm vi `0.01–1.00`). Hai điều khiển đồng bộ với nhau.
3. Bấm **Phát hiện**. Bên trái là bản gốc, bên phải là kết quả.
4. Bấm phát, dừng, tua hoặc đổi tốc độ ở bất kỳ video nào để điều khiển cả hai. Nếu một video đang tải hoặc giải mã, cả hai cùng chờ rồi phát tiếp. Ứng dụng kiểm tra độ lệch thời gian ở mỗi lượt vẽ của trình duyệt, căn lại khi lệch quá 60 ms; hai thẻ video không bảo đảm khóa chính xác từng khung hình trên mọi thiết bị. Bấm biểu tượng tải xuống để lưu kết quả.
5. Đổi ngưỡng xong bấm **Phát hiện** lần nữa để chạy lại.

Không có hướng dẫn hoặc tooltip hiển thị trên giao diện. Các tên truy cập ẩn hỗ trợ trình đọc màn hình và bàn phím. Chỉ hiển thị thông báo lỗi khi thao tác thất bại.

Ảnh: JPG, JPEG, PNG, WEBP, BMP, tối đa 24 megapixel. Video: MP4, MOV, AVI, MKV, WEBM, M4V; codec phải được OpenCV đọc được; mặc định tối đa 300 giây và độ phân giải tối đa 8.294.400 pixel. File tối đa 200 MB. Video kết quả MP4/H.264, không có âm thanh; cả hai bản phát so sánh đều tắt âm thanh.

## Báo cáo dữ liệu lưu sẵn

## So sánh model

Riêng **Đường cong học** lấy YOLOv8 từ `YOLOv8/runs/detect/yolov8m_train_1/results.csv` (100 epoch), hiển thị 50 epoch đầu cùng 50 epoch của YOLO11. `learningHistory` và `learningHistorySource` lưu nguồn riêng, không thay đổi `history` đối chiếu checkpoint. Bảng metric và biểu đồ validation vẫn thuộc checkpoint YOLOv8 train 2 đang dùng trên web; đường cong học YOLOv8 là một lần train khác, không dùng để giải thích trực tiếp các số trong bảng checkpoint.

Tab **So sánh** đọc báo cáo tĩnh `static/comparison/report.json`: checkpoint YOLOv8m đang dùng trên web và YOLO11n từ `../YOLOv11/weights/best.pt`. Có bảng Precision/Recall/mAP và chênh lệch theo điểm phần trăm, số tham số, dung lượng checkpoint theo MiB, biểu đồ cột, đường cong học và biểu đồ validation có thể phóng to. Không cần nạp thêm model YOLO11 lên RAM máy chủ khi xem trang.

Đây là **so sánh kết quả validation đã lưu của hai lần huấn luyện**, chưa phải benchmark cùng tập test: YOLOv8m dùng dataset cũ, YOLO11n dùng dataset mới 13.000 ảnh. Khác cả kích thước model (m/n), dữ liệu và quá trình huấn luyện; không suy ra kiến trúc nào tốt hơn chỉ từ bảng này. Chưa đo độ trễ, FPS hoặc AP từng lớp nên không hiển thị các số đó. Nhãn “đpt” là điểm phần trăm; dấu dương nghĩa là giá trị YOLO11 trừ YOLOv8 dương, không tự động khẳng định model tốt hơn.

Xuất lại báo cáo ở máy phát triển sau khi thay kết quả train: `python scripts/export_comparison.py`. Script xác nhận metric checkpoint khớp một dòng CSV và bộ lớp hai model giống nhau trước khi đóng gói. Deploy chỉ cần source web và báo cáo đã xuất, không cần mang theo folder YOLO11. Trang Kiểm thử có menu YOLOv8m / YOLO11n, áp dụng cho cả ảnh và video. Chọn model và Conf trước khi bấm Phát hiện. Hai model được đóng gói trong models/best.pt và models/yolo11n.pt. Backend nạp một model tại một thời điểm để giảm RAM; đổi model sẽ tốn thêm thời gian nạp. MODEL_PATH_YOLO11 cho phép đổi đường dẫn checkpoint YOLO11.

Tab **Đánh giá** dùng báo cáo đóng gói sẵn trong `static/evaluation/`, chạy được trên cloud mà không cần đưa dataset hoặc thư mục `runs` lên máy chủ. Giao diện cho phép đổi biểu đồ loss/mAP/Precision–Recall, đổi ma trận/đường cong, xem phân bố nhãn theo tập dữ liệu và bấm biểu đồ để phóng to.

Giao diện dùng nền xanh xám nhạt `#e7edf3`, không có nền ảnh hoặc dấu chấm. Các menu xổ xuống dùng hiệu ứng kính từ template, hỗ trợ chuột, cảm ứng, phím mũi tên, Home/End, Enter và Escape. Nguồn checkpoint, thông số huấn luyện, tên dataset và liên kết CSV không hiển thị trên trang; metadata trong báo cáo tĩnh được giữ để kiểm chứng và tái tạo số liệu.

Báo cáo hiện tại thuộc `yolov8m_train_2`, model `models/best.pt` có checkpoint tốt nhất ở **epoch 27/30**. Bốn chỉ số lấy từ `train_metrics` trong chính checkpoint, không lấy nhầm dòng cuối CSV: Precision 91,141%, Recall 86,014%, mAP@50 89,344%, mAP@50–95 71,821%. Đây là **kết quả validation**, chưa phải đánh giá trên test. Biểu đồ/ảnh validation lấy từ thư mục run tương ứng. Số lượng ảnh/nhãn được thống kê từ dataset hiện có lúc xuất báo cáo; không khẳng định dataset chưa từng thay đổi kể từ lúc train. Tập test hiển thị số lượng dữ liệu, không hiển thị chỉ số đánh giá chưa được tính.

Khi thay model hoặc dữ liệu huấn luyện, cần xuất lại báo cáo. Model có metric không khớp với CSV của run sẽ bị từ chối để tránh trộn kết quả:

```powershell
.\.venv\Scripts\python.exe scripts\export_evaluation.py --run ..\YOLOv8\runs\detect\yolov8m_train_2 --model models\best.pt --dataset ..\dataset\data.yaml
```

Thao tác này thực hiện ở máy phát triển, sau đó triển khai lại `static/evaluation`. Không chạy train hoặc đánh giá lại toàn bộ dataset khi mở web. Đổi Conf ở trang Kiểm thử không thay đổi các chỉ số validation đã lưu.

Theo cấu hình báo cáo, riêng số ảnh, số nhãn gán và phân bố nhãn được thống kê từ `dataset` của lần train 3. Phần Dữ liệu ghi rõ nguồn này; các metric và biểu đồ đánh giá vẫn thuộc train 2.

## Đường dẫn model

`models/best.pt` đã được sao chép từ `YOLOv8/runs/detect/yolov8m_train_2/weights/best.pt` trong dự án gốc, cùng file mà `predict.py` đang sử dụng. Muốn dùng lần train khác, thay file này hoặc đặt `MODEL_PATH` trỏ đến file `.pt` của bạn.

```powershell
$env:MODEL_PATH = 'D:\ProjectML\YOLOv8\runs\detect\yolov8m_train_3\weights\best.pt'
.\.venv\Scripts\python.exe run.py
```

## Triển khai cloud bằng Python

Chọn dịch vụ hỗ trợ chạy tiến trình Python liên tục và ghi thư mục tạm, dùng Python 3.11/3.12.

- Thư mục gốc: thư mục source này.
- Lệnh cài: `pip install -r requirements.txt`.
- Lệnh chạy: `python run.py`.
- Health check: `/health`.
- Đưa `models/best.pt` lên cùng source hoặc trỏ `MODEL_PATH` đến model đã tải sẵn trên máy chủ. File `.pt` mặc định được bỏ qua bởi `.gitignore`; nếu triển khai qua Git, phải cung cấp model riêng.
- Ứng dụng đọc `PORT` từ nền tảng, mặc định 8000 và bind `0.0.0.0`.
- Chạy **một worker, một instance**: model, hàng đợi và trạng thái nằm trong bộ nhớ của tiến trình. Không dùng nhiều worker hoặc scale nhiều instance khi chưa chuyển hàng đợi/trạng thái sang dịch vụ chung.
- Không dùng serverless có giới hạn thời gian ngắn cho video. Chọn RAM/disk đủ cho PyTorch, mô hình và video tạm. Các video AVI trung gian có thể lớn hơn nhiều so với file tải lên.
- Nếu có reverse proxy, đặt giới hạn body khoảng 201 MB (với cấu hình mặc định). Giới hạn phía proxy cũng chặn upload chunked quá lớn trước khi bộ phân tích multipart lưu file tạm.

## Cấu hình tùy chọn

| Biến môi trường | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `MODEL_PATH` | `models/best.pt` | Đường dẫn model |
| `DEVICE` | `cpu` | `cpu` hoặc `0` cho GPU CUDA |
| `PORT` | `8000` | Cổng HTTP |
| `HOST` | `0.0.0.0` | Địa chỉ bind |
| `MAX_UPLOAD_MB` | `200` | Dung lượng mỗi file |
| `MAX_VIDEO_SECONDS` | `300` | Thời lượng video |
| `RESULT_TTL_SECONDS` | `3600` | Thời gian giữ kết quả |

`requirements.txt` sử dụng PyTorch CPU. Nếu chạy GPU, cài bản PyTorch/CUDA phù hợp riêng rồi đặt `DEVICE=0`.

Mỗi lần chỉ xử lý một file; tối đa bốn tác vụ đang xử lý/chờ/tải lên. Trình duyệt kiểm tra tiến độ định kỳ nên request HTTP không phải chờ toàn bộ thời gian inference. File tải lên và AVI trung gian được xóa khi xử lý xong. Kết quả được xóa sau thời gian giữ, kiểm tra mỗi phút; tắt ứng dụng bình thường cũng xóa thư mục tạm. Sau khi tiến trình bị buộc dừng, trạng thái tác vụ mất và hệ điều hành có thể còn thư mục tạm `src-*` cần dọn.

Phiên bản này dành cho kiểm thử, chưa có đăng nhập. Các URL kết quả dùng mã ngẫu nhiên; không chia sẻ URL nếu file có dữ liệu riêng tư.

Tài liệu API tham khảo: [FastAPI UploadFile](https://fastapi.tiangolo.com/tutorial/request-files/), [Ultralytics predict](https://docs.ultralytics.com/modes/predict/).

## Kiểm thử

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe tests\smoke_test.py
.\.venv\Scripts\python.exe tests\evaluation_test.py
```

Kiểm thử dùng model thật cho ảnh/video ngắn, kiểm tra file đầu ra, tua MP4 bằng HTTP Range, dữ liệu lỗi và dọn file trung gian.

Nếu có Node.js, kiểm thử riêng đồng bộ video: `node --test tests/video-sync.test.mjs`. Node.js chỉ dùng cho bài kiểm thử này; chạy ứng dụng không cần Node.js.


## Cập nhật ba model

Giao diện hiện chỉ có Kiểm thử và So sánh. Model thứ ba là YOLO26n đã train trong YOLOv26/weights/best.pt, đóng gói vào models/yolo26n.pt; biến MODEL_PATH_YOLO26 cho phép thay đường dẫn. Tab Đánh giá riêng đã được gỡ; thống kê 13.000 ảnh và 87.765 nhãn được chuyển sang So sánh. Bảng, đường cong học và ảnh validation có đủ ba model. Bảng không còn cột chênh lệch hai model. Các ghi chú cũ về hai tab trước đây chỉ mô tả phiên bản cũ.

Kết quả validation từng checkpoint không phải benchmark cùng tập test; đường cong YOLOv8 vẫn lấy 50 epoch đầu từ lần train 100 epoch theo yêu cầu. Chạy python scripts/export_comparison.py để cập nhật báo cáo. Deploy cần models/best.pt, models/yolo11n.pt và models/yolo26n.pt. Sau khi sửa backend, dừng server bằng Ctrl+C rồi chạy lại python run.py.
