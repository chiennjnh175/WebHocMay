"""Integration checks with the bundled real model; no pytest required."""
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cv2
import numpy as np
from fastapi.testclient import TestClient

from app import app


class SmokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.context = TestClient(app)
        cls.client = cls.context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None, None, None)

    def wait_job(self, job_id):
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            response = self.client.get(f"/api/jobs/{job_id}")
            self.assertEqual(response.status_code, 200)
            job = response.json()
            if job["status"] in {"done", "error"}:
                return job
            time.sleep(.1)
        self.fail("Inference timed out")

    def test_image_upload_and_validation(self):
        self.assertEqual(self.client.get("/health").json(), {"status": "ok"})
        self.assertEqual(self.client.get("/").status_code, 200)
        sample = Path(__file__).resolve().parents[2] / "forTesting" / "test6.jpg"
        frame = cv2.imread(str(sample)) if sample.is_file() else np.zeros((240, 320, 3), dtype=np.uint8)
        ok, encoded = cv2.imencode(".jpg", frame)
        self.assertTrue(ok)
        response = self.client.post("/api/jobs", files={"file": ("sample.jpg", encoded.tobytes(), "image/jpeg")}, data={"confidence": ".3"})
        self.assertEqual(response.status_code, 202, response.text)
        job = self.wait_job(response.json()["id"])
        self.assertEqual(job["status"], "done", job)
        for url in [job["original"], job["result"]]:
            media = self.client.get(url)
            self.assertEqual(media.status_code, 200)
            decoded = cv2.imdecode(np.frombuffer(media.content, np.uint8), cv2.IMREAD_COLOR)
            self.assertEqual(decoded.shape, frame.shape)
        self.assertEqual(self.client.get(f"/api/media/{job['id']}/input.jpg").status_code, 404)
        self.assertEqual(self.client.post("/api/jobs", files={"file": ("x.exe", b"x")}).status_code, 415)
        self.assertEqual(self.client.post("/api/jobs", files={"file": ("x.jpg", b"")}).status_code, 400)
        self.assertEqual(self.client.post("/api/jobs", files={"file": ("x.jpg", b"x")}, data={"confidence": "2"}).status_code, 422)
        invalid = self.client.post("/api/jobs", files={"file": ("x.jpg", b"not an image")})
        self.assertEqual(self.wait_job(invalid.json()["id"])["status"], "error")
        self.assertEqual(self.client.get("/api/jobs/missing").status_code, 404)

    def test_switch_models(self):
        frame = np.zeros((240, 320, 3), np.uint8)
        _, encoded = cv2.imencode('.jpg', frame)
        for model_id in ['yolo11n', 'yolo26n', 'yolov8m']:
            response = self.client.post('/api/jobs', files={'file': ('switch.jpg', encoded.tobytes(), 'image/jpeg')},
                                        data={'model_id': model_id, 'confidence': '.3'})
            self.assertEqual(response.status_code, 202, response.text)
            job = self.wait_job(response.json()['id'])
            self.assertEqual(job['status'], 'done', job)
            self.assertEqual(job['model_id'], model_id)
            self.assertEqual(app.state.model_id, model_id)
        response = self.client.post('/api/jobs', files={'file': ('switch.jpg', encoded.tobytes())}, data={'model_id': '../../bad'})
        self.assertEqual(response.status_code, 422)

    def test_video_upload_encoding_and_seek(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "sample.avi"
            writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 4, (320, 240))
            self.assertTrue(writer.isOpened())
            for index in range(4):
                frame = np.zeros((240, 320, 3), np.uint8)
                cv2.rectangle(frame, (20 + index * 10, 20), (120, 160), (80, 160, 220), -1)
                writer.write(frame)
            writer.release()
            with path.open("rb") as clip:
                response = self.client.post("/api/jobs", files={"file": ("sample.avi", clip, "video/x-msvideo")}, data={"model_id": "yolo26n", "confidence": ".3"})
        self.assertEqual(response.status_code, 202, response.text)
        job = self.wait_job(response.json()["id"])
        self.assertEqual(job["status"], "done", job)
        self.assertEqual(job["model_id"], "yolo26n")
        for url in [job["original"], job["result"]]:
            media = self.client.get(url)
            self.assertEqual(media.headers["content-type"], "video/mp4")
            self.assertIn(b"ftyp", media.content[:32])
            partial = self.client.get(url, headers={"Range": "bytes=0-99"})
            self.assertEqual(partial.status_code, 206)
            self.assertEqual(len(partial.content), 100)
        for suffix in ["input.avi", "original.avi", "result.avi"]:
            self.assertFalse((app.state.root / job["id"] / suffix).exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
