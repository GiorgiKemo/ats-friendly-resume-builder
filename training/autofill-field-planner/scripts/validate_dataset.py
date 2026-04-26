#!/usr/bin/env python3
"""Validate ResumeATS autofill planner JSONL datasets."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                row = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {exc}") from exc
            row["_line_number"] = line_number
            rows.append(row)
    return rows


def validate_row(row: dict) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    prefix = f"line {row.get('_line_number', '?')} id={row.get('id', '<missing>')}:"

    if not row.get("id"):
        errors.append(f"{prefix} missing id")

    input_payload = row.get("input")
    output_payload = row.get("output")
    if not isinstance(input_payload, dict):
        errors.append(f"{prefix} input must be an object")
        return errors, warnings
    if not isinstance(output_payload, dict):
        errors.append(f"{prefix} output must be an object")
        return errors, warnings

    fields = input_payload.get("fields")
    actions = output_payload.get("actions")
    if not isinstance(fields, list) or not fields:
        errors.append(f"{prefix} input.fields must be a non-empty array")
        return errors, warnings
    if not isinstance(actions, list):
        errors.append(f"{prefix} output.actions must be an array")
        return errors, warnings

    field_by_id = {}
    for field in fields:
        if not isinstance(field, dict):
            errors.append(f"{prefix} field entries must be objects")
            continue
        field_id = field.get("fieldId")
        if not field_id:
            errors.append(f"{prefix} field missing fieldId")
            continue
        if field_id in field_by_id:
            errors.append(f"{prefix} duplicate fieldId {field_id}")
        field_by_id[field_id] = field
        if not field.get("label") and not field.get("placeholder") and not field.get("name"):
            warnings.append(f"{prefix} field {field_id} has weak labeling context")

    seen_actions = set()
    for action in actions:
        if not isinstance(action, dict):
            errors.append(f"{prefix} action entries must be objects")
            continue
        field_id = action.get("fieldId")
        if not field_id:
            errors.append(f"{prefix} action missing fieldId")
            continue
        if field_id not in field_by_id:
            errors.append(f"{prefix} action references unknown fieldId {field_id}")
            continue
        if field_id in seen_actions:
            errors.append(f"{prefix} duplicate action for fieldId {field_id}")
        seen_actions.add(field_id)

        confidence = action.get("confidence")
        if confidence not in {"high", "medium", "low"}:
            errors.append(f"{prefix} action {field_id} has invalid confidence {confidence!r}")

        value = action.get("value")
        if value is None:
            errors.append(f"{prefix} action {field_id} missing string value")
        elif not isinstance(value, str):
            errors.append(f"{prefix} action {field_id} value must be a string")

        field = field_by_id[field_id]
        options = [str(option).strip() for option in field.get("options") or [] if str(option).strip()]
        option_text = str(action.get("optionText") or "").strip()
        skip = action.get("skip") is True
        if options and not skip:
            selected = option_text or str(value or "").strip()
            if selected and selected not in options:
                warnings.append(
                    f"{prefix} action {field_id} selected option {selected!r} is not an exact listed option"
                )
            if not selected:
                warnings.append(f"{prefix} action {field_id} has options but no selected option")

        sensitive = " ".join(
            str(field.get(key) or "") for key in ("label", "placeholder", "name", "section")
        ).lower()
        if any(term in sensitive for term in ("sponsorship", "visa", "clearance", "disability", "veteran", "gender", "race")):
            if action.get("source") not in {"explicit_profile", "insufficient_profile", "human_review"}:
                warnings.append(f"{prefix} action {field_id} is sensitive and should come from explicit profile data")

    missing_actions = sorted(set(field_by_id) - seen_actions)
    if missing_actions:
        warnings.append(f"{prefix} no action for fields: {', '.join(missing_actions)}")

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path, help="Path to JSONL dataset")
    parser.add_argument("--min-rows", type=int, default=1)
    args = parser.parse_args()

    rows = load_jsonl(args.dataset)
    errors: list[str] = []
    warnings: list[str] = []

    if len(rows) < args.min_rows:
        errors.append(f"dataset has {len(rows)} rows, expected at least {args.min_rows}")

    for row in rows:
        row_errors, row_warnings = validate_row(row)
        errors.extend(row_errors)
        warnings.extend(row_warnings)

    for warning in warnings:
        print(f"WARNING: {warning}")
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)

    if errors:
        print(f"Validation failed: {len(errors)} error(s), {len(warnings)} warning(s)", file=sys.stderr)
        return 1

    print(f"Validation passed: {len(rows)} row(s), {len(warnings)} warning(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
