"""Shared prompt and JSON helpers for the ResumeATS autofill planner."""

from __future__ import annotations

import json
import re
from typing import Any


SYSTEM_PROMPT = """You are ResumeATS Autofill Planner.
Return strict JSON only. Your job is to map job application fields to truthful candidate answers.

Rules:
- Use candidate profile explicit answers as source of truth.
- For select/radio/choice fields, choose optionText exactly from the provided options.
- Do not invent legal, visa, sponsorship, salary, clearance, disability, veteran, gender, race, or demographic answers.
- If the profile does not explicitly answer a sensitive field, return value "" with skip true and confidence "low".
- Only answer open text questions when the question is concrete and the profile/job context supports the answer.
- For textareas like "why this role", write a concise truthful answer from the profile and job context.
- For vague optional textareas such as "additional information", "anything else", "comments", or "notes", answer only when the profile has an explicit answer for that exact prompt or a clearly relevant past experience for this job.
- When job title/description differs from the current role, search older profile experience/projects for relevant evidence instead of defaulting to current title or top skills.
- Never paste a generic skills or background pitch into a field that does not ask for skills, background, motivation, or fit.
- Do not include markdown, explanations, or comments outside JSON.

Return shape:
{"actions":[{"fieldId":"...","value":"...","optionText":"...","confidence":"high|medium|low","source":"explicit_profile|job_and_profile|safe_default|insufficient_profile|human_review","skip":false}],"notes":[]}
"""


VALID_CONFIDENCE = {"high", "medium", "low"}
VALID_SOURCE = {"explicit_profile", "job_and_profile", "safe_default", "insufficient_profile", "human_review"}
SENSITIVE_TERMS = ("sponsorship", "visa", "clearance", "disability", "veteran", "gender", "race", "salary")
GENERIC_OPTIONAL_TEXT_TERMS = (
    "additional information",
    "additional comment",
    "anything else",
    "anything to add",
    "other information",
    "supplemental information",
    "comment",
    "note",
)
CONCRETE_FREE_TEXT_TERMS = (
    "cover letter",
    "message to the hiring team",
    "about you",
    "tell us about yourself",
    "why are you interested",
    "why this role",
    "why do you want",
    "why should we hire",
    "why are you a fit",
    "describe",
    "explain",
    "experience",
    "availability",
    "schedule",
    "license",
    "certification",
    "portfolio",
    "website",
    "linkedin",
    "github",
    "visa",
    "sponsorship",
    "work authorization",
    "salary",
    "compensation",
)
GENERIC_OPTIONAL_EXPLICIT_KEYS = ("additional", "anything", "comment", "note", "other", "supplemental")
RELEVANCE_STOPWORDS = {
    "about",
    "after",
    "also",
    "and",
    "are",
    "based",
    "candidate",
    "current",
    "currently",
    "experience",
    "for",
    "from",
    "have",
    "include",
    "into",
    "job",
    "most",
    "role",
    "skills",
    "strongest",
    "that",
    "the",
    "this",
    "through",
    "using",
    "with",
    "work",
    "working",
}


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def build_user_prompt(input_payload: dict) -> str:
    return (
        "Plan autofill actions for this application form.\n"
        "Input JSON:\n"
        f"{json.dumps(input_payload, ensure_ascii=False, indent=2)}"
    )


def format_training_text(tokenizer: Any, row: dict) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_user_prompt(row["input"])},
        {"role": "assistant", "content": compact_json(row["output"])},
    ]

    if getattr(tokenizer, "chat_template", None):
        return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)

    return (
        f"<|system|>\n{SYSTEM_PROMPT}\n"
        f"<|user|>\n{build_user_prompt(row['input'])}\n"
        f"<|assistant|>\n{compact_json(row['output'])}"
    )


def format_inference_prompt(tokenizer: Any, input_payload: dict) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_user_prompt(input_payload)},
    ]

    if getattr(tokenizer, "chat_template", None):
        return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

    return (
        f"<|system|>\n{SYSTEM_PROMPT}\n"
        f"<|user|>\n{build_user_prompt(input_payload)}\n"
        "<|assistant|>\n"
    )


def extract_json_object(text: str) -> dict:
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.IGNORECASE | re.MULTILINE).strip()
    try:
        return normalize_planner_output(json.loads(cleaned))
    except json.JSONDecodeError:
        pass

    first = cleaned.find("{")
    last = cleaned.rfind("}")
    if first == -1 or last <= first:
        raise ValueError("Model did not return a JSON object")
    return normalize_planner_output(json.loads(cleaned[first:last + 1]))


def normalize_planner_output(value: Any) -> dict:
    if isinstance(value, dict):
        if "actions" not in value:
            value["actions"] = []
        if "notes" not in value:
            value["notes"] = []
        return value
    if isinstance(value, list):
        return {"actions": value, "notes": []}
    raise ValueError("Model JSON must be an object or an actions array")


