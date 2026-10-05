"""Calibrate the production confidence threshold on held-out validation data."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from transformers import AutoModelForTokenClassification, AutoTokenizer


def load_jsonl(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def model_scores(model, tokenizer, texts: list[str], batch_size: int, device) -> list[float]:
    scores: list[float] = []
    o_id = int(model.config.label2id.get("O", 0))

    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        encoded = tokenizer(
            batch,
            padding=True,
            truncation=True,
            max_length=512,
            return_special_tokens_mask=True,
            return_tensors="pt",
        )
        special = encoded.pop("special_tokens_mask").to(device)
        encoded = {key: value.to(device) for key, value in encoded.items()}

        with torch.inference_mode():
            probabilities = torch.softmax(model(**encoded).logits, dim=-1)
            confidence, predicted = probabilities.max(dim=-1)

        valid = encoded["attention_mask"].bool() & ~special.bool()
        candidate = confidence.masked_fill(~valid | (predicted == o_id), 0.0)
        scores.extend(candidate.max(dim=-1).values.cpu().tolist())

    return scores


def metrics(labels: list[bool], scores: list[float], threshold: float) -> dict[str, float | int]:
    tp = fp = tn = fn = 0
    for label, score in zip(labels, scores):
        prediction = score >= threshold
        if label and prediction:
            tp += 1
        elif label:
            fn += 1
        elif prediction:
            fp += 1
        else:
            tn += 1

    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "threshold": threshold,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "accuracy": (tp + tn) / len(labels) if labels else 0.0,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Calibrate safetynet confidence threshold")
    parser.add_argument("--model", required=True)
    parser.add_argument("--validation-data", required=True)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--min-threshold", type=float, default=0.05)
    parser.add_argument("--max-threshold", type=float, default=0.95)
    parser.add_argument("--step", type=float, default=0.01)
    parser.add_argument(
        "--min-precision",
        type=float,
        default=0.0,
        help="Optional precision floor; choose highest recall/F1 among qualifying thresholds",
    )
    parser.add_argument("--output")
    args = parser.parse_args()

    if args.step <= 0:
        parser.error("--step must be greater than 0")
    if not 0.0 <= args.min_threshold <= 1.0:
        parser.error("--min-threshold must be between 0 and 1")
    if not 0.0 <= args.max_threshold <= 1.0:
        parser.error("--max-threshold must be between 0 and 1")
    if args.min_threshold > args.max_threshold:
        parser.error("--min-threshold must not exceed --max-threshold")
    if not 0.0 <= args.min_precision <= 1.0:
        parser.error("--min-precision must be between 0 and 1")
    if args.batch_size <= 0:
        parser.error("--batch-size must be greater than 0")

    rows = load_jsonl(args.validation_data)
    labels = [bool(int(row.get("label_binary", 0) or 0)) for row in rows]
    texts = [str(row["text"]) for row in rows]

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tokenizer = AutoTokenizer.from_pretrained(args.model, use_fast=True)
    model = AutoModelForTokenClassification.from_pretrained(args.model).to(device)
    model.eval()

    scores = model_scores(model, tokenizer, texts, args.batch_size, device)

    candidates: list[dict[str, float | int]] = []
    threshold = args.min_threshold
    while threshold <= args.max_threshold + 1e-9:
        candidates.append(metrics(labels, scores, round(threshold, 6)))
        threshold += args.step

    qualifying = [
        result for result in candidates if float(result["precision"]) >= args.min_precision
    ]
    if not qualifying:
        best_precision = max(float(result["precision"]) for result in candidates)
        raise SystemExit(
            "No threshold satisfies "
            f"--min-precision={args.min_precision:.3f}; "
            f"best observed precision was {best_precision:.3f}. "
            "Lower the precision floor or improve the model before benchmarking."
        )

    best = max(
        qualifying,
        key=lambda result: (
            float(result["f1"]),
            float(result["recall"]),
            float(result["precision"]),
        ),
    )

    result = {
        "model": args.model,
        "validation_data": args.validation_data,
        "min_precision": args.min_precision,
        "best": best,
        "sweep": candidates,
    }
    output = json.dumps(result, indent=2, sort_keys=True)
    print(output)
    if args.output:
        Path(args.output).write_text(output + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
