"""Fine-tune an encoder for span-level secret detection."""

from __future__ import annotations

import argparse
import json
import os
import random
from typing import Any

import numpy as np
import torch
from seqeval.metrics import accuracy_score, f1_score, precision_score, recall_score
from transformers import (
    AutoModelForTokenClassification,
    AutoTokenizer,
    DataCollatorForTokenClassification,
    Trainer,
    TrainingArguments,
    set_seed,
)


LEGACY_LABELS = [
    "O",
    "B-CREDENTIAL",
    "I-CREDENTIAL",
    "B-CREDENTIAL-AWS",
    "I-CREDENTIAL-AWS",
    "B-CREDENTIAL-API-KEY",
    "I-CREDENTIAL-API-KEY",
    "B-CREDENTIAL-TOKEN",
    "I-CREDENTIAL-TOKEN",
    "B-CREDENTIAL-PASSWORD",
    "I-CREDENTIAL-PASSWORD",
    "B-CREDENTIAL-CONNECTION-STRING",
    "I-CREDENTIAL-CONNECTION-STRING",
    "B-CREDENTIAL-PRIVATE-KEY",
    "I-CREDENTIAL-PRIVATE-KEY",
    "B-CREDENTIAL-GENERIC",
    "I-CREDENTIAL-GENERIC",
    "B-INJECTION",
    "I-INJECTION",
    "B-ESCALATION",
    "I-ESCALATION",
]

BINARY_LABELS = ["O", "B-CREDENTIAL", "I-CREDENTIAL"]

COARSE_LABELS = [
    "O",
    "B-CREDENTIAL-AWS",
    "I-CREDENTIAL-AWS",
    "B-CREDENTIAL-API-KEY",
    "I-CREDENTIAL-API-KEY",
    "B-CREDENTIAL-TOKEN",
    "I-CREDENTIAL-TOKEN",
    "B-CREDENTIAL-PASSWORD",
    "I-CREDENTIAL-PASSWORD",
    "B-CREDENTIAL-CONNECTION-STRING",
    "I-CREDENTIAL-CONNECTION-STRING",
    "B-CREDENTIAL-PRIVATE-KEY",
    "I-CREDENTIAL-PRIVATE-KEY",
    "B-CREDENTIAL-GENERIC",
    "I-CREDENTIAL-GENERIC",
]


def label_list_for_mode(mode: str) -> list[str]:
    if mode == "legacy":
        return LEGACY_LABELS
    if mode == "binary":
        return BINARY_LABELS
    if mode == "coarse":
        return COARSE_LABELS
    raise ValueError(f"Unknown label mode: {mode}")


def coarse_entity_type(label_type: str | None) -> str:
    value = (label_type or "").lower().replace("-", "_")

    if "aws" in value:
        return "CREDENTIAL-AWS"
    if "private_key" in value or "privatekey" in value or "pem" in value:
        return "CREDENTIAL-PRIVATE-KEY"
    if any(term in value for term in ("connection", "database_uri", "db_uri", "dsn")):
        return "CREDENTIAL-CONNECTION-STRING"
    if "password" in value or "passwd" in value:
        return "CREDENTIAL-PASSWORD"
    if any(
        term in value
        for term in (
            "jwt",
            "token",
            "bearer",
            "oauth",
            "pat",
            "session",
            "cookie",
        )
    ):
        return "CREDENTIAL-TOKEN"
    if any(
        term in value
        for term in (
            "api_key",
            "apikey",
            "secret_key",
            "access_key",
            "client_secret",
            "credential",
            "webhook",
        )
    ):
        return "CREDENTIAL-API-KEY"
    return "CREDENTIAL-GENERIC"


def entity_type(label_type: str | None, label_mode: str) -> str:
    if label_mode == "binary":
        return "CREDENTIAL"
    return coarse_entity_type(label_type)


def load_data(path: str) -> list[dict[str, Any]]:
    if path.endswith(".jsonl"):
        with open(path, encoding="utf-8") as handle:
            return [json.loads(line) for line in handle if line.strip()]
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise ValueError(f"Expected a JSON list in {path}")
    return data


