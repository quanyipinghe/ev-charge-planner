# 部署 · Deployment

EVChargePlanner 由两个可以分开部署的部分组成：

| | 是什么 | 需要吗 |
| --- | --- | --- |
| **Web** | 纯静态前端，所有计算在浏览器完成 | **必需** |
| **API** | Hono 后端，只负责定时推送提醒 | 可选 |

只部署 Web 就是一个完整可用的应用，提醒功能会自动降级为**日历（.ics）提醒**，
在所有平台都能用。只有需要 Telegram / 企业微信定时推送时才需要 API。

前置要求：Node 22 或更高（后端用到内置的 `node:sqlite`）。

---

## 1. Cloudflare Pages（纯静态，推荐）

在 Cloudflare 控制台新建 Pages 项目并连接仓库：

| 设置项 | 值 |
| --- | --- |
| Build command | `npm run build:web` |
| Build output directory | `apps/web/dist` |
| Node version | `22` |

SPA 路由由 `apps/web/public/_redirects` 处理，无需额外配置。

---

## 2. Vercel / Netlify

两者的配置文件都已在仓库里，直接导入仓库即可：

- Vercel → `vercel.json`
- Netlify → `netlify.toml`

或用命令行：

```bash
npx vercel deploy --prod
npx netlify deploy --prod
```

---

## 3. Cloudflare Workers（API）

```bash
cd apps/api

# 1. 创建 D1 数据库，把输出的 database_id 填进 wrangler.toml
npx wrangler d1 create evcp

# 2. 建表
npx wrangler d1 migrations apply evcp --remote

# 3. 设置加密密钥（用于加密存储的通知凭据）
openssl rand -hex 32 | npx wrangler secret put ENCRYPTION_KEY

# 4. 数据打包需要先生成
npm run build:data -w ../..

# 5. 部署
npx wrangler deploy
```

`wrangler.toml` 里已经配好每 5 分钟触发一次的 Cron Trigger，用于扫描并发送到期提醒。

部署后把 Worker 地址填进应用的「设置 → 通知 → 后端地址」。

**建议**把 `ALLOWED_ORIGINS` 从 `*` 改成你自己的前端域名：

```bash
npx wrangler deploy --var ALLOWED_ORIGINS:https://your-domain.example
```

本地调试：

```bash
npx wrangler dev        # 使用本地 D1
```

---

## 4. Docker（前后端一体，一条命令）

```bash
cd docker
cp .env.example .env

# 生成加密密钥并写入 .env
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

docker compose up -d
```

打开 <http://localhost:8080>。

镜像里 nginx 提供静态前端并反代 `/api` 到同容器内的 Node 进程。
提醒数据库存在 `evcp-data` 卷里，其余数据都在浏览器本地。

细节：

- 以非 root 用户运行，nginx 监听容器内 8080 端口
- `node:sqlite` 是 Node 内置模块，**没有任何原生依赖需要编译**
- 内置 healthcheck，`docker compose ps` 可以看到健康状态

查看日志与升级：

```bash
docker compose logs -f
docker compose up -d --build      # 重新构建并滚动更新
```

---

## 5. VPS + Nginx + PM2

在一台 Ubuntu / Debian / CentOS 上：

```bash
# 安装 Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx
sudo npm install -g pm2

# 部署
git clone https://github.com/quanyipinghe/ev-charge-planner.git
cd ev-charge-planner
ENCRYPTION_KEY=$(openssl rand -hex 32) DOMAIN=evcp.example.com ./scripts/deploy-vps.sh
```

脚本会：

1. 构建前端与 API
2. 前端产物放到 `/var/www/evchargeplanner`
3. API 装到 `/opt/evchargeplanner`，用 PM2 常驻（单实例——多实例会重复发送提醒）
4. 密钥写入 `/opt/evchargeplanner/.env`（权限 600）
5. 生成 nginx 站点配置并 reload

启用 HTTPS：

```bash
sudo certbot --nginx -d evcp.example.com
```

日常运维：

```bash
pm2 logs evcp-api
pm2 restart evcp-api
pm2 startup && pm2 save    # 开机自启
```

---

## 6. 环境变量（API）

| 变量 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `ENCRYPTION_KEY` | **是** | — | 加密存储的通知凭据。`openssl rand -hex 32` |
| `PORT` | 否 | `8787` | Node 监听端口 |
| `DATABASE_FILE` | 否 | `./data/evcp.sqlite` | SQLite 路径（仅 Node） |
| `ALLOWED_ORIGINS` | 否 | `*` | CORS 白名单，逗号分隔。公网部署请收紧 |
| `MAX_PENDING_PER_DEVICE` | 否 | `20` | 单个浏览器可排队的提醒上限 |
| `TELEGRAM_WEBHOOK_SECRET` | 否 | — | 校验 Telegram webhook 的共享密钥 |
| `DEFAULT_VEHICLE_ID` | 否 | 车型库第一条 | `/plan` 指令用的默认车型 |
| `DEFAULT_TARIFF_ID` | 否 | — | `/plan` 指令用的默认电价 |
| `DISPATCH_CRON` | 否 | `*/5 * * * *` | 提醒扫描频率（仅 Node） |

---

## 7. Telegram Bot（可选）

1. 找 [@BotFather](https://t.me/BotFather) 创建 Bot，拿到 token
2. 给 Bot 发一条消息，然后访问
   `https://api.telegram.org/bot<TOKEN>/getUpdates` 拿到你的 chat id
3. 在应用「设置 → 通知 → Telegram Bot」里填入，点「发送测试消息」验证

想用 `/plan 35 85` 指令直接查询，再注册 webhook：

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://your-api.example/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

## 8. 企业微信机器人（可选）

在群里添加「群机器人」，复制 Webhook 地址，填进「设置 → 通知 → 企业微信机器人」。

> 出于安全考虑，后端只允许把 Webhook 转发到 `qyapi.weixin.qq.com`。
> 这是为了防止公开实例被当作跳板去访问内网地址。

---

## 9. 安全与隐私建议

- **自行部署**是最好的隐私保障：定时提醒必然需要把渠道凭据存在服务端。
- 凭据以 AES-GCM 静态加密存储，密钥只在服务端环境变量里，且从不通过 API 返回。
- 公网实例请务必收紧 `ALLOWED_ORIGINS`，并保留 `MAX_PENDING_PER_DEVICE` 限制。
- 提醒归属靠浏览器本地生成的随机 `deviceId`。它不是强身份凭证，只用来隔离不同浏览器
  的提醒，不要在公开实例上放置敏感内容。
- 已发送/失败的提醒会在 7 天后自动清理。

---

## 10. 升级

```bash
git pull
npm ci
npm run verify        # 确认没坏
npm run build
```

前端升级后 Service Worker 会自动更新（`registerType: autoUpdate`）；
nginx 配置已确保 `sw.js` 与 `index.html` 不被缓存，用户刷新即可拿到新版本。
