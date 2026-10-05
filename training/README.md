# Training and evaluation

The default synthetic generator is useful for smoke tests, but it is not a trustworthy
model-selection benchmark. The recommended training source is
[Podric/prowl-secrets-corpus](https://huggingface.co/datasets/Podric/prowl-secrets-corpus).

## Why this corpus

The Prowl corpus contains roughly 503k labelled records with exact secret spans,
hard negatives, and multiple source channels. Duplicate snippets are collapsed into
multi-entity examples before training so one secret is never accidentally labelled
as background while another secret in the same text is supervised.

Final evaluation uses the standalone 24,603-case ProwlBench v2 repository rather
than the older 3,843-case benchmark config currently described on the Hugging Face
card. The preparation step intentionally makes the split stricter than the source
project's historical ML experiments:

- exact ProwlBench v2 text/value overlaps are removed from training;
- `creddata` and Hugging Face-derived origins are held out for validation;
- ProwlBench v2 is used only once a model + threshold have been selected.

The dataset is CC BY-NC 4.0. See [DATASETS.md](DATASETS.md).

## Set up

```bash
cd training
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

## Prepare data

For quick iteration, the default keeps 100k training rows and 30k validation rows:

```bash
python training/data/prepare_prowl.py
```

For a full-data run:

```bash
python training/data/prepare_prowl.py --max-train 0 --max-validation 0
```

Generated data is written under `training/data/prowl/` and is intentionally gitignored.

## Hill-climb protocol

Change one major variable at a time and keep the validation split fixed.

### 0. Reproduce the old baseline

This is only useful to quantify how much the data pipeline moves the result.

```bash
python training/data/generate_synthetic.py --output training/data/ner_dataset.json
python training/finetune_ner.py \
  --data training/data/ner_dataset.json \
  --label-mode legacy \
  --model answerdotai/ModernBERT-base \
  --output training/models/baseline-legacy
```

Do not compare the random 90/10 synthetic validation score directly with the
Prowl validation score; the distributions are different.

### 1. Fix the data, keep the base model

Run both label formulations against exactly the same Prowl train/validation files:

```bash
python training/finetune_ner.py \
  --data training/data/prowl/train.jsonl \
  --validation-data training/data/prowl/validation.jsonl \
  --label-mode coarse \
  --model answerdotai/ModernBERT-base \
  --output training/models/prowl-base-coarse

python training/finetune_ner.py \
  --data training/data/prowl/train.jsonl \
  --validation-data training/data/prowl/validation.jsonl \
  --label-mode binary \
  --model answerdotai/ModernBERT-base \
  --output training/models/prowl-base-binary
```

`coarse` preserves broad secret categories. `binary` tests whether the type
taxonomy itself is costing detection quality.

### 2. Calibrate the operating point

Choose the threshold on validation data, not on ProwlBench:

```bash
python training/calibrate_threshold.py \
  --model training/models/prowl-base-coarse \
  --validation-data training/data/prowl/validation.jsonl \
  --min-precision 0.95 \
  --output training/models/prowl-base-coarse/threshold.json
```

For a different product trade-off, change `--min-precision`. The script selects
the best F1 among thresholds that satisfy the precision floor.

### 3. Evaluate once on ProwlBench

Pass the threshold selected above:

```bash
python training/benchmark_prowl.py \
  --model training/models/prowl-base-coarse \
  --threshold 0.73 \
  --output training/models/prowl-base-coarse/prowlbench.json
```

Compare overall precision/recall/F1, T1-T3 recall, and T4 false-positive rate.
Do not repeatedly tune against ProwlBench; that turns the benchmark into another
validation set.

### 4. Only then test a larger base model

Take the winning label mode and rerun it with `answerdotai/ModernBERT-large`.
Promote it only if the Prowl validation improvement survives ProwlBench and is worth
the increased training/inference cost.

## Metrics

`finetune_ner.py` reports entity-level precision, recall and F1 via `seqeval`.
It uses exact character spans and tokenizer offset mappings instead of whitespace
heuristics. Dynamic batch padding avoids padding every training example to 512 tokens.

`benchmark_prowl.py` reports snippet-level detection metrics because that is the
published ProwlBench protocol.

## Stop rule

Prefer the smallest model that is not meaningfully worse on the protected benchmark.
If Prowl data + ModernBERT-base closes most of the gap, stop there and spend the next
iteration on hard-negative mining/runtime correctness instead of scaling parameters.