def normalize_legacy_tag(tag: str, label_mode: str) -> str:
    if tag == "O":
        return tag
    prefix = "B" if tag.startswith("B-") else "I"
    if label_mode == "legacy":
        return tag
    if label_mode == "binary":
        return f"{prefix}-CREDENTIAL"
    if "INJECTION" in tag or "ESCALATION" in tag:
        return "O"
    return tag


class NERDataset(torch.utils.data.Dataset):
    def __init__(
        self,
        examples: list[dict[str, Any]],
        tokenizer,
        label_list: list[str],
        label_mode: str,
        max_length: int = 512,
    ):
        self.examples = examples
        self.tokenizer = tokenizer
        self.label_mode = label_mode
        self.max_length = max_length
        self.label2id = {label: i for i, label in enumerate(label_list)}

    def __len__(self) -> int:
        return len(self.examples)

    def _legacy_example(self, example: dict[str, Any]) -> dict[str, Any]:
        tokens = example["tokens"]
        ner_tags = example["ner_tags"]
        encoding = self.tokenizer(
            tokens,
            is_split_into_words=True,
            truncation=True,
            max_length=self.max_length,
        )

        labels: list[int] = []
        previous_word_id = None
        for word_id in encoding.word_ids():
            if word_id is None:
                labels.append(-100)
                previous_word_id = word_id
                continue
            if word_id >= len(ner_tags):
                labels.append(-100)
                previous_word_id = word_id
                continue

            tag = normalize_legacy_tag(ner_tags[word_id], self.label_mode)
            if (
                word_id == previous_word_id
                and tag.startswith("B-")
                and f"I-{tag[2:]}" in self.label2id
            ):
                tag = f"I-{tag[2:]}"
            labels.append(self.label2id.get(tag, self.label2id["O"]))
            previous_word_id = word_id

        encoding["labels"] = labels
        return dict(encoding)

    def _span_example(self, example: dict[str, Any]) -> dict[str, Any]:
        text = str(example["text"])
        encoding = self.tokenizer(
            text,
            truncation=True,
            max_length=self.max_length,
            return_offsets_mapping=True,
        )
        offsets = encoding.pop("offset_mapping")

        raw_entities = example.get("entities")
        if raw_entities is None:
            span = example.get("span")
            raw_entities = (
                [{"span": span, "label_type": example.get("label_type")}]
                if bool(int(example.get("label_binary", 0) or 0)) and span is not None
                else []
            )

        entities: list[dict[str, Any]] = []
        for raw_entity in raw_entities:
            span = raw_entity.get("span")
            if not isinstance(span, (list, tuple)) or len(span) != 2:
                continue
            span_start, span_end = int(span[0]), int(span[1])
            if not 0 <= span_start < span_end:
                continue

            entity = entity_type(raw_entity.get("label_type"), self.label_mode)
            begin = self.label2id.get(f"B-{entity}")
            inside = self.label2id.get(f"I-{entity}")
            if begin is None or inside is None:
                begin = self.label2id.get(
                    "B-CREDENTIAL-GENERIC", self.label2id.get("B-CREDENTIAL")
                )
                inside = self.label2id.get(
                    "I-CREDENTIAL-GENERIC", self.label2id.get("I-CREDENTIAL")
                )
            if begin is None or inside is None:
                continue

            entities.append(
                {
                    "start": span_start,
                    "end": span_end,
                    "begin": begin,
                    "inside": inside,
                    "started": False,
                }
            )

        entities.sort(key=lambda entity: (entity["start"], entity["end"]))

        labels: list[int] = []
        for token_start, token_end in offsets:
            if token_start == token_end:
                labels.append(-100)
                continue

            matched = None
            for entity in entities:
                if token_start < entity["end"] and token_end > entity["start"]:
                    matched = entity
                    break

            if matched is None:
                labels.append(self.label2id["O"])
                continue

            labels.append(matched["inside"] if matched["started"] else matched["begin"])
            matched["started"] = True

        encoding["labels"] = labels
        return dict(encoding)

    def __getitem__(self, idx: int) -> dict[str, Any]:
        example = self.examples[idx]
        if "text" in example:
            return self._span_example(example)
        return self._legacy_example(example)


