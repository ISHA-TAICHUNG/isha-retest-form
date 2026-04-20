/**
 * 系統設定常數
 *
 * GAS_URL 與 API_TOKEN 必須與 tools/gas_backend.js 中的設定一致。
 * 部署到 GitHub Pages 前請務必填入真實的 GAS Web App URL。
 */
window.APP_CONFIG = {
  // === GAS 後端 ===
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxiqJaR63wi4u3WvQQh2k2WZ8IqJz_Y7lmqj8ogqiFrEu2XSRLjkJVbTROPro-NiEkk/exec',
  API_TOKEN: 'OSHA_USER_ddc0652064b872c8dacd0a20fd34',

  // === 報名表固定欄位 ===
  TRAINING_UNIT: '社團法人中華民國工業安全衛生協會附設台中職業訓練中心',
  TRAINING_UNIT_CODE: '048610640002',
  AUTHORITY: '臺中市政府',
  TEST_VENUE: '社團法人中華民國工業安全衛生協會附設台中職業訓練中心(龍井)',
  TEST_VENUE_CODE: '051',

  // === 自動推算 ===
  // 民國年 = 西元年 - 1911（系統開機日為準，使用者可手動覆蓋）
  CURRENT_ROC_YEAR: new Date().getFullYear() - 1911,

  // === 送出成功後自動跳轉 URL（官方 LINE 加好友） ===
  POST_SUBMIT_REDIRECT_URL: 'https://lin.ee/Z9BFhp6',

  // === 前端快取設定 ===
  ROSTER_CACHE_KEY: 'osha_roster_v1',
  ROSTER_CACHE_TTL_MS: 30 * 60 * 1000, // 30 分鐘
  FETCH_TIMEOUT_MS: 20000, // GAS 首次讀檔較慢，給寬鬆 20 秒

  // === 應用版本 ===
  VERSION: '20260420b',
};
