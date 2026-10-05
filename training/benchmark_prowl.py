"""Evaluate a trained safetynet NER model on the protected ProwlBench split.

Do not tune the threshold on ProwlBench. Calibrate on the origin-disjoint
validation split, then pass that fixed value here.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from typing import Any

import torch
from datasets import load_dataset
from transformers import AutoModelForTokenClassification, AutoTokenizer


PROWLBENCH_REPOSITORY = "Lercas/prowlbench"
PROWLBENCH_REVISION = "53d6fc1e2006185c0fadd5cd761af3f1aacfd025"
PROWLBENCH_URL = (
    "https://raw.githubusercontent.com/Lercas/prowlbench/"
    f"{PROWLBENCH_REVISION}/prowlbench.jsonl"
)


def safe_div(numerator: int, denominator: int) -> float:
    return numerator / denominator if denominator else 0.0


def normalize_tier(value: Any) -> str:
    text = str(value).upper()
    if text.startswith("T"):
        return text
    return f"T{text}"


def score_batch(model, tokenizer, texts: list[str], threshold: float, device) -> list[bool]:
    encoded = tokenizer(
        texts,
        padding=True,
        truncation=True,
        max_length=512,
        return_special_tokens_mask=True,
        return_tensors="pt",
    )
    special_tokens = encoded.pop("special_tokens_mask")
    encoded = {key: value.to(device) for key, value in encoded.items()}
    special_tokens = special_tokens.to(device)

    with torch.inference_mode():
        logits = model(**encoded).logits
        probabilities = torch.softmax(logits, dim=-1)
        confidence, predicted = probabilities.max(dim=-1)

    o_id = int(model.config.label2id.get("O", 0))
    valid = encoded["attention_mask"].bool() & ~special_tokens.bool()
    secret = (predicted != o_id) & valid & (confidence >= threshold)
    return secret.any(dim=-1).cpu().tolist()


def metrics_from_counts(tp: int, fp: int, tn: int, fn: int) -> dict[str, float | int]:
    precision = safe_div(tp, tp + fp)
    recall = safe_div(tp, tp + fn)
    return {
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "f1": safe_div(2 * precision * recall, precision + recall),
        "accuracy": safe_div(tp + tn, tp + fp + tn + fn),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate safetynet on ProwlBench")
    parser.add_argument("--model", required=True, help="Local model path or Hugging Face model ID")
    parser.add_argument(
        "--threshold",
        type=float,
        required=True,
        help="Fixed confidence threshold calibrated on validation data",
    )
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--output", help="Optional JSON output path")
    args = parser.parse_args()

    if not 0.0 <= args.threshold <= 1.0:
        raise ValueError("--threshold must be between 0 and 1")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tokenizer = AutoTokenizer.from_pretrained(args.model, use_fast=True)
    model = AutoModelForTokenClassification.from_pretrained(args.model).to(device)
    model.eval()

    benchmark = load_dataset("json", data_files=PROWLBENCH_URL, split="train")

    tp = fp = tn = fn = 0
    tier_counts: dict[str, dict[str, int]] = defaultdict(
        lambda: {"positive": 0, "detected_positive": 0, "negative": 0, "false_positive": 0}
    )
    source_counts: dict[str, dict[str, int]] = defaultdict(
        lambda: {"tp": 0, "fp": 0, "tn": 0, "fn": 0}
    )
    language_counts: dict[str, dict[str, int]] = defaultdict(
        lambda: {"tp": 0, "fp": 0, "tn": 0, "fn": 0}
    )

    rows = list(benchmark)
    for start in range(0, len(rows), args.batch_size):
        batch = rows[start : start + args.batch_size]
        predictions = score_batch(
            model,
            tokenizer,
            [str(row["text"]) for row in batch],
            args.threshold,
            device,
        )

        for row, prediction in zip(batch, predictions):
            label = bool(int(row["label"]))
            tier = normalize_tier(row.get("tier", "unknown"))
            source = str(row.get("source", "unknown"))
            language = str(row.get("lang", "unknown"))

            if label and prediction:
                tp += 1
                source_counts[source]["tp"] += 1
                language_counts[language]["tp"] += 1
            elif label and not prediction:
                fn += 1
                source_counts[source]["fn"] += 1
                language_counts[language]["fn"] += 1
            elif not label and prediction:
                fp += 1
                source_counts[source]["fp"] += 1
                language_counts[language]["fp"] += 1
            else:
                tn += 1
                source_counts[source]["tn"] += 1
                language_counts[language]["tn"] += 1

            if label:
                tier_counts[tier]["positive"] += 1
                if prediction:
                    tier_counts[tier]["detected_positive"] += 1
            else:
                tier_counts[tier]["negative"] += 1
                if prediction:
                    tier_counts[tier]["false_positive"] += 1

    result: dict[str, Any] = {
        "dataset": PROWLBENCH_REPOSITORY,
        "dataset_revision": PROWLBENCH_REVISION,
        "model": args.model,
        "threshold": args.threshold,
        "overall": metrics_from_counts(tp, fp, tn, fn),
        "tiers": {},
        "sources": {},
        "languages": {},
    }

    for tier, counts in sorted(tier_counts.items()):
        result["tiers"][tier] = {
            "recall": safe_div(counts["detected_positive"], counts["positive"]),
            "false_positive_rate": safe_div(
                counts["false_positive"], counts["negative"]
            ),
            **counts,
        }

    for source, counts in sorted(source_counts.items()):
        result["sources"][source] = metrics_from_counts(**counts)

    for language, counts in sorted(language_counts.items()):
        result["languages"][language] = metrics_from_counts(**counts)

    output = json.dumps(result, indent=2, sort_keys=True)
    print(output)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(output + "\n")


if __name__ == "__main__":
    main()
