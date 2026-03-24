文件结构

server/
├── server.js          # 入口，Fastify 注册所有路由
├── config.js          # 读取环境变量（优先 core-service/.env）
├── db.js              # MySQL 连接池 + 自动建表
└── routes/
    ├── auth.js        # /api/auth/*  注册/登录/GitHub OAuth
    ├── presentations.js # /api/presentations/*
    ├── versions.js    # /api/presentations/:id/versions/*
    ├── documents.js   # /documents/*
    ├── comments.js    # /comments/*
    ├── templates.js   # /api/templates/*
    ├── ai.js          # /ai/trial/*  /ai/image/*
    ├── coze.js        # /api/coze/*  大纲/PPT 生成代理
    ├── speech.js      # /api/speech/xunfei-url
    ├── files.js       # /upload/*  /parse/*
    ├── user.js        # /user/*  /admin/*
    └── mock.js        # /mock/*
启动方式

cd /home/xx/LINGINE/mindplus/core-service
cp .env.example .env   # 按需填入 API 密钥（前后端共用）
cd frontend/server
npm install
npm start              # 生产
npm run dev            # 开发（--watch 热重载）


当前安全状况分析
✅ 已有的保护
措施	代码位置
密码 bcrypt 哈希（cost=10）	auth.js:routes/auth.js
JWT 签名验证	server.js authenticate
接口频率限制 300次/分钟	server.js rate-limit
外键约束（级联删除）	db.js
权限校验（owner 才能改）	documents.js、presentations.js
⚠️ 当前存在的风险
1. JWT_SECRET 是弱默认值


# core-service/.env 里默认是
JWT_SECRET=change-this-secret-in-production  # ← 必须改！
如果不改，任何人都能伪造 token。

2. MySQL 弱口令风险
如果 `MYSQL_USER/MYSQL_PASSWORD` 配置过弱，数据库容易被暴力破解。

3. 上传文件没有类型校验
files.js 目前接受任意文件，有上传恶意文件的风险。

4. 根目录 .env 文件如果泄露
API Key、JWT Secret、数据库账号全部暴露。

🔧 必须做的加固（10分钟能完成）
第一步：生成强 JWT Secret


node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# 把输出粘贴到 core-service/.env 的 JWT_SECRET=
第二步：限制上传文件类型，在 files.js 加一行：


const ALLOWED = ['image/jpeg','image/png','image/webp','application/pdf','text/plain']
if (!ALLOWED.includes(data.mimetype)) {
  return reply.code(400).send(fail('不支持的文件类型'))
}
第三步：服务器上保护文件权限


chmod 600 .env        # 只有自己能读
# MySQL 建议额外启用最小权限账号，不要使用 root 直连业务
第四步：定期备份数据库


# 加一个 cron，每天备份
0 3 * * * mysqldump -h127.0.0.1 -uroot -p'my-pass' mindplus > /path/to/backups/mindplus-$(date +%F).sql
