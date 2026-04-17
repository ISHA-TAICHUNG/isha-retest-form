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

  // ============ 職類欄位填入（鎖定為唯讀） ============
  function fillJobCategory() {
    const el = $('jobCategory');
    if (!el) return;
    const match = window.getJobCategoryByCode(record.jobCode);
    const name = match ? match.name : (record.jobName || '');
    el.value = record.jobCode ? `${record.jobCode}　${name}`.trim() : '';
    el.dataset.code = record.jobCode || '';
    el.dataset.name = name;
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

    // 自動預填應考月份：結訓月份 + 1（通常考試在結訓後隔月）
    // trainEnd 格式為民國 YYYMMDD（7 碼）
    const examMonthEl = $('examMonth');
    if (examMonthEl && !examMonthEl.value && record.trainEnd) {
      const m = String(record.trainEnd).match(/^\d{3}(\d{2})/);
      if (m) {
        const nextMonth = ((parseInt(m[1], 10) % 12) + 1).toString();
        if (examMonthEl.querySelector(`option[value="${nextMonth}"]`)) {
          examMonthEl.value = nextMonth;
          examMonthEl.classList.add('prefilled');
          examMonthEl.addEventListener('change', () => examMonthEl.classList.remove('prefilled'), { once: true });
        }
      }
    }

    // 訓練職類預設與測驗職類相同（鎖定唯讀）
    const jobMatch = window.getJobCategoryByCode(record.jobCode);
    const trainCatText = record.jobCode
      ? `${record.jobCode}　${jobMatch ? jobMatch.name : (record.jobName || '')}`.trim()
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
    // - 訓練資料欄位為鎖定狀態，永遠保留黃底
    // - 應試者個資欄位若使用者手動修改則移除標記
    const lockedIds = [
      'trainingUnit', 'authority', 'authorityDoc', 'jobCategory', 'trainCategory',
      'classNo', 'year', 'batch', 'trainStart', 'trainEnd',
    ];
    const editableIds = [
      'name', 'idNumber', 'birthDate', 'mobilePhone', 'zipCode', 'address',
    ];
    lockedIds.forEach((id) => {
      const el = $(id);
      if (el && el.value) el.classList.add('prefilled');
    });
    editableIds.forEach((id) => {
      const el = $(id);
      if (el && el.value) el.classList.add('prefilled');
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
        ph.textContent = '點此拍攝';
        preview.appendChild(ph);
        slot.querySelector('input[type="file"]').value = '';
        saveImageToPayload(target, null);
      });
    });

    // 旋轉按鈕：就地旋轉 90° 順時針
    document.querySelectorAll('[data-rotate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const target = btn.dataset.rotate;
        const current = imageStore[target];
        if (!current) return;
        btn.disabled = true;
        const origText = btn.textContent;
        btn.textContent = '旋轉中…';
        try {
          const rotated = await rotateDataUrl(current);
          imageStore[target] = rotated;
          const slot = document.querySelector(`.upload-slot[data-key="${target}"]`);
          renderPreview(slot, rotated);
        } catch (err) {
          console.error(err);
          alert('旋轉失敗：' + err.message);
        } finally {
          btn.textContent = origText;
          btn.disabled = false;
        }
      });
    });

    // 放大檢視按鈕：開啟 lightbox
    document.querySelectorAll('[data-zoom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.zoom;
        const dataUrl = imageStore[target];
        if (dataUrl && window.openImageViewer) window.openImageViewer(dataUrl);
      });
    });

    // 點預覽圖也能放大（方便手機操作）
    document.querySelectorAll('.upload-slot').forEach((slot) => {
      slot.addEventListener('click', (e) => {
        // 只有點在 img 上且有圖才觸發；避免與 label 點擊重新上傳衝突
        const tgt = e.target;
        if (tgt && tgt.tagName === 'IMG' && slot.classList.contains('has-image')) {
          e.preventDefault();
          e.stopPropagation();
          const key = slot.dataset.key;
          const dataUrl = imageStore[key];
          if (dataUrl && window.openImageViewer) window.openImageViewer(dataUrl);
        }
      });
    });
  }

  // 將 dataURL 圖片順時針旋轉 90°
  function rotateDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.height;
        canvas.height = img.width;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = reject;
      img.src = dataUrl;
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
    // 職類欄位為唯讀 input，取 dataset.code（實際 code）而非畫面顯示文字
    const jobCategoryEl = $('jobCategory');
    const jobCode = (jobCategoryEl && jobCategoryEl.dataset.code) || record.jobCode || '';
    const jobMatch = window.getJobCategoryByCode(jobCode);
    const jobName = (jobCategoryEl && jobCategoryEl.dataset.name)
      || (jobMatch ? jobMatch.name : (record.jobName || ''));

    return {
      // 訓練/測驗資料
      trainingUnit: $('trainingUnit').value.trim(),
      trainingUnitCode: cfg.TRAINING_UNIT_CODE,
      authority: $('authority').value.trim(),
      authorityDoc: $('authorityDoc').value.trim(),
      jobCode: jobCode,
      jobName: jobName,
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
      examVenue: $('examVenue') ? $('examVenue').value.trim() : '',
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

  // 欄位標籤 → DOM id 對照（驗證失敗時可 focus 至對應欄位）
  const FIELD_MAP = [
    { key: 'name',           label: '姓名',               id: 'name' },
    { key: 'idNumber',       label: '身分證統一編號',      id: 'idNumber' },
    { key: 'mobilePhone',    label: '行動電話',            id: 'mobilePhone' },
    { key: 'address',        label: '聯絡地址',            id: 'address' },
    { key: 'examMonth',      label: '應考月份',            id: 'examMonth' },
    { key: 'invoiceTaxId',   label: '統一編號（公司發票必填）', id: 'invoiceTaxId' },
  ];

  function validateRequired(payload) {
    const errors = [];
    const firstInvalidId = { value: null };
    const add = (label, id) => {
      errors.push(label);
      if (!firstInvalidId.value) firstInvalidId.value = id;
    };
    if (!payload.name)        add('姓名', 'name');
    if (!payload.idNumber)    add('身分證統一編號', 'idNumber');
    if (!payload.mobilePhone) add('行動電話', 'mobilePhone');
    if (!payload.address)     add('聯絡地址', 'address');
    if (!payload.examVenue)   add('考場', 'examVenue');
    if (!payload.examMonth)   add('應考月份', 'examMonth');
    if (payload.invoiceType === 'company' && !payload.invoiceTaxId) {
      add('統一編號（公司發票必填）', 'invoiceTaxId');
    }
    return { errors, firstInvalidId: firstInvalidId.value };
  }

  // ============ 事件繫結 ============
  function bindActions() {
    $('backBtn').addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    $('previewBtn').addEventListener('click', () => {
      const payload = collectPayload();
      const { errors, firstInvalidId } = validateRequired(payload);
      if (errors.length > 0) {
        alert('請完成必填欄位：\n' + errors.join('、'));
        // 自動捲動至第一個未填欄位並 focus，減少使用者尋找時間
        if (firstInvalidId) {
          const el = $(firstInvalidId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // 延遲 focus 避免捲動被打斷
            setTimeout(() => { try { el.focus(); } catch (e) {} }, 450);
            el.classList.add('invalid-flash');
            setTimeout(() => el.classList.remove('invalid-flash'), 1800);
          }
        }
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
  fillJobCategory();
  prefillFields();
  bindUploads();
  loadCachedImages();
  bindActions();
})();
