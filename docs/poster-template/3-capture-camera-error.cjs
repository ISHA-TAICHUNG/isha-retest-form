/**
 * 截相機錯誤狀態的圖（沒有實際裝置時用 DOM 切換顯示）
 *
 * 流程：goto form.html → 手動打開相機 modal → 切到錯誤畫面 → 截圖
 * 產出：docs/screenshots/08-camera-error.png
 *
 * 用法：node docs/poster-template/3-capture-camera-error.cjs
 */
const PW = '/Users/hao/.nvm/versions/node/v22.19.0/lib/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 13 大小
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const page = await context.newPage();

  await page.goto('http://localhost:8080/form.html');
  await page.waitForLoadState('networkidle');

  // 用注入 sessionStorage 假裝有選 record（避免 form.js 因找不到資料跳回首頁）
  await page.evaluate(() => {
    sessionStorage.setItem('osha_selected_record', JSON.stringify({
      name: '測試',
      idNumber: 'A123456789',
      jobCode: '02030',
      jobName: '丙種職業安全衛生業務主管安全衛生教育訓練',
      year: '115',
      batch: '04',
      classNo: '2891',
    }));
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);

  // 強制顯示相機 modal 的錯誤狀態（直接操作 DOM，不真的開鏡頭）
  await page.evaluate(() => {
    const modal = document.getElementById('cameraModal');
    const overlay = document.getElementById('cameraOverlay');
    const errorBox = document.getElementById('cameraError');
    const errorMsg = document.getElementById('cameraErrorMsg');
    if (!modal || !errorBox) return;
    modal.classList.remove('hidden');
    if (overlay) overlay.style.display = 'none';
    errorBox.classList.remove('hidden');
    if (errorMsg) errorMsg.textContent = '相機權限被拒絕。請到瀏覽器設定重新允許，或改用相簿。';
  });

  await page.waitForTimeout(500);

  const out = path.resolve(__dirname, '../screenshots/08-camera-error.png');
  await page.screenshot({ path: out });
  console.log('✓ 已輸出', out);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
