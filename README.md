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

If you want to fine-tune on your own data:

```bash
cd training
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Generate synthetic training data (or provide your own)
python3 data/generate_synthetic.py --output data/ner_dataset.json

# Fine-tune ModernBERT-base
python3 finetune_ner.py --data data/ner_dataset.json --epochs 3

# Export to ONNX with INT8 quantization
python3 export_onnx.py --model models/safetynet-ner --quantize

# Copy the quantized model to the bundled location
cp models/safetynet-ner-onnx/onnx/model_quantized.onnx ../models/onnx/
cp models/safetynet-ner-onnx/config.json ../models/
cp models/safetynet-ner-onnx/tokenizer.json ../models/
cp models/safetynet-ner-onnx/tokenizer_config.json ../models/
```

## Development

```bash
npm run build        # Compile TypeScript
npm test             # Run all 174 tests
npm run lint         # Type check
npm run test:watch   # Watch mode
```

## License

MIT