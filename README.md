# maya-plates MCP tool + REST API

Agents call `generate_plate`. It drives this generator headlessly
(`?autorun=1` URL), polls `#status` until `done`/`error`, parses `#manifest`,
saves PNGs to disk, and returns JSON.

Same core also serves `POST /generate` via `api.py`.

## 1. Install

```bash
cd src/mcp-server
pip install -r requirements.txt
playwright install chromium
```

Optional env:

- `PLATES_GENERATOR=maya-plates-agent` (default) or `PLATES_BASE_URL=https://perchance.org/maya-plates-agent`
- `PLATES_OUT_DIR=scratch/plates-out` (default)
- `PLAYWRIGHT_HEADLESS=1` (set `0` to watch the browser)

## 2. Dry run (no browser, no quota)

```bash
python server.py --print-url --prompt "a lighthouse at dusk" --model flux-schnell --tag mayarun --fallback
```

## 3. MCP (stdio)

Copy `mcp.json.example` into your agent's MCP config (Claude Desktop, Cursor,
Cline, etc.), fixing the `/ABS/PATH/TO` entries, then restart the client.

Tools:

- `generate_plate(prompt, batch, prompts, neg, seed, n, ar, w, h, model, steps, guidance, tag, fallback, timeout_s, out_dir, include_data_urls)`
- `plates_run_link(...)` — same params minus run options; builds the autorun URL only.

Params mirror the generator: `n` 1-4, `prompts x n <= 16`, `ar` in
`1:1 3:4 4:3 2:3 3:2 9:16 16:9`, `model` in
`flux-schnell sdxl-turbo sdxl-base plates-default`, `seed` int or `random`
(image `i` uses base+`i`), `w`+`h` 64-2048 exact px, `fallback` retries quota
errors once on `plates-default`.

Returns (JSON string):

```json
{
  "ok": true, "status": "done",
  "run_link": "https://perchance.org/maya-plates-agent?...&autorun=1",
  "count": 1, "out_dir": "...",
  "files": [{"index": 0, "filename": "mayarun_flux-schnell_5_0.png",
             "path": "...", "bytes": 123456, "seed": 5,
             "model": "flux-schnell", "prompt": "a lighthouse at dusk"}],
  "manifest": [{ "...": "..." }]
}
```

Keep agent runs small (`total <= 4` images). Each image can take up to ~180s;
default timeout is `60 + total x 190`s (max 1800s, overridable via `timeout_s`).

## 4. REST (optional)

```bash
uvicorn api:app --port 8000
curl -X POST localhost:8000/generate -H 'content-type: application/json' \
  -d '{"prompt":"a lighthouse at dusk","seed":"5","model":"flux-schnell","tag":"mayarun","fallback":true}'
```

`GET /run-link?prompt=...` builds a URL without spending quota.
`GET /health` for uptime checks.

## Notes

- Generation spends the **host's** image quota (headless Chromium = one viewer).
- `flux-schnell` ignores negative prompts (flagged in manifest as `negHonored: false`).
- Quota errors surface as errors; retry with `fallback: true` or another model.
- Images are PNG dataURLs in the page; the server decodes and saves them —
  pass `include_data_urls: true` only if the agent really needs inline bytes.
