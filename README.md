# safetynet

A neural secret scanner that uses a fine-tuned ModernBERT model to detect leaked credentials in source code. Replaces regex-based tools like gitleaks with ML-powered NER (Named Entity Recognition) that understands context.

**Ships with a pre-trained ONNX model** — no training or model download required to get started.

## Quick start

```bash
git clone <repo-url> safetynet && cd safetynet
npm install
npm run build

# Scan a directory
node dist/index.js detect --source /path/to/your/project

# Scan git history
node dist/index.js git --source /path/to/repo

# Pipe content via stdin
cat suspicious-file.py | node dist/index.js stdin
```

## How it works

safetynet tokenizes your source code, runs it through a fine-tuned ModernBERT NER model, and produces BIO-tagged entity spans that identify secrets with character-level precision.

```
source code → fragment reader → NER classifier → span extractor → finding processor → reporter
```

The bundled model (`models/`) detects these entity types:

| Rule ID | Description |
|---------|-------------|
| `credential-aws` | AWS access keys and secret keys |
| `credential-api-key` | API keys (sk-*, api_*, etc.) |
| `credential-token` | Bearer tokens, JWTs, personal access tokens |
| `credential-password` | Hardcoded password strings |
| `credential-connection-string` | Database URLs, connection strings |
| `credential-private-key` | PEM private key blocks |
| `credential-generic` | Generic secrets not matching a specific type |
| `injection` | SQL/code injection patterns |
| `escalation` | Privilege escalation patterns |

## Commands

### `detect` — scan a directory

```bash
node dist/index.js detect --source /path/to/project
node dist/index.js detect --source . --report-format sarif
```

### `git` — scan git history

```bash
node dist/index.js git --source /path/to/repo
node dist/index.js git --source . --commits abc123..def456
```

### `protect` — pre-commit hook

```bash
# In .git/hooks/pre-commit:
node /path/to/safetynet/dist/index.js protect --source .
```

### `stdin` — pipe content

```bash
echo 'AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI..."' | node dist/index.js stdin
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--source <path>` | `.` | Path to scan |
| `--config <path>` | — | Path to `.safetynet.toml` |
| `--report-format` | `json` | Output format: `json`, `sarif`, `csv`, `junit` |
| `--model <id>` | `safetynet-ner` | Override model ID |
| `--model-dir <path>` | — | Override model directory |
| `--fail-open` | `false` | Exit 0 on classifier error (default: exit 2) |
| `--min-confidence` | `0.5` | Suppress findings below this confidence |
| `--threshold` | `0.85` | Below this, tag as `low-confidence` |
| `--concurrency` | `4` | Worker pool concurrency |
| `--commits <sha>` | — | Specific commit(s) to scan (git mode) |

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | No findings (clean) |
| 1 | Findings detected |
| 2 | Classifier error (use `--fail-open` to change to 0) |

## Output formats

**JSON** (default) — gitleaks-compatible format:

```json
[
  {
    "ruleId": "credential-aws",
    "description": "B-CREDENTIAL-AWS detected",
    "file": "config.py",
    "startLine": 12,
    "match": "AKIAIOSFODNN7EXAMPLE",
    "confidence": 0.92,
    "fingerprint": "abc123:config.py:credential-aws:12"
  }
]
```

**SARIF** — for GitHub Code Scanning, Azure DevOps, etc.

**CSV** — spreadsheet-friendly output.

**JUnit** — for CI test reporting.

## Configuration

Create a `.safetynet.toml` in your project root:

```toml
[classifier]
model = "safetynet-ner"
threshold = 0.85
min_confidence = 0.5
concurrency = 4

[allowlist]
paths = ['^vendor/', '\\.test\\.ts$']
commits = ["abc123"]
stopwords = ["example", "test"]
```

## Ignoring findings

### `.safetynetignore` / `.gitleaksignore`

Add one fingerprint per line. `.safetynetignore` takes precedence:

```
abc123:src/config.ts:credential-aws:10
def456:src/db.ts:credential-password:5
```

### Inline comments

```python
api_key = "sk-test-key"  # safetynet:allow
aws_key = "AKIA..."      # gitleaks:allow
```

Both `safetynet:allow` and `gitleaks:allow` are recognized, making migration from gitleaks seamless.

## Retraining the model

The original synthetic generator remains available for smoke tests, but model selection
should use the larger span-labelled Prowl corpus with an origin-disjoint validation set.
The training pipeline removes exact ProwlBench overlaps before training and reports
entity-level precision, recall and F1.

```bash
cd training
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ..

# Download/prepare a 100k-row hill-climb split.
python training/data/prepare_prowl.py

# Keep ModernBERT-base fixed first; compare coarse vs binary NER.
python training/finetune_ner.py \
  --data training/data/prowl/train.jsonl \
  --validation-data training/data/prowl/validation.jsonl \
  --label-mode coarse \
  --model answerdotai/ModernBERT-base \
  --output training/models/prowl-base-coarse

# Calibrate on validation, then run the protected benchmark once.
python training/calibrate_threshold.py \
  --model training/models/prowl-base-coarse \
  --validation-data training/data/prowl/validation.jsonl \
  --min-precision 0.95
```

See [training/README.md](training/README.md) for the full hill-climb protocol,
including binary-vs-coarse labels, ProwlBench evaluation and the point at which to
try ModernBERT-large.

## Development

```bash
npm run build        # Compile TypeScript
npm test             # Run all 174 tests
npm run lint         # Type check
npm run test:watch   # Watch mode
```

## License

The safetynet source code is MIT.

The recommended Prowl training corpus is CC BY-NC 4.0. Training data is downloaded
at training time and is not vendored in this repository. A future bundled model
trained from that corpus must carry compatible non-commercial attribution/restrictions;
see [training/DATASETS.md](training/DATASETS.md).