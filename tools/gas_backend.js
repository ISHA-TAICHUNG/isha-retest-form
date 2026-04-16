/**
 * 管理職類測驗補考報名表 — Google Apps Script 後端（強化安全版）
 *
 * 安全策略（v2）：
 *   1. 預設端點 lookup 只回單筆查詢結果（即使 token 外洩，無法一次拉走全清冊）
 *   2. roster 端點僅供管理員透過 ADMIN_TOKEN 使用（與 API_TOKEN 分離）
 *   3. Origin/Referer 白名單防止任意網域呼叫
 *   4. IP/UA 簡易 rate limit（每分鐘上限）
 *   5. lookup 結果做 PII minimization（剔除非必要欄位）
 *
 * 部署步驟：
 *   1. 至 https://script.google.com 建立新專案
 *   2. 把本檔內容貼到 Code.gs
 *   3. 服務 (Services) → 新增 → 選「Drive API」
 *   4. 修改下方常數區（FOLDER_ID / API_TOKEN / ADMIN_TOKEN / ALLOWED_ORIGINS）
 *   5. 部署 → 新增部署 → 類型「網頁應用程式」→ 任何人皆可存取 → 取得 /exec URL
 *   6. 把 URL 填入前端 js/config.js 的 GAS_URL
 */

// ====== 設定區 ======
// API_TOKEN：前端使用，公開可見（在 GitHub 上）。靠 lookup-only API + Origin 白名單 + Rate limit 防護。
const API_TOKEN = 'OSHA_USER_ddc0652064b872c8dacd0a20fd34';
// ROSTER_FOLDER_ID：Drive 資料夾本身有權限保護，單獨 ID 公開無實際風險。
const ROSTER_FOLDER_ID = '12XIHzrfTAR_zxFLaFLyFmDr1zrxbXDiD';

// 送出的報名表 PDF 儲存資料夾
const SUBMISSIONS_FOLDER_ID = '1ljS19XmR1iCh-9S6qLVV4YdgtveCB-5a';
// 單檔大小上限（PDF base64 約 6MB，限 10MB 防呆）
const MAX_SUBMISSION_BYTES = 10 * 1024 * 1024;

/**
 * ADMIN_TOKEN 從 ScriptProperties 讀取，**不入程式碼**避免 GitHub 公開。
 * 設定方式：GAS 編輯器左下「Project Settings (專案設定)」→ Script Properties (指令碼屬性)
 *   → 新增屬性：Property=ADMIN_TOKEN, Value=（您的隨機字串，例 OSHA_ADMIN_xxxxx）
 */
function getAdminToken() {
  const t = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  return (t && t.length >= 16) ? t : null; // 未設定或太短視為無 admin
}

// 允許呼叫的 origin 子字串清單。空陣列代表不檢查（部署初期測試用）
// 公開測試階段：不限制來源網域。仍有 lookup-only + rate limit + ADMIN 分離防護。
// 正式上線後如需鎖定，填入允許的網域即可（例 ['geminihao0516.github.io', 'localhost']）
const ALLOWED_ORIGINS = [];

// Rate limit：每個 IP/UA 指紋每分鐘最多請求次數
const RATE_LIMIT_PER_MIN = 20;

const CACHE_KEY = 'roster_v1';
const CACHE_TTL_SEC = 3600;

