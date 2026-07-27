# EVChargePlanner

> 🚗 Intelligent EV Home Charging Planner

EVChargePlanner 是一个开源的新能源汽车家用充电规划工具。

它帮助用户根据车辆型号、当前电量、目标电量、预约时间、峰谷电价等信息，自动计算最佳充电方案，尽量减少高SOC停放时间，降低充电成本，并提供电池健康建议。

项目支持部署到：

- ✅ Cloudflare Pages
- ✅ Cloudflare Workers
- ✅ Docker
- ✅ VPS
- ✅ Nginx
- ✅ Vercel
- ✅ Netlify

未来可作为新能源汽车充电规划平台持续扩展。

---

# 项目目标

帮助新能源汽车用户：

- 自动计算充电时长
- 自动计算预约开始时间
- 自动计算预约结束时间
- 自动计算充电费用
- 自动推荐最佳充电策略
- 尽可能让车辆在出发前充到目标SOC
- 避免长时间100%满电停放
- 提供电池健康建议

---

# MVP 功能

## 车辆选择

支持车型数据库。

例如：

- BYD 元UP
- 元PLUS
- 海豚
- 海豹
- 秦PLUS EV
- 汉EV
- 唐EV

后续支持：

- Tesla
- Xiaomi
- XPeng
- Li Auto
- Zeekr
- NIO
- AITO
- Volvo
- BMW
- Mercedes-Benz
- Audi

用户选择车型即可自动读取：

- 电池容量
- 电池类型
- 最大交流充电功率
- 最大直流充电功率

无需手动输入。

---

# 用户输入

输入内容：

当前SOC：

例如：

35%

目标SOC：

默认：

85%

开始充电时间：

例如：

23:00

交流充电功率：

默认：

7kW

充电效率：

默认：

92%

峰谷电价：

例如：

谷电：

23:00~07:00

---

# 自动计算

自动计算：

- 需要补充电量(kWh)
- 预计充电时长
- 预计结束时间
- 是否跨天
- 峰谷电使用比例
- 总充电费用

例如：

当前SOC：

35%

目标SOC：

85%

输出：

开始：

23:00

结束：

02:41

耗时：

3小时41分钟

补电：

22.8kWh

费用：

¥7.21

---

# 智能预约

支持：

用户输入：

明天：

08:00

出门。

系统自动倒推：

建议：

04:15

开始充电。

07:55

结束。

尽量减少：

高SOC停放时间。

---

# 电池健康建议

根据：

SOC

停车时间

车辆类型

自动推荐：

例如：

建议保持：

60%~80%

建议：

每7~14天充满一次校准SOC。

SOC低于20%：

建议及时充电。

SOC高于90%：

提示：

避免长期停放。

---

# 峰谷电价

支持：

全国各地峰谷电价。

用户可配置：

谷电：

23:00~07:00

平电

峰电

自动计算：

不同时间段费用。

自动推荐：

最佳充电时间。

---

# 长途模式

例如：

周末长途。

建议：

今晚充至100%。

普通通勤：

建议：

80%~85%。

---

# 停车模式

例如：

未来：

7天不开车。

建议：

SOC：

60%左右。

避免：

长期100%。

---

# 多充电模式

支持：

7kW AC

11kW AC

20kW AC

60kW DC

120kW DC

250kW DC

自动重新计算。

---

# 车型数据库

采用：

JSON。

例如：

```json
{
  "brand": "BYD",
  "model": "Yuan UP 401",
  "batteryCapacity": 45.12,
  "batteryType": "LFP",
  "acPower": 7,
  "dcPower": 65
}
```

方便：

Pull Request。

社区维护。

---

# 通知系统

支持：

## Telegram Bot

支持：

- 预约开始提醒
- 预约结束提醒
- SOC提醒
- 长时间未充满提醒
- 长时间满电提醒

例如：

🔋 EVChargePlanner

预计：

23:00

开始充电。

预计：

02:38

达到85%。

---

## 企业微信机器人

支持：

Webhook。

发送：

- 开始提醒
- 完成提醒
- 每日充电建议
- 电池健康提醒

---

## 邮件通知

支持：

SMTP。

发送：

每日充电报告。

---

## Web Push

支持：

浏览器通知。

PWA。

---

# 数据统计

支持：

历史记录：

例如：

本月：

充电：

18次

补电：

322kWh

费用：

¥101

平均SOC：

83%

平均充电时长：

3.4小时

---

# 数据可视化

Charts：

显示：

- SOC变化
- 月度充电次数
- 月度费用
- 电费统计
- 峰谷比例
- 电池利用率

---

# 多语言

支持：

- 中文
- English
- 日本語

后续：

i18n。

---

# UI

参考：

- Apple
- Tesla
- Material 3

要求：

- 响应式
- Mobile First
- Dark Mode
- Card UI
- 现代风格

---

# 技术栈

推荐：

Frontend：

- React
- TypeScript
- TailwindCSS
- Vite

Charts：

- ECharts

State：

- Zustand

Storage：

- IndexedDB

Backend（可选）：

- Node.js
- NestJS

Database：

- SQLite

或者：

- PostgreSQL

---

# 部署

支持：

## Cloudflare Pages

纯静态部署。

## Cloudflare Workers

API。

## Docker

docker-compose

一键部署。

## VPS

Ubuntu

Debian

CentOS

Nginx

PM2

HTTPS。

---

# Docker

提供：

Dockerfile

docker-compose.yml

一键启动：

docker compose up -d

---

# PWA

支持：

安装到：

Android

iPhone

桌面。

离线运行。

---

# 项目结构

```
EVChargePlanner
├── apps
│   ├── web
│   └── api
├── packages
│   ├── calculator
│   ├── ui
│   ├── models
│   └── notification
├── data
│   └── vehicles.json
├── docs
├── docker
└── scripts
```

---

# 后续规划

- AI 智能充电建议
- 天气影响续航分析
- 电池衰减预测
- 家庭光伏充电策略
- 家庭储能联动
- Home Assistant 集成
- MQTT
- 比亚迪开放接口（如未来开放）
- OCPP 协议支持
- 实时充电监控
- 车辆能耗分析
- 充电桩管理
- 多车辆管理
- 家庭成员共享

---

# 项目理念

> **Charge Smarter, Not Longer.**

通过智能规划每一次充电，让新能源汽车充得更科学、更省钱、更健康。

目标不仅是一个充电时间计算器，而是一个长期维护的开源新能源汽车充电规划平台。