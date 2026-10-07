# 多資產即時進場助手 Web 版

這是一套可以直接部署的最小完整版本：

TradingView Alert → `/api/webhook` → Supabase → `/api/trades` → 網頁歷史單

## 1. 建 Supabase

1. 到 Supabase 建一個 Project。
2. 打開 SQL Editor。
3. 把 `sql/schema.sql` 全部貼進去執行。
4. 到 Project Settings → API，取得：
   - Project URL
   - service_role key

## 2. 部署到 Vercel

1. 把整個專案上傳到 GitHub。
2. Vercel → Add New Project → Import GitHub Repo。
3. 在 Vercel Environment Variables 加：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEBHOOK_SECRET`

例如 WEBHOOK_SECRET 可設成：
`xau-2026-secret`

部署完成後，首頁就是你的網站。

## 3. TradingView Webhook URL

假設你的 Vercel 網址是：

`https://your-app.vercel.app`

Webhook URL：

`https://your-app.vercel.app/api/webhook?secret=xau-2026-secret`

## 4. TradingView Alert Message JSON

你的 Pine alert() / alertcondition 最後要送出這類 JSON：

```json
{
  "signal_time": "{{timenow}}",
  "symbol": "{{ticker}}",
  "timeframe": "{{interval}}",
  "direction": "BUY",
  "mode": "1",
  "entry": 4163.82,
  "sl": 4156.39,
  "tp1": 4170.38,
  "tp2": 4177.90,
  "tp3": 4185.20,
  "quality": 78,
  "result": "OPEN"
}
```

SELL 的 direction 改成 `SELL`。

## 5. 網頁顯示

每一單會是一整列，依時間往下排：

單號｜訊號時間｜商品｜週期｜方向｜模式｜Entry｜SL｜TP1｜TP2｜TP3｜品質｜結果｜出場價｜來源

可以切換：
- XAUUSD
- BTCUSDT
- ETHUSDT
- SOLUSDT
- 全部商品

## 重要

目前這版已經把「接收新單」和「顯示歷史單」做好。

若要自動把 OPEN 更新成 WIN / LOSS，下一步要讓 TradingView 在 TP/SL 被碰到時再送一個 `close/update` webhook，或由後端自行追價判斷。那會是第二階段。