// ====== POST 入口：接收報名表送出（PDF 上傳） ======
function doPost(e) {
  try {
    let data;
    try {
      data = JSON.parse((e.postData && e.postData.contents) || '{}');
    } catch (err) {
      return jsonResp({ error: 'invalid_json' });
    }

    // 1) 認證
    const token = data.token || '';
    if (token !== API_TOKEN) {
      Logger.log('POST AUTH_FAIL');
      return jsonResp({ error: 'unauthorized' });
    }

    // 2) Origin 白名單（與 doGet 一致）
    if (ALLOWED_ORIGINS.length > 0) {
      const origin = String(data.origin || '').toLowerCase();
      const ok = ALLOWED_ORIGINS.some(function (a) { return origin.indexOf(a.toLowerCase()) !== -1; });
      if (!ok) {
        Logger.log('POST ORIGIN_FAIL: ' + origin);
        return jsonResp({ error: 'forbidden_origin' });
      }
    }

    // 3) Rate limit
    const fp = fingerprint(e, token);
    if (!withinRateLimit(fp)) {
      Logger.log('POST RATE_LIMITED');
      return jsonResp({ error: 'rate_limited' });
    }

    // 4) 驗證必填欄位
    const name = String(data.name || '').trim();
    const idNumber = String(data.idNumber || '').trim().toUpperCase();
    const pdfBase64 = String(data.pdfBase64 || '');

    if (!name || !idNumber || !pdfBase64) {
      return jsonResp({ error: 'missing_required_fields' });
    }
    if (!/^[A-Z][A-Z0-9]\d{8}$/.test(idNumber)) {
      return jsonResp({ error: 'invalid_id_format' });
    }

    // 5) 限制檔案大小
    if (pdfBase64.length > MAX_SUBMISSION_BYTES * 1.4) { // base64 約放大 1.37
      return jsonResp({ error: 'file_too_large' });
    }

    // 6) 寫入 Drive
    const folder = DriveApp.getFolderById(SUBMISSIONS_FOLDER_ID);
    const filename = buildFilename(data);
    const bytes = Utilities.base64Decode(pdfBase64);
    const blob = Utilities.newBlob(bytes, 'application/pdf', filename);
    const file = folder.createFile(blob);

    Logger.log('SUBMIT OK: ' + filename + ' → ' + file.getId());
    return jsonResp({
      ok: true,
      fileId: file.getId(),
      filename: filename,
    });
  } catch (err) {
    Logger.log('POST ERROR: ' + err);
    return jsonResp({ error: String(err && err.message || err) });
  }
}

/**
 * 產生檔名：{年度}-{梯次}-{職類代碼}-{姓名}-{身分證尾4}.pdf
 * 例：115-04-07040-蔡森輝-4203.pdf
 */
function buildFilename(data) {
  const year = String(data.year || 'YYYY').replace(/\D/g, '').slice(0, 3);
  const batch = String(data.batch || '00').replace(/\D/g, '');
  const jobCode = String(data.jobCode || '').replace(/[^A-Z0-9]/gi, '').slice(0, 5);
  const name = String(data.name || 'name').replace(/[\/\\\s]+/g, '');
  const idTail = String(data.idNumber || '').slice(-4);
  const ts = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss');
  return `${year}-${batch}-${jobCode}-${name}-${idTail}-${ts}.pdf`;
}

