"""Single-process YOLO upload service. Run with: python run.py."""
from __future__ import annotations

import asyncio
import logging
import math
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

BASE = Path(__file__).resolve().parent
MODEL_PATH = Path(os.environ.get("MODEL_PATH", str(BASE / "models" / "best.pt")))
MODEL_PATHS = {"yolov8m": MODEL_PATH,
               "yolo11n": Path(os.environ.get("MODEL_PATH_YOLO11", str(BASE / "models/yolo11n.pt"))),
               "yolo26n": Path(os.environ.get("MODEL_PATH_YOLO26", str(BASE / "models/yolo26n.pt")))}
MAX_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "200")) * 1024 * 1024
MAX_SECONDS = int(os.environ.get("MAX_VIDEO_SECONDS", "300"))
TTL = int(os.environ.get("RESULT_TTL_SECONDS", "3600"))
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}
log = logging.getLogger("yolo-web")


class InferenceService:
    def __init__(self, model_path=MODEL_PATH):
        import cv2
        import imageio_ffmpeg
        from ultralytics import YOLO

        if not model_path.is_file():
            raise RuntimeError(f"Không tìm thấy mô hình: {model_path}")
        self.cv2 = cv2
        self.ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        self.model = YOLO(str(model_path))
        self.device = os.environ.get("DEVICE", "cpu")

    def predict(self, frame, confidence):
        result = self.model.predict(frame, conf=confidence, device=self.device,
                                    imgsz=640, verbose=False)[0]
        return result.plot()

    def image(self, source, directory, confidence):
        from PIL import Image, ImageOps, UnidentifiedImageError
        import numpy as np

        try:
            with Image.open(source) as picture:
                if picture.width * picture.height > 24_000_000:
                    raise ValueError("Ảnh vượt quá 24 megapixel.")
                frame = np.array(ImageOps.exif_transpose(picture).convert("RGB"))[:, :, ::-1].copy()
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
            raise ValueError("Không đọc được ảnh.") from exc
        for name, data in (("original.jpg", frame), ("result.jpg", self.predict(frame, confidence))):
            if not self.cv2.imwrite(str(directory / name), data):
                raise RuntimeError("Không ghi được ảnh kết quả.")
        return "original.jpg", "result.jpg"

    def encode(self, source, destination):
        command = [self.ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                   "-i", str(source), "-an", "-c:v", "libx264", "-preset", "veryfast",
                   "-crf", "23", "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-pix_fmt",
                   "yuv420p", "-movflags", "+faststart", str(destination)]
        try:
            subprocess.run(command, check=True, stdout=subprocess.DEVNULL,
                           stderr=subprocess.PIPE, timeout=600)
        except (subprocess.SubprocessError, OSError) as exc:
            raise RuntimeError("Không chuyển đổi được video.") from exc

    def video(self, source, directory, confidence, progress):
        cv2 = self.cv2
        capture = cv2.VideoCapture(str(source))
        original = annotated = None
        try:
            if not capture.isOpened():
                raise ValueError("Không đọc được video.")
            fps = capture.get(cv2.CAP_PROP_FPS)
            total = capture.get(cv2.CAP_PROP_FRAME_COUNT)
            if not math.isfinite(fps) or fps <= 0 or fps > 240:
                raise ValueError("Tốc độ khung hình không hợp lệ.")
            if not math.isfinite(total) or total < 1 or total / fps > MAX_SECONDS:
                raise ValueError(f"Video phải ngắn hơn {MAX_SECONDS} giây.")
            count = 0
            started = time.monotonic()
            while True:
                ok, frame = capture.read()
                if not ok:
                    break
                count += 1
                if count > MAX_SECONDS * fps or time.monotonic() - started > 1800:
                    raise ValueError("Video vượt giới hạn xử lý.")
                height, width = frame.shape[:2]
                if width * height > 8_294_400:
                    raise ValueError("Video vượt độ phân giải 4K.")
                if original is None:
                    codec = cv2.VideoWriter_fourcc(*"MJPG")
                    original = cv2.VideoWriter(str(directory / "original.avi"), codec, fps, (width, height))
                    annotated = cv2.VideoWriter(str(directory / "result.avi"), codec, fps, (width, height))
                    if not original.isOpened() or not annotated.isOpened():
                        raise RuntimeError("Không khởi tạo được bộ ghi video.")
                original.write(frame)
                annotated.write(self.predict(frame, confidence))
                progress(min(95, int(count / total * 95)))
            if not count:
                raise ValueError("Video không có khung hình.")
            # A truncated upload must not silently produce an incomplete result.
            if count < total - max(2, total * 0.01):
                raise ValueError("Video bị hỏng hoặc thiếu khung hình.")
        finally:
            capture.release()
            if original is not None:
                original.release()
            if annotated is not None:
                annotated.release()
        self.encode(directory / "original.avi", directory / "original.mp4")
        self.encode(directory / "result.avi", directory / "result.mp4")
        return "original.mp4", "result.mp4"


