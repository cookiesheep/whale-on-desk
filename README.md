# whale-on-desk 鲸桌

A pixel-art whale desktop companion for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Your agents work — the whale reacts: it swims while a turn runs, thinks along with the
model, blows bubbles for tool calls, **taps the glass when an approval is waiting**,
celebrates when a task lands, and dozes off after ten quiet minutes.

```
Status: v0.0.1 live — placeholder whale swimming at http://127.0.0.1:3080 (art drops in next)
Art style: clawd-style chunky pixel art (see docs/ART_SPEC.md)
Ship plan: DSH web plugin first (one-line install), Electron overlay second
Verified: boot graph ✓ /client.js ✓ /whale/state ✓ /whale/poke ✓ (8/8 state-machine tests)
```

## Repository layout

- `docs/ART_SPEC.md` — the whale art direction, derived from frame-by-frame
  analysis of the clawd-on-desk idle loop (style reference only, no assets copied).
- `docs/GPT_PROMPT_PLAYBOOK.md` — prompt templates for AI-assisted sprite
  generation with a locked palette and character sheet.
- `src/states.ts` — pet state vocabulary, priorities, transient/durable split.
- `src/mapper.ts` — pure fold from DSH session/approval events to pet state.

## License

MIT (planned). Whale art original; not affiliated with DeepSeek.
