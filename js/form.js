/**
 * 表單頁邏輯：自動帶入清冊資料、提供編輯、處理照片上傳、暫存到 sessionStorage
 */
(function () {
  const cfg = window.APP_CONFIG;
  const $ = (id) => document.getElementById(id);

  const SELECTED_KEY = 'osha_selected_record';
  const FORM_KEY = 'osha_form_payload';

  // ============ 載入選定的記錄 ============
  let record = null;
  try {
    const raw = sessionStorage.getItem(SELECTED_KEY);
    record = raw ? JSON.parse(raw) : null;
  } catch (e) {}

  if (!record) {
    alert('找不到選定的應試者資料，將返回首頁。');
    window.location.href = 'index.html';
    return;
  }

  // ============ 職類下拉初始化 ============
  function initJobCategorySelect() {
    const sel = $('jobCategory');
    sel.replaceChildren();

    // 預設選項：清冊上的職類（即使不在內建清單中，也加進去）
    const built = window.JOB_CATEGORIES.slice();
    const exists = built.some((j) => j.code === record.jobCode);
    if (!exists && record.jobCode) {
      built.unshift({
        code: record.jobCode,
        name: record.jobName || '(清冊載入)',
        group: '— 來自清冊 —',
      });
    }

    // 依分類群組
    const groups = {};
    built.forEach((j) => {
      const g = j.group || '其他';
      if (!groups[g]) groups[g] = [];
      groups[g].push(j);
    });

    Object.keys(groups).forEach((g) => {
      const og = document.createElement('optgroup');
      og.label = g;
      groups[g].forEach((j) => {
        const opt = document.createElement('option');
        opt.value = j.code;
        opt.textContent = `${j.code}　${j.name}`;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    });

    sel.value = record.jobCode || '';

    // 測驗職類變動時，自動同步訓練職類
    function syncTrainCategory() {
      const tc = $('trainCategory');
      if (!tc) return;
      const code = sel.value;
      const match = window.getJobCategoryByCode(code);
      const text = code ? `${code}　${match ? match.name : ''}` : '';
      tc.value = text;
      tc.classList.add('prefilled');
    }
    sel.addEventListener('change', syncTrainCategory);
    sel.addEventListener('input', syncTrainCategory);
  }

  // ============ 填入欄位 ============
  function prefillFields() {
    $('trainingUnit').value = cfg.TRAINING_UNIT;
    $('authority').value = cfg.AUTHORITY;
    $('authorityDoc').value = record.authorityDoc || '';
    $('classNo').value = record.classNo || '';
    $('year').value = record.year || cfg.CURRENT_ROC_YEAR;
    $('batch').value = record.batch || '';
    $('trainStart').value = record.trainStart || '';
    $('trainEnd').value = record.trainEnd || '';

    // 訓練職類預設與測驗職類相同
    const jobMatch = window.getJobCategoryByCode(record.jobCode);
    const trainCatText = record.jobCode
      ? `${record.jobCode}${jobMatch ? jobMatch.name : (record.jobName || '')}`
      : (record.jobName || '');
    if ($('trainCategory')) $('trainCategory').value = trainCatText;

    $('name').value = record.name || '';
    $('idNumber').value = (record.idNumber || '').toUpperCase();
    $('birthDate').value = record.birthDate || '';
    $('mobilePhone').value = record.phone || '';
    $('zipCode').value = record.zipCode || '';
    $('address').value = record.address || '';

    // 學歷映射
    const edu = window.mapEducation(record.education);
    const radio = document.querySelector(`input[name="education"][value="${edu}"]`);
    if (radio) radio.checked = true;

    // 帶入後標示為「自動填入」黃色背景
    [
      'trainingUnit', 'authority', 'authorityDoc', 'classNo', 'year', 'batch',
      'trainStart', 'trainEnd', 'name', 'idNumber', 'birthDate',
      'mobilePhone', 'zipCode', 'address',
    ].forEach((id) => {
      const el = $(id);
      if (el && el.value) el.classList.add('prefilled');
      // 使用者修改後移除標記
      if (el) el.addEventListener('input', () => el.classList.remove('prefilled'));
    });
  }

  // ============ 圖片上傳處理 ============
  // 將圖片壓縮並轉成 base64 dataURL
  function compressImage(file, maxWidth = 1200, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const fr = new FileReader();
      fr.onload = () => {
        img.onload = () => {
          // 身分證本身是橫式（寬 > 高，比例約 1.58:1）；
          // 若使用者直拍（高 > 寬），自動旋轉 90° 順時針，使照片變為橫式。
          const isPortrait = img.height > img.width;
          const origW = img.width;
          const origH = img.height;

          // 旋轉後的邏輯寬高（交換）
          const logicW = isPortrait ? origH : origW;
          const logicH = isPortrait ? origW : origH;

          const ratio = logicW > maxWidth ? maxWidth / logicW : 1;
          const canvasW = Math.round(logicW * ratio);
          const canvasH = Math.round(logicH * ratio);

          const canvas = document.createElement('canvas');
          canvas.width = canvasW;
          canvas.height = canvasH;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvasW, canvasH);

          if (isPortrait) {
            // 順時針旋轉 90°：將畫布中心設為原點 → 旋轉 → 以旋轉後座標繪圖
            ctx.save();
            ctx.translate(canvasW / 2, canvasH / 2);
            ctx.rotate(Math.PI / 2); // 90° 順時針
            // 旋轉後座標：原始寬度對應 canvas 高度，原始高度對應 canvas 寬度
            ctx.drawImage(img, -canvasH / 2, -canvasW / 2, canvasH, canvasW);
            ctx.restore();
          } else {
            ctx.drawImage(img, 0, 0, canvasW, canvasH);
          }
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  function bindUploads() {
    document.querySelectorAll('input[type="file"][data-target]').forEach((inp) => {
      inp.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const target = inp.dataset.target;
        const slot = document.querySelector(`.upload-slot[data-key="${target}"]`);
        const preview = slot.querySelector('.upload-preview');

        // 顯示處理中
        preview.replaceChildren();
        const loadingTxt = document.createElement('span');
        loadingTxt.className = 'upload-placeholder';
        loadingTxt.textContent = '處理中…';
        preview.appendChild(loadingTxt);

        try {
          // 身分證需要較高解析度（用於辨識），大頭照可以小一些
          const maxW = target === 'portrait' ? 600 : 1400;
          const dataUrl = await compressImage(file, maxW, 0.85);
          renderPreview(slot, dataUrl);
          // 暫存到 sessionStorage（payload 中）
          saveImageToPayload(target, dataUrl);
        } catch (err) {
          console.error(err);
          alert('圖片處理失敗：' + err.message);
        }
      });
    });

    document.querySelectorAll('.btn-clear').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.clear;
        const slot = document.querySelector(`.upload-slot[data-key="${target}"]`);
        slot.classList.remove('has-image');
        const preview = slot.querySelector('.upload-preview');
        preview.replaceChildren();
        const ph = document.createElement('span');
        ph.className = 'upload-placeholder';
        ph.textContent = '點此上傳 / 拍照';
        preview.appendChild(ph);
        slot.querySelector('input[type="file"]').value = '';
        saveImageToPayload(target, null);
      });
    });
  }

  function renderPreview(slot, dataUrl) {
    const preview = slot.querySelector('.upload-preview');
    preview.replaceChildren();
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'preview';
    preview.appendChild(img);
    slot.classList.add('has-image');
  }

  // 圖片暫存區（記憶體 + sessionStorage）
  const imageStore = { idFront: null, idBack: null };
  function saveImageToPayload(key, dataUrl) {
    imageStore[key] = dataUrl;
  }

  // 載入既有暫存（讓使用者重新進入表單時保留照片）
  function loadCachedImages() {
    try {
      const raw = sessionStorage.getItem(FORM_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && obj.images) {
        Object.keys(obj.images).forEach((k) => {
          if (obj.images[k]) {
            imageStore[k] = obj.images[k];
            const slot = document.querySelector(`.upload-slot[data-key="${k}"]`);
            if (slot) renderPreview(slot, obj.images[k]);
          }
        });
      }
    } catch (e) {}
  }

  // ============ 序列化表單 ============
  function collectPayload() {
    const educationRadio = document.querySelector('input[name="education"]:checked');
    const disabilityRadio = document.querySelector('input[name="disability"]:checked');
    const jobCode = $('jobCategory').value;
    const jobMatch = window.getJobCategoryByCode(jobCode);

    return {
      // 訓練/測驗資料
      trainingUnit: $('trainingUnit').value.trim(),
      trainingUnitCode: cfg.TRAINING_UNIT_CODE,
      authority: $('authority').value.trim(),
      authorityDoc: $('authorityDoc').value.trim(),
      jobCode: jobCode,
      jobName: jobMatch ? jobMatch.name : (record.jobName || ''),
      classNo: $('classNo').value.trim(),
      year: $('year').value.trim() || String(cfg.CURRENT_ROC_YEAR),
      batch: $('batch').value.trim(),
      trainStart: $('trainStart').value.trim(),
      trainEnd: $('trainEnd').value.trim(),
      trainCategory: $('trainCategory') ? $('trainCategory').value.trim() : '',
      // 應試者資料
      name: $('name').value.trim(),
      idNumber: $('idNumber').value.trim().toUpperCase(),
      birthDate: $('birthDate').value.trim(),
      mobilePhone: $('mobilePhone').value.trim(),
      phoneOffice: $('phoneOffice') ? $('phoneOffice').value.trim() : '',
      phoneHome: $('phoneHome') ? $('phoneHome').value.trim() : '',
      emergencyName: $('emergencyName') ? $('emergencyName').value.trim() : '',
      emergencyPhone: $('emergencyPhone') ? $('emergencyPhone').value.trim() : '',
      invoiceType: (document.querySelector('input[name="invoiceType"]:checked') || {}).value || 'personal',
      invoiceTaxId: $('invoiceTaxId') ? $('invoiceTaxId').value.trim() : '',
      examMonth: $('examMonth') ? $('examMonth').value.trim() : '',
      zipCode: $('zipCode').value.trim(),
      address: $('address').value.trim(),
      education: educationRadio ? educationRadio.value : '',
      disability: disabilityRadio ? disabilityRadio.value : 'no',
      // 圖片
      images: {
        idFront: imageStore.idFront,
        idBack: imageStore.idBack,
      },
      // 系統資訊
      _generatedAt: new Date().toISOString(),
      _appVersion: cfg.VERSION,
    };
  }

  function validateRequired(payload) {
    const errors = [];
    if (!payload.name) errors.push('姓名');
    if (!payload.idNumber) errors.push('身分證統一編號');
    if (!payload.mobilePhone) errors.push('行動電話');
    if (!payload.address) errors.push('聯絡地址');
    return errors;
  }

  // ============ 事件繫結 ============
  function bindActions() {
    $('backBtn').addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    $('previewBtn').addEventListener('click', () => {
      const payload = collectPayload();
      const errs = validateRequired(payload);
      if (errs.length > 0) {
        alert('請完成必填欄位：\n' + errs.join('、'));
        return;
      }

      try {
        sessionStorage.setItem(FORM_KEY, JSON.stringify(payload));
        window.location.href = 'print.html';
      } catch (e) {
        // 若 sessionStorage 容量爆掉（圖片太大），提示重新壓縮或減少圖片
        alert(
          '儲存失敗（可能因照片檔案過大）：' + e.message +
          '\n\n建議：清除部分照片重新上傳，或拍攝較小尺寸照片。'
        );
      }
    });
  }

  // ============ 初始化 ============
  initJobCategorySelect();
  prefillFields();
  bindUploads();
  loadCachedImages();
  bindActions();
})();
