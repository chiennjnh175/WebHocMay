"""Check packaged report provenance and data consistency without loading YOLO."""
import csv
import hashlib
import json
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]


class EvaluationTest(unittest.TestCase):
    def test_metrics_match_checkpoint_epoch_and_bundled_model(self):
        report = json.loads((BASE / "static/evaluation/report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["modelSha256"], hashlib.sha256((BASE / "models/best.pt").read_bytes()).hexdigest())
        with (BASE / "static/evaluation/results.csv").open(encoding="utf-8") as file:
            rows = list(csv.DictReader(file))
        best = next(row for row in rows if int(row["epoch"]) == report["bestEpoch"])
        for key, column in [("precision", "metrics/precision(B)"), ("recall", "metrics/recall(B)"),
                            ("map50", "metrics/mAP50(B)"), ("map5095", "metrics/mAP50-95(B)")]:
            self.assertAlmostEqual(report["metrics"][key], float(best[column]), places=5)
        self.assertEqual(report["split"], "Validation")
        self.assertTrue(1 <= report["bestEpoch"] <= len(rows))

    def test_dataset_counts_and_artifacts(self):
        report = json.loads((BASE / "static/evaluation/report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["dataset"]["name"], "dataset")
        self.assertEqual(report["dataset"]["images"], 13000)
        self.assertEqual(sum(split["images"] for split in report["splits"]), report["dataset"]["images"])
        self.assertEqual(sum(split["instances"] for split in report["splits"]), report["dataset"]["instances"])
        for split in report["splits"]:
            self.assertEqual(sum(split["counts"]), split["instances"])
            self.assertEqual(len(split["counts"]), len(report["classes"]))
            self.assertEqual(split["missingLabels"], 0)
        for asset in report["assets"].values():
            path = BASE / asset.removeprefix("/")
            self.assertTrue(path.is_file(), path)
            self.assertGreater(path.stat().st_size, 100)


if __name__ == "__main__":
    unittest.main(verbosity=2)
