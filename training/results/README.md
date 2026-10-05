# Safetynet model hill-climb results

Permanent, append-only record of secret-detection accuracy measurements.
Future experiments must add rows here — never silently move the baseline.

## Protocol (from training/README.md + handoff)

1. Prepare one fixed dataset + validation split and reuse it for every experiment:
   `python training/data/prepare_prowl.py` (default 100k train / 30k validation).
2. Train coarse vs binary ModernBERT-base on exactly that split.
3. Calibrate the operating threshold on **validation only**
   (`--min-precision 0.95`), never on ProwlBench.
4. Run the selected configuration **once** against pinned ProwlBench v2.
5. Record numbers below. Do not claim improvement unless the numbers show it.

Pinned provenance (see training/DATASETS.md):

- Prowl corpus: `Podric/prowl-secrets-corpus` revision
  `06f6d2cdf6a64c6d77ffb95a8dfb7abf7913b885` (CC BY-NC 4.0).
- ProwlBench v2: `Lercas/prowlbench` revision
  `53d6fc1e2006185c0fadd5cd761af3f1aacfd025` (PolyForm Noncommercial 1.0.0).
- Safetynet source stays MIT; a Prowl-trained bundled model must **not** be
  described as MIT-only (see DATASETS.md licence boundary).

## Current table

| Experiment | Model | Labels | Precision | Recall | F1 | T4 FP | Model size | Relative latency |
|---|---|---|---:|---:|---:|---:|---:|---:|
| prowl-base-coarse | answerdotai/ModernBERT-base | coarse | _pending GPU runner_ | _pending_ | _pending_ | _pending_ | _pending_ | 1.0x (reference) |
| prowl-base-binary | answerdotai/ModernBERT-base | binary | _pending GPU runner_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |

Per-file JSON records in this directory hold the full detail
(train/validation counts, seed, epochs, LR, threshold, hardware, commit SHA,
validation vs protected-benchmark flag). Placeholder files with
`"status": "pending"` exist until a GPU runner fills them in.

## Status (2026-10-05)

The `hillclimb/measured-baseline` branch implements Phase 4 inference
correctness and this results scaffold, but **has not yet produced model
numbers**: this environment is CPU-only (4 cores, 11 GiB RAM, no nvidia-smi)
with no torch/transformers installed, so the 100k×3-epoch ModernBERT hill-climb
is not runnable here. The exact GPU commands are recorded in each placeholder
JSON under `reproduction`. A GPU runner should:

```bash
python training/data/prepare_prowl.py
python training/finetune_ner.py \
  --data training/data/prowl/train.jsonl \
  --validation-data training/data/prowl/validation.jsonl \
  --label-mode coarse \
  --model answerdotai/ModernBERT-base \
  --output training/models/prowl-base-coarse
python training/calibrate_threshold.py \
  --model training/models/prowl-base-coarse \
  --validation-data training/data/prowl/validation.jsonl \
  --min-precision 0.95 \
  --output training/models/prowl-base-coarse/threshold.json
# then repeat with --label-mode binary, compare, and benchmark the winner once:
python training/benchmark_prowl.py \
  --model training/models/prowl-base-<winner> \
  --threshold <CALIBRATED_THRESHOLD> \
  --output training/models/prowl-base-<winner>/prowlbench.json
```

## Decision rule (binary vs coarse)

Prefer **binary** if it matches or beats coarse detection within normal noise.
The ML job is _does this span contain a secret_; type is recovered later
deterministically. Retain coarse only if type prediction adds accuracy/product
value without hurting detection.

## Stop rule

Prefer ModernBERT-base unless a larger encoder gives a meaningful protected-
benchmark gain worth ~2x inference cost. Do not spend T1 structured-recall
gains on a larger model when deterministic candidate generation solves them
more cheaply.
