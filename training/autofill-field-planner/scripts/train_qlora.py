#!/usr/bin/env python3
"""QLoRA fine-tuning for the ResumeATS autofill field planner.

Run this inside WSL2/Linux with an NVIDIA driver visible to PyTorch.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainerCallback
from trl import SFTConfig, SFTTrainer

from scripts.common import format_training_text


DEFAULT_TARGET_MODULES = "q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj"


class JsonMetricsCallback(TrainerCallback):
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def write_event(self, event: str, state, payload: dict | None = None) -> None:
        record = {
            "event": event,
            "time": time.time(),
            "step": state.global_step,
            "epoch": state.epoch,
        }
        if payload:
            record.update(payload)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")

    def on_train_begin(self, args, state, control, **kwargs):
        self.write_event("train_begin", state, {"max_steps": state.max_steps})

    def on_log(self, args, state, control, logs=None, **kwargs):
        self.write_event("log", state, dict(logs or {}))

    def on_train_end(self, args, state, control, **kwargs):
        self.write_event("train_end", state)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=Path("data/examples.jsonl"))
    parser.add_argument("--model", default="Qwen/Qwen2.5-1.5B-Instruct")
    parser.add_argument("--output-dir", type=Path, default=Path("runs/autofill-planner-lora"))
    parser.add_argument("--eval-size", type=float, default=0.12)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--epochs", type=float, default=3.0)
    parser.add_argument("--max-steps", type=int, default=-1)
    parser.add_argument("--max-length", type=int, default=1536)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--gradient-accumulation-steps", type=int, default=16)
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    parser.add_argument("--target-modules", default=DEFAULT_TARGET_MODULES)
    parser.add_argument("--save-steps", type=int, default=100)
    parser.add_argument("--logging-steps", type=int, default=10)
    parser.add_argument("--metrics-jsonl", type=Path, help="Write structured training metrics to this JSONL file")
    parser.add_argument("--fp16", action="store_true", help="Enable FP16 mixed precision training")
    parser.add_argument("--bf16", action="store_true", help="Enable BF16 mixed precision training")
    parser.add_argument("--merge-and-save", action="store_true", help="Also save a merged full model after training")
    return parser.parse_args()


def load_training_dataset(dataset_path: Path, tokenizer, eval_size: float, seed: int):
    dataset = load_dataset("json", data_files=str(dataset_path), split="train")

    def format_row(row):
        return {"text": format_training_text(tokenizer, row)}

    dataset = dataset.map(format_row, remove_columns=dataset.column_names)

    if len(dataset) < 8 or eval_size <= 0:
        return dataset, None

    split = dataset.train_test_split(test_size=eval_size, seed=seed)
    return split["train"], split["test"]


def main() -> int:
    args = parse_args()

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is not available. Use WSL2/Linux with NVIDIA drivers and a CUDA PyTorch build.")

    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    train_dataset, eval_dataset = load_training_dataset(args.dataset, tokenizer, args.eval_size, args.seed)

    quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    )

    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        quantization_config=quantization_config,
        device_map="auto",
        torch_dtype=torch.float16,
        trust_remote_code=True,
    )
    model.config.use_cache = False

    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        target_modules=[module.strip() for module in args.target_modules.split(",") if module.strip()],
        bias="none",
        task_type="CAUSAL_LM",
    )

    training_args = SFTConfig(
        output_dir=str(args.output_dir),
        num_train_epochs=args.epochs,
        max_steps=args.max_steps,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        learning_rate=args.learning_rate,
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        logging_steps=args.logging_steps,
        save_steps=args.save_steps,
        save_strategy="steps",
        eval_strategy="steps" if eval_dataset is not None else "no",
        eval_steps=args.save_steps if eval_dataset is not None else None,
        fp16=args.fp16,
        bf16=args.bf16,
        gradient_checkpointing=True,
        optim="paged_adamw_8bit",
        max_length=args.max_length,
        dataset_text_field="text",
        report_to="none",
        seed=args.seed,
    )

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        peft_config=lora_config,
        processing_class=tokenizer,
    )
    if args.metrics_jsonl:
        trainer.add_callback(JsonMetricsCallback(args.metrics_jsonl))

    trainer.train()
    trainer.save_model(str(args.output_dir))
    tokenizer.save_pretrained(str(args.output_dir))

    if args.merge_and_save:
        merged_dir = args.output_dir.with_name(f"{args.output_dir.name}-merged")
        merged = trainer.model.merge_and_unload()
        merged.save_pretrained(str(merged_dir), safe_serialization=True)
        tokenizer.save_pretrained(str(merged_dir))
        print(f"Merged model saved to {merged_dir}")

    print(f"LoRA adapter saved to {args.output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