def split_data(
    all_data: list[dict[str, Any]], seed: int
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    indices = list(range(len(all_data)))
    rng = random.Random(seed)
    rng.shuffle(indices)
    split = int(0.9 * len(all_data))
    return (
        [all_data[i] for i in indices[:split]],
        [all_data[i] for i in indices[split:]],
    )


def build_compute_metrics(id2label: dict[int, str]):
    def compute_metrics(eval_prediction):
        logits, labels = eval_prediction
        predictions = np.argmax(logits, axis=-1)

        true_predictions: list[list[str]] = []
        true_labels: list[list[str]] = []
        for prediction, label in zip(predictions, labels):
            prediction_tags: list[str] = []
            label_tags: list[str] = []
            for predicted_id, label_id in zip(prediction, label):
                if label_id == -100:
                    continue
                prediction_tags.append(id2label[int(predicted_id)])
                label_tags.append(id2label[int(label_id)])
            true_predictions.append(prediction_tags)
            true_labels.append(label_tags)

        return {
            "precision": precision_score(true_labels, true_predictions, zero_division=0),
            "recall": recall_score(true_labels, true_predictions, zero_division=0),
            "f1": f1_score(true_labels, true_predictions, zero_division=0),
            "accuracy": accuracy_score(true_labels, true_predictions),
        }

    return compute_metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune a secret-detection NER model")
    parser.add_argument("--data", default="training/data/ner_dataset.json")
    parser.add_argument(
        "--validation-data",
        help="Optional held-out validation JSON/JSONL. Strongly recommended.",
    )
    parser.add_argument("--model", default="answerdotai/ModernBERT-base")
    parser.add_argument("--output", default="training/models/safetynet-ner")
    parser.add_argument(
        "--label-mode",
        choices=("legacy", "binary", "coarse"),
        default="coarse",
        help="binary tests pure detection; coarse preserves broad secret categories",
    )
    parser.add_argument("--epochs", type=float, default=3)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--gradient-accumulation-steps", type=int, default=1)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--warmup-ratio", type=float, default=0.05)
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    label_list = label_list_for_mode(args.label_mode)
    label2id = {label: i for i, label in enumerate(label_list)}
    id2label = {i: label for i, label in enumerate(label_list)}

    # Seed before from_pretrained: the token-classification head is initialized here,
    # before Trainer has a chance to apply TrainingArguments.seed.
    set_seed(args.seed)

    print(f"Loading model: {args.model}")
    tokenizer = AutoTokenizer.from_pretrained(args.model, use_fast=True)
    model = AutoModelForTokenClassification.from_pretrained(
        args.model,
        num_labels=len(label_list),
        label2id=label2id,
        id2label=id2label,
    )

    print(f"Loading training data: {args.data}")
    train_data = load_data(args.data)
    if args.validation_data:
        print(f"Loading validation data: {args.validation_data}")
        eval_data = load_data(args.validation_data)
    else:
        print(
            "WARNING: no --validation-data supplied; using a random 90/10 split. "
            "Do not use this for final model selection."
        )
        train_data, eval_data = split_data(train_data, args.seed)

    print(
        f"Train: {len(train_data)}, Eval: {len(eval_data)}, "
        f"labels: {args.label_mode}"
    )

    train_dataset = NERDataset(
        train_data, tokenizer, label_list, args.label_mode, args.max_length
    )
    eval_dataset = NERDataset(
        eval_data, tokenizer, label_list, args.label_mode, args.max_length
    )

    training_args = TrainingArguments(
        output_dir=args.output,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        learning_rate=args.learning_rate,
        weight_decay=args.weight_decay,
        warmup_ratio=args.warmup_ratio,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        logging_steps=25,
        save_total_limit=2,
        report_to="none",
        fp16=torch.cuda.is_available(),
        seed=args.seed,
        data_seed=args.seed,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        data_collator=DataCollatorForTokenClassification(tokenizer=tokenizer),
        compute_metrics=build_compute_metrics(id2label),
    )

    print("Starting training...")
    trainer.train()

    metrics = trainer.evaluate()
    print(json.dumps(metrics, indent=2, sort_keys=True))

    print(f"Saving model to {args.output}")
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)

    with open(os.path.join(args.output, "label_list.json"), "w", encoding="utf-8") as handle:
        json.dump(label_list, handle)

    with open(os.path.join(args.output, "eval_metrics.json"), "w", encoding="utf-8") as handle:
        json.dump(metrics, handle, indent=2, sort_keys=True)

    print("Training complete!")


if __name__ == "__main__":
    main()
