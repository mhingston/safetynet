"""Fine-tune ModernBERT-base for NER secret detection."""

import argparse
import json
import os

import torch
from transformers import (
    AutoTokenizer,
    AutoModelForTokenClassification,
    TrainingArguments,
    Trainer,
    DataCollatorForTokenClassification,
)
from datasets import Dataset

LABEL_LIST = [
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

LABEL2ID = {label: i for i, label in enumerate(LABEL_LIST)}
ID2LABEL = {i: label for i, label in enumerate(LABEL_LIST)}


class NERDataset(torch.utils.data.Dataset):
    def __init__(self, examples, tokenizer, max_length=512):
        self.examples = examples
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.examples)

    def __getitem__(self, idx):
        example = self.examples[idx]
        tokens = example["tokens"]
        ner_tags = example["ner_tags"]

        encoding = self.tokenizer(
            tokens,
            is_split_into_words=True,
            truncation=True,
            max_length=self.max_length,
            padding="max_length",
            return_tensors="pt",
        )

        word_ids = encoding.word_ids(batch_index=0)
        labels = []
        for word_id in word_ids:
            if word_id is None:
                labels.append(-100)
            elif word_id < len(ner_tags):
                tag = ner_tags[word_id]
                labels.append(LABEL2ID.get(tag, 0))
            else:
                labels.append(-100)

        return {
            "input_ids": encoding["input_ids"].squeeze(),
            "attention_mask": encoding["attention_mask"].squeeze(),
            "labels": torch.tensor(labels),
        }


def load_data(path):
    with open(path) as f:
        data = json.load(f)
    return data


def main():
    parser = argparse.ArgumentParser(description="Fine-tune ModernBERT-base for NER")
    parser.add_argument("--data", default="training/data/ner_dataset.json")
    parser.add_argument("--model", default="answerdotai/ModernBERT-base")
    parser.add_argument("--output", default="training/models/safetynet-ner")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--max-length", type=int, default=512)
    args = parser.parse_args()

    print(f"Loading model: {args.model}")
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForTokenClassification.from_pretrained(
        args.model,
        num_labels=len(LABEL_LIST),
        label2id=LABEL2ID,
        id2label=ID2LABEL,
    )

    print(f"Loading data: {args.data}")
    all_data = load_data(args.data)
    random_idx = list(range(len(all_data)))

    import random

    random.seed(42)
    random.shuffle(random_idx)

    split = int(0.9 * len(all_data))
    train_data = [all_data[i] for i in random_idx[:split]]
    eval_data = [all_data[i] for i in random_idx[split:]]

    print(f"Train: {len(train_data)}, Eval: {len(eval_data)}")

    train_dataset = NERDataset(train_data, tokenizer, args.max_length)
    eval_dataset = NERDataset(eval_data, tokenizer, args.max_length)

    training_args = TrainingArguments(
        output_dir=args.output,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        logging_steps=10,
        save_total_limit=2,
        report_to="none",
        fp16=torch.cuda.is_available(),
    )

    data_collator = DataCollatorForTokenClassification(tokenizer=tokenizer)

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        data_collator=data_collator,
    )

    print("Starting training...")
    trainer.train()

    print(f"Saving model to {args.output}")
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)

    with open(os.path.join(args.output, "label_list.json"), "w") as f:
        json.dump(LABEL_LIST, f)

    print("Training complete!")


if __name__ == "__main__":
    main()
