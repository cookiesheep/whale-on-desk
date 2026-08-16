# Whale Art Spec (clawd-style, data-derived)

Source of truth: frame-by-frame analysis of `clawd-on-desk/assets/gif/clawd-idle.gif`
(302x300, 48 frames, 3.2s loop). Reference frames extracted to `D:\code\clawd-ref\frame_*.png`.
Style reference only — never copy clawd assets (AGPL). We draw our own whale.

## Canvas & resolution

- Base logical resolution: **48x48 px** per frame (clawd is ~32; we take 48 for more expression room).
- Display size: **144-192 px** (3x-4x nearest-neighbor upscale; never smooth filtering).
- The character occupies ~30-38 px of the base canvas, ~6 px breathing margin on all sides.

## Outline

- Single-pixel dark outline, near-black navy `#1A1030`, unbroken around the silhouette.
- Interior detail lines: same color, single pixel.

## Palette (8-10 colors, lock these hexes across ALL generations)

| Role | Hex |
|---|---|
| Outline | `#1A1030` |
| Body base (deep sea blue-black, 小黑鲸) | `#23324D` |
| Body shade | `#17233A` |
| Body highlight | `#3C5A86` |
| Belly / eye white | `#F2F5F9` |
| Pupil | `#101623` |
| Blush | `#E58FA2` |
| Spout/bubble accent (foam) | `#BFE3FF` |
| Warning state accent (approval) | `#F2C14E` |
| Error accent | `#C0554D` |

Rule: no color outside this table survives cleanup. Any AI generation gets snapped to the nearest palette color (see tooling).

## Character design

- Round chibi whale: body is one egg/squash form, no neck; tiny tail fluke (3-4 px); small side fin.
- Eyes: 3-4 px tall oval at base res, single-pixel white highlight top-left; blink = 2 px horizontal line.
- Mouth: 1-2 px line; expressions vary (happy arc / worried squiggle / open on celebrate).
- Spout: 2-3 px foam arc on top — our signature secondary motion (clawd has claws; we have the spout).

## Shading

- 2-tone cel: base + shade, light from top-left.
- Transition uses a 1-row checkerboard dither only on curved bottoms.
- Highlight: 2-3 px patch on head top-left, plus eye whites.

## Animation grammar (per state, loop)

- Bob: sine, ±2-3 px at base res, 1.5-2 Hz, ease-in-out; last frame blends into first.
- Blink: every 2-3 s, 2 frames closed, inside any non-sleep state.
- Spout puff: every 4-6 s in idle, 3-frame spurt with foam pixels.
- Fin/tail wiggle: 1-2 px, phase-offset from body bob (secondary motion rule).
- Squash-stretch on jumps/celebration: ±10% height.
- Frame counts: idle-type states 12-24 frames @ 8-12 fps; reaction states 6-10 frames.

## State inventory v1 (target: ship 12, grow to 25+)

| State | Trigger (DSH) | Motion notes |
|---|---|---|
| idle | no session activity | bob + blink + spout puff |
| swim-fast | turn running | faster bob, tail wiggle, lean forward |
| think | assistant/chunk streaming | thought bubble (code rendering), eyes up |
| tool-run | tool/call | bubble with tool icon; fin paddling |
| glass-tap | approval/asked | whale presses screen edge, taps, amber accent — highest priority |
| celebrate | turn/end success | jump + flip, confetti bubbles |
| sink | turn/end error | sinks 3 px, bubbles, frown |
| sleep | idle > 10 min | nightcap, Zzz pixels, slow bob |
| nightcap | local time 00:00-06:00 overlay | auto |
| poked-flail | user double-click | flail 8 frames |
| startled | wake from sleep by click | pop + wobble |
| eat | context fill 62%/82% | "还能吃一点 / 吃饱了" feeding frames |

## Readability test (gate before ship)

Silhouette must be recognizable at 96 px on a busy screenshot; print test at 50% zoom.
