# 管理職類測驗補考報名表 — 專案設定

## 專案概覽

職業安全衛生管理職類測驗補考線上報名系統（GitHub Pages + GAS）。

- **前端**：純 HTML/CSS/JS，部署於 GitHub Pages（geminihao0516/isha-retest-form）
- **清冊來源**：Google Drive 資料夾內的 xlsx / Google Sheets
- **後端**：Google Apps Script（lookup 查詢 + PDF 送出收件）
- **使用情境**：全部由考生於**手機**操作（iOS Safari / Android Chrome）

## 操作目錄

- 本機開發路徑：`/Users/hao/Desktop/管理職類測驗補考報名表/`
- GAS 程式碼來源：`tools/gas_backend.js`（clasp 推送時拷到 `tools/gas/程式碼.js`）
- GitHub 遠端：`https://github.com/geminihao0516/isha-retest-form.git`

## 程式碼風格

- 縮排：2 空格
- 引號：單引號優先（JS）、雙引號（HTML attribute）
- 分號：使用
- 命名：camelCase（變數/函式）、UPPER_SNAKE_CASE（常數）
- 註解：繁體中文，只寫「為什麼」不寫「做什麼」
- Commit 訊息格式：`type(scope): 繁體中文描述`

## 安全注意

- `data/` 與 `*.xlsx` 已 gitignore，**永遠不要 commit 清冊**
- `.env`、Drive Folder ID 不入 git
- `API_TOKEN` 在 `js/config.js`（前端公開可見，僅做初階鎖；真正保護靠 rate limit + lookup-only + Origin 白名單）
- `ADMIN_TOKEN` 存於 GAS ScriptProperties，**絕對不寫入程式碼**

## 版本號同步

修改 CSS/JS 後，一定要同步升級版本號：
- `js/config.js` 的 `VERSION`
- `form.html` / `index.html` / `print.html` 的 `?v=` query string
- `sw.js` 的 `CACHE_NAME` 和靜態資源 `?v=`

版本命名規則：`YYYYMMDD` + 當日字母後綴（a/b/c…）。

## GAS 部署流程

修改 `tools/gas_backend.js` 後：
```bash
cp tools/gas_backend.js tools/gas/程式碼.js
cd tools/gas && clasp push -f
clasp deploy --deploymentId <PROD_DEPLOYMENT_ID> --description "vXX: 說明"
```

Production Deployment ID（固定，不可變動以保持 GAS_URL 不變）：
`AKfycbxiqJaR63wi4u3WvQQh2k2WZ8IqJz_Y7lmqj8ogqiFrEu2XSRLjkJVbTROPro-NiEkk`

## 清冊格式支援

`parseSpreadsheet()` 自動偵測兩種格式：
1. **TP610 樣板**：Row 1-7 抬頭、Row 8 起資料
2. **平面欄位**：Row 1 欄位名（批號/身分證號…）、Row 2 起資料

新版系統匯出的 xlsx 採用「平面欄位」格式。

## Git 工作流程

- commit：`type(scope): 描述` + `Co-Authored-By: Claude...`
- 不自動 push，等使用者確認
- 有效 type：`feat` `fix` `docs` `style` `refactor` `test` `chore` `revert`
- 有效 scope：`前端` `GAS` `PWA` `工具` `設定`

## 不要做的事

- 不寫 README、CHANGELOG（除非使用者明確要求）
- 不提交 `data/`、`*.xlsx`、`tools/gas/`（clasp 工作區）、`.env`
- 不 `--amend` 先前 commit（除非使用者明確要求）
- 不 push 到遠端（等使用者確認）
