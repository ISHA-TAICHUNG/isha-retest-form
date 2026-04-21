/**
 * 捕捉系統三個頁面的實機截圖（手機尺寸 + 桌面 A4 版）
 *
 * 使用方法：
 *   1. 確認已開啟本地靜態伺服器 http://localhost:8765 指向專案根目錄
 *      （可用 VS Code Live Server、python -m http.server 8765、或 npx serve）
 *   2. node docs/poster-template/1-capture-screenshots.cjs
 *   3. 產生 docs/screenshots/*.png
 */
const PW_PATH = '/Users/hao/.nvm/versions/node/v22.19.0/lib/node_modules/playwright';
const { chromium } = require(PW_PATH);
const path = require('path');

const BASE = 'http://localhost:8765';
const OUT = path.resolve(__dirname, '../screenshots');

const mockRecord = {
  name: '王大明', idNumber: 'A123456789', birthDate: '0790912',
  phone: '0912345678', address: '台中市龍井區忠明路 99 號', zipCode: '434',
  education: '大學', jobCode: '07040',
  jobName: '缺氧作業主管安全衛生教育訓練',
  authorityDoc: '府勞安字第 1150001234 號',
  classNo: '001', year: '115', batch: '1',
  trainStart: '1150401', trainEnd: '1150410',
};

const mockPayload = {
  trainingUnit: '社團法人中華民國工業安全衛生協會附設台中職業訓練中心',
  trainingUnitCode: '048610640002', authority: '臺中市政府',
  authorityDoc: '府勞安字第 1150001234 號',
  jobCode: '07040', jobName: '缺氧作業主管安全衛生教育訓練',
  classNo: '001', year: '115', batch: '1',
  trainStart: '1150401', trainEnd: '1150410',
  trainCategory: '07040　缺氧作業主管安全衛生教育訓練',
  name: '王大明', idNumber: 'A123456789', birthDate: '0790912',
  mobilePhone: '0912345678', invoiceType: 'personal', invoiceTaxId: '',
  examVenue: '龍井', examMonth: '5',
  zipCode: '434', address: '台中市龍井區忠明路 99 號',
  education: 'bachelor', disability: 'no', images: {},
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/index.html`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/01-home.png` });
  console.log('✓ 01-home.png');

  await page.fill('#idInput', 'A123456789');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/02-home-typed.png` });
  console.log('✓ 02-home-typed.png');

  await page.evaluate((rec) => {
    sessionStorage.setItem('osha_selected_record', JSON.stringify(rec));
  }, mockRecord);
  await page.goto(`${BASE}/form.html`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/03-form-top.png` });
  console.log('✓ 03-form-top.png');

  await page.locator('#photo-title').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/05-form-upload.png` });
  console.log('✓ 05-form-upload.png');

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/04-form-full.png`, fullPage: true });
  console.log('✓ 04-form-full.png');

  await page.evaluate((p) => {
    sessionStorage.setItem('osha_form_payload', JSON.stringify(p));
  }, mockPayload);
  await page.goto(`${BASE}/print.html`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/06-print-top.png` });
  console.log('✓ 06-print-top.png');

  const dContext = await browser.newContext({
    viewport: { width: 1280, height: 1400 },
    deviceScaleFactor: 2,
  });
  const dp = await dContext.newPage();
  await dp.goto(`${BASE}/index.html`);
  await dp.evaluate((p) => {
    sessionStorage.setItem('osha_form_payload', JSON.stringify(p));
  }, mockPayload);
  await dp.goto(`${BASE}/print.html`);
  await dp.waitForLoadState('networkidle');
  await dp.waitForTimeout(800);
  await dp.screenshot({ path: `${OUT}/07-print-desktop.png`, fullPage: true });
  console.log('✓ 07-print-desktop.png');

  await browser.close();
  console.log('\n全部完成！下一步跑 2-render-poster.cjs');
})().catch(e => { console.error(e); process.exit(1); });
