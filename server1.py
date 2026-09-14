#!/usr/bin/env python3
"""
server1.py - Local MLX Model API Microservice (Phase 2 Air-Gapped Sovereign Engine)

Serves two quantized models on Apple Silicon unified memory:
1. Qwen2.5-VL-3B (Vision / OCR Engine) for diagrams, P&IDs, and scanned inspection logs.
2. Qwen3.5-4B (Reasoning & Coding Engine) for Chain-of-Thought (<think>) audits and Python math.

Endpoints:
- GET  /health               : Model inventory, memory status, and health check.
- POST /describe             : Multimodal image upload OCR / description.
- POST /v1/chat/completions  : OpenAI-compatible endpoint (routes text and images automatically).
- POST /generate             : Simple generation endpoint (Ollama-compatible /api/generate).
"""

import os
import sys
import time
import base64
import tempfile
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Ensure project root is accessible
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

# MLX VLM Imports
from mlx_vlm import load, generate
from mlx_vlm.prompt_utils import apply_chat_template
from mlx_vlm.utils import load_config, load_image

app = FastAPI(
    title="Local MLX Sovereign Inference API",
    description="High-performance Apple Silicon microservice for Qwen2.5-VL-3B & Qwen3.5-4B (Team rv2)",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Model Registry & Lazy Loader
# ---------------------------------------------------------------------------
MODEL_CONFIGS = {
    "vision": {
        "id": "qwen2.5-vl-3b",
        "alias": "vision-engine",
        "path": os.environ.get("VISION_MODEL_PATH", os.path.expanduser("~/qwen-vl-3b-4bit")),
        "description": "Qwen2.5-VL-3B 4-bit (Vision / Scanned Inspection Document Parser)"
    },
    "reasoning": {
        "id": "qwen3.5-4b",
        "alias": "reasoning-engine",
        "path": os.environ.get("REASONING_MODEL_PATH", os.path.expanduser("~/Desktop/Qwen3.5-4B-MLX-4bit")),
        "description": "Qwen3.5-4B 4-bit (Reasoning & Coding Engine)"
    }
}

_loaded_models: Dict[str, Dict[str, Any]] = {}


def get_model(model_type: str = "reasoning"):
    """
    Lazily loads and caches the requested MLX model in Apple Silicon unified memory.
    model_type: 'vision' or 'reasoning'
    """
    key = "vision" if "vision" in model_type.lower() or "vl" in model_type.lower() else "reasoning"
    
    if key in _loaded_models:
        return _loaded_models[key]

    target_config = MODEL_CONFIGS[key]
    model_path = target_config["path"]

    if not os.path.exists(model_path):
        raise HTTPException(
            status_code=500,
            detail=f"Model directory not found at '{model_path}'. Check local model path."
        )

    print(f"[MLX] Loading {target_config['id']} from {model_path} into unified memory...", flush=True)
    start_t = time.time()
    model, processor = load(model_path)
    config = load_config(model_path)
    elapsed = time.time() - start_t
    print(f"[MLX] {target_config['id']} loaded successfully in {elapsed:.2f}s.", flush=True)

    _loaded_models[key] = {
        "model": model,
        "processor": processor,
        "config": config,
        "id": target_config["id"],
        "alias": target_config["alias"],
        "path": model_path
    }
    return _loaded_models[key]


# ---------------------------------------------------------------------------
# Request & Response Schemas
# ---------------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: str
    content: Any  # Can be str or list of content dicts (text, image_url)


class ChatCompletionRequest(BaseModel):
    model: Optional[str] = "reasoning-engine"
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.1
    max_tokens: Optional[int] = 1024
    stream: Optional[bool] = False


class GenerateRequest(BaseModel):
    prompt: str
    model: Optional[str] = "reasoning-engine"
    system_prompt: Optional[str] = None
    temperature: Optional[float] = 0.1
    max_tokens: Optional[int] = 1024


# ---------------------------------------------------------------------------
# Core Inference Helpers
# ---------------------------------------------------------------------------
def _extract_text_and_images_from_messages(messages: List[ChatMessage]):
    """Extract flat text prompt and any base64/file images from OpenAI chat messages."""
    text_parts = []
    images = []

    for msg in messages:
        role_label = msg.role.capitalize()
        if isinstance(msg.content, str):
            text_parts.append(f"{role_label}: {msg.content}")
        elif isinstance(msg.content, list):
            for part in msg.content:
                if isinstance(part, dict):
                    if part.get("type") == "text":
                        text_parts.append(f"{role_label}: {part.get('text', '')}")
                    elif part.get("type") == "image_url":
                        url = part.get("image_url", {}).get("url", "")
                        if url.startswith("data:image"):
                            # Decode base64 image to temp file
                            try:
                                header, encoded = url.split(",", 1)
                                ext = ".png"
                                if "jpeg" in header or "jpg" in header:
                                    ext = ".jpg"
                                img_bytes = base64.b64decode(encoded)
                                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
                                tmp.write(img_bytes)
                                tmp.close()
                                images.append(tmp.name)
                            except Exception as e:
                                print(f"[MLX] Warning: Failed to decode base64 image: {e}")
                        elif os.path.isfile(url):
                            images.append(url)

    combined_prompt = "\n".join(text_parts)
    return combined_prompt, images


def _run_inference(model_entry: dict, prompt: str, image_path: Optional[str] = None,
                   max_tokens: int = 1024, temperature: float = 0.1) -> dict:
    """Execute inference on the MLX model with optional image conditioning."""
    model = model_entry["model"]
    processor = model_entry["processor"]
    config = model_entry["config"]

    num_images = 1 if image_path else 0
    formatted_prompt = apply_chat_template(
        processor, config, prompt, num_images=num_images
    )

    image_obj = load_image(image_path) if image_path else None

    start_time = time.time()
    output = generate(
        model,
        processor,
        prompt=formatted_prompt,
        image=image_obj,
        max_tokens=max_tokens,
        temperature=temperature,
        repetition_penalty=1.1,
        repetition_context_size=20,
        verbose=False,
    )
    elapsed = time.time() - start_time
    text = output.text if hasattr(output, "text") else str(output)
    tps = round(output.generation_tps, 1) if hasattr(output, "generation_tps") else 0.0
    tokens = output.generation_tokens if hasattr(output, "generation_tokens") else 0

    return {
        "text": text,
        "generation_tps": tps,
        "tokens": tokens,
        "duration_sec": round(elapsed, 2)
    }


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------
@app.get("/")
def root():
    return {
        "message": "Local MLX Sovereign Inference API is online.",
        "team": "rv2",
        "phase": "Phase 2 (100% Air-Gapped Sovereign Execution)",
        "models": {k: v["id"] for k, v in MODEL_CONFIGS.items()}
    }


@app.get("/health")
def health():
    """Health status check and model availability."""
    models_status = {}
    for k, v in MODEL_CONFIGS.items():
        models_status[k] = {
            "id": v["id"],
            "alias": v["alias"],
            "path": v["path"],
            "exists_on_disk": os.path.exists(v["path"]),
            "is_loaded": k in _loaded_models
        }
    return {
        "status": "online",
        "hardware": "Apple Silicon (MLX Unified Memory)",
        "airgap_compliant": True,
        "zero_wan_egress": True,
        "models": models_status
    }


@app.post("/describe")
async def describe_image(
    image: UploadFile = File(...),
    prompt: str = Form("Extract all text, tables, inspection points, and metadata from this document accurately.")
):
    """
    Direct multimodal inspection endpoint (Qwen2.5-VL).
    Ingests an uploaded scan, drawing, or photo and extracts structured data.
    """
    try:
        suffix = os.path.splitext(image.filename)[1] or ".png"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await image.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            model_entry = get_model("vision")
            result = _run_inference(
                model_entry=model_entry,
                prompt=prompt,
                image_path=tmp_path,
                max_tokens=1500,
                temperature=0.1
            )
            return {
                "description": result["text"],
                "model": model_entry["id"],
                "generation_tps": result["generation_tps"],
                "tokens": result["tokens"],
                "duration_sec": result["duration_sec"]
            }
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"MLX Vision inference error: {str(e)}")


