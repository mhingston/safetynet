"""Generate synthetic NER training data for secret detection."""

import json
import random
import string
import os
import argparse


def random_chars(length, charset=string.ascii_uppercase):
    return "".join(random.choices(charset, k=length))


def random_digits(length):
    return "".join(random.choices(string.digits, k=length))


def random_word(length=8):
    return "".join(random.choices(string.ascii_lowercase, k=length))


def random_b64(length=200):
    charset = string.ascii_letters + string.digits + "+/="
    return "".join(random.choices(charset, k=length))


TEMPLATE_GENERATORS = {
    "CREDENTIAL-AWS": lambda: f"AKIA{random_chars(16)}",
    "CREDENTIAL-API-KEY": lambda: f"sk-{random_chars(32)}",
    "CREDENTIAL-TOKEN": lambda: f"eyJ{random_b64(30)}.{random_b64(30)}.{random_b64(30)}",
    "CREDENTIAL-PASSWORD": lambda: f"{random_word(6)}{random_digits(4)}!{random_word(5)}",
    "CREDENTIAL-CONNECTION-STRING": lambda: f"postgresql://admin:{random_word(10)}@db.example.com:5432/prod",
    "CREDENTIAL-PRIVATE-KEY": lambda: f"-----BEGIN RSA PRIVATE KEY-----\n{random_b64(200)}\n-----END RSA PRIVATE KEY-----",
    "CREDENTIAL-GENERIC": lambda: f"secret_{random_word(8)}_{random_digits(16)}",
    "INJECTION": lambda: random.choice(
        [
            f"SELECT * FROM users WHERE id = {random_digits(1)} OR 1=1; DROP TABLE users;--",
            f"<script>document.cookie</script>",
            f"; cat /etc/passwd",
            f"{{{{config}}}}",
        ]
    ),
    "ESCALATION": lambda: random.choice(
        [
            f"sudo chmod 777 /etc/shadow",
            f"sudo su -",
            f"chmod +s /bin/bash",
        ]
    ),
}

CONTEXT_TEMPLATES = [
    'config["key"] = {secret}',
    "API_KEY = '{secret}'",
    f"const apiKey = '{{secret}}'",
    f"password = '{{secret}}'",
    f"db_url = '{{secret}}'",
    f"aws_access_key = '{{secret}}'",
    f"token = '{{secret}}'",
    f"private_key = '{{secret}}'",
    f"secret = '{{secret}}'",
    "export SECRET_KEY={secret}",
    "setenv DB_PASSWORD {secret}",
    f"<input type='hidden' value='{{secret}}' />",
    f"ConnectionString={{secret}};",
    "Authorization: Bearer {secret}",
    f"query = '{{secret}}'",
]


def text_to_bio_tokens(text, entity_label):
    """Convert text with a known secret into BIO-tagged tokens.

    The secret portion gets B-/I- tags, surrounding context gets O tags.
    We use a simple heuristic: split on spaces, tag the secret-containing tokens.
    """
    tokens = text.split()
    if not tokens:
        return [], []

    # Find which tokens are part of the secret by looking for the generated value
    # We'll mark a contiguous span as the entity
    ner_tags = ["O"] * len(tokens)

    # Find the secret span - look for tokens that look like generated values
    secret_started = False
    for i, token in enumerate(tokens):
        # Heuristics for detecting secret tokens:
        # - Long tokens (>12 chars) are likely secrets
        # - Tokens starting with known prefixes (AKIA, sk-, eyJ, -----BEGIN)
        # - Tokens with high special character density
        is_secret = (
            len(token) > 12
            or token.startswith("AKIA")
            or token.startswith("sk-")
            or token.startswith("eyJ")
            or token.startswith("-----BEGIN")
            or token.startswith("postgresql://")
            or "OR 1=1" in token
            or "sudo" in token
            or "chmod" in token
            or "<script>" in token
            or "/etc/passwd" in token
            or token.count("=") > 2
            or (token.startswith("secret_") and len(token) > 10)
        )

        if is_secret:
            if not secret_started:
                ner_tags[i] = f"B-{entity_label}"
                secret_started = True
            else:
                ner_tags[i] = f"I-{entity_label}"
        else:
            secret_started = False

    return tokens, ner_tags


