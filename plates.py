"""Shared core for the maya-plates-agent MCP tool + REST API.

Builds autorun URLs, drives the generator in headless Chromium (Playwright),
polls #status until done/error, parses #manifest, saves PNG dataURLs to disk.
Browser-free helpers (build_run_url) work without Playwright installed.
"""
from __future__ import annotations
import base64
import json
import os
import re
import urllib.parse
from pathlib import Path

DEFAULT_GENERATOR = "maya-plates-agent"
AR_KEYS = ("1:1", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9")
MODEL_KEYS = ("flux-schnell", "sdxl-turbo", "sdxl-base", "plates-default")
DEFAULT_AR = "3:4"
DEFAULT_MODEL = "flux-schnell"
PER_IMAGE_TIMEOUT_S = 180


def base_url() -> str:
    override = os.environ.get("PLATES_BASE_URL", "").strip()
    if override:
        return override.rstrip("/")
    gen = os.environ.get("PLATES_GENERATOR", DEFAULT_GENERATOR).strip() or DEFAULT_GENERATOR
    return f"https://perchance.org/{gen}"


def default_out_dir() -> Path:
    return Path(os.environ.get("PLATES_OUT_DIR", "scratch/plates-out")).resolve()


def split_prompts(prompt: str = "", batch: str = "", prompts: list[str] | None = None) -> list[str]:
    if prompts:
        items = [str(p).strip() for p in prompts if str(p).strip()]
    elif (batch or "").strip():
        items = [s.strip() for s in str(batch).split("||")]
    else:
        items = [s.strip() for s in str(prompt or "").split("||")]
    items = [s for s in items if s]
    if not items:
        raise ValueError("empty prompt (pass prompt, batch, or prompts)")
    return items


def build_run_url(
    prompt: str = "",
    batch: str = "",
    prompts: list[str] | None = None,
    neg: str = "",
    seed: str = "random",
    n: int = 1,
    ar: str = DEFAULT_AR,
    w: int | None = None,
    h: int | None = None,
    model: str = DEFAULT_MODEL,
    steps: int | None = None,
    guidance: int | None = None,
    tag: str = "",
    fallback: bool = False,
    autorun: bool = True,
) -> tuple[str, dict]:
    items = split_prompts(prompt, batch, prompts)
    n = max(1, min(4, int(n or 1)))
    if len(items) * n > 16:
        raise ValueError(f"too many images (prompts x n = {len(items) * n} > 16)")
    if ar not in AR_KEYS:
        raise ValueError(f"bad ar {ar!r} (want one of {', '.join(AR_KEYS)})")
    if model not in MODEL_KEYS:
        raise ValueError(f"bad model {model!r} (want one of {', '.join(MODEL_KEYS)})")
    seed_s = str(seed if seed not in (None, "") else "random").strip() or "random"
    if seed_s.lower() not in ("random", "-1"):
        try:
            int(seed_s)
        except ValueError:
            raise ValueError("bad seed (want integer or 'random')")
    q: dict[str, str] = {}
    multi = len(items) > 1
    joined = " || ".join(items)
    q["batch" if multi else "prompt"] = joined
    q["neg"] = str(neg or "")
    q["seed"] = seed_s
    q["n"] = str(n)
    q["ar"] = ar
    if w and h:
        wi, hi = int(w), int(h)
        if not (64 <= wi <= 2048 and 64 <= hi <= 2048):
            raise ValueError("w/h must both be 64-2048 (else omit both)")
        q["w"], q["h"] = str(wi), str(hi)
    q["model"] = model
    if steps is not None and str(steps).strip() != "":
        q["steps"] = str(int(steps))
    if guidance is not None and str(guidance).strip() != "":
        g = int(guidance)
        if not (0 <= g <= 30):
            raise ValueError("guidance must be 0-30")
        q["guidance"] = str(g)
    q["tag"] = str(tag or "")
    q["fallback"] = "1" if fallback else "0"
    if autorun:
        q["autorun"] = "1"
    url = base_url() + "?" + urllib.parse.urlencode(q)
    meta = {"prompts": items, "n": n, "total": len(items) * n}
    return url, meta


def default_timeout_s(total: int, override: int | None = None) -> int:
    if override and int(override) > 0:
        return int(override)
    return min(60 + int(total) * (PER_IMAGE_TIMEOUT_S + 10), 1800)


def _save_data_url(data_url: str, dest: Path) -> int:
    m = re.match(r"^data:image/\w+;base64,(.+)$", data_url or "", re.DOTALL)
    if not m:
        raise ValueError("result image is not a PNG dataURL")
    raw = base64.b64decode(m.group(1))
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw)
    return len(raw)


