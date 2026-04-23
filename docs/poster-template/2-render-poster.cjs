/**
 * 將 poster.html 渲染成 PNG（LINE 轉發用）+ PDF（A4 列印用）
 *
 * 使用方法：node docs/poster-template/2-render-poster.cjs
 * 產出：docs/使用說明-一頁版.png + .pdf
 */
const GLOBAL_NODE_MODULES = '/Users/hao/.nvm/versions/node/v22.19.0/lib/node_modules';
const { chromium } = require(`${GLOBAL_NODE_MODULES}/playwright`);
const QRCode = require(`${GLOBAL_NODE_MODULES}/qrcode`);
const path = require('path');

const TARGET_URL = 'https://isha-taichung.github.io/isha-retest-form/';

(async () => {
  // 產出 QR 成 data URL（PNG base64），直接塞進 <img> src —
  //   避開 innerHTML；errorCorrection=H + margin=0 + scale=10 保證印小也能掃
  const qrDataUrl = await QRCode.toDataURL(TARGET_URL, {
    errorCorrectionLevel: 'H',
    margin: 0,
    scale: 10,
    color: { dark: '#0F172A', light: '#FFFFFF' },
  });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1400 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const htmlPath = path.resolve(__dirname, 'poster.html');
  await page.goto('file://' + htmlPath);
  await page.waitForLoadState('networkidle');

  // 載入後用 DOM 方法把 QR 以 <img> 注入 #qr 容器（不破壞相對路徑圖片）
  await page.evaluate((src) => {
    const slot = document.getElementById('qr');
    if (!slot) return;
    slot.replaceChildren();
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'QR Code';
    slot.appendChild(img);
  }, qrDataUrl);

  await page.waitForTimeout(500);

  const outDir = path.resolve(__dirname, '..');

  await page.screenshot({
    path: `${outDir}/使用說明-一頁版.png`,
    fullPage: true,
    type: 'png',
  });
  console.log('✓ PNG 輸出');

  await page.pdf({
    path: `${outDir}/使用說明-一頁版.pdf`,
    format: 'A4',
    landscape: false,
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
  });
  console.log('✓ PDF 輸出');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