def generate_safe_examples(count=500):
    """Generate examples with no secrets."""
    safe_texts = [
        "const port = 3000;",
        "export const API_URL = 'https://api.example.com/v1';",
        "function processData(data) { return data.map(x => x * 2); }",
        "import React from 'react';",
        "console.log('Hello, World!');",
        "const result = await fetch('/api/health');",
        "# This is a regular comment",
        "def main(): pass",
        "let x = 42;",
        "return { status: 'ok' };",
        "const MAX_RETRIES = 3;",
        "const TIMEOUT_MS = 5000;",
        "if (user.role === 'admin') { return true; }",
        "const schema = { name: String, age: Number };",
        "app.listen(8080);",
        'const greeting = "Hello, " + name;',
        "module.exports = { parse, format };",
        "class User { constructor(name) { this.name = name; } }",
        "const items = list.filter(x => x.active);",
        "async function refresh() { location.reload(); }",
    ]
    examples = []
    for _ in range(count):
        text = random.choice(safe_texts)
        tokens = text.split()
        ner_tags = ["O"] * len(tokens)
        examples.append({"tokens": tokens, "ner_tags": ner_tags})
    return examples


def generate_secret_examples(label, count=200):
    """Generate secret-containing examples for a given label."""
    examples = []
    for _ in range(count):
        secret = TEMPLATE_GENERATORS[label]()
        context = random.choice(CONTEXT_TEMPLATES).format(secret=secret)
        tokens, ner_tags = text_to_bio_tokens(context, label)
        if tokens:
            examples.append({"tokens": tokens, "ner_tags": ner_tags})
    return examples


def generate_multi_entity_examples(count=200):
    """Generate examples with multiple secrets."""
    examples = []
    labels = list(TEMPLATE_GENERATORS.keys())
    for _ in range(count):
        lines = []
        all_tokens = []
        all_tags = []
        num_secrets = random.randint(2, 4)
        chosen_labels = random.sample(labels, min(num_secrets, len(labels)))
        for label in chosen_labels:
            secret = TEMPLATE_GENERATORS[label]()
            line = random.choice(CONTEXT_TEMPLATES).format(secret=secret)
            tokens, ner_tags = text_to_bio_tokens(line, label)
            if tokens:
                all_tokens.extend(tokens)
                all_tags.extend(ner_tags)
        if all_tokens:
            examples.append({"tokens": all_tokens, "ner_tags": all_tags})
    return examples


def main():
    parser = argparse.ArgumentParser(
        description="Generate synthetic NER training data for safetynet"
    )
    parser.add_argument(
        "--output",
        default="training/data/ner_dataset.json",
        help="Output JSON path",
    )
    parser.add_argument(
        "--examples-per-label",
        type=int,
        default=300,
        help="Examples per entity type",
    )
    parser.add_argument(
        "--safe-examples",
        type=int,
        default=500,
        help="Number of safe (no-secret) examples",
    )
    args = parser.parse_args()

    random.seed(42)
    all_examples = []

    for label in TEMPLATE_GENERATORS:
        label_examples = generate_secret_examples(label, args.examples_per_label)
        all_examples.extend(label_examples)
        print(f"Generated {len(label_examples)} {label} examples")

    safe = generate_safe_examples(args.safe_examples)
    all_examples.extend(safe)
    print(f"Generated {len(safe)} safe examples")

    multi = generate_multi_entity_examples(200)
    all_examples.extend(multi)
    print(f"Generated {len(multi)} multi-entity examples")

    random.shuffle(all_examples)

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(all_examples, f, indent=2)

    label_counts = {}
    for ex in all_examples:
        for tag in ex["ner_tags"]:
            if tag != "O":
                label_counts[tag] = label_counts.get(tag, 0) + 1

    print(f"\nTotal examples: {len(all_examples)}")
    print(f"Label distribution: {json.dumps(label_counts, indent=2)}")
    print(f"Saved to {args.output}")


if __name__ == "__main__":
    main()