@asynccontextmanager
async def lifespan(app):
    app.state.root = Path(tempfile.mkdtemp(prefix="yolo-web-"))
    app.state.jobs = {}
    app.state.lock = threading.Lock()
    app.state.slots = threading.BoundedSemaphore(4)
    app.state.executor = ThreadPoolExecutor(max_workers=1)
    try:
        app.state.inference = await asyncio.to_thread(InferenceService)
        app.state.model_id = "yolov8m"
        async def cleanup():
            while True:
                await asyncio.sleep(60)
                expired = []
                with app.state.lock:
                    for key, job in list(app.state.jobs.items()):
                        if job["status"] in {"done", "error"} and time.time() - job["updated"] > TTL:
                            expired.append(key)
                            del app.state.jobs[key]
                for key in expired:
                    await asyncio.to_thread(shutil.rmtree, app.state.root / key, True)
        cleaner = asyncio.create_task(cleanup())
        try:
            yield
        finally:
            cleaner.cancel()
            try:
                await cleaner
            except asyncio.CancelledError:
                pass
    finally:
        app.state.executor.shutdown(wait=True, cancel_futures=True)
        shutil.rmtree(app.state.root, ignore_errors=True)


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


@app.middleware("http")
async def upload_length(request, call_next):
    if request.url.path == "/api/jobs":
        try:
            length = int(request.headers.get("content-length", "0"))
        except ValueError:
            return JSONResponse({"detail": "Dung lượng không hợp lệ."}, status_code=400)
        if length > MAX_BYTES + 1024 * 1024:
            return JSONResponse({"detail": "File vượt dung lượng cho phép."}, status_code=413)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


def update_job(job_id, **fields):
    with app.state.lock:
        app.state.jobs[job_id].update(fields, updated=time.time())


def process(job_id, source, kind, confidence, model_id):
    directory = source.parent
    try:
        update_job(job_id, status="processing")
        # One executor worker serializes switching and inference. Release the old
        # model before loading the next to keep cloud memory usage bounded.
        if app.state.model_id != model_id:
            app.state.inference = None
            app.state.model_id = None
            import gc
            import torch
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            app.state.inference = InferenceService(MODEL_PATHS[model_id])
            app.state.model_id = model_id
        engine = app.state.inference
        if kind == "image":
            names = engine.image(source, directory, confidence)
        else:
            names = engine.video(source, directory, confidence,
                                 lambda value: update_job(job_id, progress=value))
        update_job(job_id, status="done", progress=100,
                   original=f"/api/media/{job_id}/{names[0]}",
                   result=f"/api/media/{job_id}/{names[1]}")
    except ValueError as exc:
        update_job(job_id, status="error", error=str(exc))
    except Exception:
        log.exception("Inference failed for job %s", job_id)
        update_job(job_id, status="error", error="Xử lý thất bại. Kiểm tra log máy chủ.")
    finally:
        for path in directory.iterdir():
            if path.name.startswith("input") or path.suffix == ".avi":
                path.unlink(missing_ok=True)
        app.state.slots.release()


@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/jobs", status_code=202)
async def create_job(file: UploadFile = File(...), confidence: float = Form(0.3, ge=0.01, le=1),
                     model_id: str = Form("yolov8m")):
    if model_id not in MODEL_PATHS:
        raise HTTPException(422, "Mô hình không hợp lệ.")
    if not MODEL_PATHS[model_id].is_file():
        raise HTTPException(503, "Chưa có file trọng số của mô hình đã chọn.")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in IMAGE_EXTENSIONS | VIDEO_EXTENSIONS:
        raise HTTPException(415, "Định dạng file không được hỗ trợ.")
    if not app.state.slots.acquire(blocking=False):
        raise HTTPException(429, "Máy chủ đang bận. Thử lại sau.")
    job_id = uuid.uuid4().hex
    directory = app.state.root / job_id
    try:
        directory.mkdir()
        source = directory / ("input" + suffix)
        size = 0
        with source.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, "File vượt dung lượng cho phép.")
                output.write(chunk)
        if not size:
            raise HTTPException(400, "File rỗng.")
        kind = "image" if suffix in IMAGE_EXTENSIONS else "video"
        with app.state.lock:
            app.state.jobs[job_id] = {"id": job_id, "kind": kind, "status": "queued",
                                      "progress": 0, "updated": time.time(),
                                      "model_id": model_id, "confidence": confidence}
        app.state.executor.submit(process, job_id, source, kind, confidence, model_id)
    except BaseException:
        with app.state.lock:
            app.state.jobs.pop(job_id, None)
        shutil.rmtree(directory, ignore_errors=True)
        app.state.slots.release()
        raise
    finally:
        await file.close()
    return {"id": job_id}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    with app.state.lock:
        job = app.state.jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Kết quả đã hết hạn.")
        return dict(job)


@app.get("/api/media/{job_id}/{filename}")
def get_media(job_id: str, filename: str):
    with app.state.lock:
        job = app.state.jobs.get(job_id)
        if not job or job["status"] != "done" or filename not in {
            Path(job["original"]).name, Path(job["result"]).name
        }:
            raise HTTPException(404, "Không tìm thấy file.")
    path = app.state.root / job_id / filename
    if not path.is_file():
        raise HTTPException(404, "Kết quả đã hết hạn.")
    return FileResponse(path, media_type="video/mp4" if path.suffix == ".mp4" else "image/jpeg",
                        headers={"Cache-Control": "private, no-store"})
