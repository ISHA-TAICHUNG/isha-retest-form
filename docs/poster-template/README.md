# 學員版使用說明海報產製工具

這個資料夾放**海報產製的原始模板 + 自動化腳本**。以後要改版（換文案、換截圖）就動這裡。

## 📁 檔案

| 檔案 | 用途 |
|---|---|
| `poster.html` | 海報 HTML 模板（改文案、排版看這個） |
| `1-capture-screenshots.cjs` | 用 Playwright 自動截系統三頁的實機畫面 |
| `2-render-poster.cjs` | 把 `poster.html` 渲染成 PNG + PDF |

## 🚀 使用流程

### 前置條件
- 已安裝 Node.js（建議 v18+）
- 已安裝 Playwright（全域：`npm i -g playwright`，已含 chromium）
- 在 repo 根目錄起本地伺服器，port 8765，例如：
  ```bash
  cd /path/to/isha-retest-form
  npx serve -p 8765
  # 或
  python3 -m http.server 8765
  ```

### 步驟
```bash
# 1. 重新截圖（若系統 UI 有更新才需要）
node docs/poster-template/1-capture-screenshots.cjs

# 2. 渲染海報
node docs/poster-template/2-render-poster.cjs
```

### 輸出
- `docs/screenshots/*.png`（7 張系統截圖）
- `docs/使用說明-一頁版.png`（海報 PNG，給 LINE）
- `docs/使用說明-一頁版.pdf`（海報 PDF，給列印）

## 🎨 要改什麼

- **文案 / 排版**：編輯 `poster.html`，重跑 `2-render-poster.cjs`
- **截圖**：改 `1-capture-screenshots.cjs` 裡的 `mockRecord` / `mockPayload`，重跑
- **加新步驟**：在 `poster.html` 的 `.steps` 裡新增 `.step` 區塊

## 🔧 Playwright 路徑注意

腳本內寫死 `/Users/hao/.nvm/versions/node/v22.19.0/lib/node_modules/playwright`。
若換電腦或 Node 版本，改兩個 .cjs 檔頂端的 `PW_PATH` 變數。
