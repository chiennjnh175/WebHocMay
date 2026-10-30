"""Compare original/result bytes from the running server using a known sample."""
import time
from pathlib import Path

import httpx

source = Path(__file__).resolve().parents[2] / "forTesting" / "test5.jpg"
with httpx.Client(base_url="http://localhost:8000", timeout=30) as client:
    with source.open("rb") as image:
        response = client.post("/api/jobs", files={"file": (source.name, image, "image/jpeg")}, data={"confidence": "0.3"})
    response.raise_for_status()
    job_id = response.json()["id"]
    for _ in range(300):
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in {"done", "error"}:
            break
        time.sleep(.1)
    assert job["status"] == "done", job
    original = client.get(job["original"]).content
    result = client.get(job["result"]).content
    print(job)
    print("original_bytes", len(original), "result_bytes", len(result), "identical", original == result)
    assert original != result, "The result has no annotations for the known sample at conf=0.3"
    Path(__file__).with_name("verified-detection.jpg").write_bytes(result)
