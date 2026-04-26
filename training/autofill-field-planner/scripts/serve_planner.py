#!/usr/bin/env python3
"""Local dashboard and HTTP server for the ResumeATS autofill planner."""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from peft import PeftModel
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

from scripts.common import extract_json_object, format_inference_prompt, sanitize_planner_output


PROJECT_DIR = Path(__file__).resolve().parents[1]
RUNS_DIR = PROJECT_DIR / "runs"
DATA_DIR = PROJECT_DIR / "data"
CAPTURED_DATASET = DATA_DIR / "captured-examples.jsonl"
MODEL_ID = os.environ.get("AUTOFILL_MODEL_ID", "Qwen/Qwen2.5-1.5B-Instruct")
ADAPTER_DIR = Path(os.environ.get("AUTOFILL_ADAPTER_DIR", "runs/autofill-planner-lora"))
MAX_NEW_TOKENS = int(os.environ.get("AUTOFILL_MAX_NEW_TOKENS", "700"))

app = FastAPI(title="ResumeATS Autofill Planner", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
tokenizer = None
model = None
model_error: str | None = None


@dataclass
class TrainingJob:
    process: subprocess.Popen
    started_at: float
    log_path: Path
    metrics_path: Path
    output_dir: Path
    command: list[str]


training_job: TrainingJob | None = None


class PlanRequest(BaseModel):
    profile: dict
    job: dict
    fields: list[dict]
    page: dict | None = None


class TrainStartRequest(BaseModel):
    dataset: str = "data/examples.jsonl"
    model: str = MODEL_ID
    outputDir: str | None = None
    maxSteps: int = Field(default=10, ge=1, le=100000)
    epochs: float = Field(default=3.0, gt=0, le=100)
    maxLength: int = Field(default=768, ge=256, le=4096)
    saveSteps: int = Field(default=10, ge=1, le=100000)
    loggingSteps: int = Field(default=1, ge=1, le=100000)
    gradientAccumulationSteps: int = Field(default=1, ge=1, le=1024)
    fp16: bool = False
    bf16: bool = False


class DatasetExamplesRequest(BaseModel):
    examples: list[dict]
    dataset: str = "data/captured-examples.jsonl"


def resolve_project_path(value: str | Path) -> Path:
    path = Path(value)
    if not path.is_absolute():
        path = PROJECT_DIR / path
    resolved = path.resolve()
    if PROJECT_DIR not in resolved.parents and resolved != PROJECT_DIR:
        raise HTTPException(status_code=400, detail=f"Path must stay inside {PROJECT_DIR}: {value}")
    return resolved


def adapter_path() -> Path:
    if ADAPTER_DIR.is_absolute():
        return ADAPTER_DIR
    return PROJECT_DIR / ADAPTER_DIR


def unload_model() -> None:
    global tokenizer, model
    tokenizer = None
    model = None
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def load_model_once() -> None:
    global tokenizer, model, model_error
    if model is not None:
        return

    path = adapter_path()
    if not path.exists():
        model_error = f"Adapter directory does not exist: {path}"
        raise RuntimeError(model_error)

    try:
        tokenizer = AutoTokenizer.from_pretrained(str(path), trust_remote_code=True)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        quantization_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )
        base = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            quantization_config=quantization_config,
            device_map="auto",
            trust_remote_code=True,
        )
        model = PeftModel.from_pretrained(base, str(path))
        model.eval()
        model_error = None
    except Exception as exc:
        model_error = str(exc)
        unload_model()
        raise


@app.on_event("startup")
def startup_event() -> None:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    if adapter_path().exists():
        try:
            load_model_once()
        except Exception:
            pass


@app.get("/", response_class=HTMLResponse)
@app.get("/dashboard", response_class=HTMLResponse)
def dashboard() -> str:
    return DASHBOARD_HTML


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "model": MODEL_ID,
        "adapter": str(ADAPTER_DIR),
        "adapterExists": adapter_path().exists(),
        "modelLoaded": model is not None,
        "modelError": model_error,
        "cuda": torch.cuda.is_available(),
        "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    }


@app.post("/plan")
def plan(request: PlanRequest) -> dict:
    try:
        load_model_once()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Planner model is not loaded: {exc}") from exc

    payload = request.model_dump()
    prompt = format_inference_prompt(tokenizer, payload)
    encoded = tokenizer(prompt, return_tensors="pt").to(model.device)

    try:
        with torch.no_grad():
            output = model.generate(
                **encoded,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id,
            )
        generated = tokenizer.decode(output[0][encoded["input_ids"].shape[1]:], skip_special_tokens=True)
        return sanitize_planner_output(extract_json_object(generated), payload)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Planner returned invalid JSON: {exc}") from exc


