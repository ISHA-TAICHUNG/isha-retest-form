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
    alert('找不到報名表資料，將返回首頁。');
    window.location.href = 'index.html';
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
    setText('invoiceExamMonth', payload.examMonth ? payload.examMonth + ' 月' : '_____');

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

    // 身分證正反面影本
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

  // ==== 產生 PDF Blob（html2canvas + jsPDF） ====
  async function generatePdfBlob() {
    const page = document.getElementById('printPage');
    if (!page) throw new Error('找不到列印頁面元素');
    if (typeof html2canvas === 'undefined') throw new Error('PDF 函式庫載入失敗（html2canvas）');
    const jsPDFLib = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFLib) throw new Error('PDF 函式庫載入失敗（jsPDF）');

    // 隱藏所有 .no-print 元素（工具列、旋轉按鈕、狀態列…）避免進入 PDF
    const noPrintEls = document.querySelectorAll('.no-print');
    const noPrintOld = [];
    noPrintEls.forEach((el) => {
      noPrintOld.push({ el: el, display: el.style.display });
      el.style.display = 'none';
    });

    // 強制以 A4 寬度（19cm ≈ 718.6px @ 96dpi）渲染，避免手機窄 viewport 下壓縮版面
    const A4_RENDER_WIDTH = 720;
    const oldW = page.style.width;
    const oldMinW = page.style.minWidth;
    const oldMaxW = page.style.maxWidth;
    page.style.width = A4_RENDER_WIDTH + 'px';
    page.style.minWidth = A4_RENDER_WIDTH + 'px';
    page.style.maxWidth = A4_RENDER_WIDTH + 'px';

    try {
      await new Promise(r => requestAnimationFrame(() => r()));
      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: A4_RENDER_WIDTH,
        windowWidth: A4_RENDER_WIDTH + 40,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdf = new jsPDFLib({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = 210, pageH = 297;
      // 印表機安全邊界：多數家用／辦公印表機不可列印區約 3-5mm，
      // 預留 6mm 邊界讓使用者能用「100% 原始大小」直接列印不被裁切。
      const safeMargin = 6;
      const printableW = pageW - safeMargin * 2;
      const printableH = pageH - safeMargin * 2;
      const imgRatio = canvas.height / canvas.width;

      // 以「等比例縮放」塞進可列印區，取長寬兩者較嚴格的限制
      let drawW = printableW;
      let drawH = printableW * imgRatio;
      if (drawH > printableH) {
        drawH = printableH;
        drawW = printableH / imgRatio;
      }
      const offsetX = (pageW - drawW) / 2;
      const offsetY = (pageH - drawH) / 2;
      pdf.addImage(imgData, 'JPEG', offsetX, offsetY, drawW, drawH);
      return pdf.output('blob');
    } finally {
      page.style.width = oldW;
      page.style.minWidth = oldMinW;
      page.style.maxWidth = oldMaxW;
      // 還原 no-print 元素原本 display 狀態
      noPrintOld.forEach((r) => { r.el.style.display = r.display; });
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result.split(',')[1]);
      fr.onerror = reject;
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
      const res = await fetch(cfg.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) {
        const msg = ({
          unauthorized: 'API Token 不正確',
          forbidden_origin: '此網域不在白名單',
          rate_limited: '送出過於頻繁，請稍候再試',
          file_too_large: 'PDF 檔案過大（>10MB）',
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
      // 送出成功後自動跳轉（若 config 有設定）
      if (redirectUrl) {
        setTimeout(() => { window.location.href = redirectUrl; }, redirectSeconds * 1000);
      }
    } catch (err) {
      console.error(err);
      showSubmitStatus('❌ 送出失敗：' + err.message + '。請稍候再試，或聯繫訓練單位。', 'error');
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  // ==== 旋轉身分證影本 90° ====
  function rotateImageDataUrl(dataUrl) {
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
        ctx.drawImage(img, -canvas.height / 2, -canvas.width / 2, canvas.height, canvas.width);
        ctx.restore();
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  async function handleRotate(target, btn) {
    if (!payload.images || !payload.images[target]) return;
    btn.disabled = true;
    const childNodes = Array.from(btn.childNodes);
    btn.replaceChildren(document.createTextNode('旋轉中…'));
    try {
      const rotated = await rotateImageDataUrl(payload.images[target]);
      payload.images[target] = rotated;
      sessionStorage.setItem(FORM_KEY, JSON.stringify(payload));
      const cellId = target === 'idFront' ? 'idFrontCell' : 'idBackCell';
      const slotId = target === 'idFront' ? 'idFrontSlot' : 'idBackSlot';
      renderIdImage(cellId, slotId, rotated);
    } catch (err) {
      console.error(err);
      alert('旋轉失敗：' + err.message);
    } finally {
      btn.replaceChildren(...childNodes);
      btn.disabled = false;
    }
  }

  // 事件
  $('backBtn').addEventListener('click', () => { window.location.href = 'form.html'; });
  const submitBtn = $('submitBtn');
  if (submitBtn) submitBtn.addEventListener('click', submitToCloud);

  document.querySelectorAll('.rotate-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = btn.dataset.rotateTarget;
      if (target) handleRotate(target, btn);
    });
  });

  // 初始化
  render();
  document.title = `${payload.name || '報名表'} — ${payload.year || ''} 年第 ${payload.batch || ''} 梯`;
})();
