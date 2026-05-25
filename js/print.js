/**
 * 列印頁邏輯：從 sessionStorage 讀取 payload，渲染到 A4 版面。
 * 對齊實際作業範本格式（含雙職類、身分證方格、兩層審核）。
 */
(function () {
  const cfg = window.APP_CONFIG;
  const FORM_KEY = 'osha_form_payload';

  let payload = null;
  try {
    const raw = sessionStorage.getItem(FORM_KEY);
    payload = raw ? JSON.parse(raw) : null;
  } catch (e) {}

  if (!payload) {
    if (typeof window.showToast === 'function') {
      window.showToast('找不到報名表資料，3 秒後返回首頁', 'warn', 3000);
      setTimeout(() => { window.location.href = 'index.html'; }, 3000);
    } else {
      window.location.href = 'index.html';
    }
    return;
  }

  const $ = (id) => document.getElementById(id);

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text || '';
  }

  function render() {
    setText('printYear', payload.year || cfg.CURRENT_ROC_YEAR);

    // 訓練單位
    setText('cell-trainingUnit', payload.trainingUnit || '');

    // 主管機關備查文號（合併顯示：主管機關 + 文號）
    const authority = payload.authority || cfg.AUTHORITY || '';
    const doc = payload.authorityDoc || '';
    setText('cell-authorityDoc', authority + (doc ? doc : ''));

    // 測驗職類（與訓練職類）
    const testText = payload.jobCode
      ? `${payload.jobCode}${payload.jobName || ''}`
      : (payload.jobName || '');
    setText('cell-testCategory', testText);
    // 訓練職類：用 trainCategory（若有）否則同測驗職類
    const trainCat = payload.trainCategory || testText;
    setText('cell-trainCategory', trainCat);

    setText('cell-classNo', payload.classNo || '');
    setText('cell-trainPeriod', window.formatTrainPeriod(payload.trainStart, payload.trainEnd));

    // 應試者基本資料
    setText('cell-name', payload.name || '');

    const birth = window.rocDateToParts(payload.birthDate);
    setText(
      'cell-birthDate',
      birth.year
        ? `中華民國 ${birth.year} 年 ${String(birth.month).padStart(2, '0')} 月 ${String(birth.day).padStart(2, '0')} 日`
        : '中華民國　　年　　月　　日'
    );

    // 身分證方格（10 格）
    renderIdGrid('cell-idGrid', payload.idNumber || '');

    setText('cell-mobilePhone', payload.mobilePhone || '');
    setText('cell-phoneHome', payload.phoneHome || '');
    setText('cell-phoneOffice', payload.phoneOffice || '');
    setText('cell-emergencyName', payload.emergencyName || '');
    setText('cell-emergencyPhone', payload.emergencyPhone || '');

    // 發票開立
    const invoiceType = payload.invoiceType || 'personal';
    const ip = document.getElementById('invoicePersonal');
    const ic = document.getElementById('invoiceCompany');
    if (ip) ip.textContent = invoiceType === 'personal' ? '■' : '□';
    if (ic) ic.textContent = invoiceType === 'company' ? '■' : '□';
    setText('invoiceTaxId', payload.invoiceTaxId || '');
    setText('invoiceExamVenue', payload.examVenue || '_____');
    setText('invoiceExamMonth', payload.examMonth ? payload.examMonth + ' 月' : '_____');
    // 開考日不顯示在 PDF 報名表上（僅網頁端給學員看）
    // payload.examDate 仍會傳給後端做紀錄用，但不印出

    setText('cell-zip', formatZipDigits(payload.zipCode));
    setText('cell-address', payload.address || '');

    // 學歷
    renderRadios('cell-education', [
      { val: 'primary', label: '國小' },
      { val: 'junior', label: '國中' },
      { val: 'high', label: '高中' },
      { val: 'college', label: '專科' },
      { val: 'bachelor', label: '大學' },
      { val: 'master', label: '碩士' },
      { val: 'phd', label: '博士' },
      { val: 'other', label: '其他' },
    ], payload.education);

    renderRadios('cell-disability', [
      { val: 'no', label: '否' },
      { val: 'yes', label: '是(請於報名表後方檢附身心障礙手冊或學習障礙證明影本，若未檢附者，視同一般應試者，不予延長測驗時間20分鐘。)' },
    ], payload.disability);

    // 身分證正反面影本（相機已自動裁切到 1.58:1，預設使用 contain 完整顯示）
    renderIdImage('idFrontCell', 'idFrontSlot', payload.images && payload.images.idFront);
    renderIdImage('idBackCell', 'idBackSlot', payload.images && payload.images.idBack);

  }

  // 身分證方格：每個字元一格，共 10 格
  function renderIdGrid(containerId, idNumber) {
    const c = $(containerId);
    if (!c) return;
    c.replaceChildren();
    const chars = String(idNumber || '').toUpperCase().padEnd(10, ' ').slice(0, 10).split('');
    chars.forEach((ch) => {
      const cell = document.createElement('div');
      cell.className = 'id-grid-cell';
      cell.textContent = ch.trim() ? ch : '';
      c.appendChild(cell);
    });
  }

  function formatZipDigits(zip) {
    if (!zip) return '□□□-□□';
    const s = String(zip).replace(/\D/g, '');
    if (s.length >= 5) return `${s.slice(0, 3)}-${s.slice(3, 5)}`;
    if (s.length === 3) return `${s}-□□`;
    return s || '□□□-□□';
  }

  function renderRadios(containerId, options, selectedValue) {
    const c = $(containerId);
    if (!c) return;
    c.replaceChildren();
    options.forEach((opt) => {
      const span = document.createElement('span');
      span.textContent = (opt.val === selectedValue ? '■' : '□') + opt.label;
      if (opt.val === selectedValue) span.style.fontWeight = 'bold';
      c.appendChild(span);
    });
  }

  function renderIdImage(cellId, slotId, dataUrl) {
    const cell = $(cellId);
    const slot = $(slotId);
    if (!cell || !slot) return;
    slot.replaceChildren();
    if (dataUrl) {
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = '';
      slot.appendChild(img);
      cell.classList.add('has-image');
    } else {
      cell.classList.remove('has-image');
    }
  }

  // ==== Lazy load html2canvas + jsPDF ====
  // 首屏不載入這兩個重量級 CDN（~220KB），按下「送出報名」才動態插入。
  // 保留 SRI integrity 檢核（和舊版 HTML 一致）。
  const PDF_LIBS = [
    {
      id: 'lib-html2canvas',
      src: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
      integrity: 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H',
      check: () => typeof window.html2canvas !== 'undefined',
    },
    {
      id: 'lib-jspdf',
      src: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
      integrity: 'sha384-en/ztfPSRkGfME4KIm05joYXynqzUgbsG5nMrj/xEFAHXkeZfO3yMK8QQ+mP7p1/',
      check: () => !!((window.jspdf && window.jspdf.jsPDF) || window.jsPDF),
    },
  ];
  function loadScriptOnce(lib) {
    if (lib.check()) return Promise.resolve();
    if (document.getElementById(lib.id)) {
      // 已在載入中，等它完成
      return new Promise((resolve, reject) => {
        const el = document.getElementById(lib.id);
        el.addEventListener('load', resolve, { once: true });
        el.addEventListener('error', reject, { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.id = lib.id;
      s.src = lib.src;
      s.integrity = lib.integrity;
      s.crossOrigin = 'anonymous';
      // 20 秒 timeout — SRI mismatch 在某些瀏覽器既不 fire onerror 也不 fire onload (silent block)
      // settled 旗標避免 race(timeout 過後又 onerror 觸發二次 reject)
      let settled = false;
      const t = setTimeout(() => {
        if (settled) return; settled = true;
        reject(new Error('CDN 載入逾時(20s):' + lib.src + ' — 請確認網路或重新整理'));
      }, 20000);
      s.onload = () => {
        if (settled) return; settled = true;
        clearTimeout(t); resolve();
      };
      s.onerror = () => {
        if (settled) return; settled = true;
        clearTimeout(t); reject(new Error('無法載入 ' + lib.src));
      };
      document.head.appendChild(s);
    });
  }
  async function ensurePdfLibs() {
    for (const lib of PDF_LIBS) {
      await loadScriptOnce(lib);
    }
  }

  // ==== 產生 PDF Blob（html2canvas + jsPDF）====
  // 策略：把 #printPage clone 到一個固定 720px 寬的隱藏 iframe，
  //       html2canvas 對 iframe 內的元素擷取，完全脫離原頁面 viewport / zoom 干擾
  //       徹底解決 Android Chrome 縮放或廠商客製 viewport 造成的版面跑掉
  async function generatePdfBlob() {
    const page = document.getElementById('printPage');
    if (!page) throw new Error('找不到列印頁面元素');
    await ensurePdfLibs();
    if (typeof html2canvas === 'undefined') throw new Error('PDF 函式庫載入失敗（html2canvas）');
    const jsPDFLib = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFLib) throw new Error('PDF 函式庫載入失敗（jsPDF）');

    const A4_RENDER_WIDTH = 720;

    // 1) 建立隱藏 iframe（固定 720px 寬，獨立 layout context）
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = [
      'position:fixed', 'left:-99999px', 'top:0',
      'width:' + A4_RENDER_WIDTH + 'px',
      'height:1200px', // 暫時夠用，最後會看 iframe 內容真實高度
      'border:0', 'visibility:hidden', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(iframe);

    try {
      // 2) 把原頁面所有 stylesheets + #printPage clone 進 iframe
      //    ⚠ 過去用 <link rel=stylesheet href=...> 等網路載入，慢網路 / Google Fonts
      //    卡住會 timeout 後跑版。改成從 document.styleSheets 直接讀 cssText 注入
      //    inline <style>，iframe 內**立即**有完整 CSS，不需等網路。
      const idoc = iframe.contentDocument;
      // LINE / FB In-App WebView 對 sandboxed iframe.contentDocument 可能回 null
      // 給使用者明確中文錯誤指引,而不是讓他看到 "Cannot read properties of null"
      if (!idoc) {
        throw new Error('您目前的瀏覽器(可能是 LINE 或 Facebook 內建)不支援 PDF 產生。請複製此頁網址到 Safari 或 Chrome 瀏覽器開啟後再送出。');
      }
      idoc.open();
      idoc.write('<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body></body></html>');
      idoc.close();
      // 從目前頁面的 document.styleSheets 抓 same-origin CSS 內容（main.css / print.css）
      // 跨源（Google Fonts）會被 CORS 擋，跳過 — 字體 fallback 不影響 layout
      for (const sheet of document.styleSheets) {
        let cssText = '';
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (!rules) continue;
          for (const rule of rules) cssText += rule.cssText + '\n';
        } catch (e) {
          // CORS 阻擋 → 跳過（通常是 Google Fonts，不影響表格 layout）
          continue;
        }
        if (cssText) {
          const style = idoc.createElement('style');
          style.textContent = cssText;
          idoc.head.appendChild(style);
        }
      }
      // 跨源 stylesheet（讀不到內容）仍用 link 嘗試載（有就有，無就無，不阻塞）
      document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
        // 同源已用 styleSheets 讀進來，跨源才需要 link
        try {
          const u = new URL(l.href);
          if (u.origin === window.location.origin) return;
        } catch (_) { return; }
        const link = idoc.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('href', l.href);
        idoc.head.appendChild(link);
      });
      // 同步原頁面的 inline <style>
      document.querySelectorAll('style').forEach((s) => {
        const style = idoc.createElement('style');
        style.textContent = s.textContent;
        idoc.head.appendChild(style);
      });
      // iframe 內強制 720px viewport + table-layout:fixed
      const iframeStyle = idoc.createElement('style');
      iframeStyle.textContent =
        'html, body { margin: 0; padding: 0; background: #fff; }' +
        ' body { width: ' + A4_RENDER_WIDTH + 'px; }' +
        ' .print-page { width: ' + A4_RENDER_WIDTH + 'px !important;' +
        '   min-width: ' + A4_RENDER_WIDTH + 'px !important;' +
        '   max-width: ' + A4_RENDER_WIDTH + 'px !important; }' +
        ' table { table-layout: fixed; width: 100%; }' +
        ' .no-print { display: none !important; }';
      idoc.head.appendChild(iframeStyle);
      // clone #printPage 進去
      const clonedPage = page.cloneNode(true);
      idoc.body.appendChild(clonedPage);

      // 3) reflow + 短延遲讓 inline style 套用（不需等網路了）
      void clonedPage.offsetWidth;
      await new Promise((r) => requestAnimationFrame(() => r()));
      await new Promise((r) => setTimeout(r, 100));

      // 4) iframe 高度依 content 自動調整（避免裁切）
      iframe.style.height = (clonedPage.offsetHeight + 40) + 'px';

      // 5) html2canvas 對 iframe 內的 clone 進行擷取
      // ⚠ 老 iPhone / Android(<4GB RAM)在 scale=2 處理大 DOM 時極易 OOM,
      //   promise 會永遠 pending 而非 reject → 學員按下後永遠卡「處理中…」。
      //   修法 1:依裝置記憶體降級 scale(deviceMemory API 不支援時保守用 1.5)
      //   修法 2:Promise.race 加 45 秒 timeout 兜底,卡住至少能解除按鈕讓學員重試
      // iOS Safari 全版本不支援 navigator.deviceMemory(永遠 undefined),
      // 必須當「未知裝置」也走保守路線,否則 iPhone 6s/7/SE1 (1-2GB RAM) 仍會 OOM
      const lowMem = (typeof navigator.deviceMemory !== 'number') || navigator.deviceMemory < 4;
      const captureScale = lowMem ? 1.5 : 2;
      const canvasPromise = html2canvas(clonedPage, {
        scale: captureScale,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: A4_RENDER_WIDTH,
        height: clonedPage.offsetHeight,
        windowWidth: A4_RENDER_WIDTH,
        windowHeight: clonedPage.offsetHeight,
        // iframe 內 capture，避免被原頁面 zoom/transform 影響
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PDF 產生逾時(45 秒),可能您的裝置記憶體不足。請關閉其他 App 後重試,或改用電腦操作。')), 45000)
      );
      const canvas = await Promise.race([canvasPromise, timeoutPromise]);

      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdf = new jsPDFLib({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = 210, pageH = 297;
      const safeMargin = 6;
      const printableW = pageW - safeMargin * 2;
      const printableH = pageH - safeMargin * 2;
      const imgRatio = canvas.height / canvas.width;
      let drawW = printableW;
      let drawH = printableW * imgRatio;
      if (drawH > printableH) { drawH = printableH; drawW = printableH / imgRatio; }
      const offsetX = (pageW - drawW) / 2;
      const offsetY = (pageH - drawH) / 2;
      pdf.addImage(imgData, 'JPEG', offsetX, offsetY, drawW, drawH);
      return pdf.output('blob');
    } finally {
      // 清理 iframe
      try { document.body.removeChild(iframe); } catch (_) {}
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      // 30 秒 timeout — iOS Safari 14 以下在 low-memory 時 FileReader 會 silently drop 任務
      // 用 settled 旗標避免 abort 觸發的 onerror 重複 reject(雖無害但清console)
      let settled = false;
      const t = setTimeout(() => {
        if (settled) return; settled = true;
        try { fr.abort(); } catch (_) {}
        reject(new Error('檔案轉檔逾時(30s),可能您的裝置記憶體不足。請重試或改用電腦。'));
      }, 30000);
      fr.onload = () => {
        if (settled) return; settled = true;
        clearTimeout(t);
        resolve(fr.result.split(',')[1]);
      };
      fr.onerror = () => {
        if (settled) return; settled = true;
        clearTimeout(t);
        reject(fr.error || new Error('FileReader 失敗'));
      };
      fr.readAsDataURL(blob);
    });
  }

  function showSubmitStatus(msg, type) {
    const el = document.getElementById('submitStatus');
    if (!el) return;
    el.className = 'submit-status status ' + (type || 'info');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  async function submitToCloud() {
    const btn = $('submitBtn');
    if (!btn) return;
    const originalText = btn.textContent;
    btn.disabled = true;
    showSubmitStatus('⏳ 正在產生 PDF，請稍候（約 3-5 秒）…', 'info');
    btn.textContent = '處理中…生成 PDF';
    try {
      const blob = await generatePdfBlob();
      const sizeMb = (blob.size / 1024 / 1024).toFixed(2);
      btn.textContent = `上傳中…${sizeMb}MB`;
      showSubmitStatus(`⏳ PDF 已產生 (${sizeMb}MB)，正在上傳至訓練單位…`, 'info');

      const pdfBase64 = await blobToBase64(blob);
      const body = {
        token: cfg.API_TOKEN,
        origin: window.location.origin,
        name: payload.name,
        idNumber: payload.idNumber,
        year: payload.year,
        batch: payload.batch,
        jobCode: payload.jobCode,
        jobName: payload.jobName,
        pdfBase64: pdfBase64,
      };
      // 60 秒 timeout — PDF 上傳檔案大（最高約 6MB），首次 GAS 冷啟動更慢
      const res = await window.fetchWithTimeout(cfg.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      }, 60000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) {
        const msg = ({
          unauthorized: 'API Token 不正確',
          forbidden_origin: '此網域不在白名單',
          rate_limited: '送出過於頻繁，請稍候再試',
          file_too_large: 'PDF 檔案過大（>10MB）',
          not_a_pdf: 'PDF 檔案格式異常，請重新整理後再試',
          missing_required_fields: '資料不完整',
          invalid_id_format: '身分證格式不正確',
        }[json.error]) || ('後端錯誤：' + json.error);
        throw new Error(msg);
      }
      const redirectUrl = cfg.POST_SUBMIT_REDIRECT_URL || '';
      const redirectSeconds = 3;
      if (redirectUrl) {
        showSubmitStatus(
          `✅ 送出成功！您的報名資料已送達訓練單位。${redirectSeconds} 秒後將跳轉至官方 LINE 加好友頁面，建議加入以接收後續通知。`,
          'success'
        );
      } else {
        showSubmitStatus('✅ 送出成功！您的報名資料已送達訓練單位。訓練單位將在收到後安排後續處理。', 'success');
      }
      btn.textContent = '✓ 已送出';
      btn.classList.remove('btn-accent');
      btn.classList.add('btn-success');
      // 送出成功後立即清除本機暫存（身分證影本 base64 + 個資），
      // 避免 Back 或公共裝置殘留敏感資料
      try {
        sessionStorage.removeItem(FORM_KEY);
        sessionStorage.removeItem('osha_selected_record');
      } catch (e) {}
      // 送出成功後自動跳轉（若 config 有設定）
      if (redirectUrl) {
        setTimeout(() => { window.location.href = redirectUrl; }, redirectSeconds * 1000);
      }
    } catch (err) {
      console.error(err);
      // PDF 產生逾時時 html2canvas 仍在背景跑佔記憶體,讓學員「重新整理頁面」釋放更安全
      // 否則學員按重試會疊加 canvasPromise → 必崩
      const isTimeoutErr = err && /逾時/.test(err.message || '');
      if (isTimeoutErr) {
        showSubmitStatus('❌ ' + err.message + '\n👉 請下拉重新整理此頁面後再送出(或關閉瀏覽器分頁重開)。', 'error');
        btn.textContent = '請重新整理頁面後再試';
        // disabled 保留 true,強迫 reload 釋放記憶體
      } else {
        showSubmitStatus('❌ 送出失敗：' + err.message + '。請稍候再試，或聯繫訓練單位。', 'error');
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }

  // 事件
  // ⚠ 兩個 button 都要 null check,免得任一 button 缺(SW/cache 卡舊 HTML)時整段 IIFE 中斷
  // 導致 submitBtn 永遠沒綁、學員按下「字面意義 0 反應」(2026-05-25 deep review 修正)
  const backBtn = $('backBtn');
  if (backBtn) backBtn.addEventListener('click', () => { window.location.href = 'form.html'; });
  const submitBtn = $('submitBtn');
  if (submitBtn) submitBtn.addEventListener('click', submitToCloud);

  // 旋轉按鈕已移除：相機拍照 + 相簿自動旋轉 + 裁切 modal 已能處理所有方向問題。
  // 若列印時發現影本方向錯誤，請回上一步「返回編輯」重新拍攝或裁切。

  // 初始化
  render();
  document.title = `${payload.name || '報名表'} — ${payload.year || ''} 年第 ${payload.batch || ''} 梯`;
})();
