# whale-on-desk 🐳 鲸桌

中文 | [English](docs/README.en.md) | [🏠 官网](https://cookiesheep.github.io/whale-on-desk/)

**给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的像素鲸鱼桌宠。**
Agent 干活时它游泳,调工具时吐泡泡,**请求批准时贴着屏幕敲玻璃**。

![status](https://img.shields.io/badge/status-早期预览-orange) ![license](https://img.shields.io/badge/license-MIT-blue) ![dsh](https://img.shields.io/badge/DSH-插件-4D6BFE)

![演示](docs/media/demo.gif)

## 它会做什么

鲸鱼住在 DeepSeek Harness 网页界面的一角,实时反映 Agent 的状态:

| Agent 在干嘛 | 鲸鱼在干嘛 |
|---|---|
| 任务运行中 | 快速游泳 🏊 |
| 模型输出中 | 陪它思考,头顶思考泡泡 💭 |
| 调用工具 | 吐一个带友好标签的泡泡(敲命令 / 读文件 / …) |
| **请求批准** | **贴住屏幕边缘敲玻璃 + 琥珀色脉冲,浏览器标签标题闪 🔔** |
| 任务完成 | 空翻庆祝 + 开口汇报:"搞定! 3 分 12 秒,跑了 8 个工具,改了 5 个文件" 🎉 |
| 任务失败 | 下沉,眼睛变横线 😢 |
| 上下文约 62% / 82% | 喂鱼时间——"还能吃一点 / 吃饱了" 🍤 |
| 闲置 5 分钟 | 主动讨活:"我闲着呢,有活吗?" |
| 闲置 10 分钟 | 睡着 💤 |
| 本地 00:00–06:00 | 戴睡帽 🌙 |
| 悬停鲸鱼 | 显示当前任务统计牌(耗时 / 工具数) |
| 点击鲸鱼 | 惊吓反应 + 随机台词("别戳啦") |
| 单击 / 双击它 | 吱吱叫 / 惊醒炸毛(带音效) |

可以拖到任何位置,位置自动记住。音效为实时合成,零音频文件。

## 安装

```sh
dsh plugin --profile web add whale-on-desk
```

打开(或重启)DSH 网页界面即可。无需 API Key,无需配置。

**[DSH Desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)**(社区 Electron 桌面版)同样支持——它跑的就是官方 Web 客户端,插件体系和 DSH home 与网页版一致。在应用托盘打开 **Open DSH Terminal**,执行 `dsh plugin add whale-on-desk`,重启 DSH Desktop 即可。

## 卸载 / 配置

```sh
dsh plugin --profile web remove whale-on-desk
```

睡眠超时可在 `cordis.patch.yml` 配置(`sleepAfterMinutes`,默认 10)。右键点鲸鱼有小菜单(静音 / 回到默认位置 / 换桌宠 / 隐藏——隐藏后双击右下角 🐳 恢复)。配置 `allowPreview: true` 会额外开启 `POST /whale/preview {"state":"glass-tap"}`(传 `{"state":null}` 恢复)——方便录演示和截图,默认关闭。

## 水族馆模式

![水族馆](docs/media/aquarium.gif)

右键鲸鱼 → **🐠 水族馆**,进入全屏水族箱:手绘水体背景(自动适配明暗主题)、海草摇曳、**随工具调用生长的进度珊瑚**、**计数本回合工具数的小鱼群**——大鲸鱼本体就是 Agent:等批准时冲向缸边敲玻璃(警示浮标闪烁)。水层保持半透明且点击穿透,**可以边写代码边养鱼**。按 Esc(或 ✕ 按钮)回到桌面伙伴模式。

## AI 宠物工坊

插件向 harness 注册了 **pet-forge** 技能:直接对 Agent 说"给我做一只粉色章鱼桌宠"——它会设计精灵图、跑和内置鲸鱼同款的像素审计、切出 GIF、装成宠物包并**当场热切换**,全程无需重启。(需要 PATH 里有 ffmpeg。)

## 自定义桌宠

把一套精灵放进 `~/.dsh/whale-on-desk/pets/<名字>/`——一个把状态映射到 GIF 文件的 `manifest.json`,加上 GIF 本体:

```json
{ "idle": "idle.gif", "glass-tap": "tap.gif" }
```

没提供的状态回退到你的 `idle`,没带的文件回退到内置小鲸鱼。右键桌宠即可切换,**立即生效,无需刷新**。相关配置:`pet`(启动时激活的桌宠名)、`petsDir`、`enabled: false`(彻底卸载桌宠)。

## 工作原理

- **宿主端**(`lib/index.js`):Cordis 插件,监听 `session/event`(回合、流式块、工具调用、审批——全部是持久会话事件),折叠进一个小状态机(`lib/pet-machine.mjs`);在 DSH web 服务器上暴露 `/whale/state`、`/whale/poke`、`/whale/assets/*`。只读:不碰你的会话和文件。
- **浏览器端**(`lib/client.js`):经 DSH shell 模块加载器注册,挂载到 `shell.overlay` 槽位,渲染当前状态的精灵图(500ms 轮询),播放合成音效,记忆位置。
- **美术流水线**(`tools/process-sprites.mjs`):AI 精灵图进,干净循环 GIF 出——切片、精确 8 色吸附(纯最近色计算)、洋红抠像、装饰剔除。

## 自己做新状态

见 [`docs/GPT_PROMPT_PLAYBOOK.md`](docs/GPT_PROMPT_PLAYBOOK.md)——用 AI 出图工具生成新鲸鱼动画的完整工作流,以及把一张图变成上线状态的一条命令。

## 目录结构

```
art/     AI 工作流的源精灵图(仅仓库)
assets/  发布运行时:状态 GIF + manifest.json
docs/    美术规格、提示词手册、权威角色参考图
lib/     插件宿主端 + 浏览器端 + 状态机
test/    状态机单元测试
tools/   精灵图处理流水线 + 测试网格生成器
```

## 致谢与声明

动画语法与像素规范致敬 [clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk)(仅风格参考——未共享任何素材或代码;clawd 美术归 Anthropic 所有)。鲸鱼美术由 AI 辅助生成。与 DeepSeek 无官方关联。MIT 许可。
