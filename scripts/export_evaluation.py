"""Package real training artifacts for the static evaluation page."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path

import yaml
from ultralytics import YOLO

BASE = Path(__file__).resolve().parents[1]
METRICS = {
    "precision": "metrics/precision(B)", "recall": "metrics/recall(B)",
    "map50": "metrics/mAP50(B)", "map5095": "metrics/mAP50-95(B)",
}


def build_report(run, model_path, dataset_yaml, destination):
    run, model_path, dataset_yaml = map(Path, (run, model_path, dataset_yaml))
    with (run / "results.csv").open(encoding="utf-8-sig", newline="") as file:
        history = [{key.strip(): float(value) for key, value in row.items()} for row in csv.DictReader(file)]
    if not history:
        raise ValueError("results.csv has no epochs")
    args = yaml.safe_load((run / "args.yaml").read_text(encoding="utf-8"))
    model = YOLO(str(model_path))
    recorded = model.ckpt.get("train_metrics") or {}
    # A packaged report must belong to this checkpoint, not merely its last epoch.
    if not all(key in recorded for key in METRICS.values()):
        raise ValueError("Checkpoint does not contain validation metrics")
    matches = [row for row in history if all(abs(row[key] - recorded[key]) < .00002 for key in METRICS.values())]
    if not matches:
        raise ValueError("Checkpoint metrics do not match this training run")
    best_epoch = int(matches[-1]["epoch"])
    dataset = yaml.safe_load(dataset_yaml.read_text(encoding="utf-8"))
    class_names = dataset["names"]
    if isinstance(class_names, dict):
        class_names = [class_names[key] for key in sorted(class_names)]
    if list(model.names.values()) != class_names:
        raise ValueError("Checkpoint classes do not match the dataset")
    splits = []
    for key, label in (("train", "Train"), ("val", "Validation"), ("test", "Test")):
        ref = dataset.get(key)
        if not isinstance(ref, str):
            splits.append({"name": label, "images": None, "instances": None, "counts": None})
            continue
        root = Path(dataset.get("path", dataset_yaml.parent))
        if not root.is_absolute():
            root = dataset_yaml.parent / root
        images = root / ref
        if not images.is_dir() and ref.startswith("../"):
            # Roboflow YAMLs can keep ../ even when exported alongside split folders.
            images = root / ref[3:]
        if not images.is_dir():
            splits.append({"name": label, "images": None, "instances": None, "counts": None})
            continue
        image_files = [file for file in images.iterdir() if file.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}]
        labels = images.parent / "labels"
        counts = Counter()
        missing_labels = 0
        for file in image_files:
            annotation = labels / (file.stem + ".txt")
            if not annotation.is_file():
                missing_labels += 1
                continue
            for line in annotation.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                class_id = int(line.split()[0])
                if not 0 <= class_id < len(class_names):
                    raise ValueError(f"Invalid class in {annotation}")
                counts[class_id] += 1
        splits.append({"name": label, "images": len(image_files), "instances": sum(counts.values()),
                       "counts": [counts[i] for i in range(len(class_names))], "missingLabels": missing_labels})
    destination.mkdir(parents=True, exist_ok=True)
    assets = {}
    filenames = ["results.png", "confusion_matrix.png", "confusion_matrix_normalized.png", "BoxPR_curve.png",
                 "BoxF1_curve.png", "BoxP_curve.png", "BoxR_curve.png"]
    for name in filenames:
        if (run / name).is_file():
            shutil.copy2(run / name, destination / name)
            assets[name] = f"/static/evaluation/{name}"
    shutil.copy2(run / "results.csv", destination / "results.csv")
    report = {
        "run": run.name, "model": model_path.name, "modelSha256": hashlib.sha256(model_path.read_bytes()).hexdigest(),
        "split": "Validation", "metricSource": "best.pt / train_metrics", "bestEpoch": best_epoch,
        "epochs": len(history), "metrics": {key: recorded[value] for key, value in METRICS.items()},
        "config": {key: args.get(key) for key in ["imgsz", "batch", "epochs", "optimizer", "lr0"]},
        "classes": class_names, "splits": splits, "history": history, "assets": assets,
        "dataset": {"name": dataset_yaml.parent.name,
                    "images": sum(split["images"] for split in splits) if all(split["images"] is not None for split in splits) else None,
                    "instances": sum(split["instances"] for split in splits) if all(split["instances"] is not None for split in splits) else None},
    }
    (destination / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps({"bestEpoch": best_epoch, "metrics": report["metrics"], "splits": splits, "assets": len(assets)}, ensure_ascii=False))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path, default=BASE.parent / "YOLOv8/runs/detect/yolov8m_train_2")
    parser.add_argument("--model", type=Path, default=BASE / "models/best.pt")
    parser.add_argument("--dataset", type=Path, default=BASE.parent / "dataset/data.yaml")
    parser.add_argument("--output", type=Path, default=BASE / "static/evaluation")
    cli = parser.parse_args()
    build_report(cli.run, cli.model, cli.dataset, cli.output)
