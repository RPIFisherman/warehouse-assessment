# ──────────────────────────────────────────────────────────────────
# AI Service — FastAPI + ffmpeg (GPU-optional)
#
# Runs in API-relay mode by default (OpenAI / Ollama). Florence-2
# requires a separate GPU-enabled image — see Dockerfile.gpu.
# ──────────────────────────────────────────────────────────────────
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY main.py .

RUN mkdir -p /app/frames /app/annotated

EXPOSE 8100
CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100"]
