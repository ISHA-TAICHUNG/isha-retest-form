# 管理職類測驗補考報名表系統

職業安全衛生管理職類「結訓電腦測驗報名表（附件四）」線上自動填寫與 A4 列印系統。

> **使用情境**：學員需補考時，輸入身分證字號 → 系統自動從 Google Drive 上的清冊（Excel）找出該員資料 → 填入官方報名表 → 上傳照片與身分證影本 → A4 一頁列印或存 PDF。

---

## ✨ 功能特色

- **身分證查詢**：輸入身分證一鍵帶出該員所屬梯次的所有資料
- **多份清冊合併**：Drive 資料夾內所有 .xlsx 自動合併索引；若一人有多筆紀錄會列出讓使用者選
- **自動帶入欄位**：訓練單位、主管機關備查文號、職類代碼、訓練期別、訓練日期、姓名、地址、學歷…等
- **可微調**：所有欄位皆可手動修改（黃色背景表示為自動帶入）
- **照片上傳**：手機自動開相機拍攝大頭照、身分證正反面，自動壓縮並嵌入列印版面
- **A4 嚴格單頁列印**：對齊官方「附件四」版面，瀏覽器列印或存 PDF 皆可
- **PWA**：可加入主畫面離線使用
- **年度自動**：依當年自動帶入民國年（如 2026 → 115）

---

## 📁 專案結構

```
管理職類測驗補考報名表/
├── README.md                  # 本文件
├── index.html                 # 入口：身分證查詢
├── form.html                  # 表單頁：自動帶入 + 編輯 + 照片上傳
├── print.html                 # A4 列印預覽
├── manifest.json              # PWA manifest
├── sw.js                      # Service Worker
├── css/
│   ├── main.css               # 一般樣式
│   └── print.css              # A4 列印版面
├── js/
│   ├── config.js              # ⚠️ GAS_URL / API_TOKEN 設定區
│   ├── utils.js               # 民國年/身分證驗證/快取等工具
│   ├── api.js                 # 呼叫 GAS 後端
│   ├── job-categories.js      # 測驗職類代碼+名稱清單（可擴充）
│   ├── index.js               # 首頁邏輯
│   ├── form.js                # 表單頁邏輯
│   └── print.js               # 列印頁邏輯
├── icons/
│   └── icon.svg               # PWA 圖示
├── docs/
│   ├── 部署指南.md            # GAS / GitHub Pages 部署步驟
│   ├── 維護指南.md            # 日常更新流程
│   └── 附件四_原始範本.PDF    # 官方報名表範本
├── tools/
│   └── gas_backend.js         # GAS 後端原始碼（部署到 Apps Script）
└── data/                      # ⚠️ git 已忽略，本機開發用清冊
```

---

## 🚀 快速開始

### 1. 本機開發測試

```bash
cd "管理職類測驗補考報名表"
python3 -m http.server 8080
```

開瀏覽器 http://localhost:8080

> 注意：未設定 GAS 後端前，清冊查詢會失敗。可先看 UI、列印版面。

### 2. 設定 GAS 後端

詳見 [`docs/部署指南.md`](docs/部署指南.md)，重點：

1. 把 `tools/gas_backend.js` 內容貼到 https://script.google.com 新建專案
2. 啟用 Drive Advanced Service
3. 修改頂部的 `API_TOKEN` 與 `ROSTER_FOLDER_ID`
4. 部署為「網頁應用程式」（任何人皆可存取）
5. 把 `/exec` URL 填入前端 `js/config.js`

### 3. 部署到 GitHub Pages

```bash
git init
git add .
git commit -m "feat(初始化): 建立補考報名表系統"
git remote add origin <your-github-url>
git push -u origin main
```

GitHub repo → Settings → Pages → Source: `main / (root)`

---

## 🔧 設定檔說明

唯一需要修改的設定都在 `js/config.js` 一個檔案：

