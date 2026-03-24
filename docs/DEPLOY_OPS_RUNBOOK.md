# MindPlus GitHub 更新与部署手册

适用项目：`/home/xx/LINGINE/mindplus`  
更新时间：`2026-03-24`

## 1. 目标

这版手册只做一件事：
- 继续沿用你现在的线上部署方式（服务器拉 GitHub + 重启服务）
- 不强制你改成复杂 CI/CD
- 尽量少改现网配置，降低出错和迁移成本

适用场景：
- 服务器可直接访问 GitHub
- 你已经有可运行的 `mindplus` 线上环境
- 你希望以后按固定命令完成更新、回滚、排障

说明：
- 这版默认使用当前仓库结构：`core-service` + `opendraft-project`
- `systemd` 服务名、端口、Nginx 配置建议保持你现网已有值，不强制改名

## 2. 一次性准备（首次或新服务器）

### 2.1 代码目录

```bash
mkdir -p /home/xx/LINGINE
cd /home/xx/LINGINE
git clone <YOUR_GITHUB_REPO_URL> mindplus
cd /home/xx/LINGINE/mindplus
```

### 2.2 核心环境变量

```bash
cd /home/xx/LINGINE/mindplus/core-service
cp .env.example .env
```

至少检查这些变量：
- `VITE_BACKEND_HOST`（一般 `127.0.0.1`）
- `VITE_BACKEND_PORT`（默认 `3001`）
- `JWT_SECRET`
- `MINDUSER_JWT_SECRET`
- `MYSQL_HOST` `MYSQL_PORT` `MYSQL_USER` `MYSQL_PASSWORD` `MYSQL_DATABASE`
- `VITE_MINDUSER_BASE_URL`（如果你接了 MindUser 登录）
- `OPENDRAFT_SERVICE_BASE_URL`（默认 `http://127.0.0.1:18080`）

OpenDraft 环境文件（若未配置过）：

```bash
cd /home/xx/LINGINE/mindplus/opendraft-project
cp .env.example .env
```

### 2.3 安装依赖（首次）

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

### 2.4 首次部署：systemd 服务配置（重点）

以下是首次部署建议的最小 service 方案，名称保持与本文后续命令一致：
- `aippt-server`
- `opendraft`
- `nginx`

如果你已有线上服务名，建议继续沿用现有名字，减少改动成本。

#### 2.4.1 `aippt-server`（core-service 后端）

文件：`/etc/systemd/system/aippt-server.service`

```ini
[Unit]
Description=MindPlus Core Backend Service
After=network.target opendraft.service
Wants=opendraft.service

[Service]
Type=simple
User=xx
WorkingDirectory=/home/xx/LINGINE/mindplus/core-service
Environment=NODE_ENV=production
Environment=AIPPT_ENV_FILE=/home/xx/LINGINE/mindplus/core-service/.env
ExecStart=/usr/bin/npm run frontend:server:start
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

#### 2.4.2 `opendraft`（文献服务）

文件：`/etc/systemd/system/opendraft.service`

```ini
[Unit]
Description=OpenDraft Service
After=network.target

[Service]
Type=simple
User=xx
WorkingDirectory=/home/xx/LINGINE/mindplus/opendraft-project
EnvironmentFile=/home/xx/LINGINE/mindplus/opendraft-project/.env
ExecStart=/home/xx/LINGINE/mindplus/opendraft-project/.venv/bin/python app.py
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

#### 2.4.3 （可选）`minduser`（同机部署登录系统时）

如果 MindUser 不在本机部署，这节可跳过。  
如果在同一台机器，可参考：

文件：`/etc/systemd/system/minduser.service`

```ini
[Unit]
Description=MindUser Service
After=network.target

[Service]
Type=simple
User=xx
WorkingDirectory=/home/xx/LINGINE/minduser
Environment=NODE_ENV=production
EnvironmentFile=/home/xx/LINGINE/minduser/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

### 2.5 首次部署：启用并启动服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now opendraft
sudo systemctl enable --now aippt-server
sudo systemctl enable --now nginx

# 若同机部署 MindUser，再执行：
# sudo systemctl enable --now minduser
```

检查状态：

```bash
sudo systemctl status aippt-server --no-pager
sudo systemctl status opendraft --no-pager
sudo systemctl status nginx --no-pager
```

