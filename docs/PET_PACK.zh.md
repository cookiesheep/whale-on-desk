# 宠物包格式

[English](PET_PACK.md) | 中文

宠物包是 `~/.dsh/whale-on-desk/pets/<名字>/` 下的一个目录:

```
pets/my-pet/
├── manifest.json
├── idle.gif        # 必需——没有专属精灵的状态都会回退到它
└── glass-tap.gif   # 可选:按状态覆盖
```

`manifest.json` 把状态映射到文件:

```json
{
  "idle": "idle.gif",
  "glass-tap": "glass-tap.gif"
}
```

## 值得画的状态

`idle`(必需)、`glass-tap`(等批准——招牌时刻)、`celebrate`(任务完成)、`think`、`tool-run`、`swim-fast`、`eat`、`sink`、`sleep`、`nightcap`、`startled`、`poked-flail`、`greet`、`compact`。

## 精灵要求

- 循环 GIF,透明背景
- 方形构图最佳(桌宠显示区域 160×120)
- 像素风友好:少而平的颜色、硬边缘
- **朝左**(与内置鲸鱼一致)

## 用 AI 做

插件注册了 `pet-forge` 技能:对 Agent 说"给我做一只粉色章鱼桌宠",它会跑完整流水线(设计→像素审计→切 GIF→安装→热切换)。手动做法,用包内自带工具:

```sh
node <插件目录>/tools/scan-sheet.mjs sheet.png --frames 8 --cell 320    # 审计
node <插件目录>/tools/process-sprites.mjs idle sheet.png --frames 8 --fps 8 --cell 320 --out ~/.dsh/whale-on-desk/pets/my-pet
```

## 分享

向本仓库的 `community-pets/` 提交 `pets/<名字>/` 目录(只含 manifest + GIF,不含源图)+ 一行署名。收录的宠物包会进入文档画廊。

右键桌宠可随时切换或回到默认鲸鱼。
