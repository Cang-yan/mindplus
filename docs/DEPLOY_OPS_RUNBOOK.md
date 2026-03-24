# MindPlus + MindUser 全链路运维部署手册

更新时间：2026-03-22  
适用目录：
- 主项目：`/home/xx/LINGINE/mindplus`
- 登录服务：`/home/xx/LINGINE/minduser`

本文档把你当前代码中的三套核心服务统一成一条可执行上线链路，覆盖：
- 打包
- 上传服务器
- 数据库初始化
- `systemd` 托管
- `nginx` 配置
- 日志查看
- 版本升级与回滚

---

## 1. 当前服务拓扑（按代码实际）

| 服务 | 目录 | 默认端口 | 作用 | 数据库 |
|---|---|---:|---|---|
| MindUser | `/home/xx/LINGINE/minduser` | `3100` | 统一登录、注册、会员钱包、CDKey | SQLite 或 MySQL（`minduser`库） |
| AiPPT Backend (Fastify) | `/home/xx/LINGINE/mindplus/AiPPT/frontend/server` | `3001` | AiPPT API、鉴权联动 MindUser、业务写库 | MySQL（`mindplus`库） |
| OpenDraft (Flask) | `/home/xx/LINGINE/mindplus/opendraft-project` | `18080` | 文献/论文生成服务（被 AiPPT Backend 转发调用） | MySQL（`mindplus`库） |
| AiPPT Frontend (Vite 构建产物) | `/home/xx/LINGINE/mindplus/AiPPT/frontend/slide` | 由 Nginx 托管 | 前端页面 `/slide/*` | 无 |

关键联动：
- AiPPT Backend 通过 `OPENDRAFT_SERVICE_BASE_URL` 调 OpenDraft。
- AiPPT Backend 通过 `VITE_MINDUSER_BASE_URL` + `MINDUSER_JWT_SECRET` 与 MindUser 做登录态联动。
- AiPPT Backend 与 OpenDraft 共用 `mindplus` MySQL。
- MindUser 建议独立 `minduser` 库（或 SQLite）。

你当前服务器口径（本手册后续按此口径给示例）：
- 公网 `:80` -> Nginx -> AiPPT 前端 `127.0.0.1:3002`
- 公网 `:3001` -> AiPPT Backend（1:1）
- 公网 `:8080` -> MindUser（1:1）
- 公网 `:18080` -> OpenDraft（1:1）

---

## 2. 服务器准备

推荐环境：
- Ubuntu 22.04+
- Node.js 22 LTS（MindUser 默认 SQLite 依赖 `node:sqlite`，Node 22 更稳）
- Python 3.10+
- MySQL 8.0+
- Nginx
- systemd

建议安装：

```bash
sudo apt update
sudo apt install -y nginx mysql-server python3 python3-venv python3-pip build-essential
```

如果 OpenDraft PDF 导出（`weasyprint`）报系统库错误，再补：

```bash
sudo apt install -y libcairo2 libpango-1.0-0 libgdk-pixbuf-2.0-0 libffi-dev shared-mime-info
```

---

## 3. 打包（发布机执行）

下面按“离线包上传”方式，产出两个 tar 包：`mindplus`、`minduser`。

### 3.1 打包 `mindplus`（AiPPT + OpenDraft + SQL）

```bash
set -e
TS=$(date +%Y%m%d_%H%M%S)
RELEASE_DIR=/tmp/release
mkdir -p "$RELEASE_DIR"

cd /home/xx/LINGINE/mindplus/AiPPT
npm run frontend:install
npm run frontend:server:install
npm run frontend:build
npm run security:check

cd /home/xx/LINGINE
tar -czf "$RELEASE_DIR/mindplus_${TS}.tar.gz" \
  --exclude='mindplus/AiPPT/.git' \
  --exclude='mindplus/AiPPT/frontend/node_modules' \
  --exclude='mindplus/AiPPT/frontend/server/node_modules' \
  --exclude='mindplus/opendraft-project/.git' \
  --exclude='mindplus/opendraft-project/.venv' \
  mindplus/AiPPT \
  mindplus/opendraft-project \
  mindplus/db
```

### 3.2 打包 `minduser`

```bash
set -e
TS=$(date +%Y%m%d_%H%M%S)
RELEASE_DIR=/tmp/release
mkdir -p "$RELEASE_DIR"

cd /home/xx/LINGINE
tar -czf "$RELEASE_DIR/minduser_${TS}.tar.gz" \
  --exclude='minduser/.git' \
  --exclude='minduser/node_modules' \
  --exclude='minduser/server/data/*.db' \
  --exclude='minduser/server/data/*.db-*' \
  minduser
```

