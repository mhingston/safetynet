"""Prepare a leakage-reduced Prowl corpus split for safetynet NER training.

The source dataset is CC BY-NC 4.0:
https://huggingface.co/datasets/Podric/prowl-secrets-corpus

This script does not vendor the dataset. It downloads it through Hugging Face,
groups duplicate snippets into multi-entity examples, removes exact ProwlBench v2
text/value overlaps, then creates origin-disjoint train and validation JSONL files.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from pathlib import Path
from typing import Any

from datasets import load_dataset


DATASET_ID = "Podric/prowl-secrets-corpus"
DATASET_REVISION = "06f6d2cdf6a64c6d77ffb95a8dfb7abf7913b885"
PROWLBENCH_REVISION = "53d6fc1e2006185c0fadd5cd761af3f1aacfd025"
PROWLBENCH_URL = (
    "https://raw.githubusercontent.com/Lercas/prowlbench/"
    f"{PROWLBENCH_REVISION}/prowlbench.jsonl"
)
DEFAULT_VALIDATION_ORIGINS = {"creddata", "hf"}


def stable_hash(value: str | None) -> str | None:
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def normalize_span(span: Any) -> list[int] | None:
    if span is None:
        return None
    if isinstance(span, (list, tuple)) and len(span) == 2:
        start, end = int(span[0]), int(span[1])
        if 0 <= start < end:
            return [start, end]
    return None


def benchmark_fingerprints() -> tuple[set[str], set[str]]:
    bench = load_dataset("json", data_files=PROWLBENCH_URL, split="train")
    text_hashes: set[str] = set()
    value_hashes: set[str] = set()

    for row in bench:
        text = str(row.get("text", ""))
        text_hash = stable_hash(text)
        if text_hash:
            text_hashes.add(text_hash)

        span = normalize_span(row.get("span"))
        if span and span[1] <= len(text):
            value_hash = stable_hash(text[span[0] : span[1]])
            if value_hash:
                value_hashes.add(value_hash)

    return text_hashes, value_hashes


def aggregate_corpus(corpus) -> tuple[list[dict[str, Any]], int]:
    """Collapse one-row-per-secret records into one multi-span example per text."""

    groups: dict[str, dict[str, Any]] = {}
    skipped_invalid = 0

    for raw in corpus:
        text = str(raw.get("text", ""))
        if not text:
            skipped_invalid += 1
            continue

        label_binary = int(raw.get("label_binary", raw.get("label", 0)) or 0)
        span = normalize_span(raw.get("span")) if label_binary else None
        if label_binary and span is None:
            skipped_invalid += 1
            continue

        group = groups.setdefault(
            text,
            {
                "text": text,
                "entities": [],
                "source": raw.get("source"),
                "_origins": set(),
                "_entity_keys": set(),
            },
        )

        origin = raw.get("origin")
        if origin:
            group["_origins"].add(str(origin))

        if label_binary and span is not None:
            value = raw.get("value")
            if not value and span[1] <= len(text):
                value = text[span[0] : span[1]]
            entity = {
                "span": span,
                "label_type": raw.get("label_type") or raw.get("type"),
                "value": value,
            }
            key = (span[0], span[1], entity["label_type"])
            if key not in group["_entity_keys"]:
                group["_entity_keys"].add(key)
                group["entities"].append(entity)

    result: list[dict[str, Any]] = []
    for group in groups.values():
        group["entities"].sort(key=lambda entity: (entity["span"][0], entity["span"][1]))
        origins = sorted(group.pop("_origins"))
        group.pop("_entity_keys")
        group["origins"] = origins
        group["origin"] = origins[0] if len(origins) == 1 else None
        group["label_binary"] = 1 if group["entities"] else 0
        result.append(group)

    return result, skipped_invalid


def is_contaminated(
    row: dict[str, Any], text_hashes: set[str], value_hashes: set[str]
) -> bool:
    text_hash = stable_hash(row["text"])
    if text_hash and text_hash in text_hashes:
        return True

    for entity in row.get("entities", []):
        value_hash = stable_hash(entity.get("value"))
        if value_hash and value_hash in value_hashes:
            return True

    return False


def reservoir_add(
    reservoir: list[dict[str, Any]],
    row: dict[str, Any],
    seen: int,
    limit: int,
    rng: random.Random,
) -> None:
    if limit <= 0:
        reservoir.append(row)
        return
    if len(reservoir) < limit:
        reservoir.append(row)
        return
    index = rng.randint(0, seen - 1)
    if index < limit:
        reservoir[index] = row


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare Prowl corpus train/validation splits for safetynet"
    )
    parser.add_argument("--output-dir", default="training/data/prowl")
    parser.add_argument(
        "--max-train",
        type=int,
        default=100_000,
        help="Reservoir-sample this many train snippets; <=0 keeps all snippets",
    )
    parser.add_argument(
        "--max-validation",
        type=int,
        default=30_000,
        help="Reservoir-sample this many validation snippets; <=0 keeps all snippets",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--validation-origins",
        default="creddata,hf",
        help="Comma-separated origins held out from training",
    )
    parser.add_argument(
        "--no-decontaminate",
        action="store_true",
        help="Do not remove exact ProwlBench v2 text/value overlaps (not recommended)",
    )
    args = parser.parse_args()

    rng = random.Random(args.seed)
    validation_origins = {
        value.strip() for value in args.validation_origins.split(",") if value.strip()
    } or DEFAULT_VALIDATION_ORIGINS

    if args.no_decontaminate:
        bench_text_hashes: set[str] = set()
        bench_value_hashes: set[str] = set()
    else:
        print("Loading ProwlBench v2 fingerprints for decontamination...")
        bench_text_hashes, bench_value_hashes = benchmark_fingerprints()
        print(
            "Protected benchmark fingerprints: "
            f"{len(bench_text_hashes)} texts, {len(bench_value_hashes)} values"
        )

    corpus = load_dataset(
        DATASET_ID, "corpus", split="train", revision=DATASET_REVISION
    )
    print("Grouping duplicate snippets into multi-entity examples...")
    grouped_rows, skipped_invalid = aggregate_corpus(corpus)

    train_rows: list[dict[str, Any]] = []
    validation_rows: list[dict[str, Any]] = []
    train_seen = 0
    validation_seen = 0
    skipped_contaminated = 0

    for row in grouped_rows:
        if is_contaminated(row, bench_text_hashes, bench_value_hashes):
            skipped_contaminated += 1
            continue

        origins = set(row.get("origins", []))
        if origins & validation_origins:
            validation_seen += 1
            reservoir_add(
                validation_rows,
                row,
                validation_seen,
                args.max_validation,
                rng,
            )
        else:
            train_seen += 1
            reservoir_add(train_rows, row, train_seen, args.max_train, rng)

    rng.shuffle(train_rows)
    rng.shuffle(validation_rows)

    output_dir = Path(args.output_dir)
    write_jsonl(output_dir / "train.jsonl", train_rows)
    write_jsonl(output_dir / "validation.jsonl", validation_rows)

    manifest = {
        "dataset": DATASET_ID,
        "dataset_revision": DATASET_REVISION,
        "prowlbench_revision": PROWLBENCH_REVISION,
        "license": "CC BY-NC 4.0",
        "seed": args.seed,
        "validation_origins": sorted(validation_origins),
        "decontaminated_against_prowlbench_v2": not args.no_decontaminate,
        "corpus_rows": len(corpus),
        "grouped_snippets": len(grouped_rows),
        "train_rows_seen": train_seen,
        "validation_rows_seen": validation_seen,
        "train_rows_written": len(train_rows),
        "validation_rows_written": len(validation_rows),
        "skipped_contaminated": skipped_contaminated,
        "skipped_invalid": skipped_invalid,
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )

    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
