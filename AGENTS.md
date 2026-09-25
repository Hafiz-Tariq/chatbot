# AI Project - Agent Guide

## What this is
Offline web chat UI for locally installed Ollama models. No cloud calls, no CDN assets —
everything is served from `static/`.

## Layout
- `src/ai/server.py` — FastAPI backend, the only real entrypoint
- `static/index.html` — app shell markup
- `static/style.css` — design system (CSS vars, light/dark themes)
- `static/app.js` — all frontend logic incl. a hand-rolled markdown renderer
- `main.py` — legacy scratch script, not used by the app

## Commands
```bash
uv sync                 # install (uv_build backend, src-layout)
ai-server               # or: uv run ai-server  -> http://127.0.0.1:8000
uv run -m ai            # same thing, via package main
ollama serve            # must be running separately
```

## Hard constraints
- **Never add CDN links** (fonts, highlight.js, marked, …). It breaks the offline
  guarantee. Markdown + code rendering is implemented locally in `app.js`.
- **No tests/lint/typecheck are configured.** Verification is manual — see below.
- `README.md` is empty. `static/` lives at the repo root, *not* inside the package.

## Gotchas that cost time
- **Static paths must stay absolute.** `server.py` resolves `ROOT` from
  `Path(__file__).resolve().parents[2]`. Do not go back to `directory="static"` or a
  relative `open()` — the server then only works when CWD is the repo root.
- **`ollama.chat(stream=True)` is a blocking sync generator.** It is passed straight to
  `StreamingResponse` on purpose. Do not wrap it in `asyncio.to_thread` /
  `run_in_executor` to "fix" async — buffering the iterator to a `list()` to get it into
  a thread silently breaks token streaming.
- **`stream=False` is very slow** on these models (tens of seconds, dominated by
  thinking). The UI only uses the streaming path.
- Thinking tokens arrive in `message.thinking`, separate from `message.content`. The
  backend blanks them unless `show_thinking` is true, so the toggle is enforced server-side.
- Ollama is single-threaded per model: a second concurrent chat queues behind the first.
- **`.app` must be a single fixed-size grid.** `grid-template-rows: minmax(0, 1fr)` plus
  `overflow: hidden` is what keeps the page from growing past `100dvh`. Without the explicit
  row the implicit `auto` row is content-sized, so a long thread pushes the composer below the
  fold. `.main` and `.sidebar` also need `min-height: 0` or they refuse to shrink.
- **Below `60rem` the grid must be one column.** The sidebar becomes `position: fixed`
  (out of flow), so `grid-template-columns: 0 minmax(0, 1fr)` leaves `.main` auto-placed in
  the zero-width first column and the whole UI measures 0px wide. The mobile rule overrides
  both `.app` and `.app.is-collapsed` to `minmax(0, 1fr)`.
- `.viewport` is the only scroll container; `document.documentElement.scrollHeight` should
  equal `innerHeight` at every size. Verify at 1024x600, 820x1180 and 390x700, both empty
  and with a long conversation. Short viewports (laptops at 150% scaling) are handled by the
  `max-height: 46rem` / `34rem` blocks, which reclaim thread height rather than clipping it.

## API
- `GET /api/health` — 200 when Ollama is reachable, else 503
- `GET /api/models` — `[{name, size, family, parameter_size, quantization, modified}]`, sorted by name; `[]` if Ollama is down
- `POST /api/chat` — body `{model, messages:[{role,content}], stream, show_thinking, options?}`
  - streaming: NDJSON, one JSON object per line, `{content, thinking, done}`; the final
    line has `done: true` plus `stats`
  - non-streaming: `{content, thinking, done, stats}`
  - `stats` = `{tokens, prompt_tokens, tokens_per_second, total_ms, load_ms}`
  - errors: 400 empty messages, 502 bad/unknown model

## Frontend notes
- State lives in `localStorage` under `nebula.*` (sessions, current id, theme, model,
  reasoning, sidebar). Sessions are plain `{id,title,model,createdAt,updatedAt,messages[]}`.
- **`readStore`/`writeStore` are `JSON.parse`/`JSON.stringify` wrappers.** Every value is
  stored JSON-encoded, so a string like the current id is stored as `"abc"` *with quotes*.
  Seeding storage from a test harness with a raw `abc` makes `JSON.parse` throw, the catch
  returns the fallback, and the app silently boots a brand-new empty session instead of the
  one you seeded. Seed with `JSON.stringify("abc")` and assert `localStorage` after boot
  before trusting any layout assertion.
- `renderMarkdown()` escapes HTML **before** inline formatting; keep that order or model
  output becomes an XSS vector. Code fences are extracted to placeholders first so their
  contents are never inline-parsed.
- `this.codeBlocks` is gone on purpose — code copy reads straight from the DOM via
  `btn.closest(".code")`, which stays correct across multiple messages.
- Keyboard: `Ctrl/⌘+K` new chat, `Ctrl/⌘+B` sidebar, `Ctrl/⌘+J` theme, `Esc` close/stop.
- Below 60rem the sidebar becomes an overlay drawer; the topbar menu button reopens it
  (and reopens the collapsed desktop sidebar). Don't hide that button when collapsed.

## Verifying changes
There is no test runner. These are the checks worth repeating after edits:
```bash
node --check static/app.js
# start server, then:
#   GET /api/health, /api/models
#   POST /api/chat with stream:true  -> expect thinking + content lines then stats
# open http://127.0.0.1:8000 and confirm: model list populates, reasoning toggle works,
# stop button aborts mid-stream, sidebar + theme survive a reload
```
A 9B model needs ~10s just to load. Prefer `qwen3.5:0.8b` when smoke-testing.
