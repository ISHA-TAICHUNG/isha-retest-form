/**
 * Service Worker — 提供離線基本功能
 *
 * 策略：
 *   - 靜態資源（HTML/CSS/JS/icons）：cache-first
 *   - GAS API 請求：永遠 network（不快取，避免資料過期）
 *   - 升級時改 CACHE_NAME 即會自動清舊快取
 */
const CACHE_NAME = 'osha-form-v20260420a';
const STATIC_ASSETS = [
  './',
  './index.html',
  './form.html',
  './print.html',
  './manifest.json',
  './css/main.css?v=20260420a',
  './css/print.css?v=20260420a',
  './js/config.js?v=20260420a',
  './js/utils.js?v=20260420a',
  './js/api.js?v=20260420a',
  './js/job-categories.js?v=20260420a',
  './js/index.js?v=20260420a',
  './js/form.js?v=20260420a',
  './js/print.js?v=20260420a',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // GAS API / Google Fonts → 直接 network，不快取（含 redirect 目標）
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('script.googleusercontent.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML (navigation) → network-first 確保拿到最新版，離線時才退回 cache
  const isHtml = event.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    (url.hostname === self.location.hostname && url.pathname.endsWith('/'));

  if (isHtml) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok && event.request.method === 'GET') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // 其他靜態資源（CSS/JS/SVG，都帶 ?v= 版本號）→ cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          if (res.ok && event.request.method === 'GET') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
