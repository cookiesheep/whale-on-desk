# whale-on-desk 🐳

English | [中文](docs/README.zh.md)

**A pixel-art whale companion for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).**
It swims while your agents work, blows bubbles for tool calls, and taps the glass when an approval is waiting.

![status](https://img.shields.io/badge/status-early%20preview-orange) ![license](https://img.shields.io/badge/license-MIT-blue) ![dsh](https://img.shields.io/badge/DSH-plugin-4D6BFE)

![demo](docs/media/demo.gif)

## What it does

The whale lives in the corner of your DeepSeek Harness web UI and reacts to what your agents are doing:

| Agent activity | Whale reaction |
|---|---|
| Turn running | swims fast 🏊 |
| Model streaming | thinks along, thought bubble 💭 |
| Tool call | blows a bubble with a friendly label (敲命令 / 读文件 / …) |
| **Approval requested** | **presses against the glass, taps, amber pulse** 🔔 |
| Turn completed | jumps with a flip and foam confetti 🎉 |
| Turn failed | sinks, eyes flatline 😢 |
| Context ~62% / ~82% full | feeding time — "还能吃一点 / 吃饱了" 🍤 |
| Idle 10 minutes | dozes off 💤 |
| 00:00–06:00 local | nightcap 🌙 |
| You click / double-click it | squeak / startled flail (with sound) |

Drag it anywhere — the position sticks. Tiny synthesized sounds, zero audio assets.

## Install

```sh
dsh plugin --profile web add whale-on-desk
```

Then open (or restart) the DSH web UI. That's it — no API key, no config.

## Uninstall / configure

```sh
dsh plugin --profile web remove whale-on-desk
```

Sleep timeout is configurable in `cordis.patch.yml` (`sleepAfterMinutes`, default 10). Right-click the whale for a small menu (mute sounds / reset position). Setting `allowPreview: true` additionally exposes `POST /whale/preview {"state":"glass-tap"}` (clear with `{"state":null}`) — handy for demos and screenshots; off by default.

## How it works

- **Host half** (`lib/index.js`): a Cordis plugin listening to `session/event` (turns, chunks, tool calls, approvals — all durable session events) and folding them into a small state machine (`lib/pet-machine.mjs`). Exposes `/whale/state`, `/whale/poke`, `/whale/assets/*` on the DSH web server. Read-only: it never touches your sessions or files.
- **Browser half** (`lib/client.js`): registers via the DSH shell module loader, mounts into the `shell.overlay` slot, renders the current state's sprite (500 ms poll), plays synthesized sounds, and persists its position.
- **Art pipeline** (`tools/process-sprites.mjs`): AI-generated sprite sheets in, clean looping GIFs out — slicing, exact 8-color palette snapping (pure nearest-color math), magenta chroma-key, decoration removal.

## Making your own states

See [`docs/GPT_PROMPT_PLAYBOOK.md`](docs/GPT_PROMPT_PLAYBOOK.md) — the full workflow for generating new whale animations with an AI image tool, and the one-line pipeline command that turns a sheet into a live state.

## Project layout

```
art/     source sprite sheets from the AI workflow (repo only)
assets/  shipped runtime: state GIFs + manifest.json
docs/    art spec, prompt playbook, canonical character reference
lib/     plugin host half + browser half + state machine
test/    state machine unit tests
tools/   sprite processing pipeline + test grid generator
```

## Credits & disclaimer

Animation grammar and pixel discipline inspired by [clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk) (style reference only — no assets or code shared; clawd art is Anthropic's). Whale art generated with AI assistance. Not affiliated with DeepSeek. MIT licensed.
