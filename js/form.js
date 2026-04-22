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
    if (typeof window.showToast === 'function') {
      window.showToast('找不到選定的應試者資料，3 秒後返回首頁', 'warn', 3000);
      setTimeout(() => { window.location.href = 'index.html'; }, 3000);
    } else {
      window.location.href = 'index.html';
    }
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
  // 讀取 File 為 HTMLImageElement（同時處理 EXIF 直拍旋轉）
  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const fr = new FileReader();
      fr.onload = () => {
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  // 將直拍圖片順時針旋轉 90° 使其變橫式（身分證應為橫式）
  function rotateImageIfPortrait(img) {
    if (img.height <= img.width) {
      // 已經是橫式
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return c;
    }
    // 直拍 → 順時針 90°
    const c = document.createElement('canvas');
    c.width = img.height;
    c.height = img.width;
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    return c;
  }

  // 將 canvas 壓縮輸出 base64（含白底以防透明 PNG）
  function canvasToDataUrl(canvas, maxWidth = 1400, quality = 0.85) {
    const ratio = canvas.width > maxWidth ? maxWidth / canvas.width : 1;
    if (ratio === 1) {
      return canvas.toDataURL('image/jpeg', quality);
    }
    const out = document.createElement('canvas');
    out.width = Math.round(canvas.width * ratio);
    out.height = Math.round(canvas.height * ratio);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', quality);
  }

  // ============ 方案 A：裁切 Modal ============
  const cropState = {
    // 原圖（已自動旋轉為橫式）
    sourceCanvas: null,
    // 顯示在 modal canvas 上時的縮放比
    displayScale: 1,
    // 裁切框在「原圖座標系」的位置與大小
    box: { x: 0, y: 0, w: 0, h: 0 },
    // 原圖尺寸快取
    srcW: 0,
    srcH: 0,
    // 關閉時解析 Promise 的 resolver
    resolver: null,
  };

  // 開啟裁切介面，回傳 Promise：裁切完成的 dataURL 或 null（取消）
  function openCropModal(sourceCanvas, targetKey) {
    return new Promise((resolve) => {
      cropState.sourceCanvas = sourceCanvas;
      cropState.srcW = sourceCanvas.width;
      cropState.srcH = sourceCanvas.height;
      cropState.resolver = resolve;
      // targetKey 目前僅作為輸入識別，不需存在 cropState 內

      const modal = $('cropModal');
      const stage = $('cropStage');
      const canvas = $('cropCanvas');
      const ctx = canvas.getContext('2d');

      modal.classList.remove('hidden');

      // 等待 modal 渲染後計算尺寸（否則 stage 尺寸為 0）
      requestAnimationFrame(() => {
        const stageW = stage.clientWidth;
        const stageH = stage.clientHeight;
        const scale = Math.min(stageW / cropState.srcW, stageH / cropState.srcH);
        cropState.displayScale = scale;

        canvas.width = Math.round(cropState.srcW * scale);
        canvas.height = Math.round(cropState.srcH * scale);
        ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);

        // 初始化裁切框：原圖 85% 居中（以身分證 1.58:1 比例為目標）
        const targetRatio = 1.58;
        const imgRatio = cropState.srcW / cropState.srcH;
        let boxW, boxH;
        if (imgRatio > targetRatio) {
          // 原圖比 1.58:1 更寬 → 以高度 80% 為基準
          boxH = cropState.srcH * 0.85;
          boxW = boxH * targetRatio;
        } else {
          // 原圖比 1.58:1 更高（瘦長）→ 以寬度 80% 為基準
          boxW = cropState.srcW * 0.85;
          boxH = boxW / targetRatio;
        }
        cropState.box = {
          x: (cropState.srcW - boxW) / 2,
          y: (cropState.srcH - boxH) / 2,
          w: boxW,
          h: boxH,
        };
        updateCropBoxUI();
      });
    });
  }

  // 同步裁切框 DOM 位置（根據 cropState.box 於原圖座標 + displayScale 換算）
  function updateCropBoxUI() {
    const box = $('cropBox');
    const canvas = $('cropCanvas');
    if (!box || !canvas) return;
    const s = cropState.displayScale;
    // canvas 在 stage 內居中，所以要加上 canvas 左上偏移
    const stage = $('cropStage');
    const offsetX = (stage.clientWidth - canvas.width) / 2;
    const offsetY = (stage.clientHeight - canvas.height) / 2;
    box.style.left = (offsetX + cropState.box.x * s) + 'px';
    box.style.top = (offsetY + cropState.box.y * s) + 'px';
    box.style.width = (cropState.box.w * s) + 'px';
    box.style.height = (cropState.box.h * s) + 'px';
  }

  // 裁切框互動（拖曳 + 四角縮放）
  function bindCropInteraction() {
    const box = $('cropBox');
    if (!box) return;

    let mode = null; // 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se'
    let startPointer = { x: 0, y: 0 };
    let startBox = null;

    const onPointerDown = (e) => {
      const target = e.target;
      const handle = target.dataset.handle;
      if (handle) {
        mode = 'resize-' + handle;
      } else {
        mode = 'move';
      }
      startPointer = { x: e.clientX, y: e.clientY };
      startBox = { ...cropState.box };
      box.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    };

    const onPointerMove = (e) => {
      if (!mode || !startBox) return;
      const s = cropState.displayScale;
      // 螢幕位移 → 原圖座標位移
      const dx = (e.clientX - startPointer.x) / s;
      const dy = (e.clientY - startPointer.y) / s;

      const b = { ...startBox };
      const srcW = cropState.srcW;
      const srcH = cropState.srcH;
      const MIN = 60; // 原圖座標中的最小邊長（避免框縮成一點）

      if (mode === 'move') {
        b.x = Math.max(0, Math.min(srcW - b.w, startBox.x + dx));
        b.y = Math.max(0, Math.min(srcH - b.h, startBox.y + dy));
      } else if (mode === 'resize-nw') {
        b.x = Math.max(0, Math.min(startBox.x + startBox.w - MIN, startBox.x + dx));
        b.y = Math.max(0, Math.min(startBox.y + startBox.h - MIN, startBox.y + dy));
        // 防禦性上限：即便起點座標異常，也不讓 w/h 超出原圖
        b.w = Math.min(startBox.w - (b.x - startBox.x), srcW - b.x);
        b.h = Math.min(startBox.h - (b.y - startBox.y), srcH - b.y);
      } else if (mode === 'resize-ne') {
        b.y = Math.max(0, Math.min(startBox.y + startBox.h - MIN, startBox.y + dy));
        b.w = Math.max(MIN, Math.min(srcW - startBox.x, startBox.w + dx));
        b.h = Math.min(startBox.h - (b.y - startBox.y), srcH - b.y);
      } else if (mode === 'resize-sw') {
        b.x = Math.max(0, Math.min(startBox.x + startBox.w - MIN, startBox.x + dx));
        b.w = Math.min(startBox.w - (b.x - startBox.x), srcW - b.x);
        b.h = Math.max(MIN, Math.min(srcH - startBox.y, startBox.h + dy));
      } else if (mode === 'resize-se') {
        b.w = Math.max(MIN, Math.min(srcW - startBox.x, startBox.w + dx));
        b.h = Math.max(MIN, Math.min(srcH - startBox.y, startBox.h + dy));
      }
      cropState.box = b;
      updateCropBoxUI();
    };

    const onPointerUp = (e) => {
      mode = null;
      startBox = null;
      try { box.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    box.addEventListener('pointerdown', onPointerDown);
    box.addEventListener('pointermove', onPointerMove);
    box.addEventListener('pointerup', onPointerUp);
    box.addEventListener('pointercancel', onPointerUp);

    // 視窗縮放時重算裁切框位置
    window.addEventListener('resize', () => {
      if (!$('cropModal').classList.contains('hidden')) {
        // 重新計算 displayScale
        const stage = $('cropStage');
        const canvas = $('cropCanvas');
        const scale = Math.min(stage.clientWidth / cropState.srcW, stage.clientHeight / cropState.srcH);
        cropState.displayScale = scale;
        canvas.width = Math.round(cropState.srcW * scale);
        canvas.height = Math.round(cropState.srcH * scale);
        canvas.getContext('2d').drawImage(cropState.sourceCanvas, 0, 0, canvas.width, canvas.height);
        updateCropBoxUI();
      }
    });
  }

  // 關閉 modal 並回傳結果（null = 取消）
  function closeCropModal(result) {
    const modal = $('cropModal');
    modal.classList.add('hidden');
    const resolver = cropState.resolver;
    cropState.resolver = null;
    cropState.sourceCanvas = null;
    if (resolver) resolver(result);
  }

  // 根據 cropState.box 於原圖實際裁切，回傳 dataURL
  function performCrop() {
    const { box, sourceCanvas } = cropState;
    const out = document.createElement('canvas');
    out.width = Math.round(box.w);
    out.height = Math.round(box.h);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(
      sourceCanvas,
      box.x, box.y, box.w, box.h,   // source
      0, 0, out.width, out.height    // dest
    );
    return { canvas: out, cropRatio: (box.w * box.h) / (cropState.srcW * cropState.srcH) };
  }

  function bindCropButtons() {
    const confirmBtn = $('cropConfirmBtn');
    const cancelBtn = $('cropCancelBtn');
    const skipBtn = $('cropSkipBtn');
    if (!confirmBtn || !cancelBtn || !skipBtn) return;

    confirmBtn.addEventListener('click', () => {
      // 防止 RAF 尚未執行完畢就點擊 → box 尺寸 0 會產出空白 dataURL
      if (!cropState.box.w || !cropState.box.h) return;
      try {
        const { canvas, cropRatio } = performCrop();
        const dataUrl = canvasToDataUrl(canvas, 1400, 0.85);
        // 方案 B：品質警告（裁切佔原圖太小 = 學員拍太遠）
        if (cropRatio < 0.25 && typeof window.showToast === 'function') {
          window.showToast(
            '⚠ 身分證在原始照片中偏小（<25%），列印可能模糊。建議重拍並讓身分證靠近鏡頭。',
            'warn',
            6000
          );
        }
        closeCropModal(dataUrl);
      } catch (err) {
        console.error(err);
        window.showToast('裁切失敗：' + err.message, 'error');
      }
    });

    cancelBtn.addEventListener('click', () => {
      closeCropModal(null);
    });

    skipBtn.addEventListener('click', () => {
      // 不裁切 → 使用整張原圖（已旋轉為橫式）壓縮輸出
      const dataUrl = canvasToDataUrl(cropState.sourceCanvas, 1400, 0.85);
      closeCropModal(dataUrl);
    });
  }

  // 原始（已旋轉為橫式）canvas 快取：讓「重新裁切」不用再讀檔
  const rawStore = { idFront: null, idBack: null };

  // 以 DOM 方法建構「點此拍攝」引導框（避免 innerHTML，滿足 CSP/XSS 安全掃描）
  function buildIdFrameHint(side) {
    const wrap = document.createElement('span');
    wrap.className = 'upload-placeholder';

    const frame = document.createElement('div');
    frame.className = 'id-frame-hint';
    frame.setAttribute('aria-hidden', 'true');

    const corners = document.createElement('div');
    corners.className = 'id-frame-hint-corners';
    frame.appendChild(corners);

    const label = document.createElement('div');
    label.className = 'id-frame-hint-text';
    label.textContent = '身分證填滿此框';
    frame.appendChild(label);

    const cta = document.createElement('span');
    cta.className = 'upload-cta';
    cta.textContent = `📷 點此拍攝${side}`;

    wrap.appendChild(frame);
    wrap.appendChild(cta);
    return wrap;
  }

  function showProcessing(slot) {
    const preview = slot.querySelector('.upload-preview');
    preview.replaceChildren();
    const ph = document.createElement('span');
    ph.className = 'upload-placeholder';
    ph.textContent = '處理中…';
    preview.appendChild(ph);
  }

  function restoreEmptyState(slot, key) {
    const preview = slot.querySelector('.upload-preview');
    preview.replaceChildren();
    const side = key === 'idFront' ? '正面' : '反面';
    preview.appendChild(buildIdFrameHint(side));
  }

  function bindUploads() {
    document.querySelectorAll('input[type="file"][data-target]').forEach((inp) => {
      inp.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const target = inp.dataset.target;
        const slot = document.querySelector(`.upload-slot[data-key="${target}"]`);

        showProcessing(slot);

        try {
          const img = await fileToImage(file);
          // 先自動旋轉成橫式（若是直拍）再交給裁切 modal
          const rotatedCanvas = rotateImageIfPortrait(img);
          rawStore[target] = rotatedCanvas;

          const dataUrl = await openCropModal(rotatedCanvas, target);
          if (!dataUrl) {
            // 使用者取消 → 還原空白狀態
            restoreEmptyState(slot, target);
            inp.value = '';
            return;
          }
          renderPreview(slot, dataUrl);
          saveImageToPayload(target, dataUrl);
        } catch (err) {
          console.error(err);
          window.showToast('圖片處理失敗：' + err.message, 'error', 5000);
          restoreEmptyState(slot, target);
          inp.value = '';
        }
      });
    });

    document.querySelectorAll('.btn-clear').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.clear;
        const slot = document.querySelector(`.upload-slot[data-key="${target}"]`);
        slot.classList.remove('has-image');
        restoreEmptyState(slot, target);
        slot.querySelector('input[type="file"]').value = '';
        rawStore[target] = null;
        saveImageToPayload(target, null);
      });
    });

    // 重新裁切按鈕：直接用已拍過的原圖再進裁切，不用重拍
    document.querySelectorAll('[data-recrop]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const target = btn.dataset.recrop;
        const raw = rawStore[target];
        if (!raw) {
          window.showToast('找不到原始照片，請清除後重新拍攝', 'warn', 3000);
          return;
        }
        const slot = document.querySelector(`.upload-slot[data-key="${target}"]`);
        const dataUrl = await openCropModal(raw, target);
        if (dataUrl) {
          renderPreview(slot, dataUrl);
          saveImageToPayload(target, dataUrl);
        }
      });
    });

    // 旋轉按鈕：就地旋轉 90° 順時針（同步旋轉 rawStore 以便再裁切方向正確）
    document.querySelectorAll('[data-rotate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const target = btn.dataset.rotate;
        const current = imageStore[target];
        if (!current) return;
        btn.disabled = true;
        const origText = btn.textContent;
        btn.textContent = '旋轉中…';
        try {
          const rotated = await window.rotateImage90(current);
          imageStore[target] = rotated;
          const slot = document.querySelector(`.upload-slot[data-key="${target}"]`);
          renderPreview(slot, rotated);
          // 同步旋轉 rawStore（若存在）
          if (rawStore[target]) {
            const src = rawStore[target];
            const rc = document.createElement('canvas');
            rc.width = src.height;
            rc.height = src.width;
            const ctx = rc.getContext('2d');
            ctx.translate(rc.width / 2, rc.height / 2);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(src, -src.width / 2, -src.height / 2);
            rawStore[target] = rc;
          }
        } catch (err) {
          console.error(err);
          window.showToast('旋轉失敗：' + err.message, 'error');
        } finally {
          btn.textContent = origText;
          btn.disabled = false;
        }
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
        window.showToast(
          '儲存失敗，可能是照片檔案過大。請清除部分照片重新拍攝較小尺寸。',
          'error',
          8000
        );
      }
    });
  }

  // ============ 初始化 ============
  fillJobCategory();
  prefillFields();
  bindCropInteraction();
  bindCropButtons();
  bindUploads();
  loadCachedImages();
  bindActions();
})();
