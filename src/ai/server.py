import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Iterator, List, Optional

import ollama
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
STATIC_DIR = ROOT / "static"

app = FastAPI(title="Local AI Chat", version="1.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ollama")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatOptions(BaseModel):
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    top_p: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    top_k: Optional[int] = Field(default=None, ge=0)
    num_predict: Optional[int] = Field(default=None, ge=1)
    num_ctx: Optional[int] = Field(default=None, ge=256)
    seed: Optional[int] = None
    repeat_penalty: Optional[float] = Field(default=None, ge=0.0, le=2.0)

    def to_ollama(self) -> dict:
        mapping = {
            "temperature": "temperature",
            "top_p": "top_p",
            "top_k": "top_k",
            "num_predict": "num_predict",
            "num_ctx": "num_ctx",
            "seed": "seed",
            "repeat_penalty": "repeat_penalty",
        }
        return {k: v for k, v in ((dst, getattr(self, src)) for src, dst in mapping.items()) if v is not None}


class ChatRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    stream: bool = True
    show_thinking: bool = False
    options: Optional[ChatOptions] = None


class ModelInfo(BaseModel):
    name: str
    size: str
    family: str
    parameter_size: str
    quantization: str
    modified: str


@app.get("/api/health")
async def health():
    try:
        await asyncio.get_running_loop().run_in_executor(executor, ollama.list)
        return {"status": "ok", "ollama": "connected"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama unreachable: {exc}") from exc


@app.get("/api/models", response_model=List[ModelInfo])
async def list_models():
    try:
        listing = await asyncio.get_running_loop().run_in_executor(executor, ollama.list)
    except Exception:
        return []

    models = []
    for m in listing.models:
        details = m.details
        models.append(
            ModelInfo(
                name=m.model,
                size=f"{m.size / (1024 ** 3):.1f} GB" if m.size else "unknown",
                family=details.family if details else "unknown",
                parameter_size=details.parameter_size if details else "unknown",
                quantization=details.quantization_level if details else "unknown",
                modified=m.modified_at.strftime("%Y-%m-%d") if m.modified_at else "unknown",
            )
        )
    models.sort(key=lambda x: x.name)
    return models


def _stats_from(chunk: dict) -> dict:
    eval_count = chunk.get("eval_count") or 0
    eval_ns = chunk.get("eval_duration") or 0
    prompt_count = chunk.get("prompt_eval_count") or 0
    load_ns = chunk.get("load_duration") or 0
    return {
        "tokens": eval_count,
        "prompt_tokens": prompt_count,
        "tokens_per_second": round(eval_count / (eval_ns / 1e9), 1) if eval_ns else 0.0,
        "total_ms": round((chunk.get("total_duration") or 0) / 1e6),
        "load_ms": round(load_ns / 1e6),
    }


def _stream(model: str, messages: list, show_thinking: bool, options: Optional[dict]) -> Iterator[str]:
    try:
        stream = ollama.chat(model=model, messages=messages, stream=True, options=options or None)
    except Exception as exc:
        yield json.dumps({"error": str(exc), "done": True}) + "\n"
        return

    try:
        for chunk in stream:
            message = chunk.get("message") or {}
            done = bool(chunk.get("done"))
            payload = {
                "content": message.get("content") or "",
                "thinking": (message.get("thinking") or "") if show_thinking else "",
                "done": done,
            }
            if done:
                payload["stats"] = _stats_from(chunk)
            yield json.dumps(payload) + "\n"
    except Exception as exc:
        yield json.dumps({"error": str(exc), "done": True}) + "\n"


@app.post("/api/chat")
async def chat(request: ChatRequest):
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")

    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    options = request.options.to_ollama() if request.options else None

    if not request.stream:
        try:
            response = await asyncio.get_running_loop().run_in_executor(
                executor,
                lambda: ollama.chat(model=request.model, messages=messages, stream=False, options=options),
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        message = response.get("message") or {}
        return {
            "content": message.get("content") or "",
            "thinking": (message.get("thinking") or "") if request.show_thinking else "",
            "done": True,
            "stats": _stats_from(response),
        }

    return StreamingResponse(
        _stream(request.model, messages, request.show_thinking, options),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@app.get("/", response_class=FileResponse)
async def root():
    return FileResponse(STATIC_DIR / "index.html")


def run():
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")


if __name__ == "__main__":
    run()