@app.post("/train/start")
def start_training(request: TrainStartRequest) -> dict:
    global training_job
    if training_job and training_job.process.poll() is None:
        raise HTTPException(status_code=409, detail="A training job is already running")

    dataset = resolve_project_path(request.dataset)
    if not dataset.exists():
        raise HTTPException(status_code=400, detail=f"Dataset does not exist: {dataset}")

    timestamp = time.strftime("%Y%m%d-%H%M%S")
    output_dir = resolve_project_path(request.outputDir or f"runs/dashboard-{timestamp}-lora")
    log_path = RUNS_DIR / f"dashboard-{timestamp}.log"
    metrics_path = RUNS_DIR / f"dashboard-{timestamp}.metrics.jsonl"
    output_dir.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)

    unload_model()

    command = [
        sys.executable,
        "-u",
        "-m",
        "scripts.train_qlora",
        "--dataset",
        str(dataset.relative_to(PROJECT_DIR)),
        "--model",
        request.model,
        "--output-dir",
        str(output_dir.relative_to(PROJECT_DIR)),
        "--max-steps",
        str(request.maxSteps),
        "--epochs",
        str(request.epochs),
        "--max-length",
        str(request.maxLength),
        "--save-steps",
        str(request.saveSteps),
        "--logging-steps",
        str(request.loggingSteps),
        "--gradient-accumulation-steps",
        str(request.gradientAccumulationSteps),
        "--metrics-jsonl",
        str(metrics_path.relative_to(PROJECT_DIR)),
    ]
    if request.fp16:
        command.append("--fp16")
    if request.bf16:
        command.append("--bf16")

    log_handle = log_path.open("ab", buffering=0)
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
    process = subprocess.Popen(
        command,
        cwd=PROJECT_DIR,
        env=env,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    log_handle.close()

    training_job = TrainingJob(
        process=process,
        started_at=time.time(),
        log_path=log_path,
        metrics_path=metrics_path,
        output_dir=output_dir,
        command=command,
    )
    (RUNS_DIR / "dashboard-train.pid").write_text(str(process.pid), encoding="utf-8")
    return training_status()


@app.post("/train/stop")
def stop_training() -> dict:
    if not training_job or training_job.process.poll() is not None:
        return training_status()

    try:
        os.killpg(training_job.process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    return training_status()


@app.get("/train/status")
def training_status() -> dict:
    if not training_job:
        return {
            "running": False,
            "pid": None,
            "returnCode": None,
            "startedAt": None,
            "elapsedSeconds": 0,
            "outputDir": None,
            "logPath": None,
            "metricsPath": None,
            "lastMetric": None,
        }

    return_code = training_job.process.poll()
    return {
        "running": return_code is None,
        "pid": training_job.process.pid,
        "returnCode": return_code,
        "startedAt": training_job.started_at,
        "elapsedSeconds": round(time.time() - training_job.started_at, 1),
        "outputDir": str(training_job.output_dir),
        "logPath": str(training_job.log_path),
        "metricsPath": str(training_job.metrics_path),
        "command": training_job.command,
        "lastMetric": read_metrics(training_job.metrics_path, limit=1)[-1:] or None,
    }


@app.get("/train/logs")
def training_logs(lines: int = 200) -> dict:
    path = training_job.log_path if training_job else latest_run_file("*.log")
    return {
        "path": str(path) if path else None,
        "text": tail_text(path, max(1, min(lines, 2000))) if path else "",
    }


@app.get("/train/metrics")
def training_metrics(limit: int = 300) -> dict:
    path = training_job.metrics_path if training_job else latest_run_file("*.metrics.jsonl")
    return {
        "path": str(path) if path else None,
        "metrics": read_metrics(path, max(1, min(limit, 2000))) if path else [],
    }


@app.get("/dataset/status")
def dataset_status(dataset: str = "data/captured-examples.jsonl") -> dict:
    path = resolve_project_path(dataset)
    row_count = 0
    if path.exists():
        row_count = sum(1 for line in path.read_text(encoding="utf-8", errors="replace").splitlines() if line.strip())
    return {
        "path": str(path),
        "exists": path.exists(),
        "rows": row_count,
    }


@app.post("/dataset/examples")
def append_dataset_examples(request: DatasetExamplesRequest) -> dict:
    path = resolve_project_path(request.dataset)
    examples = [
        example for example in request.examples
        if isinstance(example, dict) and example.get("id") and example.get("input") and example.get("output")
    ]
    if not examples:
        raise HTTPException(status_code=400, detail="No valid examples were provided")

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for example in examples:
            handle.write(json.dumps(example, ensure_ascii=False, separators=(",", ":")) + "\n")

    return {
        "ok": True,
        "savedCount": len(examples),
        "dataset": str(path),
        "rows": dataset_status(str(path.relative_to(PROJECT_DIR)))["rows"],
    }


def latest_run_file(pattern: str) -> Path | None:
    files = sorted(RUNS_DIR.glob(pattern), key=lambda path: path.stat().st_mtime, reverse=True)
    return files[0] if files else None


def tail_text(path: Path, lines: int) -> str:
    if not path.exists():
        return ""
    data = path.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(data[-lines:])


def read_metrics(path: Path, limit: int) -> list[dict]:
    if not path.exists():
        return []
    rows: list[dict] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines()[-limit:]:
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


DASHBOARD_HTML = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ResumeATS Autofill Trainer</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1115;
      --panel: #181b21;
      --panel-2: #20242c;
      --text: #edf0f5;
      --muted: #9aa4b2;
      --border: #303640;
      --accent: #42d392;
      --warn: #ffcc66;
      --bad: #ff6b6b;
      --line: #5da9ff;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
      background: #14171d;
      position: sticky;
      top: 0;
      z-index: 2;
    }

    h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 650;
    }

    main {
      display: grid;
      grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
      gap: 16px;
      padding: 16px;
    }

    section {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      overflow: hidden;
    }

    section > h2 {
      margin: 0;
      padding: 10px 12px;
      background: var(--panel-2);
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      font-weight: 650;
    }

    .body { padding: 12px; }
    .stack { display: grid; gap: 12px; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .label { color: var(--muted); font-size: 12px; }
    .value { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
    .status { color: var(--accent); font-weight: 700; }
    .status.bad { color: var(--bad); }
    .status.warn { color: var(--warn); }

    button, input {
      border: 1px solid var(--border);
      border-radius: 6px;
      background: #12151a;
      color: var(--text);
      height: 34px;
      padding: 0 10px;
      font: inherit;
    }

    input { width: 100%; }
    button {
      cursor: pointer;
      background: #1f2934;
    }

    button.primary {
      background: #1e6a49;
      border-color: #2aa76f;
    }

    button.danger {
      background: #4c2025;
      border-color: #8b343d;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: .55;
    }

    pre {
      margin: 0;
      min-height: 420px;
      max-height: calc(100vh - 330px);
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      color: #d8dee9;
      background: #0b0d11;
      padding: 12px;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
    }

    canvas {
      width: 100%;
      height: 180px;
      display: block;
      background: #0b0d11;
      border-top: 1px solid var(--border);
    }

    .full { grid-column: 1 / -1; }
    .controls { display: grid; gap: 8px; }

    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <header>
    <h1>ResumeATS Autofill Trainer</h1>
    <div class="row">
      <span id="serverStatus" class="status warn">connecting</span>
      <button id="refreshBtn">Refresh</button>
    </div>
  </header>

  <main>
    <div class="stack">
      <section>
        <h2>Runtime</h2>
        <div class="body stack">
          <div class="row"><span class="label">CUDA</span><span id="cuda" class="value">-</span></div>
          <div class="row"><span class="label">Device</span><span id="device" class="value">-</span></div>
          <div class="row"><span class="label">Model</span><span id="model" class="value">-</span></div>
          <div class="row"><span class="label">Adapter</span><span id="adapter" class="value">-</span></div>
          <div class="row"><span class="label">Loaded</span><span id="loaded" class="value">-</span></div>
        </div>
      </section>

      <section>
        <h2>Start Training</h2>
        <div class="body controls">
          <label class="label" for="dataset">Dataset</label>
          <input id="dataset" value="data/examples.jsonl" />
          <div class="grid">
            <div>
              <label class="label" for="steps">Steps</label>
              <input id="steps" type="number" min="1" value="10" />
            </div>
            <div>
              <label class="label" for="length">Max len</label>
              <input id="length" type="number" min="256" value="768" />
            </div>
            <div>
              <label class="label" for="saveSteps">Save</label>
              <input id="saveSteps" type="number" min="1" value="10" />
            </div>
            <div>
              <label class="label" for="gradSteps">Grad acc</label>
              <input id="gradSteps" type="number" min="1" value="1" />
            </div>
          </div>
          <div class="row">
            <button id="startBtn" class="primary">Start</button>
            <button id="stopBtn" class="danger">Stop</button>
          </div>
        </div>
      </section>

      <section>
        <h2>Training Status</h2>
        <div class="body stack">
          <div class="row"><span class="label">State</span><span id="trainState" class="value">-</span></div>
          <div class="row"><span class="label">PID</span><span id="pid" class="value">-</span></div>
          <div class="row"><span class="label">Elapsed</span><span id="elapsed" class="value">-</span></div>
          <div class="row"><span class="label">Step</span><span id="step" class="value">-</span></div>
          <div class="row"><span class="label">Loss</span><span id="loss" class="value">-</span></div>
          <div class="row"><span class="label">Output</span><span id="outputDir" class="value">-</span></div>
        </div>
      </section>
    </div>

    <div class="stack">
      <section>
        <h2>Metrics</h2>
        <canvas id="chart" width="1200" height="260"></canvas>
      </section>

      <section>
        <h2>Live Logs</h2>
        <pre id="logs">Waiting for logs...</pre>
      </section>
    </div>
  </main>

  <script>
    const $ = (id) => document.getElementById(id);
    const state = { metrics: [] };

    async function jsonFetch(url, options) {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }

    function formatSeconds(value) {
      if (!value) return "-";
      const minutes = Math.floor(value / 60);
      const seconds = Math.floor(value % 60);
      return `${minutes}m ${seconds}s`;
    }

    function latestLogMetric(metrics) {
      for (let i = metrics.length - 1; i >= 0; i--) {
        if (metrics[i].event === "log") return metrics[i];
      }
      return null;
    }

    function drawChart(metrics) {
      const canvas = $("chart");
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#0b0d11";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const points = metrics
        .filter((m) => m.event === "log" && Number.isFinite(Number(m.loss)))
        .map((m) => ({ x: Number(m.step || 0), y: Number(m.loss) }));

      ctx.strokeStyle = "#303640";
      ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        const y = (canvas.height / 5) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      ctx.fillStyle = "#9aa4b2";
      ctx.font = "22px ui-monospace, Consolas, monospace";
      if (!points.length) {
        ctx.fillText("Waiting for loss metrics...", 24, 48);
        return;
      }

      const minX = Math.min(...points.map((p) => p.x));
      const maxX = Math.max(...points.map((p) => p.x));
      const minY = Math.min(...points.map((p) => p.y));
      const maxY = Math.max(...points.map((p) => p.y));
      const sx = (x) => 40 + ((x - minX) / Math.max(1, maxX - minX)) * (canvas.width - 80);
      const sy = (y) => 20 + (1 - ((y - minY) / Math.max(0.001, maxY - minY))) * (canvas.height - 60);

      ctx.strokeStyle = "#5da9ff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(sx(p.x), sy(p.y));
        else ctx.lineTo(sx(p.x), sy(p.y));
      });
      ctx.stroke();

      ctx.fillStyle = "#edf0f5";
      const last = points[points.length - 1];
      ctx.fillText(`loss ${last.y.toFixed(4)} at step ${last.x}`, 24, 48);
    }

    async function refresh() {
      try {
        const [health, status, logs, metrics] = await Promise.all([
          jsonFetch("/health"),
          jsonFetch("/train/status"),
          jsonFetch("/train/logs?lines=400"),
          jsonFetch("/train/metrics?limit=500")
        ]);

        $("serverStatus").textContent = "online";
        $("serverStatus").className = "status";
        $("cuda").textContent = String(health.cuda);
        $("device").textContent = health.device || "-";
        $("model").textContent = health.model;
        $("adapter").textContent = `${health.adapter} ${health.adapterExists ? "" : "(missing)"}`;
        $("loaded").textContent = health.modelLoaded ? "yes" : "no";

        $("trainState").textContent = status.running ? "running" : status.returnCode === 0 ? "finished" : status.returnCode === null ? "idle" : `failed (${status.returnCode})`;
        $("pid").textContent = status.pid || "-";
        $("elapsed").textContent = formatSeconds(status.elapsedSeconds);
        $("outputDir").textContent = status.outputDir || "-";

        state.metrics = metrics.metrics || [];
        const metric = latestLogMetric(state.metrics);
        $("step").textContent = metric ? String(metric.step || "-") : "-";
        $("loss").textContent = metric && metric.loss ? Number(metric.loss).toFixed(4) : "-";
        drawChart(state.metrics);

        $("logs").textContent = logs.text || "No logs yet.";
        $("logs").scrollTop = $("logs").scrollHeight;
        $("startBtn").disabled = status.running;
        $("stopBtn").disabled = !status.running;
      } catch (err) {
        $("serverStatus").textContent = "offline";
        $("serverStatus").className = "status bad";
        $("logs").textContent = String(err);
      }
    }

    async function startTraining() {
      const body = {
        dataset: $("dataset").value,
        maxSteps: Number($("steps").value),
        maxLength: Number($("length").value),
        saveSteps: Number($("saveSteps").value),
        loggingSteps: 1,
        gradientAccumulationSteps: Number($("gradSteps").value)
      };
      await jsonFetch("/train/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      await refresh();
    }

    async function stopTraining() {
      await jsonFetch("/train/stop", { method: "POST" });
      await refresh();
    }

    $("refreshBtn").addEventListener("click", refresh);
    $("startBtn").addEventListener("click", startTraining);
    $("stopBtn").addEventListener("click", stopTraining);
    refresh();
    setInterval(refresh, 1200);
  </script>
</body>
</html>
"""
