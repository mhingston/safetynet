# Training data provenance and licensing

## Podric/prowl-secrets-corpus

- Hugging Face: https://huggingface.co/datasets/Podric/prowl-secrets-corpus
- Purpose here: secret-detection training and origin-disjoint validation.
- Dataset licence: **CC BY-NC 4.0**.
- Pinned revision: `06f6d2cdf6a64c6d77ffb95a8dfb7abf7913b885`.
- Size/card at time of adoption: ~503k corpus rows; exact secret spans; code, ticket,
  wiki, log and chat contexts; positive and hard-negative examples.

The preparation script downloads this dataset at training time. No dataset rows are
committed to safetynet.

## ProwlBench v2

- Repository: https://github.com/Lercas/prowlbench
- Purpose here: protected final evaluation only.
- Repository licence: **PolyForm Noncommercial 1.0.0**.
- Pinned revision: `53d6fc1e2006185c0fadd5cd761af3f1aacfd025`.
- Size: 24,603 cases: 16,552 positive and 8,051 hard-negative cases.

The Hugging Face corpus card currently describes its bundled `prowlbench` config as
the older 3,843-case set. Safetynet therefore pins the standalone ProwlBench v2 JSONL
for final evaluation and for exact-overlap decontamination.

ProwlBench documents a known ~5% overlap affecting historical trained-model rows.
Safetynet hashes the pinned v2 benchmark texts and secret spans and excludes exact
matches from the training corpus before fitting a model. This removes known exact
duplicates, but does not claim template-level independence.

### Licence boundary

The safetynet source code remains MIT. Training/evaluation data is fetched at run
time and is not vendored in the source distribution.

Any model artifact trained using the Prowl corpus should conservatively be treated
as **non-commercial** and distributed with clear attribution/restrictions compatible
with the source dataset unless a separate legal/licensing determination says
otherwise. Do not describe such a model as MIT-only.

If a Prowl-trained model replaces the bundled model under `models/`, add a model
licence/attribution file in that release and update the root README accordingly.

This is a conservative project policy for respecting upstream terms, not legal advice.

## Other upstream sources inside the Prowl corpus

The dataset card records mixed provenance for derived portions, including Samsung
CredData and Hugging Face PII datasets. Downstream users should follow the dataset
card and upstream attribution requirements in addition to the compiled-dataset licence.

## Leakage policy

ProwlBench is never used to select model architecture, labels, hyperparameters or
thresholds. `prepare_prowl.py` removes exact ProwlBench v2 text/value overlaps from
the training corpus before creating local files. Validation additionally holds out
`creddata` and `hf` origins from training.