可选：生成校验和。

```bash
cd /tmp/release
sha256sum mindplus_*.tar.gz minduser_*.tar.gz > SHA256SUMS.txt
```

---

## 4. 上传服务器并解包

### 4.1 上传

```bash
scp /tmp/release/mindplus_*.tar.gz xx@<server>:/tmp/
scp /tmp/release/minduser_*.tar.gz xx@<server>:/tmp/
scp /tmp/release/SHA256SUMS.txt xx@<server>:/tmp/   # 如有
```

### 4.2 服务器解包

```bash
ssh xx@<server>
mkdir -p /home/xx/LINGINE
cd /home/xx/LINGINE

tar -xzf /tmp/release/mindplus_<timestamp>.tar.gz -C /home/xx/LINGINE
tar -xzf /tmp/release/minduser_<timestamp>.tar.gz -C /home/xx/LINGINE
```

---

## 5. 数据库初始化

## 5.1 MindPlus（AiPPT + OpenDraft 共用库）

代码里已有统一 SQL：`/home/xx/LINGINE/mindplus/db/init_mindplus.sql`。

```bash
mysql -h 127.0.0.1 -P 53306 -u minduser -p < /home/xx/LINGINE/mindplus/db/init_mindplus.sql
```

验证：

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p -e "
USE mindplus;
SHOW TABLES LIKE 'presentations';
SHOW TABLES LIKE 'opendraft_papers';
SHOW TABLES LIKE 'theses';
"
```

说明：
- AiPPT Backend 和 OpenDraft 启动时也会 `CREATE TABLE IF NOT EXISTS`，但生产建议先执行统一 SQL，便于审计和一致性。

## 5.2 MindUser（MySQL 模式）

```bash
cd /home/xx/LINGINE/minduser
mysql -h 127.0.0.1 -P 3306 -u <user> -p < sql/mysql_init.sql
npm run db:init:seed
npm run db:check
```

`db:check` 输出 `backend=mysql` 即表示切换成功。

## 5.3 MindUser（SQLite 模式）

`.env` 中设置：

```env
DB_CLIENT=sqlite
DB_PATH=/home/xx/LINGINE/minduser/server/data/minduser.db
```

启动后执行：

```bash
cd /home/xx/LINGINE/minduser
npm run db:check
```

---

## 6. 环境变量配置

## 6.1 MindUser：`/home/xx/LINGINE/minduser/.env`

从模板复制：

```bash
cd /home/xx/LINGINE/minduser
cp .env.example .env
```

至少修改：
- `PORT=8080`
- `HOST=0.0.0.0`
- `JWT_SECRET`
- `INTERNAL_RECHARGE_KEY`
- `CORS_ORIGIN`
- `MINDPLUS_ADMIN_PASSWORD`
- 数据库相关（`DB_CLIENT` / `DATABASE_URL` / `DB_PATH`）

## 6.2 AiPPT：`/home/xx/LINGINE/mindplus/AiPPT/frontend/.env`

从模板复制：

```bash
cd /home/xx/LINGINE/mindplus/AiPPT/frontend
cp .env.example .env
```

必须核对：
- `PORT=3001`
- `MINDUSER_JWT_SECRET=<必须与 minduser JWT_SECRET 一致>`
- `VITE_MINDUSER_BASE_URL=http://<公网IP>:8080`
- `VITE_MINDUSER_SERVICE_KEY=mindplus`
- `OPENDRAFT_SERVICE_BASE_URL=http://127.0.0.1:18080`
- `MYSQL_HOST/PORT/USER/PASSWORD/DATABASE`（指向 `mindplus` 库）
- `UPLOAD_DIR` 建议改绝对路径（如 `/home/xx/LINGINE/mindplus-data/aippt/uploads`）

重要提醒：
- `tools/generate-runtime-config.sh` 会把部分 `VITE_*` 写进浏览器可见的 `runtime-config.js`。
- 不要把仅服务端使用的密钥放到前端运行时配置里。

## 6.3 OpenDraft：`/home/xx/LINGINE/mindplus/opendraft-project/.env`

从模板复制：

```bash
cd /home/xx/LINGINE/mindplus/opendraft-project
cp .env.example .env
```

