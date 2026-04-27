/**
 * GAS 後端 API 客戶端（強化安全版）
 *
 * 安全策略：不再下載/快取整份清冊到前端（避免 PII 暴露）。
 * 改用 lookupById() 每次只查單筆。
 */

(function () {
  const cfg = window.APP_CONFIG;

  /**
   * 依身分證號查單筆記錄
   * @param {string} idNumber
   * @returns {Promise<{records: Array, queryId: string}>}
   */
  window.lookupById = async function (idNumber) {
    const id = String(idNumber || '').trim().toUpperCase();
    if (!id) throw new Error('身分證字號不可為空');

    // 本機格式 + checksum 檢核（省一次 GAS 呼叫，攔截手誤輸入）
    if (!/^[A-Z][A-Z0-9]\d{8}$/.test(id)) {
      throw new Error('身分證格式不正確');
    }
    if (typeof window.validateTwId === 'function' && !window.validateTwId(id)) {
      throw new Error('身分證檢核碼不正確，請確認號碼是否有打錯');
    }

    const url = `${cfg.GAS_URL}?action=lookup&id=${encodeURIComponent(id)}` +
      `&token=${encodeURIComponent(cfg.API_TOKEN)}` +
      `&origin=${encodeURIComponent(window.location.origin)}` +
      `&fp=${encodeURIComponent(navigator.userAgent.slice(0, 80))}`;

    const res = await window.fetchWithTimeout(url, { method: 'GET' }, cfg.FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`GAS 回應錯誤：HTTP ${res.status}`);

    const json = await res.json();
    if (json.error) {
      const msg = {
        unauthorized: 'API Token 不正確',
        forbidden_origin: '此網域不在白名單，無法呼叫 API',
        rate_limited: '查詢過於頻繁，請稍候再試',
        invalid_id_format: '身分證格式不正確',
        admin_only: '此操作需要管理員權限',
      }[json.error] || `GAS 錯誤：${json.error}`;
      throw new Error(msg);
    }
    if (!Array.isArray(json.records)) throw new Error('GAS 回應格式異常');

    return { records: json.records, queryId: id };
  };

  /**
   * Ping GAS（測試連線）
   */
  window.pingGas = async function () {
    const url = `${cfg.GAS_URL}?action=ping&token=${encodeURIComponent(cfg.API_TOKEN)}` +
      `&origin=${encodeURIComponent(window.location.origin)}`;
    const res = await window.fetchWithTimeout(url, { method: 'GET' }, 8000);
    return await res.json();
  };

  /**
   * 取得考試行事曆（公開資訊 + sessionStorage 快取 30 分鐘）
   * @returns {Promise<Object>} { '忠明': { '1': '01/22', ... }, '龍井': {...} }
   */
  const SCHEDULE_CACHE_KEY = 'osha_schedule_v1';
  const SCHEDULE_CACHE_TTL_MS = 30 * 60 * 1000;
  window.fetchSchedule = async function (forceRefresh = false) {
    if (!forceRefresh) {
      const cached = window.cacheGet(SCHEDULE_CACHE_KEY);
      if (cached && cached.schedule) return cached.schedule;
    }
    const url = `${cfg.GAS_URL}?action=schedule&token=${encodeURIComponent(cfg.API_TOKEN)}` +
      `&origin=${encodeURIComponent(window.location.origin)}` +
      `&fp=${encodeURIComponent(navigator.userAgent.slice(0, 80))}`;
    const res = await window.fetchWithTimeout(url, { method: 'GET' }, cfg.FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`GAS 回應錯誤：HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(`GAS 錯誤：${json.error}`);
    const schedule = json.schedule || {};
    try { window.cacheSet(SCHEDULE_CACHE_KEY, { schedule: schedule }, SCHEDULE_CACHE_TTL_MS); } catch (e) {}
    return schedule;
  };
})();
