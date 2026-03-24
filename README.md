# MindPlus

MindPlus 是本仓库承载的核心业务项目，聚焦以下能力：
- AI PPT 生成与编辑
- 文献翻译与文献辅助编撰
- 与独立登录/会员系统联动的鉴权与计费

登录服务（MindUser）仓库地址：[点击跳转](https://github.com/Cang-yan/minduser)

## 项目结构

- [`core-service`](./core-service)
  - 前端（Vue + Vite）与后端（Fastify）核心服务
  - 子项目说明见：[`core-service/README.md`](./core-service/README.md)
- [`opendraft-project`](./opendraft-project)
  - 文献生成/编撰服务（Flask）
  - 子项目说明见：[`opendraft-project/README.md`](./opendraft-project/README.md)
- [`docs`](./docs)
  - 部署与运维文档见：[`docs/DEPLOY_OPS_RUNBOOK.md`](./docs/DEPLOY_OPS_RUNBOOK.md)
- [`scripts`](./scripts)
  - 运维巡检脚本（如 `ops_health_check.sh`）
- [`db`](./db)
  - 数据库初始化 SQL

## 本地开发运行

以下步骤是最小可用流程，适合本地联调。

### 1. 环境准备

- Node.js 18+
- Python 3.10+
- MySQL 8+

### 2. 配置环境变量

```bash
cd /home/xx/LINGINE/mindplus/core-service
cp .env.example .env

cd /home/xx/LINGINE/mindplus/opendraft-project
cp .env.example .env
```

按需填写数据库、AI Key、MindUser 地址等配置。

### 3. 安装依赖

```bash
cd /home/xx/LINGINE/mindplus/core-service
npm run frontend:install
npm run frontend:server:install

cd /home/xx/LINGINE/mindplus/opendraft-project
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
deactivate
```

### 4. 启动服务

先启动 OpenDraft：

```bash
cd /home/xx/LINGINE/mindplus/opendraft-project
source .venv/bin/activate
python3 app.py
```

再启动 core-service（前后端一体开发）：

```bash
cd /home/xx/LINGINE/mindplus/core-service
npm run dev
```

如果你本地也要完整登录链路，再启动 MindUser（在它自己的仓库内启动）。

### 5. 访问入口

- 前端：`http://localhost:5173/slide/`
- core-service 后端健康检查：`http://127.0.0.1:3001/health`
- OpenDraft：`http://127.0.0.1:18080/`

## 相关阅读

- 部署运维手册：[`docs/DEPLOY_OPS_RUNBOOK.md`](./docs/DEPLOY_OPS_RUNBOOK.md)
- core-service 架构说明（新版）：[`core-service/readme-v2.md`](./core-service/readme-v2.md)
