# ──────────────────────────────────────────────────────────────────
# AI Service — Florence-2 + FastAPI + ffmpeg
# Built on nvidia/cuda for GPU inference. Ollama and OpenAI relay are
# NOT bundled — they are external services reached via env-configured URLs.
# If OLLAMA_HOST / OPENAI_BASE_URL are unset or unreachable, those models
# are automatically dropped from the Settings dropdown.
# ──────────────────────────────────────────────────────────────────
FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu22.04

# Python 3.11 + ffmpeg + build tools for wheels with C extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY main.py .

# Florence-2 weights land here on first run (unless a host path is mounted
# via FLORENCE_MODEL_PATH). Mounted as a named volume in compose so the
# ~1.5 GB download happens once and survives container rebuilds.
ENV HF_HOME=/root/.cache/huggingface
RUN mkdir -p "$HF_HOME" /app/frames /app/annotated

EXPOSE 8100
CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100"]