### 2.6 已有线上服务：只做状态确认（低改动）

如果你线上已经有服务在跑，建议只确认可重启即可：

```bash
sudo systemctl status aippt-server --no-pager
sudo systemctl status opendraft --no-pager
sudo systemctl status nginx --no-pager
```

如果你的服务名不是上面这几个，后面命令替换成你自己的名字即可。

## 3. 日常发布流程（GitHub 更新）

每次发版按下面顺序走。

### 3.1 发布前备份（建议）

```bash
mkdir -p /home/xx/backup
cp /home/xx/LINGINE/mindplus/core-service/.env /home/xx/backup/mindplus_env_$(date +%F_%H%M%S).bak
cp /home/xx/LINGINE/mindplus/opendraft-project/.env /home/xx/backup/opendraft_env_$(date +%F_%H%M%S).bak
```

如果本次涉及数据库结构变更，再加一份 SQL 备份。

### 3.2 拉取目标版本

```bash
cd /home/xx/LINGINE/mindplus
git fetch --all --tags
git status --short
```

方式 A（按主分支发布）：

```bash
git checkout main
git pull --ff-only origin main
```

方式 B（按 tag 发布）：

```bash
git checkout tags/<release-tag>
```

记录当前版本（便于回滚）：

```bash
git rev-parse --short HEAD
```

### 3.3 依赖安装与构建

```bash
cd /home/xx/LINGINE/mindplus/core-service
npm run frontend:install
npm run frontend:server:install
npm run frontend:build
npm run security:check
```

OpenDraft 如有 Python 依赖变化再执行：

```bash
cd /home/xx/LINGINE/mindplus/opendraft-project
source .venv/bin/activate
pip install -r requirements.txt
deactivate
```

### 3.4 重启服务

```bash
sudo systemctl restart aippt-server
sudo systemctl restart opendraft
sudo systemctl reload nginx

sudo systemctl status aippt-server --no-pager
sudo systemctl status opendraft --no-pager
```

### 3.5 发布后验收

```bash
curl -s http://127.0.0.1:3001/health
curl -s http://127.0.0.1:18080/
```

再做一次前端实际访问验证（浏览器）：
- `/slide/` 可正常打开
- 登录流程可用（如果你开启了 MindUser）
- 核心功能至少跑一遍（如生成、导出、文献流程）

## 4. 快速回滚

### 4.1 代码回滚

```bash
cd /home/xx/LINGINE/mindplus
git reflog --date=local -n 20
git checkout <previous-commit-or-tag>

cd /home/xx/LINGINE/mindplus/core-service
npm run frontend:install
npm run frontend:server:install
npm run frontend:build

sudo systemctl restart aippt-server
sudo systemctl restart opendraft
sudo systemctl reload nginx
```

### 4.2 环境回滚（必要时）

```bash
cp /home/xx/backup/mindplus_env_<timestamp>.bak /home/xx/LINGINE/mindplus/core-service/.env
cp /home/xx/backup/opendraft_env_<timestamp>.bak /home/xx/LINGINE/mindplus/opendraft-project/.env

sudo systemctl restart aippt-server
sudo systemctl restart opendraft
```

## 5. 常用排障命令

```bash
journalctl -u aippt-server -f
journalctl -u opendraft -f
journalctl -u aippt-server -n 200 --no-pager
journalctl -u opendraft -n 200 --no-pager

ss -ltnp | rg ':3001|:18080|:80'
```

可选一键检查：

```bash
cd /home/xx/LINGINE/mindplus
bash scripts/ops_health_check.sh
```

## 6. 发布规范（轻量建议）

- 主分支建议保持可发布状态（`main`）
- 每次上线打 tag（例如 `mindplus-v2026.03.24-1`）
- 生产更新优先用 `git pull --ff-only`，避免意外 merge commit
- 先小步发布，再做功能性大改

## 7. 关于 GitHub Actions（结论）

你当前这套流程不依赖 GitHub Actions 也能正常发布。

也就是说：
- 删除或不启用 Actions，不影响你执行 `npm run security:check`
- `security:check` 是本地/服务器脚本能力，和 GitHub Actions 是两回事
- 你后续如果想自动化，再把 Actions 加回来即可，不影响当前低成本上线模式