@app.post("/v1/chat/completions")
async def chat_completions(req: ChatCompletionRequest):
    """
    OpenAI-compatible chat completions endpoint.
    Automatically routes between Vision (Qwen2.5-VL) and Reasoning/Coding (Qwen3.5-4B).
    """
    try:
        prompt, images = _extract_text_and_images_from_messages(req.messages)
        
        if images or (req.model and ("vision" in req.model.lower() or "vl" in req.model.lower())):
            model_type = "vision"
            image_path = images[0] if images else None
        else:
            model_type = "reasoning"
            image_path = None

        model_entry = get_model(model_type)
        result = _run_inference(
            model_entry=model_entry,
            prompt=prompt,
            image_path=image_path,
            max_tokens=req.max_tokens or 1024,
            temperature=req.temperature if req.temperature is not None else 0.1
        )

        for img in images:
            if img.startswith(tempfile.gettempdir()) and os.path.exists(img):
                try:
                    os.remove(img)
                except Exception:
                    pass

        return {
            "id": f"chatcmpl-{int(time.time())}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model_entry["id"],
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": result["text"]
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": len(prompt) // 4,
                "completion_tokens": result["tokens"],
                "total_tokens": (len(prompt) // 4) + result["tokens"]
            },
            "system_fingerprint": "mlx-apple-silicon"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"MLX Completion error: {str(e)}")


@app.post("/generate")
@app.post("/api/generate")
async def generate_text(req: GenerateRequest):
    """
    Simple text generation endpoint (also compatible with Ollama /api/generate format).
    """
    try:
        full_prompt = f"{req.system_prompt}\n\n{req.prompt}" if req.system_prompt else req.prompt
        model_type = "vision" if req.model and ("vision" in req.model.lower() or "vl" in req.model.lower()) else "reasoning"
        
        model_entry = get_model(model_type)
        result = _run_inference(
            model_entry=model_entry,
            prompt=full_prompt,
            image_path=None,
            max_tokens=req.max_tokens or 1024,
            temperature=req.temperature if req.temperature is not None else 0.1
        )
        return {
            "response": result["text"],
            "model": model_entry["id"],
            "done": True,
            "tokens": result["tokens"],
            "duration_sec": result["duration_sec"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MLX Generation error: {str(e)}")


if __name__ == "__main__":
    port = int(os.environ.get("MLX_PORT", 5001))
    print(f"Starting Local MLX Sovereign Server on port {port}...", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")