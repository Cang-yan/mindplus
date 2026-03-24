# OpenDraft — AI 学术论文生成器

基于多 Agent 协作的学术论文自动生成系统。输入研究主题，自动完成文献检索、大纲设计、分章节撰写、润色降重、摘要生成、引用编译，最终输出完整的 Word/PDF/Markdown 论文。

## 功能特性

- **智能大纲生成** — 根据主题自动分析论文类型（综述/理论/比较/案例等），参考同领域真实论文结构设计大纲，而非套用固定模板
- **自动文献检索** — 通过 Crossref API 检索学术论文，自动生成引用标记并编译参考文献
- **动态章节写作** — 按大纲逐章撰写，每章独立生成，支持用户逐章审阅和编辑
- **一键润色降重** — 集成 Polish + Entropy + Thinking 清理，单次 API 调用完成语法修正、文风优化和 AI 痕迹消除
- **中英文摘要** — 中文论文自动生成中文摘要 + 英文摘要，英文论文仅生成英文摘要
- **实时进度追踪** — SSE 实时推送生成进度，前端可视化展示每个阶段的状态
- **多格式导出** — 支持 Word (.docx)、Markdown (.md)、PDF 输出

## 技术栈

- **后端**: Python + Flask
- **前端**: 单页 HTML（原生 JS，无框架依赖）
- **主模型**: Google Gemini（通过 API 代理）
- **润色模型**: Kimi K2.5（通过 OpenAI 兼容接口）
- **文献检索**: Crossref API

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
pip install httpx[socks]  # 如果使用 SOCKS 代理
```

**系统依赖（Word/PDF 导出必需）：**

```bash
# macOS
brew install pandoc

# Ubuntu/Debian
sudo apt install pandoc

# Windows
choco install pandoc
```

> 未安装 pandoc 时，DOCX 导出将使用基础模式（不支持表格和复杂格式）。

### 2. 配置 API Key

创建 `.env` 文件或设置环境变量：

```bash
export GOOGLE_API_KEY="你的API密钥"
export MYSQL_HOST="127.0.0.1"
export MYSQL_PORT="3306"
export MYSQL_USER="root"
export MYSQL_PASSWORD="change_me"
export MYSQL_DATABASE="mindplus"
```

> 此密钥同时用于 Gemini 主模型和 Kimi K2.5 润色模型（通过同一个代理服务）。

### 3. 启动服务

```bash
python3 app.py
```

服务默认运行在 `http://localhost:18080`。

可选的环境变量：

```bash
# 禁用 Gemini Grounded Search（推荐，该功能容易超时）
export ENABLE_GEMINI_GROUNDED=false

# 禁用 Semantic Scholar（如果不需要）
export ENABLE_SEMANTIC_SCHOLAR=false

# 指定 Gemini 模型（默认 gemini-3-pro-preview）
export GEMINI_MODEL="gemini-3.1-flash-lite-preview-thinking-medium"
```

完整启动示例：

```bash
ENABLE_SEMANTIC_SCHOLAR=false ENABLE_GEMINI_GROUNDED=false python3 app.py
```

## 仅本项目禁用系统代理

为了避免系统代理异常影响 API 调用，项目默认会在**当前进程内**禁用系统代理变量（`HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` 等）。  
这不会修改你的系统设置，也不会影响其他项目。

- 默认行为：`OPENDRAFT_DISABLE_SYSTEM_PROXY=true`
- 如需保留系统代理（恢复旧行为）：

```bash
OPENDRAFT_DISABLE_SYSTEM_PROXY=false python3 app.py
```

## 需要修改的配置

### API 代理地址（Base URL）

项目通过 `.env` 管理 API Base URL，不需要改代码：

```bash
# Gemini SDK 代理（支持 host 或完整 URL）
# 示例：api.linkapi.org
# 示例：https://api.linkapi.org/v1beta/models
GEMINI_API_ENDPOINT=https://api.linkapi.org/v1beta/models

# OpenAI 兼容接口（章节润色）
OPENAI_BASE_URL=https://api.linkapi.org/v1
```

说明：
- `utils/agent_runner.py` 的 Gemini 主模型会读取 `GEMINI_API_ENDPOINT`。
- `utils/agent_runner.py` 的 `_refine_chapter` 会读取 `OPENAI_BASE_URL`。
- `utils/api_citations/gemini_grounded.py` 也会读取 `GEMINI_API_ENDPOINT`。

### 模型配置

项目当前使用的模型：

| 用途 | 模型名称 | 配置位置 |
|------|----------|----------|
| 论文撰写（主模型） | `gemini-3.1-flash-lite-preview-thinking-medium` | 环境变量 `GEMINI_MODEL` 或 `config.py` 第 44 行 |
| 章节润色 / 降重 | `kimi-k2.5` | `utils/agent_runner.py` 第 271 行 |

修改主模型：

```bash
export GEMINI_MODEL="你的模型名称"
```

修改润色模型（在 `utils/agent_runner.py` 的 `_refine_chapter` 函数中）：

```python
response = client.chat.completions.create(
    model="kimi-k2.5",  # ← 修改此处
    ...
)
```

> **注意**: 如果使用 API 代理，代理支持的模型名称可能与官方名称不同，请先确认代理支持的模型列表。

### 支持的 Gemini 模型

在 `config.py` 中定义了可用模型白名单。如需添加新模型，修改 `valid_models` 列表：

```python
valid_models = [
    'gemini-3-flash-preview',
    'gemini-3-pro-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite-preview-thinking-medium',
    # 在此添加新模型...
]
```

## 项目结构

```
opendraft-project/
├── app.py                          # Flask 主应用 + SSE 推送
├── config.py                       # 全局配置（模型、路径、验证）
├── draft_generator.py              # 论文生成主流程（4个阶段）
├── requirements.txt                # Python 依赖
├── static/
│   └── index.html                  # 前端单页应用
├── utils/
│   ├── agent_runner.py             # Agent 执行引擎 + 润色管线
│   ├── abstract_generator.py       # 摘要生成与替换
│   ├── deep_research.py            # 深度文献研究
│   ├── citation_compiler.py        # 引用编译（{cite_XXX} → 格式化引用）
│   └── api_citations/
│       ├── orchestrator.py         # 文献检索调度器
│       ├── crossref_search.py      # Crossref API 检索
│       └── gemini_grounded.py      # Gemini Grounded Search（可选）
└── opendraft/
    └── prompts/                    # Agent 提示词
        ├── 01_research/            # 研究阶段提示词
        ├── 02_structure/           # 大纲设计提示词
        ├── 03_compose/             # 章节撰写提示词
        └── 06_enhance/            # 摘要生成提示词
```

## 生成流程

```
Phase 1: 研究    → Crossref 文献检索 → 深度研究 → 研究缺口分析
Phase 2: 结构    → 智能大纲设计（用户审阅确认）
Phase 3: 撰写    → 逐章撰写 → 润色降重（用户逐章审阅）
Phase 4: 编译    → 引用编译 → 中英文摘要 → 目录生成 → 文档导出
```

## 许可证

MIT License
