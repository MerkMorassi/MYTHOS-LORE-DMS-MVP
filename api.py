#!/usr/bin/env python3
"""Optional REST wrapper around the same Plates runner. `uvicorn api:app --port 8000`."""
from __future__ import annotations
import sys
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
from plates import DEFAULT_AR, DEFAULT_MODEL, build_run_url, run_plates  # noqa: E402

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

app = FastAPI(title="maya-plates API", version="1.0.0")


class GenerateRequest(BaseModel):
    prompt: str = ""
    batch: str = ""
    prompts: Optional[list[str]] = None
    neg: str = ""
    seed: str = "random"
    n: int = Field(1, ge=1, le=4)
    ar: str = DEFAULT_AR
    w: Optional[int] = None
    h: Optional[int] = None
    model: str = DEFAULT_MODEL
    steps: Optional[int] = None
    guidance: Optional[int] = None
    tag: str = ""
    fallback: bool = False
    timeout_s: Optional[int] = None
    out_dir: Optional[str] = None
    include_data_urls: bool = False


@app.get("/health")
async def health():
    return {"ok": True, "service": "maya-plates"}


@app.get("/run-link")
async def run_link(prompt: str = "", model: str = DEFAULT_MODEL, seed: str = "random",
                   n: int = 1, ar: str = DEFAULT_AR, tag: str = "",
                   neg: str = "", fallback: bool = False):
    try:
        url, meta = build_run_url(prompt, "", None, neg, seed, n, ar, None,
                                  None, model, None, None, tag, fallback, True)
    except ValueError as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
    return {"ok": True, "run_link": url, **meta}


@app.post("/generate")
async def generate(req: GenerateRequest):
    try:
        result = await run_plates(**req.model_dump())
    except ValueError as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
    except TimeoutError as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=504)
    except RuntimeError as e:
        msg = str(e)
        code = 502 if ("quota" in msg.lower() or "failed" in msg.lower()) else 500
        return JSONResponse({"ok": False, "error": msg}, status_code=code)
    return result
