<div align="center">

# ⚡ EVChargePlanner

**Charge Smarter, Not Longer.**

开源的新能源汽车家用充电规划平台 · Intelligent EV home charging planner

[功能](#功能) · [快速开始](#快速开始) · [部署](#部署) · [计算模型](docs/calculation.md) · [贡献](CONTRIBUTING.md)

</div>

---

EVChargePlanner 根据车型、当前电量、出发时间和峰谷电价，算出**什么时候开始充电、
充多久、花多少钱**，并给出对电池更友好的建议。

所有计算都在浏览器本地完成，**离线可用、无需账号、数据不上传**。

---

## 功能

### 充电规划

- **四种策略**：立即充 / 最晚开始 / 最省钱 / 均衡推荐
- **智能预约**：给出发时间，自动倒推最晚开始时间，最大限度减少高电量停放
- **峰谷电价**：跨零点时段、季节差异、工作日与周末，以及**阶梯电价**
- **逐分钟仿真**：功率随 SOC 衰减、每分钟按真实所处时段计价
- **分段充电**：允许时自动挑选最便宜的若干时段（可关闭）
- **充电曲线图**：SOC 与功率随时间变化，叠加峰谷时段色带

### 电池健康

- 按化学体系区分建议：LFP 与三元锂的日常区间、停放电量都不同
- **LFP 满充校准提醒**：追踪距上次满充天数
- 停放模式：输入停放天数，给出建议停放电量
- 电池应力评分：高电量暴露、停放时长、温度、快充占比的综合指标

### 更省钱

- **费用对比**：本次方案 vs 全谷电 vs 全峰电 vs 公共快充
- 直接告诉你「相比峰电时段充电，本次省了多少」

### 续航与行程

- 续航估算，含**低温衰减修正**
- **行程反推目标电量**：输入「明天往返 180km」，自动算出该充到多少 %

### 记录与统计

- 充电记录、月度趋势图、峰谷构成、等效循环次数
- JSON 全量备份 / CSV 导出

### 提醒

- **日历提醒（.ics）** —— 零后端依赖，纯静态部署也能用，全平台通吃
- **Telegram Bot** / **企业微信机器人** —— 需要部署可选后端

### 其他

- 中文 / English / 日本語
- 深色模式、移动优先、PWA 可安装、完全离线可用
- 多车辆管理、自定义车型、可视化电价编辑器
- 方案分享链接

---

## 快速开始

需要 Node 22 或更高版本。

```bash
git clone https://github.com/quanyipinghe/ev-charge-planner.git
cd ev-charge-planner
npm install
npm run dev            # http://localhost:5173
```

只跑前端就已经是完整可用的应用了。想要定时推送提醒时再启动后端：

```bash
ENCRYPTION_KEY=$(openssl rand -hex 32) npm run dev:api    # http://localhost:8787
```

然后在「设置 → 通知」里填入后端地址。

常用命令：

```bash
npm run verify         # typecheck + lint + 数据校验 + 测试
npm test               # 单元测试
npm run build          # 构建全部产物
npm run validate:data  # 只校验车型与电价数据
```

---

## 部署

| 目标 | 说明 |
| --- | --- |
| **Cloudflare Pages** | 构建 `npm run build:web`，输出 `apps/web/dist` |
| **Cloudflare Workers** | `cd apps/api && wrangler deploy`（D1 + Cron Triggers） |
| **Vercel** | 仓库内 `vercel.json` 已配置好 |
| **Netlify** | 仓库内 `netlify.toml` 已配置好 |
| **Docker** | `cd docker && cp .env.example .env && docker compose up -d` |
| **VPS + Nginx** | `ENCRYPTION_KEY=... DOMAIN=... ./scripts/deploy-vps.sh` |

完整步骤见 **[docs/deployment.md](docs/deployment.md)**。

前端是纯静态的，任何静态托管都能跑；后端只负责定时提醒，是可选组件。

---

## 项目结构

```
ev-charge-planner
├── apps
│   ├── web            React + Vite + Tailwind + ECharts，PWA
│   └── api            Hono，一套代码同时跑 Workers 和 Node
├── packages
│   ├── models         zod schema 与共享类型
│   ├── calculator     充电引擎（纯函数，95% 测试覆盖）
│   └── notification   通知渠道适配器（ICS / Telegram / 企业微信）
├── data
│   ├── vehicles       车型数据库（按品牌分文件）
│   ├── tariffs        峰谷电价预设
│   └── schema         JSON Schema（编辑器提示用）
├── docker             Dockerfile / compose / nginx
├── scripts            数据构建与部署脚本
└── docs               计算模型与部署文档
```

依赖方向单向：`calculator → models`，`web/api → calculator, models, notification`。

---

## 计算模型

引擎的公式、假设与已知简化全部写在 **[docs/calculation.md](docs/calculation.md)**。

一个能说明设计取向的例子——需求文档的算例「元UP、35%→85%、7kW、92%、耗时 3小时41分钟」
用 7kW 直接算是 3h30m，对不上；但代入元UP 实际 **6.6kW 车载充电机上限**：

```
22.56 kWh ÷ 0.92 ÷ 6.6 kW = 3.715 h = 3小时43分钟
```

几乎完全吻合。这就是为什么引擎必须做 `有效功率 = min(桩功率, 车辆上限)` 的钳制——
忽略它会让每次家充少算 5%~10%。该算例已固化为黄金测试用例。

---

## ⚠️ 关于数据准确性

**车型参数与峰谷电价均来自公开资料，标记为「待核验」，可能与实际存在差异。**

- 车型参数随年款变化，同一车名不同批次的电池容量、充电功率都可能不同
- 峰谷电价随各地政策调整，**请以你的实际电费单为准**
- 应用内所有数据都可以直接修改，改动只存在你自己的浏览器里

发现不准确的地方，欢迎提交 PR 修正 —— 见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 隐私

- 车辆、电价、充电记录全部存在浏览器 IndexedDB 里，不会上传到任何服务器
- 只有在你主动配置了后端地址并点击「发送提醒」时，才会把提醒内容与渠道凭据发送到
  你指定的后端；凭据在服务端以 AES-GCM 静态加密存储
- 想要最好的隐私保障，请**自行部署**后端

---

## 路线图

- [ ] AI 智能充电建议
- [ ] 天气 API 接入（当前为离线温度模型）
- [ ] 电池衰减预测
- [ ] 家庭光伏 / 储能联动
- [ ] Home Assistant 集成、MQTT
- [ ] OCPP 协议、实时充电监控
- [ ] Web Push、SMTP 邮件报告（适配器接口已预留）
- [ ] 家庭成员共享

---

## License

[MIT](LICENSE)

---

<div align="center">

# EVChargePlanner (English)

**Charge Smarter, Not Longer.**

</div>

EVChargePlanner works out **when to start charging, how long it takes and what it
costs**, from your car, its current charge, when you need to leave, and your
time-of-use electricity tariff. It also tells you what that plan does to your battery.

Everything is computed in the browser: **offline-capable, no account, nothing uploaded.**

## Highlights

- **Four strategies** — charge now, latest start, cheapest, balanced
- **Smart reservation** — works backwards from departure to minimise time at high SOC
- **Minute-by-minute simulation** — models the charging taper and prices every minute
  in the tariff band it actually falls in
- **Chemistry-aware battery advice** — LFP wants periodic full charges to recalibrate;
  NMC prefers the middle of the range
- **Cost comparison** — against off-peak, peak and public fast charging
- **Range and trip planning** — with cold-weather correction
- **Calendar (.ics) reminders** — no server required; Telegram and WeCom bots optional
- 中文 / English / 日本語, dark mode, mobile-first, installable PWA

## Getting started

Node 22+.

```bash
npm install
npm run dev            # http://localhost:5173
npm run verify         # typecheck, lint, data validation, tests
```

The optional backend (scheduled push reminders only) runs on both Cloudflare Workers
and Node from one codebase:

```bash
ENCRYPTION_KEY=$(openssl rand -hex 32) npm run dev:api
```

See [docs/deployment.md](docs/deployment.md) for Cloudflare Pages/Workers, Vercel,
Netlify, Docker and VPS instructions, and [docs/calculation.md](docs/calculation.md)
for the formulas, assumptions and known simplifications.

## Data accuracy

Vehicle specifications and electricity tariffs come from public sources and are
marked **unverified**. They vary by model year and change with local policy — check
against your own car and your own bill. Everything is editable in-app, and
corrections are very welcome as pull requests.
