/**
 * 將 poster.html 渲染成 PNG（LINE 轉發用）+ PDF（A4 列印用）
 *
 * 使用方法：node docs/poster-template/2-render-poster.cjs
 * 產出：docs/使用說明-一頁版.png + .pdf
 */
const PW_PATH = '/Users/hao/.nvm/versions/node/v22.19.0/lib/node_modules/playwright';
const { chromium } = require(PW_PATH);
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1400 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const htmlPath = path.resolve(__dirname, 'poster.html');
  await page.goto('file://' + htmlPath);
  await page.waitForLoadState('networkidle');
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
