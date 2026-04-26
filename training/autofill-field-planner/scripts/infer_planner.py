#!/usr/bin/env python3
"""Run one autofill planner inference from a JSON input file."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

from scripts.common import extract_json_object, format_inference_prompt, sanitize_planner_output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="JSON file containing the planner input object")
    parser.add_argument("--model", default="Qwen/Qwen2.5-1.5B-Instruct")
    parser.add_argument("--adapter", type=Path, required=True, help="Trained LoRA adapter directory")
    parser.add_argument("--max-new-tokens", type=int, default=700)
    parser.add_argument("--temperature", type=float, default=0.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    payload = json.loads(args.input.read_text(encoding="utf-8"))

    tokenizer = AutoTokenizer.from_pretrained(args.adapter, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    )
    base = AutoModelForCausalLM.from_pretrained(
        args.model,
        quantization_config=quantization_config,
        device_map="auto",
        trust_remote_code=True,
    )
    model = PeftModel.from_pretrained(base, str(args.adapter))
    model.eval()

    prompt = format_inference_prompt(tokenizer, payload)
    encoded = tokenizer(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        output = model.generate(
            **encoded,
            max_new_tokens=args.max_new_tokens,
            do_sample=args.temperature > 0,
            temperature=args.temperature if args.temperature > 0 else None,
            pad_token_id=tokenizer.eos_token_id,
        )

    generated = tokenizer.decode(output[0][encoded["input_ids"].shape[1]:], skip_special_tokens=True)
    parsed = sanitize_planner_output(extract_json_object(generated), payload)
    print(json.dumps(parsed, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
