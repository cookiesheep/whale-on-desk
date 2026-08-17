# Pet pack format

English | [中文](PET_PACK.zh.md)

A pet pack is a directory under `~/.dsh/whale-on-desk/pets/<name>/` containing:

```
pets/my-pet/
├── manifest.json
├── idle.gif        # required — every state without its own sprite falls back to it
└── glass-tap.gif   # optional per-state overrides
```

`manifest.json` maps companion states to files:

```json
{
  "idle": "idle.gif",
  "glass-tap": "glass-tap.gif"
}
```

## States worth drawing

`idle` (required), `glass-tap` (approval waits — the signature moment), `celebrate` (turn done), `think`, `tool-run`, `swim-fast`, `eat`, `sink`, `sleep`, `nightcap`, `startled`, `poked-flail`, `greet`, `compact`.

## Sprite requirements

- looping GIF, transparent background
- square aspect renders best (the companion is 160×120 on screen)
- pixel-art friendly: few flat colors, hard edges
- face LEFT to match the bundled whale's orientation

## Making one with AI

The plugin registers a `pet-forge` skill: ask your agent "make me a pink octopus pet" and it runs the full pipeline (sheet design → pixel audit → GIF → install → live switch). To do it by hand, use the shipped tools:

```sh
node <plugin-dir>/tools/scan-sheet.mjs sheet.png --frames 8 --cell 320    # audit
node <plugin-dir>/tools/process-sprites.mjs idle sheet.png --frames 8 --fps 8 --cell 320 --out ~/.dsh/whale-on-desk/pets/my-pet
```

## Sharing

PR a `pets/<name>/` directory to this repository's `community-pets/` (manifest + GIFs only, no source sheets) with a one-line credit. Accepted packs ship in the docs gallery.

Right-click the pet → switch or return to the default whale at any time.
