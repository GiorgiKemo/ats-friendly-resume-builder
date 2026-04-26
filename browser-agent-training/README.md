# ResumeATS Autofill Trainer Extension

This is a training-only copy of `browser-agent`. Load this folder as an unpacked extension when you want to collect autofill correction examples.

It uses separate Chrome extension storage keys from production, so it will not overwrite the production extension's cached profile, queue, or job state.

## How To Use

1. Keep the local trainer server running:

   ```text
   http://127.0.0.1:8787/dashboard
   ```

2. Open Chrome extensions:

   ```text
   chrome://extensions
   ```

3. Enable Developer mode.
4. Click "Load unpacked".
5. Select this folder:

   ```text
   browser-agent-training
   ```

6. Use the trainer extension to run Autofill on a job application.
7. Correct any wrong fields manually.
8. In the bottom-right "Autofill Trainer" panel, click "Save corrections".

Saved corrections are appended to:

```text
training/autofill-field-planner/data/captured-examples.jsonl
```

That file is git-ignored because it may contain personal profile data and job application answers.

## What Gets Recorded

The trainer records only after the trainer extension runs autofill on a page. It stores one JSONL training example per corrected field:

- candidate profile context,
- job/page context,
- normalized field descriptor,
- model/autofill value before correction,
- your corrected target value.

The production `browser-agent` extension is not changed by this folder.