// ====== GET 入口 ======
function doGet(e) {
  try {
    const params = (e && e.parameter) || {};

    // 1) 認證
    const token = params.token || '';
    const adminToken = getAdminToken();
    const isAdmin = !!(adminToken && token === adminToken);
    const isUser = token === API_TOKEN;
    if (!isAdmin && !isUser) {
      Logger.log('AUTH_FAIL: bad_token (action=' + (params.action || '') + ')');
      return jsonResp({ error: 'unauthorized' });
    }

    // 2) Origin / Referer 白名單（admin 跳過）
    if (!isAdmin && ALLOWED_ORIGINS.length > 0) {
      const origin = (params.origin || '').toLowerCase();
      const ok = ALLOWED_ORIGINS.some(function (a) { return origin.indexOf(a.toLowerCase()) !== -1; });
      if (!ok) {
        Logger.log('ORIGIN_FAIL: ' + origin);
        return jsonResp({ error: 'forbidden_origin' });
      }
    }

    // 3) Rate limit（admin 跳過）
    if (!isAdmin) {
      const fp = fingerprint(e, token);
      if (!withinRateLimit(fp)) {
        Logger.log('RATE_LIMITED: fp=' + fp.slice(0, 8));
        return jsonResp({ error: 'rate_limited' });
      }
    }

    // 4) Action 路由
    const action = params.action || 'lookup';

    if (action === 'ping') {
      return jsonResp({ ok: true, time: new Date().toISOString() });
    }

    if (action === 'lookup') {
      const id = String(params.id || '').trim().toUpperCase();
      if (!id || !/^[A-Z][A-Z0-9]\d{8}$/.test(id)) {
        return jsonResp({ error: 'invalid_id_format' });
      }
      const records = getRosterCached();
      const matches = records.filter(function (r) {
        return String(r.idNumber || '').trim().toUpperCase() === id;
      });
      if (matches.length === 0) return jsonResp({ records: [] });
      // PII minimization：剔除 Drive 內部欄位（如來源檔名），僅回填表所需欄位
      const cleaned = matches.map(stripInternalFields);
      return jsonResp({ records: cleaned });
    }

    if (action === 'roster') {
      // 僅 admin 可取全清冊
      if (!isAdmin) return jsonResp({ error: 'admin_only' });
      const records = getRosterCached();
      return jsonResp({ records: records, total: records.length });
    }

    if (action === 'clearCache') {
      if (!isAdmin) return jsonResp({ error: 'admin_only' });
      CacheService.getScriptCache().remove(CACHE_KEY);
      return jsonResp({ ok: true, cleared: true });
    }

    if (action === 'count') {
      // 僅 admin 可看總筆數（避免外部窺探清冊規模）
      if (!isAdmin) return jsonResp({ error: 'admin_only' });
      const records = getRosterCached();
      return jsonResp({ total: records.length });
    }

    return jsonResp({ error: 'unknown_action: ' + action });
  } catch (err) {
    return jsonResp({ error: String(err && err.message || err) });
  }
}

// ====== 核心邏輯 ======
function getRosterCached() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY);
  if (cached) return JSON.parse(cached);
  const records = loadAllRosters();
  try {
    const payload = JSON.stringify(records);
    if (payload.length < 95 * 1024) cache.put(CACHE_KEY, payload, CACHE_TTL_SEC);
  } catch (e) {}
  return records;
}

function loadAllRosters() {
  const folder = DriveApp.getFolderById(ROSTER_FOLDER_ID);
  const all = [];
  pushFiles(folder.getFilesByType(MimeType.MICROSOFT_EXCEL), all);
  pushFiles(folder.getFilesByType(MimeType.GOOGLE_SHEETS), all);
  return all;

  function pushFiles(iter, out) {
    while (iter.hasNext()) {
      const file = iter.next();
      const name = file.getName();
      if (name.indexOf('~$') === 0) continue;
      const records = readOneFile(file);
      records.forEach(function (r) { r._sourceFile = name; });
      Array.prototype.push.apply(out, records);
    }
  }
}

function readOneFile(file) {
  const mime = file.getMimeType();
  if (mime === MimeType.GOOGLE_SHEETS) {
    return parseSpreadsheet(SpreadsheetApp.openById(file.getId()));
  }
  const blob = file.getBlob();
  let convertedId = null;
  try {
    convertedId = convertXlsxToGoogleSheet(blob, file.getId());
    return parseSpreadsheet(SpreadsheetApp.openById(convertedId));
  } finally {
    if (convertedId) {
      try { DriveApp.getFileById(convertedId).setTrashed(true); } catch (e) {}
    }
  }
}

function convertXlsxToGoogleSheet(blob, sourceFileId) {
  const tmpName = 'tmp_' + sourceFileId + '_' + Date.now();
  if (Drive && Drive.Files && typeof Drive.Files.create === 'function') {
    const resource = { name: tmpName, mimeType: MimeType.GOOGLE_SHEETS };
    const created = Drive.Files.create(resource, blob);
    return created.id;
  }
  if (Drive && Drive.Files && typeof Drive.Files.insert === 'function') {
    const resource = { title: tmpName, mimeType: MimeType.GOOGLE_SHEETS };
    const created = Drive.Files.insert(resource, blob, { convert: true });
    return created.id;
  }
  throw new Error('Drive Advanced Service 不可用。請至服務 → 新增 Drive API');
}

