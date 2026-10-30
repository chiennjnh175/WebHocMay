"""Bundle checkpoint metrics and original validation plots; no training required."""
import csv
import hashlib
import json
import shutil
from pathlib import Path

from ultralytics import YOLO

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE.parent
OUTPUT = BASE / 'static/comparison'


def export():
    models = []
    for key, name, checkpoint, run, dataset in [
        ('v8', 'YOLOv8m', BASE / 'models/best.pt', ROOT / 'YOLOv8/runs/detect/yolov8m_train_2', 'Dataset cũ'),
        ('v11', 'YOLO11n', ROOT / 'YOLOv11/weights/best.pt', ROOT / 'YOLOv11', 'Dataset 13.000 ảnh'),
        ('v26', 'YOLO26n', ROOT / 'YOLOv26/weights/best.pt', ROOT / 'YOLOv26', 'Dataset 13.000 ảnh'),
    ]:
        model = YOLO(str(checkpoint))
        metrics = model.ckpt.get('train_metrics', {})
        keys = {'precision': 'metrics/precision(B)', 'recall': 'metrics/recall(B)',
                'map50': 'metrics/mAP50(B)', 'map5095': 'metrics/mAP50-95(B)'}
        with (run / 'results.csv').open(encoding='utf-8-sig', newline='') as file:
            history = [{k.strip(): float(v) for k, v in row.items()} for row in csv.DictReader(file)]
        if not any(all(abs(row[column] - metrics[column]) < .00002 for column in keys.values()) for row in history):
            raise ValueError(f'Checkpoint/CSV mismatch: {name}')
        learning_run = ROOT / 'YOLOv8/runs/detect/yolov8m_train_1' if key == 'v8' else run
        with (learning_run / 'results.csv').open(encoding='utf-8-sig', newline='') as file:
            learning_history = [{k.strip(): float(v) for k, v in row.items()} for row in csv.DictReader(file)]
        folder = OUTPUT / key
        folder.mkdir(parents=True, exist_ok=True)
        assets = {}
        for filename in ['confusion_matrix_normalized.png', 'confusion_matrix.png', 'BoxPR_curve.png', 'BoxF1_curve.png', 'BoxP_curve.png', 'BoxR_curve.png', 'results.png']:
            if (run / filename).is_file():
                shutil.copy2(run / filename, folder / filename)
                assets[filename] = f'/static/comparison/{key}/{filename}'
        models.append({'id': key, 'name': name, 'dataset': dataset, 'split': 'Validation',
                       'metrics': {k: metrics[v] for k, v in keys.items()},
                       'sizeMB': checkpoint.stat().st_size / 1024**2,
                       'parameters': sum(p.numel() for p in model.model.parameters()),
                       'classes': list(model.names.values()), 'assets': assets, 'history': history,
                       'learningHistory': learning_history, 'learningHistorySource': learning_run.name,
                       'checkpointMetricsSource': run.name,
                       'sha256': hashlib.sha256(checkpoint.read_bytes()).hexdigest()})
    if any(model['classes'] != models[0]['classes'] for model in models):
        raise ValueError('Class sets differ')
    report = {'protocol': 'saved-validation', 'sameEvaluationSetVerified': False, 'models': models}
    (OUTPUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    print(json.dumps([{k: m[k] for k in ['name', 'metrics', 'sizeMB', 'parameters']} for m in models]))


if __name__ == '__main__':
    export()