至少修改：
- `GOOGLE_API_KEY`
- `MYSQL_HOST/PORT/USER/PASSWORD/DATABASE=mindplus`
- `OPENDRAFT_HOST=0.0.0.0`（你当前要做公网 `:18080` 直连）
- `OPENDRAFT_PORT=18080`
- `OPENDRAFT_DISABLE_SYSTEM_PROXY=true`（默认）

---

## 7. 服务器安装依赖与构建

## 7.1 MindUser

```bash
cd /home/xx/LINGINE/minduser
npm ci --omit=dev
```

## 7.2 AiPPT（前后端）

```bash
cd /home/xx/LINGINE/mindplus/AiPPT
npm --prefix frontend ci
npm --prefix frontend/server ci
npm --prefix frontend run build
```

生成前端运行时配置（写入构建目录 `slide`）：

```bash
cd /home/xx/LINGINE/mindplus/AiPPT/frontend
set -a
source .env
set +a
bash tools/generate-runtime-config.sh ./slide
```

将静态资源同步到 Nginx 目录：

```bash
sudo mkdir -p /var/www/aippt/slide
sudo rsync -a --delete /home/xx/LINGINE/mindplus/AiPPT/frontend/slide/ /var/www/aippt/slide/
```

## 7.3 OpenDraft

```bash
cd /home/xx/LINGINE/mindplus/opendraft-project
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
deactivate
```

---

## 8. systemd 托管

## 8.1 MindUser

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

## 8.2 AiPPT Backend

文件：`/etc/systemd/system/aippt-server.service`

```ini
[Unit]
Description=AiPPT Backend Service
After=network.target minduser.service opendraft.service
Wants=opendraft.service

[Service]
Type=simple
User=xx
WorkingDirectory=/home/xx/LINGINE/mindplus/AiPPT/frontend/server
Environment=NODE_ENV=production
Environment=AIPPT_ENV_FILE=/home/xx/LINGINE/mindplus/AiPPT/frontend/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

## 8.3 OpenDraft

文件：`/etc/systemd/system/opendraft.service`

```ini
[Unit]
Description=OpenDraft Service
After=network.target mysql.service

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

## 8.4 AiPPT Frontend（3002）

当你采用“`80 -> 3002` 反代前端”时，必须常驻一个前端服务监听 `127.0.0.1:3002`。

文件：`/etc/systemd/system/aippt-frontend.service`

```ini
[Unit]
Description=AiPPT Frontend Preview Service
After=network.target

[Service]
Type=simple
User=xx
WorkingDirectory=/home/xx/LINGINE/mindplus/AiPPT/frontend
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run preview -- --host 127.0.0.1 --port 3002 --strictPort
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

启动前请确保前端构建产物已生成：

```bash
cd /home/xx/LINGINE/mindplus/AiPPT/frontend
npm run build
bash tools/generate-runtime-config.sh ./slide
```

## 8.5 启动

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now minduser
sudo systemctl enable --now opendraft
sudo systemctl enable --now aippt-server
sudo systemctl enable --now aippt-frontend

sudo systemctl status minduser --no-pager
sudo systemctl status opendraft --no-pager
sudo systemctl status aippt-server --no-pager
sudo systemctl status aippt-frontend --no-pager
```

---

## 9. Nginx 配置（单公网 IP 口径）

文件示例：`/etc/nginx/conf.d/mindplus.conf`

```nginx
# 目标：
# - 80 -> 3002（AiPPT 前端）
# - 3001 / 8080 / 18080 走服务自身端口直连（不经 Nginx 转发）
server {
    listen 80;
    server_name _;
    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600;
    }
}
```

应用配置：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

上线请接入 HTTPS（`certbot` 或其他证书方案）。

配套端口与监听建议（保证“80->3002，其余 1:1”能调通）：
- AiPPT 前端（3002）建议只监听本机：`127.0.0.1:3002`（由 Nginx 转发）
- AiPPT Backend：`0.0.0.0:3001`
- MindUser：`0.0.0.0:8080`（`.env` 设 `PORT=8080`、`HOST=0.0.0.0`）
- OpenDraft：`0.0.0.0:18080`（`.env` 设 `OPENDRAFT_HOST=0.0.0.0`）

服务间互调关键变量（AiPPT Backend）：
- `OPENDRAFT_SERVICE_BASE_URL=http://127.0.0.1:18080`
- `VITE_MINDUSER_BASE_URL=http://<公网IP>:8080`
  - 当前代码中该变量同时用于前端跳转和后端鉴权校验，因此单 IP 模式建议填公网地址。

---

## 10. 发布后验收

本机健康检查：

