"""Export trained NER model to ONNX format with INT8 quantization."""

import argparse
import os

from optimum.exporters.onnx import main_export


def main():
    parser = argparse.ArgumentParser(description="Export NER model to ONNX")
    parser.add_argument("--model", default="training/models/safetynet-ner")
    parser.add_argument("--output", default="training/models/safetynet-ner-onnx")
    parser.add_argument(
        "--quantize", action="store_true", help="Apply INT8 quantization"
    )
    args = parser.parse_args()

    os.makedirs(args.output, exist_ok=True)

    print(f"Exporting {args.model} to ONNX at {args.output}...")
    main_export(
        model_name_or_path=args.model,
        output=args.output,
        task="token-classification",
        do_validation=False,
    )

    if args.quantize:
        print("Applying INT8 quantization...")
        from onnxruntime.quantization import quantize_dynamic, QuantType

        onnx_path = os.path.join(args.output, "model.onnx")
        quantized_path = os.path.join(args.output, "model_quantized.onnx")
        if os.path.exists(onnx_path):
            quantize_dynamic(onnx_path, quantized_path, weight_type=QuantType.QInt8)
            print(f"Quantized model saved to {quantized_path}")
        else:
            print(f"Warning: {onnx_path} not found, skipping quantization")

    print(f"ONNX model exported to {args.output}")


if __name__ == "__main__":
    main()
