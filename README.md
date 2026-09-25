# chatbot

A local AI chat frontend for [Ollama](https://ollama.com). FastAPI backend, vanilla JS
frontend, no build step, and **no network access at runtime** — every asset is served from
disk, so it works fully offline.

![Python](https://img.shields.io/badge/python-3.12%2B-blue) ![Offline](https://img.shields.io/badge/runtime-100%25%20offline-2ea043)

## Features

- Streaming token-by-token responses over NDJSON
- Thinking/reasoning toggle, enforced server-side rather than just hidden in the UI
- Multiple persisted conversations with per-conversation model selection
- Write a reply, stop generation, regenerate, copy code blocks and messages
- Model picker with size/family/quantization metadata and live search
- Stopwatch, token count, tokens/sec and load time per response
- Dark/light themes, keyboard shortcuts, responsive down to phone width

## Requirements

- [Ollama](https://ollama.com) running on `localhost:11434`, with at least one model pulled
- Python 3.12+
- [uv](https://docs.astral.sh/uv/)

## Setup

```bash
uv sync
ollama serve          # if it isn't already running
uv run ai-server
```

Then open <http://127.0.0.1:8000>.

## Usage

| Shortcut | Action |
| --- | --- |
| `Ctrl`/`Cmd` + `K` | New chat |
| `Ctrl`/`Cmd` + `B` | Toggle sidebar |
| `Ctrl`/`Cmd` + `J` | Toggle theme |
| `Esc` | Close drawer / stop generating |

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | `200` when Ollama is reachable, else `503` |
| `GET /api/models` | Installed models as `[{name, size, family, parameter_size, quantization, modified}]`, sorted by name; `[]` if Ollama is down |
| `POST /api/chat` | Body `{model, messages:[{role,content}], stream, show_thinking, options?}` |

`POST /api/chat` streams NDJSON — one JSON object per line, `{content, thinking, done}` —
with a final `done: true` line carrying `stats`. Thinking tokens arrive in a separate
`message.thinking` field from Ollama and are blanked server-side unless `show_thinking` is
true. An unknown model returns `502`; an empty `messages` array returns `400`.

## Notes for contributors

- `AGENTS.md` documents the architecture, the offline constraint, and the gotchas that have
  already cost time here (blocking Ollama generator, absolute static paths, the viewport
  grid invariants). Read it before changing layout or streaming code.
- Static paths are resolved from `Path(__file__).resolve().parents[2]`, so the server works
  from any working directory.
- `renderMarkdown()` escapes HTML **before** applying inline formatting. Keep that order or
  model output becomes an XSS vector.
- There is no test runner. After edits, re-run `node --check static/app.js` and the health,
  models and streaming endpoints.