```bash
curl -s http://127.0.0.1:8080/health
curl -s http://127.0.0.1:3001/health
curl -I http://127.0.0.1:18080/
curl -I http://127.0.0.1:3002/
curl -s "http://127.0.0.1:18080/api/papers?uid=smoke-test"
```

外网验收（示例）：
- `http://<公网IP>/`（应命中 3002 前端）
- `http://<公网IP>:8080/mindplus/login`
- `http://<公网IP>:3001/health`
- `http://<公网IP>:18080/api/papers?uid=smoke-test`
- AiPPT 登录后请求不报 `401`/`502`
- OpenDraft 生成流程可启动（`/api/opendraft/generate`）

---

## 11. 日志查看与排障

### 11.1 systemd 日志

```bash
journalctl -u minduser -f
journalctl -u aippt-server -f
journalctl -u opendraft -f
```

最近 200 行：

```bash
journalctl -u minduser -n 200 --no-pager
journalctl -u aippt-server -n 200 --no-pager
journalctl -u opendraft -n 200 --no-pager
```

### 11.2 Nginx 日志

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 11.3 常见问题

1. AiPPT 登录后 401  
`MINDUSER_JWT_SECRET` 与 MindUser 的 `JWT_SECRET` 不一致。

2. AiPPT 调 OpenDraft 502  
`opendraft.service` 未启动，或 `OPENDRAFT_SERVICE_BASE_URL` 配置错误。

3. MindUser SQLite 启动失败（`node:sqlite`）  
Node 版本过低，升级到 Node 22 LTS。

4. OpenDraft 启动时 MySQL 初始化失败  
检查 `MYSQL_*` 以及 `mindplus` 库权限。

---

## 12. 版本升级流程（推荐）

1. 备份（必须）
- 备份数据库（`mindplus`、`minduser`）。
- 备份配置文件：
  - `/home/xx/LINGINE/minduser/.env`
  - `/home/xx/LINGINE/mindplus/AiPPT/frontend/.env`
  - `/home/xx/LINGINE/mindplus/opendraft-project/.env`
  - MindUser 卡密文件（如 `.cardkey_secret`、`batch_registry.json`）

2. 构建并上传新包（第 3、4 章）

3. 服务器更新代码（覆盖解包）

4. 安装依赖与重建

```bash
cd /home/xx/LINGINE/minduser && npm ci --omit=dev
cd /home/xx/LINGINE/mindplus/AiPPT && npm --prefix frontend ci && npm --prefix frontend/server ci && npm --prefix frontend run build
cd /home/xx/LINGINE/mindplus/AiPPT/frontend && set -a && source .env && set +a && bash tools/generate-runtime-config.sh ./slide
sudo rsync -a --delete /home/xx/LINGINE/mindplus/AiPPT/frontend/slide/ /var/www/aippt/slide/
cd /home/xx/LINGINE/mindplus/opendraft-project && source .venv/bin/activate && pip install -r requirements.txt && deactivate
```

5. 如有 schema 变更，执行初始化 SQL（幂等）

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p < /home/xx/LINGINE/mindplus/db/init_mindplus.sql
mysql -h 127.0.0.1 -P 3306 -u <user> -p < /home/xx/LINGINE/minduser/sql/mysql_init.sql
```

6. 重启服务

```bash
sudo systemctl restart opendraft
sudo systemctl restart aippt-server
sudo systemctl restart minduser
sudo systemctl reload nginx
```

7. 验收（第 10 章）

---

## 13. 回滚流程

1. 回滚代码到上一版本包并解压覆盖。  
2. 恢复升级前数据库备份。  
3. 重启服务：

```bash
sudo systemctl restart opendraft aippt-server minduser
sudo systemctl reload nginx
```

4. 复测关键链路（登录、AiPPT 生成、OpenDraft 调用、充值/扣费）。

---

## 14. 运维清单（上线前最后确认）

- [ ] MindUser、AiPPT、OpenDraft 三服务均 `active (running)`
- [ ] `JWT_SECRET` 与 `MINDUSER_JWT_SECRET` 已按预期配置
- [ ] `OPENDRAFT_SERVICE_BASE_URL` 可达
- [ ] MySQL 初始化脚本已执行
- [ ] Nginx 配置 `nginx -t` 通过
- [ ] 日志可实时查看（`journalctl` + Nginx）
- [ ] 备份与回滚演练过一次
- [ ] 已按当前策略开放端口（`80` 转发前端、`3001/8080/18080` 直连）
- [ ] `3002` 仅本机监听（推荐），由 `80` 转发访问
