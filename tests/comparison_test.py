import json
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]


class ComparisonTest(unittest.TestCase):
    def test_report_integrity(self):
        report = json.loads((BASE / 'static/comparison/report.json').read_text(encoding='utf-8'))
        self.assertFalse(report['sameEvaluationSetVerified'])
        self.assertEqual([m['name'] for m in report['models']], ['YOLOv8m', 'YOLO11n', 'YOLO26n'])
        self.assertEqual(report['models'][0]['classes'], report['models'][1]['classes'])
        self.assertEqual(report['models'][0]['learningHistorySource'], 'yolov8m_train_1')
        self.assertEqual(len(report['models'][0]['learningHistory']), 100)
        self.assertEqual(len(report['models'][1]['learningHistory']), 50)
        for model in report['models']:
            self.assertGreater(model['parameters'], 0)
            self.assertGreater(model['sizeMB'], 0)
            for key, column in [('precision', 'metrics/precision(B)'), ('recall', 'metrics/recall(B)'), ('map50', 'metrics/mAP50(B)'), ('map5095', 'metrics/mAP50-95(B)')]:
                self.assertTrue(0 <= model['metrics'][key] <= 1)
                self.assertTrue(any(abs(row[column] - model['metrics'][key]) < .00002 for row in model['history']))
            for path in model['assets'].values():
                self.assertTrue((BASE / path.lstrip('/')).is_file())


if __name__ == '__main__':
    unittest.main(verbosity=2)
