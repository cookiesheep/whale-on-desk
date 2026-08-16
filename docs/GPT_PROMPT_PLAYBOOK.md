# GPT Prompt Playbook — 出图操作手册 v2(经社区工作流验证)

配合 ChatGPT 会员网页版。你出图,我切片/校色/合成动画。
基于 clawd-idle.gif 逐帧规格(ART_SPEC.md)+ 2025-26 社区验证的 AI 精灵图工作流
(OpenAI 社区/chongdashu 工作流/Scenario 指南)。

## 核心策略(经研究验证,别偏离)

1. **永远不要一次性生成大图集**——单次大 sheet 会重复姿势/丢帧。
   正确顺序:先锁角色设计表 → 逐状态生成 → 最后 normalize 统一。
2. **帧数预算**:idle + 1 个招牌状态用完整帧网格(8-16 帧);**其余状态只要 2-4 张关键帧**,动作(浮动/挤压/旋转)由代码补——clawd 官方主题指南也说自定义主题 4-12 帧就够。
3. **双参考图技巧**:每次生成附两张图——①Master Sheet ②一张纯像素网格图(对齐锚),能显著减少帧漂移。
4. **重试优于修复**:失败就重生成 2-3 次,比让模型"修"更快。

## 第 0 步:Master Sheet(今天做)

把下面整段发给 ChatGPT:

```
Create a character design sheet for WHALE, a chunky pixel-art desktop-pet whale.
Flat 2D, single-pixel dark navy outline (#1A1030), exactly 8 colors
(#1A1030 #23324D #17233A #3C5A86 #F2F5F9 #101623 #E58FA2 #BFE3FF),
2-tone cel shading, light from top-left, NO anti-aliasing, NO gradients, NO dithering.
Character: round egg-shaped whale body, white belly, tiny 3px tail fluke, one small
side fin, small foam spout on top; eyes are 4px-tall dark ovals with one white
highlight pixel each; kawaii chibi proportions.
Layout: 4x2 grid turnaround (front / 3-4 left / side / 3-4 right / back),
plus 3 expression close-ups (happy / sleepy / surprised),
plus a palette swatch row with hex labels.
Character occupies the SAME pixel height in every cell. Transparent background.
```

- 生成 3-5 个候选发我 → 我按 clawd 规格选优锁定。
- 以后每次生成都带它 + 一句:"Use the EXACT same character as the reference image."

## 第 1 步:招牌状态完整帧网格(只做 idle + celebrate 两个)

```
Using the attached character sheet as reference 1 (and the pixel grid as reference 2
for alignment), generate a sprite sheet: exactly 8 frames of [IDLE BREATHING],
arranged as a single row, equal-size cells, character bottom-anchored on the same
ground line in every frame, identical palette and scale in all frames
(no zoom, no camera movement, no mirror flips), 1-pixel dark outline preserved.
Each frame is one consecutive phase of the loop; frame 8 must match frame 1
so the loop is seamless. Transparent background, no anti-aliasing, no new colors.
```

- [IDLE BREATHING] 换成招牌动作时,替换动作描述(celebrate: upward jump with flip
  at apex, squash on landing, happy open mouth, foam confetti)。
- 失败两次 → 降级为关键帧模式(第 2 步),别死磕。

## 第 2 步:其余状态只要关键帧(2-4 张/状态)

```
Edit: apply this exact character (reference image) into {N} key frames for [STATE].
Preserve the character's identity, palette (exact hex list), outline weight,
lighting direction, camera, and background.
Do not mirror the pose; do not swap left/right assignments; left/right refer to the
subject's own anatomical sides, not the viewer's.
Do not generalize the pose into a similar pose. Keep all poses intact.
```

状态关键帧描述(替换 [STATE] 时用):
- swim-fast: leaned-forward swimming pose / mid-tail-beat pose
- think: floating still, eyes up-right, thought bubble with 3 dots
- tool-run: paddling fin, determined squint, small wrench bubble
- glass-tap: pressed against right edge, fin raised tapping, wide worried eyes, amber pixels
- sink: sinking 3px, flat-line eyes, one bubble rising
- sleep: resting on bottom, nightcap, Zzz pixels
- poked-flail: arms-flailing spread pose, startled round eyes
- eat: mouth open toward food pixels / content closed-eyes cheeks-full

## 第 3 步:normalize 统一(每状态生成完做一次)

```
Normalize the style, character consistency and size for this sprite sheet,
keeping all the poses intact.
```

## 第 4 步:回传与命名

- `master.png`、`idle.png`(整行帧)、`swim.png`(关键帧组)…发我时注明状态名。
- 我负责:切片 → 色板吸附(杂色拉回 8 色)→ 对齐 → ffmpeg 合成循环 GIF → 代码动效叠加。

## 失败模式速查

| 问题 | 对策 |
|---|---|
| 色板漂移 | 出图后我统一 palette-snap;也可用 RetroDiffusion Pixel Art Fixer(免费网页) |
| 糊边/抗锯齿 | 同上工具的 pixel-snap;渲染时 `image-rendering: pixelated` |
| 帧数错/重复姿势 | 重试 2-3 次;仍失败降级关键帧模式 |
| 左右手性画反 | 提示词里已有反镜像条款;渲染端 CSS `scaleX(-1)` 镜像兜底 |

## 分工

你:GPT 出图(第 0 步今天可跑),回传。
我:风格审定 → 切片/校色/合成 → 状态机接线(已完成,8/8 测试过)→ 插件打包 → 发布。