def _field_context(field: dict) -> str:
    raw_context = " ".join(str(field.get(key) or "") for key in ("label", "placeholder", "name", "id", "section")).lower()
    return re.sub(r"[\s_-]+", " ", raw_context).strip()


def _is_generic_optional_text_field(field: dict) -> bool:
    context = _field_context(field)
    if not any(term in context for term in GENERIC_OPTIONAL_TEXT_TERMS):
        return False
    return not any(term in context for term in CONCRETE_FREE_TEXT_TERMS)


def _iter_explicit_generic_answers(profile: dict) -> list[str]:
    explicit_answers = profile.get("explicitAnswers") if isinstance(profile, dict) else None
    if not isinstance(explicit_answers, dict):
        return []

    answers: list[str] = []
    for key, raw_value in explicit_answers.items():
        key_text = str(key or "").lower()
        if not any(term in key_text for term in GENERIC_OPTIONAL_EXPLICIT_KEYS):
            continue
        values = raw_value if isinstance(raw_value, list) else [raw_value]
        for value in values:
            text = str(value or "").strip()
            if text:
                answers.append(text)
    return answers


def _matches_explicit_generic_answer(value: str, explicit_answers: list[str]) -> bool:
    normalized_value = value.strip()
    if not normalized_value:
        return False
    return any(normalized_value == answer or normalized_value in answer for answer in explicit_answers)


def _flatten_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        return " ".join(_flatten_text(entry) for entry in value.values())
    if isinstance(value, list):
        return " ".join(_flatten_text(entry) for entry in value)
    return str(value)


def _normalize_relevance_token(token: str) -> str:
    token = token.lower()
    for suffix in ("ing", "ed", "es", "s"):
        if len(token) > len(suffix) + 3 and token.endswith(suffix):
            return token[: -len(suffix)]
    return token


def _relevance_tokens(text: str) -> set[str]:
    return {
        _normalize_relevance_token(token)
        for token in re.findall(r"[a-zA-Z][a-zA-Z0-9+#.-]{2,}", text.lower())
        if token not in RELEVANCE_STOPWORDS
    }


def _has_relevant_profile_context(input_payload: dict, selected_text: str) -> bool:
    profile = input_payload.get("profile", {}) if isinstance(input_payload, dict) else {}
    job = input_payload.get("job", {}) if isinstance(input_payload, dict) else {}
    if not isinstance(profile, dict) or not isinstance(job, dict):
        return False

    profile_text = _flatten_text({
        "experience": profile.get("experience"),
        "projects": profile.get("projects"),
        "skills": profile.get("skills"),
        "summary": profile.get("summary"),
        "candidate": profile.get("candidate"),
    })
    job_text = _flatten_text({
        "title": job.get("title"),
        "company": job.get("company"),
        "industry": job.get("industry"),
        "description": job.get("description"),
        "employmentType": job.get("employmentType"),
    })

    answer_tokens = _relevance_tokens(selected_text)
    profile_tokens = _relevance_tokens(profile_text)
    job_tokens = _relevance_tokens(job_text)
    if not answer_tokens or not profile_tokens or not job_tokens:
        return False

    answer_profile_overlap = answer_tokens & profile_tokens
    answer_job_overlap = answer_tokens & job_tokens
    profile_job_overlap = profile_tokens & job_tokens

    return (
        len(answer_profile_overlap) >= 2
        and len(answer_job_overlap) >= 1
        and len(profile_job_overlap) >= 1
    )


def _first_clean_sentence(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(text or "")).strip()
    cleaned = re.sub(r"^(?:[-*]|\u2022)\s*", "", cleaned)
    if not cleaned:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", cleaned)
    sentence = parts[0].strip()
    return sentence[:280].rstrip(" ,;")


def _experience_detail_phrase(sentence: str) -> str:
    detail = sentence.rstrip(".")
    replacements = {
        "Supported ": "supported ",
        "Answered ": "answered ",
        "Resolved ": "resolved ",
        "Handled ": "handled ",
        "Built ": "built ",
        "Managed ": "managed ",
        "Provided ": "provided ",
    }
    for prefix, replacement in replacements.items():
        if detail.startswith(prefix):
            return replacement + detail[len(prefix):]
    if detail[:1].isupper() and not detail[:2].isupper():
        return detail[:1].lower() + detail[1:]
    return detail


def _iter_profile_experience(profile: dict) -> list[dict]:
    rows: list[dict] = []
    for key in ("experience", "workExperience", "employment", "projects"):
        value = profile.get(key) if isinstance(profile, dict) else None
        if isinstance(value, list):
            rows.extend(row for row in value if isinstance(row, dict))
    return rows


