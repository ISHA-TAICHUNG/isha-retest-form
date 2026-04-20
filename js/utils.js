/**
 * 工具函式集
 */

/**
 * 帶 timeout 的 fetch 包裝
 */
window.fetchWithTimeout = function (url, options = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    fetch(url, { ...options, signal: controller.signal })
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

/**
 * 民國年日期字串解析
 * '1141210' → { year: 114, month: 12, day: 10 }
 * '0600616' → { year: 60, month: 6, day: 16 }
 * '0751010' → { year: 75, month: 10, day: 10 }
 */
window.rocDateToParts = function (rocStr) {
  if (!rocStr) return { year: '', month: '', day: '' };
  const s = String(rocStr).replace(/\D/g, '').padStart(7, '0');
  if (s.length < 7) return { year: '', month: '', day: '' };
  return {
    year: parseInt(s.slice(0, 3), 10),
    month: parseInt(s.slice(3, 5), 10),
    day: parseInt(s.slice(5, 7), 10),
  };
};

/**
 * 民國年數字組合 → 顯示字串
 * (114, 12, 10) → '114 年 12 月 10 日'
 */
window.partsToRocStr = function (year, month, day) {
  if (!year || !month || !day) return '';
  return `${year} 年 ${String(month).padStart(2, '0')} 月 ${String(day).padStart(2, '0')} 日`;
};

/**
 * 訓練日期區間顯示
 * ('1141210', '1141212') → '114 年 12 月 10 日 至 114 年 12 月 12 日 止'
 */
window.formatTrainPeriod = function (startStr, endStr) {
  const s = window.rocDateToParts(startStr);
  const e = window.rocDateToParts(endStr);
  if (!s.year || !e.year) return '';
  return `${window.partsToRocStr(s.year, s.month, s.day)} 至 ${window.partsToRocStr(e.year, e.month, e.day)} 止`;
};

/**
 * 中華民國身分證/居留證號驗證
 * 標準演算法：首字母轉數字 + 後 9 碼加權檢查
 */
window.validateTwId = function (id) {
  if (!id || typeof id !== 'string') return false;
  const s = id.trim().toUpperCase();
  // 國民身分證：1 英文 + 1 數字(1/2) + 8 數字
  // 居留證舊版：2 英文 + 8 數字（首字+第二字皆英文）
  // 新式統一證號：1 英文 + 1 數字(8/9) + 8 數字
  if (!/^[A-Z][A-Z0-9]\d{8}$/.test(s)) return false;

  const letterMap = {
    A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17,
    J: 18, K: 19, L: 20, M: 21, N: 22, P: 23, Q: 24, R: 25,
    S: 26, T: 27, U: 28, V: 29, X: 30, Y: 31, W: 32, Z: 33,
    I: 34, O: 35,
  };

  const c1 = letterMap[s[0]];
  if (c1 === undefined) return false;

  // 第二碼若是英文，舊版居留證演算法
  let n;
  if (/[A-Z]/.test(s[1])) {
    const c2 = letterMap[s[1]];
    if (c2 === undefined) return false;
    n = [Math.floor(c1 / 10), c1 % 10, Math.floor(c2 / 10), c2 % 10];
  } else {
    n = [Math.floor(c1 / 10), c1 % 10, parseInt(s[1], 10)];
  }
  for (let i = 2; i < 10; i++) n.push(parseInt(s[i], 10));

  const weights = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1];
  let sum = 0;
  for (let i = 0; i < n.length; i++) sum += n[i] * weights[i];
  return sum % 10 === 0;
};

/**
 * 學歷字串映射為 radio 值
 * 清冊「高中(職)」→ 'high'
 */
window.mapEducation = function (raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  const map = [
    { kw: ['博士'], val: 'phd' },
    { kw: ['碩士', '研究所'], val: 'master' },
    { kw: ['大學', '學士'], val: 'bachelor' },
    { kw: ['專科', '專校', '五專', '二專'], val: 'college' },
    { kw: ['高中', '高職', '高工'], val: 'high' },
    { kw: ['國中', '初中'], val: 'junior' },
    { kw: ['國小', '小學'], val: 'primary' },
  ];
  for (const m of map) {
    if (m.kw.some((k) => s.includes(k))) return m.val;
  }
  return 'other';
};

/**
 * 訓練種類字串解析「07040缺氧作業主管...」→ { code, name }
 */
window.parseTrainingType = function (str) {
  if (!str) return { code: '', name: '' };
  const m = String(str).match(/^(\d{5})\s*(.+)$/);
  if (m) return { code: m[1], name: m[2].trim() };
  return { code: '', name: String(str).trim() };
};

/**
 * sessionStorage 快取讀寫（含 TTL）
 */
window.cacheGet = function (key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj.expiresAt && Date.now() > obj.expiresAt) {
      sessionStorage.removeItem(key);
      return null;
    }
    return obj.data;
  } catch (e) {
    return null;
  }
};

window.cacheSet = function (key, data, ttlMs) {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ data, expiresAt: ttlMs ? Date.now() + ttlMs : null, savedAt: Date.now() })
    );
  } catch (e) {
    console.warn('cacheSet failed:', e);
  }
};

window.cacheGetSavedAt = function (key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw).savedAt || null;
  } catch (e) {
    return null;
  }
};

/**
 * 民國日期格式化（用於螢幕顯示）
 */
window.formatRocDate = function (str) {
  const p = window.rocDateToParts(str);
  if (!p.year) return str || '';
  return `${p.year}/${String(p.month).padStart(2, '0')}/${String(p.day).padStart(2, '0')}`;
};

/**
 * 將 dataURL 圖片順時針旋轉 90°（form.js / print.js 共用）
 * 旋轉後以白底填滿，品質 0.9 的 JPEG
 */
window.rotateImage90 = function (dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.width / 2, -img.height / 2, img.width, img.height);
      ctx.restore();
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
};

/**
 * 輕量 toast 提示（無障礙 aria-live）
 * 首次呼叫時自動掛載到 <body>，重複呼叫會重用同一容器
 * @param {string} msg 訊息內容
 * @param {'info'|'success'|'warn'|'error'} type 視覺樣式
 * @param {number} durationMs 顯示毫秒數
 */
window.showToast = function (msg, type = 'info', durationMs = 4000) {
  let el = document.getElementById('appToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appToast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.className = 'app-toast ' + type + ' show';
  el.textContent = msg;
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.classList.remove('show');
  }, durationMs);
};