```javascript
window.APP_CONFIG = {
  GAS_URL: '<-- 填入 GAS Web App URL -->',
  API_TOKEN: '<-- 與 GAS 一致的 token -->',
  TRAINING_UNIT: '社團法人中華民國工業安全衛生協會附設台中職業訓練中心',
  AUTHORITY: '臺中市政府',
  CURRENT_ROC_YEAR: new Date().getFullYear() - 1911,
  VERSION: '20260415a',
};
```

---

## 🛠 常見維護動作

| 我想… | 動作 |
|------|------|
| 新增測驗職類 | 編輯 `js/job-categories.js` 加一筆物件 |
| 換 GAS 後端 | 改 `js/config.js` 的 `GAS_URL` |
| 變更訓練單位資訊 | 改 `js/config.js` 的 `TRAINING_UNIT` 等常數 |
| 強制清前端快取 | 首頁點「重新載入清冊（強制刷新）」 |
| 升版本號 | 更新 `js/config.js` 的 `VERSION` 與 `sw.js` 的 `CACHE_NAME` |
| 微調 A4 版面 | 改 `css/print.css` |

完整流程詳見 [`docs/維護指南.md`](docs/維護指南.md)。

---

## 🛡 安全設計

本系統處理含個人資料的清冊，採以下分層防護：

### 設計層
1. **lookup-only API**：前端 `API_TOKEN` 只能呼叫 `?action=lookup&id=XXX` 端點，每次只回單筆結果。攻擊者即使取得 token，**無法一次拉走全清冊**（且不知道有哪些身分證號）
2. **管理員 API 分離**：取得全清冊或清快取需 `ADMIN_TOKEN`（僅後端持有，不在前端）
3. **PII minimization**：lookup 結果剔除 Drive 內部欄位
4. **個資不入 git**：`data/` 已 gitignore，前端不存全清冊到 sessionStorage（僅暫存當前查詢的單筆，跳轉用）

### 部署層（請務必啟用）
5. **Origin 白名單**：在 GAS 設 `ALLOWED_ORIGINS = ['你的 github.io 網域', 'localhost']`
6. **Rate limit**：每分鐘 20 次（已內建，依需要調整）
7. **GAS 部署選項**：執行身分「我」、存取權「任何人」（讓 GAS 用您的身分讀 Drive，呼叫端不需登入）

### 維運層
8. **Token 輪替**：建議每 3-6 個月輪替 `API_TOKEN` 與 `ADMIN_TOKEN`
9. **Drive 權限最小化**：清冊資料夾僅分享給 GAS 執行身分的 Google 帳號
10. **列印紙本管理**：含個資，請依個資法妥善保管/銷毁

### ❗ 已知限制
- GAS Web App 的 `ContentService` 無法取得真實 client IP，rate limit 採 UA 指紋（精度有限）
- 前端 `API_TOKEN` 仍會被反向工程取得（僅作為「成本提高」防線；真正防護依賴 lookup-only + Origin 白名單）
- 公開 GitHub Pages 上若需更高安全，建議改用 OAuth 流程（需要使用者登入）

### 🚨 上線前 checklist
- [ ] `tools/gas_backend.js` 中 `ALLOWED_ORIGINS` 已填入你的 Pages 網域
- [ ] `API_TOKEN` 與 `ADMIN_TOKEN` 為不同的隨機字串
- [ ] Drive 清冊資料夾權限只給 GAS 執行身分的帳號
- [ ] GAS 已部署為「任何人」「執行身分：我」
- [ ] 完成後測試：從非白名單網域呼叫應拒絕

---

## 📜 授權

內部使用，未公開授權。

---

## 🙏 致謝

- 報名表範本：勞動部職業安全衛生署「附件四」
- 職類清單：[勞動部職業安全衛生教育訓練測驗資訊網](https://trains.osha.gov.tw/TZ02/TestInfo.aspx)
