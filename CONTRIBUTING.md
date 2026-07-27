# 贡献指南 · Contributing

最需要帮助的是**车型参数与峰谷电价的核验**。这两类数据都标记为「待核验」，
你只要拥有对应的车或电费单，就能做出高价值的贡献。

---

## 添加或修正车型

车型数据在 `data/vehicles/*.json`，按品牌分文件。

```jsonc
{
  "id": "byd-yuan-up-401",        // kebab-case，发布后不要再改
  "brand": "BYD",
  "brandZh": "比亚迪",
  "model": "Yuan UP",
  "modelZh": "元UP",
  "variant": "401km",
  "variantZh": "401km 高续航型",
  "year": 2024,

  "batteryCapacityKwh": 45.12,     // 标称容量
  "usableCapacityKwh": 45.12,      // 可用容量，与标称相同时可省略
  "batteryType": "LFP",            // LFP | LMFP | NMC | NCA | NAION

  "acMaxKw": 6.6,                  // 车载充电机上限 ← 决定家充速度的关键参数
  "dcMaxKw": 65,                   // 直流峰值功率，没有直流口填 0

  "cltcRangeKm": 401,
  "consumptionKwhPer100km": 11.2,  // 实际电耗，不是官方标称

  "source": "官方参数",
  "verified": false,               // 只有维护者对照一手资料确认后才改成 true
  "updatedAt": "2026-07-27"
}
```

### 几个容易填错的字段

- **`acMaxKw` 是车载充电机（OBC）的上限，不是你家充电桩的功率。** 这是最重要也最容易
  搞错的参数：7kW 的桩配 6.6kW 的车，实际就是 6.6kW。填错会让所有时长和费用都偏低。
- **`batteryType`** 决定直流充电曲线形状和电池健康建议，务必填准确。
  不确定的话，国产车 2022 年后的入门/中配版本多为 LFP。
- **`consumptionKwhPer100km`** 请填实际电耗（表显平均值），不要填官方数字。
  留空时引擎会从 CLTC 续航反推并打 15% 折扣。
- **`dcCurve`** 是可选的实测充电曲线，格式为 `[[SOC%, 功率占峰值比例], ...]`。
  有实测数据的话非常欢迎提供，会显著提升快充时长的准确度。

---

## 添加或修正电价

电价数据在 `data/tariffs/*.json`。

```jsonc
{
  "id": "cn-jiangsu-residential",
  "name": "江苏居民峰谷分时",
  "region": { "country": "CN", "province": "江苏" },
  "currency": "CNY",
  "seasons": [
    {
      "months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      // 可选：限定工作日或周末
      // "dayTypes": ["weekday"],
      "windows": [
        { "level": "valley", "from": "21:00", "to": "08:00", "price": 0.3583 },
        { "level": "peak",   "from": "08:00", "to": "21:00", "price": 0.5583 }
      ]
    }
  ],
  // 阶梯电价：月累计超过阈值后每度加价
  "tiers": [
    { "upToKwh": 230,  "delta": 0 },
    { "upToKwh": 400,  "delta": 0.05 },
    { "upToKwh": null, "delta": 0.3 }     // 最后一档必须是 null
  ],
  "verified": false
}
```

规则：

- **时段必须不重不漏地覆盖 24 小时。** 校验脚本会强制检查，否则某段充电会被静默按 0 元
  计费。`to` 小于等于 `from` 表示跨零点（如 `21:00 → 08:00`）。
- `level` 取值：`valley`（谷）/ `flat`（平）/ `peak`（峰）/ `sharp`（尖峰）
- 阶梯电价只有最后一档的 `upToKwh` 可以是 `null`
- **请附上你的电费单截图或当地电网公示链接**（`sourceUrl` 字段），这样维护者才能把
  `verified` 改成 `true`

---

## 提交前

```bash
npm run validate:data   # 校验数据（CI 也会跑）
npm run verify          # typecheck + lint + 数据校验 + 全部测试
```

只改 `data/` 目录的 PR 只需要 `validate:data` 通过。

编辑器会根据文件顶部的 `$schema` 字段自动补全和校验字段
（`data/schema/*.schema.json`）。运行时的权威校验来自
`packages/models` 里的 zod schema。

---

## 改代码

### 结构

```
packages/models         zod schema 与共享类型 —— 数据契约的唯一来源
packages/calculator     充电引擎，纯函数、无 I/O，测试覆盖 ≥ 90%
packages/notification   通知渠道适配器，只用 fetch（要能跑在 Workers 上）
apps/web                React 前端
apps/api                Hono 后端，一套代码跑 Workers 和 Node
```

依赖方向严格单向：`calculator → models`，`web/api → calculator, models, notification`。

### 约定

- **引擎里不要有 I/O。** `packages/calculator` 全部是纯函数，这是它能被前端、后端和
  Bot 共用并保证结果一致的前提。
- **时间一律用 epoch 毫秒 + 显式 IANA 时区**，不要依赖运行环境的本地时区。
- **改动引擎必须配测试。** 尤其是功率模型、电价解析和策略选择。
- **新增建议/警告要同时更新三个语言的词典**（`apps/web/src/i18n/`）。
  code 列表在 `apps/web/src/i18n/codes.ts` 里，漏翻会直接编译失败。
- 通知渠道只能用 `fetch`，不能用 Node 专有 API。

### 加一个通知渠道

1. 在 `packages/notification/src/` 新建一个文件，实现 `NotificationChannel` 接口
2. 在 `types.ts` 的 `notificationTargetSchema` 里加上它的 target 类型
3. 在 `dispatch.ts` 的 `CHANNELS` 里注册
4. 如果它需要转发用户提供的 URL，**务必**在 `apps/api/src/app.ts` 的
   `WEBHOOK_HOST_ALLOWLIST` 里加上允许的主机名 —— 否则公开实例会变成 SSRF 跳板

---

## 报告问题

计算结果不对的话，请附上：

- 车型、当前/目标电量、充电桩功率、电价方案
- 你期望的结果和实际得到的结果
- 如果可能，附上实际充电的表现（真实耗时、真实电费）

真实充电数据对校准模型极有价值。

---

## License

提交即表示同意你的贡献以 [MIT](LICENSE) 协议发布。
