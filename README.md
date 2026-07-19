# AI Manga Studio

一句话输入，AI 自动完成从剧本到成片的全流程。

输入你的创意，Agent 智能体自动扩写故事、引导你确认风格和细节、编排生产管线，最终生成漫剧/短视频/电影短片。

## 核心特性

**一句话入口** — 输入任意创意，AI 自动扩写为完整故事大纲，引导选择风格、色调、节奏等参数。

**三层 Agent 协作体系** — 决策层、执行层、监督层协同工作，覆盖任务拆解、内容生成、质量审阅与修订反馈。

**多模态 AI 支持** — 集成 Agnes AI 等多家供应商，支持文本、图像、视频、TTS 多模态生成。

**漫剧模式** — 支持动态漫画（Motion Comic）生产模式，包括分镜布局、运镜、字幕、转场动画。

**交互式确认** — 在关键流程节点暂停，让用户参与风格和细节决策。

**持久化 Agent 记忆** — 基于本地 ONNX 向量检索的跨会话记忆系统。

## 快速开始

```bash
# 安装依赖
yarn install

# 启动开发服务器
yarn dev

# 访问
open http://localhost:10588
```

默认登录账号：`admin` / `admin123`

### 配置 AI 模型

1. 登录后进入 **设置 > 供应商配置**
2. 选择 Agnes AI 供应商，已预置 API Key
3. 在 **模型部署** 中为各 Agent 选择合适的模型
4. 打开 http://localhost:10588/one_sentence.html 体验一句话生成

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 语言 | TypeScript 5.x | 全栈类型安全 |
| 后端 | Express 5 + Socket.IO | API + 实时通信 |
| 数据库 | SQLite (better-sqlite3 + knex) | 轻量嵌入式 |
| AI SDK | Vercel AI SDK | 统一多模型接入 |
| 桌面端 | Electron 40 | 跨平台桌面应用 |
| 图像处理 | Sharp | 高性能图像处理 |
| 本地推理 | @huggingface/transformers (ONNX) | Agent 记忆向量检索 |
| 前端 | Vue 3 + Vite (独立仓库) | 响应式界面 |

## 项目结构

```
src/
  agents/
    oneSentenceAgent/    # 一句话入口 Agent
    scriptAgent/         # 剧本 Agent
    productionAgent/     # 生产 Agent
  socket/routes/        # Socket.IO 路由
  routes/               # REST API 路由
  lib/                  # 数据库初始化
  utils/agent/          # Agent 工具（记忆、交互确认）
data/
  vendor/               # AI 供应商配置
  web/                  # 前端静态页面
  skills/               # Agent 技能提示词
```

## License

MIT
