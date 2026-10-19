#!/usr/bin/env python3
"""MCP tool for maya-plates-agent. Stdio transport (Claude Desktop / agents).

Tools:
  generate_plate  - run the generator headlessly, save PNGs, return manifest
  plates_run_link - build a shareable autorun URL without spending quota
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from plates import (  # noqa: E402
    AR_KEYS, DEFAULT_AR, DEFAULT_MODEL, MODEL_KEYS,
    base_url, build_run_url, default_out_dir,
)


def _build_mcp():
    from mcp.server.fastmcp import FastMCP
    from plates import run_plates

    mcp = FastMCP("maya-plates")

    @mcp.tool()
    async def generate_plate(
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
    ) -> str:
        """Generate images with the Plates runner. One call = one run.

        prompt may contain '||' for batch mode; or pass prompts=['a cat','a dog'].
        Each batch prompt x n images (n 1-4, total <= 16). seed is an int base
        ('random' = random, image i uses base+i). w+h (64-2048) = exact px output.
        Images are saved as PNGs under out_dir; the returned JSON lists files
        plus the full manifest. Keep total <= 4 for agent-friendly latency.
        """
        result = await run_plates(prompt, batch, prompts, neg, seed, n, ar, w, h,
                                  model, steps, guidance, tag, fallback,
                                  timeout_s, out_dir, include_data_urls)
        return json.dumps(result, indent=2)

    @mcp.tool()
    def plates_run_link(
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
    ) -> str:
        """Build a shareable autorun URL without running anything (no quota used)."""
        url, meta = build_run_url(prompt, batch, prompts, neg, seed, n, ar, w, h,
                                  model, steps, guidance, tag, fallback, True)
        return json.dumps({"run_link": url, **meta, "base": base_url()}, indent=2)

    return mcp


def _cli() -> int:
    ap = argparse.ArgumentParser(description="maya-plates MCP server")
    ap.add_argument("--print-url", action="store_true",
                    help="print an autorun URL for the given args, no browser")
    ap.add_argument("--prompt", default="")
    ap.add_argument("--batch", default="")
    ap.add_argument("--neg", default="")
    ap.add_argument("--seed", default="random")
    ap.add_argument("--n", type=int, default=1)
    ap.add_argument("--ar", default=DEFAULT_AR, help=f"one of {', '.join(AR_KEYS)}")
    ap.add_argument("--model", default=DEFAULT_MODEL, help=f"one of {', '.join(MODEL_KEYS)}")
    ap.add_argument("--tag", default="")
    ap.add_argument("--fallback", action="store_true")
    a = ap.parse_args()
    if a.print_url:
        # No browser, no mcp import needed: safe without dependencies.
        url, meta = build_run_url(a.prompt, a.batch, None, a.neg, a.seed,
                                  a.n, a.ar, None, None, a.model,
                                  None, None, a.tag, a.fallback, True)
        print(url)
        print(json.dumps(meta, indent=2))
        print("out_dir:", default_out_dir())
        return 0
    _build_mcp().run()
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