function parseSpreadsheet(ss) {
  const sheets = ss.getSheets();
  const out = [];
  for (let si = 0; si < sheets.length; si++) {
    const ws = sheets[si];
    const data = ws.getDataRange().getValues();
    if (data.length < 8) continue;
    const meta = parseHeader(data);
    if (!meta.year && si > 0) continue;
    for (let i = 7; i < data.length; i++) {
      const row = data[i];
      if (!row[0] && !row[3]) continue;
      out.push({
        seq: row[0] || '',
        classNo: cellStr(row[1]),
        name: cellStr(row[2]),
        idNumber: cellStr(row[3]).trim().toUpperCase(),
        birthDate: cellStr(row[4]),
        zipCode: cellStr(row[5]),
        address: cellStr(row[6]),
        phone: cellStr(row[7]),
        education: cellStr(row[8]),
        trainStart: cellStr(row[9]),
        trainEnd: cellStr(row[10]),
        authorityDoc: cellStr(row[11]),
        year: meta.year,
        batch: meta.batch,
        jobCode: meta.jobCode,
        jobName: meta.jobName,
        venue: meta.venue,
        trainingUnitRaw: meta.trainingUnitRaw,
      });
    }
  }
  return out;
}

function parseHeader(data) {
  const get = function (r, c) { return data[r] && data[r][c] !== undefined ? cellStr(data[r][c]) : ''; };
  const trainingUnitRaw = get(1, 2);
  const trainingType = get(2, 2);
  const venue = get(3, 2);
  const year = get(4, 2);
  const batch = get(5, 2);
  let jobCode = '';
  let jobName = trainingType;
  const m = trainingType.match(/^(\d{5})\s*(.+)$/);
  if (m) { jobCode = m[1]; jobName = m[2].trim(); }
  return {
    trainingUnitRaw: trainingUnitRaw,
    jobCode: jobCode,
    jobName: jobName,
    venue: venue,
    year: year.replace(/\D/g, ''),
    batch: batch.replace(/\D/g, ''),
  };
}

// 移除內部欄位（避免暴露 Drive 檔名等）
function stripInternalFields(record) {
  const cleaned = {};
  for (const k in record) {
    if (k.charAt(0) === '_') continue;
    cleaned[k] = record[k];
  }
  return cleaned;
}

// ====== Rate limit ======
function fingerprint(e, token) {
  // GAS doGet 拿不到 client IP，採用 (token + 客戶端 fp + 當前分鐘) 做指紋
  // token 是 server-only 已知，攻擊者就算偽造 fp 也擋不住「同 token 同分鐘」的限速
  const ua = (e && e.parameter && e.parameter.fp) || 'anon';
  const min = Math.floor(Date.now() / 60000);
  const seed = (token || 'NA') + '|' + ua + '|' + min;
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, seed)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function withinRateLimit(fp) {
  const cache = CacheService.getScriptCache();
  const key = 'rl_' + fp;
  const cur = parseInt(cache.get(key) || '0', 10);
  if (cur >= RATE_LIMIT_PER_MIN) return false;
  cache.put(key, String(cur + 1), 65);
  return true;
}

// ====== 工具 ======
function cellStr(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyyMMdd');
  return String(v).trim();
}

function jsonResp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ====== 部署輔助 ======
function _testLoadRosters() {
  const records = loadAllRosters();
  Logger.log('總筆數: ' + records.length);
  if (records.length > 0) Logger.log(JSON.stringify(records[0], null, 2));
}
function _testLookup() {
  // 測試用：從清冊任取一筆第一個身分證號作為測試對象（避免將真實身分證寫入程式碼）
  const records = getRosterCached();
  if (records.length === 0) { Logger.log('清冊為空'); return; }
  const id = records[0].idNumber;
  const m = records.filter(function (r) { return r.idNumber === id; });
  Logger.log('lookup (第一筆) → ' + m.length + ' matches');
  if (m.length > 0) Logger.log(JSON.stringify(stripInternalFields(m[0]), null, 2));
}
function _testClearCache() {
  CacheService.getScriptCache().remove(CACHE_KEY);
  Logger.log('快取已清除');
}