def _best_relevant_profile_experience(input_payload: dict) -> dict | None:
    profile = input_payload.get("profile", {}) if isinstance(input_payload, dict) else {}
    job = input_payload.get("job", {}) if isinstance(input_payload, dict) else {}
    if not isinstance(profile, dict) or not isinstance(job, dict):
        return None

    job_text = _flatten_text({
        "title": job.get("title"),
        "industry": job.get("industry"),
        "description": job.get("description"),
    })
    job_tokens = _relevance_tokens(job_text)
    if not job_tokens:
        return None

    best: tuple[int, dict] | None = None
    for row in _iter_profile_experience(profile):
        row_text = _flatten_text(row)
        row_tokens = _relevance_tokens(row_text)
        overlap = row_tokens & job_tokens
        if len(overlap) < 2:
            continue
        score = len(overlap) * 10 + min(10, len(row_tokens))
        if best is None or score > best[0]:
            best = (score, row)

    return best[1] if best else None


def build_relevant_generic_optional_actions(input_payload: dict) -> list[dict]:
    fields = [field for field in input_payload.get("fields", []) if isinstance(field, dict)]
    experience = _best_relevant_profile_experience(input_payload)
    if not experience:
        return []

    title = str(experience.get("title") or experience.get("role") or "past role").strip()
    description = _first_clean_sentence(
        experience.get("description")
        or experience.get("summary")
        or experience.get("responsibilities")
        or _flatten_text(experience)
    )
    if not description:
        return []

    job = input_payload.get("job", {}) if isinstance(input_payload, dict) else {}
    job_title = str(job.get("title") or "this role").strip()
    value = (
        f"In my past {title} role, I {_experience_detail_phrase(description)}. "
        f"That background is directly relevant to the {job_title} role."
    )

    actions = []
    for field in fields:
        field_id = str(field.get("fieldId") or "").strip()
        if field_id and _is_generic_optional_text_field(field):
            actions.append(
                {
                    "fieldId": field_id,
                    "value": value[:700],
                    "optionText": "",
                    "confidence": "high",
                    "source": "job_and_profile",
                    "skip": False,
                }
            )
    return actions


def sanitize_planner_output(plan: dict, input_payload: dict) -> dict:
    fields = [field for field in input_payload.get("fields", []) if isinstance(field, dict)]
    field_by_id = {str(field.get("fieldId")): field for field in fields if field.get("fieldId")}
    explicit_generic_answers = _iter_explicit_generic_answers(input_payload.get("profile", {}))
    aliases: dict[str, str] = {}
    for field in fields:
        field_id = str(field.get("fieldId") or "")
        if not field_id:
            continue
        for key in ("name", "id"):
            alias = str(field.get(key) or "").strip()
            if alias:
                aliases[alias] = field_id

    sanitized_actions: list[dict] = []
    notes = [str(note) for note in plan.get("notes", []) if str(note).strip()]

    for action in plan.get("actions", []):
        if not isinstance(action, dict):
            notes.append("Dropped non-object action.")
            continue

        raw_field_id = str(action.get("fieldId") or "").strip()
        field_id = raw_field_id
        if field_id not in field_by_id and field_id in aliases:
            field_id = aliases[field_id]
            notes.append(f"Repaired action fieldId {raw_field_id!r} to {field_id!r}.")

        field = field_by_id.get(field_id)
        if field is None:
            notes.append(f"Dropped action for unknown fieldId {raw_field_id!r}.")
            continue

        confidence = str(action.get("confidence") or "low")
        if confidence not in VALID_CONFIDENCE:
            confidence = "low"

        source = str(action.get("source") or "human_review")
        if source not in VALID_SOURCE:
            source = "human_review"

        skip = action.get("skip") is True
        value = str(action.get("value") or "")
        option_text = str(action.get("optionText") or "")
        options = [str(option).strip() for option in field.get("options") or [] if str(option).strip()]

        if options and not skip:
            selected = option_text or value
            if selected in options:
                option_text = selected
                value = selected
            else:
                notes.append(f"Marked {field_id!r} for review because selected option {selected!r} was not available.")
                value = ""
                option_text = ""
                confidence = "low"
                source = "human_review"
                skip = True

        sensitive_context = _field_context(field)
        if any(term in sensitive_context for term in SENSITIVE_TERMS):
            if source not in {"explicit_profile", "insufficient_profile", "human_review"}:
                notes.append(f"Marked sensitive field {field_id!r} for review because source was {source!r}.")
                value = ""
                option_text = ""
                confidence = "low"
                source = "human_review"
                skip = True

        if _is_generic_optional_text_field(field) and not skip:
            selected_text = value or option_text
            has_explicit_answer = source == "explicit_profile" and _matches_explicit_generic_answer(
                selected_text,
                explicit_generic_answers,
            )
            has_relevant_profile_answer = source == "job_and_profile" and _has_relevant_profile_context(
                input_payload,
                selected_text,
            )
            if not has_explicit_answer and not has_relevant_profile_answer:
                notes.append(f"Skipped vague optional field {field_id!r}; no explicit answer or relevant profile experience was available.")
                value = ""
                option_text = ""
                confidence = "low"
                source = "human_review"
                skip = True

        sanitized_actions.append(
            {
                "fieldId": field_id,
                "value": value,
                "optionText": option_text,
                "confidence": confidence,
                "source": source,
                "skip": skip,
            }
        )

    return {"actions": sanitized_actions, "notes": notes}