EXTRACT_JS = """() => {
  const status = document.querySelector('#status')?.textContent ?? '';
  const detail = document.querySelector('#status-detail')?.textContent ?? '';
  const manifestText = document.querySelector('#manifest')?.textContent ?? '[]';
  const rows = [...document.querySelectorAll('div.result')].map(el => ({
    index: el.getAttribute('data-index'),
    img: el.querySelector('img')?.src ?? null,
    href: el.querySelector('a.download')?.href ?? null,
    filename: el.querySelector('a.download')?.getAttribute('download') ?? null
  }));
  return {status, detail, manifestText, rows};
}"""


async def run_plates(
    prompt: str = "",
    batch: str = "",
    prompts: list[str] | None = None,
    neg: str = "",
    seed: str = "random",
    n: int = 1,
    ar: str = DEFAULT_AR,
    w: int | None = None,
    h: int | None = None,
    model: str = DEFAULT_MODEL,
    steps: int | None = None,
    guidance: int | None = None,
    tag: str = "",
    fallback: bool = False,
    timeout_s: int | None = None,
    out_dir: str | None = None,
    include_data_urls: bool = False,
) -> dict:
    try:
        from playwright.async_api import async_playwright
    except ImportError as e:
        raise RuntimeError("playwright not installed (pip install -r requirements.txt)") from e
    url, meta = build_run_url(prompt, batch, prompts, neg, seed, n, ar, w, h,
                              model, steps, guidance, tag, fallback, True)
    total = meta["total"]
    timeout = default_timeout_s(total, timeout_s)
    out = Path(out_dir).resolve() if out_dir else default_out_dir()
    out.mkdir(parents=True, exist_ok=True)
    headless = os.environ.get("PLAYWRIGHT_HEADLESS", "1") != "0"
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=headless,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        try:
            ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
            page = await ctx.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_selector("#status", timeout=60000)
            try:
                await page.wait_for_function(
                    "document.querySelector('#status').textContent === 'done'"
                    " || document.querySelector('#status').textContent === 'error'",
                    timeout=timeout * 1000,
                )
            except Exception as e:
                state = await page.evaluate(EXTRACT_JS)
                raise TimeoutError(
                    f"timed out after {timeout}s waiting for #status "
                    f"(still {state.get('status')!r}: {state.get('detail')!r})"
                ) from e
            state = await page.evaluate(EXTRACT_JS)
        finally:
            await browser.close()
    status = (state.get("status") or "").strip()
    detail = state.get("detail") or ""
    if status != "done":
        raise RuntimeError(f"plates run failed [{status}]: {detail or 'unknown error'}")
    try:
        manifest = json.loads(state.get("manifestText") or "[]")
    except json.JSONDecodeError as e:
        raise RuntimeError(f"manifest was not JSON: {e}") from e
    rows = {r.get("index"): r for r in (state.get("rows") or []) if r.get("index") is not None}
    files: list[dict] = []
    for entry in manifest:
        idx = str(entry.get("index"))
        row = rows.get(idx, {})
        data_url = row.get("img") or row.get("href")
        if not data_url:
            raise RuntimeError(f"image {idx} finished but had no dataURL (page bug?)")
        filename = entry.get("filename") or row.get("filename") or f"plate_{idx}.png"
        filename = re.sub(r"[^a-zA-Z0-9._-]+", "_", filename)
        dest = out / filename
        size = _save_data_url(data_url, dest)
        f: dict = {
            "index": entry.get("index"),
            "filename": filename,
            "path": str(dest),
            "bytes": size,
            "seed": entry.get("seed"),
            "model": entry.get("model"),
            "prompt": entry.get("prompt"),
        }
        if include_data_urls:
            f["data_url"] = data_url
        files.append(f)
    return {
        "ok": True,
        "status": "done",
        "run_link": url,
        "count": len(files),
        "out_dir": str(out),
        "files": files,
        "manifest": manifest,
    }
