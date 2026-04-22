"""
AI Video Assessment sidecar — GPU-optional, multi-backend.

Supports three inference backends, switchable at runtime via POST /config:
  1. Florence-2 (local GPU) — fast (~1s/img), bounding boxes, requires NVIDIA CUDA
  2. Ollama qwen3-vl (external) — semantic understanding, via OLLAMA_HOST
  3. OpenAI-compatible API (external) — via OPENAI_BASE_URL (any provider)

When no NVIDIA GPU is detected (or torch is not installed), the service runs in
API-relay mode and defaults to the OpenAI or Ollama backend. Florence-2 is
automatically removed from the available models list.

Exposed endpoints:
  GET  /health              — liveness + model status + mode (gpu / api-relay)
  GET  /config              — current active model
  POST /config              — switch active model (runtime, no restart)
  POST /assess-video        — upload video + questions → per-frame analysis
                              (bboxes only with florence-2; API mode returns text findings)
  POST /describe-photos     — analyze photo(s) and generate a contextual AI comment
  GET  /frames/{sid}/{f}    — serve extracted / annotated frame images
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import shutil
import subprocess
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
# Load root .env first (shared config), then local .env overrides
load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(override=True)  # ai-service/.env can override if it exists

import httpx
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, ImageDraw

# GPU / Florence-2 support is optional. When torch+transformers are installed
# AND a CUDA GPU is present, Florence-2 loads into GPU for fast local inference.
# Otherwise the service runs in API-relay mode (OpenAI / Ollama only).
try:
    import torch
    from transformers import AutoModelForCausalLM, AutoProcessor
    HAS_GPU = torch.cuda.is_available()
except ImportError:
    torch = None  # type: ignore[assignment]
    AutoModelForCausalLM = None  # type: ignore[assignment,misc]
    AutoProcessor = None  # type: ignore[assignment,misc]
    HAS_GPU = False

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Florence-2 model path. Set FLORENCE_MODEL_PATH to a local snapshot dir or
# leave unset to download from HuggingFace Hub on first launch.
MODEL_PATH = os.environ.get("FLORENCE_MODEL_PATH", "microsoft/Florence-2-large")
BASE_DIR = Path(__file__).parent
FRAMES_DIR = BASE_DIR / "frames"
ANNOTATED_DIR = BASE_DIR / "annotated"
SESSION_TTL_SEC = 3600

# Shared secret for authenticating requests from the Express backend.
# The sidecar MUST NOT be called directly from the internet.
AI_SIDECAR_SECRET = os.environ.get("AI_SIDECAR_SECRET", "")
# Allowed base directory for photo_paths — prevents arbitrary file reads.
ALLOWED_PHOTO_DIR = os.environ.get("ALLOWED_PHOTO_DIR", str(Path(__file__).parent.parent / "backend" / "uploads"))

# Ollama (for qwen3-vl backend). Runtime-probed: if OLLAMA_HOST is unset OR
# the host isn't reachable, the qwen3-vl option is dropped from the available
# models list so the Settings dropdown doesn't show it.
OLLAMA_HOST = (os.environ.get("OLLAMA_HOST") or "").rstrip("/")
OLLAMA_VL_MODEL = os.environ.get("OLLAMA_VL_MODEL", "qwen3-vl:32b")
OLLAMA_TIMEOUT_SEC = 120
OLLAMA_ENABLED = bool(OLLAMA_HOST)

# OpenAI-compatible API relay (e.g. nginx → gpt-5.4 / gpt-4.1).
# Only enabled when OPENAI_BASE_URL is set. The relay may inject auth via nginx
# lua, so OPENAI_API_KEY can be a placeholder. We always use `stream: true`
# because some relays drop the `content` field in non-streaming responses.
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "").rstrip("/")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "managed-by-relay")
OPENAI_TIMEOUT_SEC = 120

# Active model — runtime-switchable via POST /config.
# AVAILABLE_MODELS is DYNAMIC — rebuilt on each /health via reachability probes.
# Florence-2 only appears when HAS_GPU is True.
# Ollama / OpenAI only appear when their env var is set AND the host is alive.
# _active_model is overridden in lifespan() when no GPU is present.
_active_model = "florence-2"
_models_cache: dict[str, Any] = {"models": [], "checked_at": 0.0}
_MODELS_CACHE_TTL_SEC = 10


async def _probe_reachable(url: str) -> bool:
    """Fast liveness probe — used to decide whether to list a backend model."""
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(url)
            return r.status_code < 500
    except Exception:
        return False


async def _list_available_models() -> list[str]:
    """Compute the live list of available models. Cached for 10s to avoid
    probing on every /health call while staying responsive to env changes."""
    now = time.time()
    if now - float(_models_cache["checked_at"]) < _MODELS_CACHE_TTL_SEC:
        return list(_models_cache["models"])

    models: list[str] = []
    if HAS_GPU:
        models.append("florence-2")
    if OLLAMA_ENABLED and await _probe_reachable(f"{OLLAMA_HOST}/api/version"):
        models.append(OLLAMA_VL_MODEL)
    if OPENAI_BASE_URL and await _probe_reachable(f"{OPENAI_BASE_URL}/models"):
        models.append(OPENAI_MODEL)

    _models_cache["models"] = models
    _models_cache["checked_at"] = now
    return models

# Keywords in questions that indicate the question is about a HAZARD (finding it = issue)
HAZARD_WORDS = {
    "hazard", "spill", "obstruct", "damage", "block", "leak", "crack",
    "dirty", "clutter", "expire", "unsafe", "broken", "wet",
}
# Keywords in questions that indicate the question is about a SAFETY MEASURE (NOT finding it = issue)
SAFETY_MEASURE_WORDS = {
    "accessible", "visible", "clear", "clean", "worn", "available",
    "intact", "working", "stocked", "posted", "secure", "adequate",
}

log = logging.getLogger("ai-service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")

# ---------------------------------------------------------------------------
# Model lifecycle
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _active_model

    if HAS_GPU:
        log.info("Loading Florence-2-large into GPU…")
        t0 = time.time()
        app.state.processor = AutoProcessor.from_pretrained(MODEL_PATH, trust_remote_code=True)
        app.state.model = (
            AutoModelForCausalLM.from_pretrained(
                MODEL_PATH, torch_dtype=torch.float16, trust_remote_code=True,
            )
            .to("cuda")
            .eval()
        )
        log.info("Model loaded in %.1fs", time.time() - t0)
    else:
        app.state.model = None
        app.state.processor = None
        log.info("No CUDA GPU — running in API-relay mode (OpenAI / Ollama)")
        # Default to an available external model
        if OPENAI_BASE_URL:
            _active_model = OPENAI_MODEL
            log.info("Default model: %s (OpenAI-compatible)", OPENAI_MODEL)
        elif OLLAMA_ENABLED:
            _active_model = OLLAMA_VL_MODEL
            log.info("Default model: %s (Ollama)", OLLAMA_VL_MODEL)
        else:
            _active_model = ""
            log.warning("No GPU and no external model configured — "
                        "set OPENAI_BASE_URL or OLLAMA_HOST in .env")

    FRAMES_DIR.mkdir(exist_ok=True)
    ANNOTATED_DIR.mkdir(exist_ok=True)
    yield
    log.info("Shutting down")


app = FastAPI(title="AI Assessment Sidecar", lifespan=lifespan)


from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware


class SidecarAuthMiddleware(BaseHTTPMiddleware):
    """Reject requests without a valid X-AI-Auth header (if secret is configured)."""
    async def dispatch(self, request: Request, call_next):
        # Health check is always public (for Docker healthcheck + frontend probe)
        if request.url.path == "/health":
            return await call_next(request)
        if AI_SIDECAR_SECRET:
            provided = request.headers.get("x-ai-auth", "")
            if provided != AI_SIDECAR_SECRET:
                return JSONResponse({"error": "unauthorized"}, status_code=401)
        return await call_next(request)


if AI_SIDECAR_SECRET:
    app.add_middleware(SidecarAuthMiddleware)
    log.info("Sidecar auth enabled (X-AI-Auth header required)")
else:
    log.warning("AI_SIDECAR_SECRET not set — sidecar is UNAUTHENTICATED (dev only)")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _cleanup_old_sessions() -> None:
    now = time.time()
    for d in [FRAMES_DIR, ANNOTATED_DIR]:
        if not d.exists():
            continue
        for child in d.iterdir():
            if child.is_dir() and (now - child.stat().st_mtime > SESSION_TTL_SEC):
                shutil.rmtree(child, ignore_errors=True)


def _extract_frames(video_path: Path, out_dir: Path, interval: int) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = str(out_dir / "frame_%04d.jpg")
    cmd = [
        "ffmpeg", "-y", "-i", str(video_path),
        "-vf", f"fps=1/{interval}",
        "-q:v", "2",
        pattern,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        log.error("ffmpeg error: %s", (result.stderr or "")[-500:])
        raise RuntimeError(f"ffmpeg failed (exit {result.returncode})")
    frames = sorted(out_dir.glob("frame_*.jpg"))
    log.info("Extracted %d frames", len(frames))
    return frames


def _run_inference(model: Any, processor: Any, image: Image.Image, task: str, text_input: str = "") -> dict:
    prompt = task + text_input
    inputs = processor(text=prompt, images=image, return_tensors="pt")
    inputs = {
        k: v.to("cuda", torch.float16) if v.dtype in (torch.float32, torch.float16) else v.to("cuda")
        for k, v in inputs.items()
    }
    with torch.no_grad():
        gen = model.generate(
            input_ids=inputs["input_ids"],
            pixel_values=inputs["pixel_values"],
            max_new_tokens=256,
            num_beams=3,
        )
    decoded = processor.batch_decode(gen, skip_special_tokens=False)[0]
    parsed = processor.post_process_generation(decoded, task=task, image_size=(image.width, image.height))
    return parsed


def _question_to_phrase(question: str) -> str:
    """
    Extract a grounding phrase from an assessment question.
    "Are fire extinguishers accessible and visible?" → "fire extinguisher"
    "Are there any spills on the floor?" → "spill on the floor"
    "Is PPE being worn by workers?" → "PPE"
    """
    q = question.lower().strip().rstrip("?").rstrip(".")
    # Strip common question prefixes
    for prefix in [
        "are there any ", "are there ", "are the ", "are ",
        "is there any ", "is there a ", "is there ", "is the ", "is ",
        "do the ", "does the ", "do ", "does ",
        "can you see any ", "can you see ", "check if ", "check for ",
    ]:
        if q.startswith(prefix):
            q = q[len(prefix):]
            break
    # Strip trailing modifiers
    for suffix in [
        " being worn", " being used", " in place", " on the floor",
        " by workers", " by staff", " properly", " correctly",
    ]:
        if q.endswith(suffix):
            q = q[: -len(suffix)]
    return q.strip() or question.strip().rstrip("?")


def _is_hazard_question(question: str) -> bool:
    """Does this question ask about the PRESENCE of a hazard?"""
    lower = question.lower()
    return any(w in lower for w in HAZARD_WORDS)


def _caption_mentions_issue(caption: str, question: str) -> tuple[bool, str]:
    """
    Check if the caption text suggests an issue related to the question.
    Returns (has_issue, explanation).
    """
    caption_lower = caption.lower()
    q_lower = question.lower()

    # Look for explicit problem words in caption
    problem_indicators = ["spill", "wet", "block", "obstruct", "damage", "crack", "broken",
                          "missing", "dirty", "clutter", "hazard", "unsafe", "leak"]
    for word in problem_indicators:
        if word in caption_lower and word in q_lower:
            return True, f"Caption mentions '{word}'"

    return False, ""


async def _call_ollama_vl(prompt: str, image: Image.Image) -> str:
    """
    Call qwen3-vl via Ollama /api/generate. Returns the raw text response.
    Raises on any HTTP/network error — the caller decides how to fall back.
    """
    # Encode image as base64 JPEG (Ollama accepts base64-encoded image bytes)
    from io import BytesIO
    buf = BytesIO()
    image.convert("RGB").save(buf, format="JPEG", quality=85)
    img_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    payload = {
        "model": OLLAMA_VL_MODEL,
        "prompt": prompt,
        "images": [img_b64],
        "stream": False,
        "options": {"temperature": 0.2},  # lower temp for deterministic descriptions
    }
    async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SEC) as client:
        resp = await client.post(f"{OLLAMA_HOST}/api/generate", json=payload)
        resp.raise_for_status()
        data = resp.json()
        return str(data.get("response", "")).strip()


async def _call_openai_vision(prompt: str, image: Image.Image) -> str:
    """
    Call an OpenAI-compatible vision model via the nginx relay.
    Uses streaming because the relay drops `content` in non-streaming responses.
    Collects SSE delta chunks and concatenates the result.
    """
    from io import BytesIO
    buf = BytesIO()
    image.convert("RGB").save(buf, format="JPEG", quality=85)
    img_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    payload = {
        "model": OPENAI_MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
            ],
        }],
        "max_tokens": 300,
        "temperature": 0.2,
        "stream": True,
    }
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    content_parts: list[str] = []
    async with httpx.AsyncClient(timeout=OPENAI_TIMEOUT_SEC) as client:
        async with client.stream("POST", f"{OPENAI_BASE_URL}/chat/completions", json=payload, headers=headers) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    text = delta.get("content", "")
                    if text:
                        content_parts.append(text)
                except json.JSONDecodeError:
                    continue

    return "".join(content_parts)


def _draw_bboxes(image: Image.Image, bboxes: list[list[float]], labels: list[str], color: str = "#ef4444") -> Image.Image:
    annotated = image.copy()
    draw = ImageDraw.Draw(annotated)
    for bbox, label in zip(bboxes, labels):
        x1, y1, x2, y2 = [int(c) for c in bbox]
        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
        text_bbox = draw.textbbox((x1, y1 - 16), label)
        draw.rectangle([text_bbox[0] - 2, text_bbox[1] - 2, text_bbox[2] + 2, text_bbox[3] + 2], fill=color)
        draw.text((x1, y1 - 16), label, fill="white")
    return annotated


async def _assess_frame_via_api(image: Image.Image, questions: list[str]) -> dict:
    """
    Assess a single frame using the active VLM API (OpenAI or Ollama).
    Returns {"caption": str, "findings": [{question, has_issue, severity, answer}]}.
    Bounding boxes are not supported in API mode.
    """
    questions_text = "\n".join(f"- {q}" for q in questions)
    prompt = (
        "You are a warehouse safety inspector analyzing a video frame.\n\n"
        "1. Describe the scene in detail.\n"
        "2. Evaluate each question and determine if there is an issue.\n\n"
        f"Questions:\n{questions_text}\n\n"
        "Respond ONLY with valid JSON (no markdown fences, no extra text):\n"
        '{"caption": "detailed scene description", "findings": ['
        '{"question": "original question text", "has_issue": true/false, '
        '"severity": "ok" or "low" or "medium" or "high", '
        '"answer": "1-2 sentence explanation"}]}'
    )

    raw = ""
    try:
        if _active_model == OLLAMA_VL_MODEL:
            raw = await _call_ollama_vl(prompt, image)
        else:
            raw = await _call_openai_vision(prompt, image)

        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```\w*\n?", "", cleaned)
            cleaned = re.sub(r"\n?```$", "", cleaned)
        return json.loads(cleaned)
    except (json.JSONDecodeError, Exception) as exc:
        log.warning("API assessment JSON parse failed: %s — raw: %.200s", exc, raw)
        return {
            "caption": raw if isinstance(raw, str) else "",
            "findings": [
                {"question": q, "has_issue": False, "severity": "ok",
                 "answer": "Unable to parse model response"}
                for q in questions
            ],
        }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    model_loaded = HAS_GPU and hasattr(app.state, "model") and app.state.model is not None
    gpu = "none"
    if HAS_GPU and torch is not None:
        gpu = torch.cuda.get_device_name(0)
    available = await _list_available_models()
    return {
        "status": "ok",
        "model_loaded": model_loaded,
        "gpu": gpu,
        "active_model": _active_model,
        "available_models": available,
        "mode": "gpu" if HAS_GPU else "api-relay",
    }


@app.get("/config")
async def get_config():
    available = await _list_available_models()
    return {"active_model": _active_model, "available_models": available}


@app.post("/config")
async def set_config(payload: dict):
    global _active_model
    requested = payload.get("model", "")
    available = await _list_available_models()
    if requested not in available:
        return JSONResponse(
            {"error": f"unknown or unreachable model '{requested}'", "available": available},
            status_code=400,
        )
    # Reachability checks so user gets immediate signal on switch
    if requested == OLLAMA_VL_MODEL:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{OLLAMA_HOST}/api/version")
                r.raise_for_status()
        except Exception as e:
            return JSONResponse(
                {"error": f"ollama unreachable at {OLLAMA_HOST}: {e}"},
                status_code=503,
            )
    elif requested != "florence-2" and OPENAI_BASE_URL:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{OPENAI_BASE_URL}/models", headers={"Authorization": f"Bearer {OPENAI_API_KEY}"})
                r.raise_for_status()
        except Exception as e:
            return JSONResponse(
                {"error": f"OpenAI relay unreachable at {OPENAI_BASE_URL}: {e}"},
                status_code=503,
            )
    _active_model = requested
    log.info("Active model switched to: %s", _active_model)
    return {"active_model": _active_model}


@app.post("/assess-video")
async def assess_video(
    video: UploadFile = File(...),
    questions: str = Form('["Are there any safety hazards?"]'),
    frame_interval: int = Form(3),
):
    _cleanup_old_sessions()
    session_id = str(uuid.uuid4())[:12]
    question_list: list[str] = json.loads(questions)

    if not question_list:
        return JSONResponse({"error": "at least one question required"}, status_code=400)

    # Save uploaded video
    session_frames = FRAMES_DIR / session_id
    session_annotated = ANNOTATED_DIR / session_id
    session_frames.mkdir(parents=True, exist_ok=True)
    session_annotated.mkdir(parents=True, exist_ok=True)

    video_path = session_frames / f"input{Path(video.filename or 'v.mp4').suffix}"
    with open(video_path, "wb") as f:
        content = await video.read()
        f.write(content)
    log.info("Session %s: saved video (%d bytes)", session_id, len(content))

    # Extract frames
    try:
        frame_paths = _extract_frames(video_path, session_frames, frame_interval)
    except RuntimeError as e:
        return JSONResponse({"error": str(e)}, status_code=422)

    if not frame_paths:
        return JSONResponse({"error": "no frames extracted — video may be too short"}, status_code=422)

    use_florence = _active_model == "florence-2" and HAS_GPU
    model = app.state.model if use_florence else None
    processor = app.state.processor if use_florence else None
    results = []

    for fi, fpath in enumerate(frame_paths):
        image = Image.open(fpath).convert("RGB")
        timestamp = fi * frame_interval
        frame_result: dict[str, Any] = {
            "frame_index": fi,
            "timestamp_sec": timestamp,
            "frame_url": f"/api/ai/frames/{session_id}/{fpath.name}",
            "status": "ok",
            "caption": "",
            "findings": [],
        }

        if use_florence:
            # ── Florence-2 path (GPU): grounding + bboxes ──
            caption_out = _run_inference(model, processor, image, "<DETAILED_CAPTION>")
            caption = caption_out.get("<DETAILED_CAPTION>", "")
            if isinstance(caption, dict):
                caption = str(caption)
            frame_result["caption"] = caption

            for qi, question in enumerate(question_list):
                phrase = _question_to_phrase(question)
                is_hazard_q = _is_hazard_question(question)

                grounding_out = _run_inference(
                    model, processor, image,
                    "<CAPTION_TO_PHRASE_GROUNDING>", phrase,
                )
                grounding_data = grounding_out.get("<CAPTION_TO_PHRASE_GROUNDING>", {})
                bboxes = grounding_data.get("bboxes", [])
                labels = grounding_data.get("labels", [phrase] * len(bboxes))

                caption_issue, caption_explanation = _caption_mentions_issue(caption, question)

                has_issue = False
                severity = "ok"
                answer = ""

                if is_hazard_q:
                    if bboxes or caption_issue:
                        has_issue = True
                        severity = "high" if len(bboxes) > 1 else "medium"
                        answer = f"Detected: {phrase} found in frame" + (f". {caption_explanation}" if caption_explanation else "")
                    else:
                        answer = f"No {phrase} detected — appears OK"
                else:
                    if bboxes:
                        answer = f"{phrase.title()} detected in frame — OK"
                    else:
                        phrase_in_caption = any(w in caption.lower() for w in phrase.lower().split() if len(w) > 3)
                        if phrase_in_caption:
                            answer = "Caption mentions related elements — review recommended"
                            severity = "low"
                        else:
                            has_issue = True
                            severity = "medium"
                            answer = f"{phrase.title()} not clearly detected — review recommended"

                if has_issue:
                    frame_result["status"] = "issue"

                finding: dict[str, Any] = {
                    "question": question,
                    "answer": answer,
                    "has_issue": has_issue,
                    "severity": severity,
                    "grounding_phrase": phrase,
                }

                if bboxes:
                    color = "#ef4444" if has_issue else "#22c55e"
                    annotated = _draw_bboxes(image, bboxes, labels, color=color)
                    ann_name = f"annotated_{fi:04d}_q{qi}.jpg"
                    ann_path = session_annotated / ann_name
                    annotated.save(ann_path, quality=85)
                    finding["annotated_url"] = f"/api/ai/frames/{session_id}/{ann_name}"
                    finding["bboxes"] = [[int(c) for c in b] for b in bboxes]

                frame_result["findings"].append(finding)

        else:
            # ── API path (OpenAI / Ollama): no bboxes ──
            api_data = await _assess_frame_via_api(image, question_list)
            frame_result["caption"] = api_data.get("caption", "")

            api_findings = api_data.get("findings", [])
            for qi, question in enumerate(question_list):
                # Match API finding to question by index (prompt preserves order)
                if qi < len(api_findings):
                    af = api_findings[qi]
                    has_issue = bool(af.get("has_issue", False))
                    severity = af.get("severity", "ok")
                    answer = af.get("answer", "")
                else:
                    has_issue = False
                    severity = "ok"
                    answer = "No assessment available"

                if has_issue:
                    frame_result["status"] = "issue"

                frame_result["findings"].append({
                    "question": question,
                    "answer": answer,
                    "has_issue": has_issue,
                    "severity": severity,
                    "grounding_phrase": _question_to_phrase(question),
                })

        results.append(frame_result)
        log.info(
            "Session %s: frame %d/%d done (%s)",
            session_id, fi + 1, len(frame_paths), frame_result["status"],
        )

    total_issues = sum(1 for r in results if r["status"] == "issue")
    return {
        "session_id": session_id,
        "total_frames": len(results),
        "total_issues": total_issues,
        "results": results,
    }


@app.post("/describe-photos")
async def describe_photos(payload: dict):
    """
    Analyze one or more photos and generate a contextual AI comment.

    Called by the Express backend when an assessor saves an issue with photos
    but leaves the comment empty. Returns a formatted description prefixed
    with [AI Comment] that gets stored as the issue's comment.

    Request body:
      {
        "photo_paths": ["/abs/path/to/photo1.jpg", ...],
        "context": {
          "checklist_label": "Fire extinguisher accessible",
          "zone_name": "Receiving Area",
          "severity": "HIGH"
        }
      }
    Response:
      { "comment": "[AI Comment] ...", "confident": true }
    """
    photo_paths = payload.get("photo_paths", [])
    context = payload.get("context", {})
    checklist_label = context.get("checklist_label", "")
    zone_name = context.get("zone_name", "")
    severity = context.get("severity", "")

    if not photo_paths:
        return JSONResponse({"error": "no photo_paths provided"}, status_code=400)

    model = app.state.model
    processor = app.state.processor
    captions: list[str] = []

    # Build a qwen3-vl prompt that's grounded in the assessment context.
    # This is the "delicate prompt that relates to the field they entered"
    # — it gives the VLM the checklist context so its description is relevant.
    qwen_prompt = (
        f"You are reviewing a warehouse safety assessment photo.\n"
        f"Zone: {zone_name or 'unknown'}\n"
        f"Checklist item: {checklist_label or 'general inspection'}\n"
        f"Flagged severity: {severity or 'not specified'}\n\n"
        f"In 1-2 sentences, describe what you see that is relevant to the "
        f"checklist item above. Mention any hazards, damage, or concerns "
        f"visible. If the photo does not clearly show anything related to "
        f"the checklist item, reply exactly: NOT SURE"
    )

    allowed_base = Path(ALLOWED_PHOTO_DIR).resolve()
    for path_str in photo_paths:
        p = Path(path_str).resolve()
        # Security: reject paths outside the allowed uploads directory
        if not str(p).startswith(str(allowed_base)):
            log.warning("describe-photos: path outside allowed dir: %s", path_str)
            continue
        if not p.exists() or not p.is_file():
            log.warning("describe-photos: file not found: %s", path_str)
            continue
        try:
            image = Image.open(p).convert("RGB")
            if _active_model == "florence-2" and HAS_GPU:
                cap_out = _run_inference(model, processor, image, "<DETAILED_CAPTION>")
                cap = cap_out.get("<DETAILED_CAPTION>", "")
                if isinstance(cap, dict):
                    cap = str(cap)
            elif _active_model == OLLAMA_VL_MODEL:
                cap = await _call_ollama_vl(qwen_prompt, image)
            elif OPENAI_BASE_URL:
                # OpenAI-compatible relay (gpt-4.1, gpt-5, etc.)
                cap = await _call_openai_vision(qwen_prompt, image)
            cap = cap.strip() if isinstance(cap, str) else ""
            # Respect the "not sure → say nothing" contract
            if cap and cap.upper().strip().rstrip(".") != "NOT SURE":
                captions.append(cap)
        except Exception as e:
            log.warning("describe-photos: inference failed for %s: %s", path_str, e)

    if not captions:
        return {"comment": None, "confident": False}

    # Build the formatted comment with assessment context
    parts: list[str] = []
    if len(captions) == 1:
        parts.append(captions[0])
    else:
        for i, cap in enumerate(captions, 1):
            parts.append(f"Photo {i}: {cap}")

    description = " ".join(parts) if len(captions) == 1 else "\n".join(parts)

    # Check relevance: does the caption mention anything related to the checklist item?
    label_words = set(w.lower() for w in checklist_label.split() if len(w) > 3)
    caption_lower = description.lower()
    relevant = any(w in caption_lower for w in label_words) if label_words else True

    if not relevant and len(captions) == 1 and len(captions[0]) < 20:
        # Too short and unrelated — not confident
        return {"comment": None, "confident": False}

    # Format with context header
    context_header = ""
    if zone_name and checklist_label:
        context_header = f"{zone_name} — {checklist_label}"
        if severity:
            context_header += f" ({severity})"
        context_header += ": "

    comment = f"[AI Comment] {context_header}{description}"
    return {"comment": comment, "confident": True, "model_used": _active_model}


@app.get("/frames/{session_id}/{filename}")
async def serve_frame(session_id: str, filename: str):
    for base in [FRAMES_DIR, ANNOTATED_DIR]:
        path = base / session_id / filename
        if path.exists() and path.is_file():
            return FileResponse(path, media_type="image/jpeg")
    return JSONResponse({"error": "not found"}, status_code=404)
