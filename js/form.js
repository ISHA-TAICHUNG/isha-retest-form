/**
 * 表單頁邏輯：自動帶入清冊資料、提供編輯、處理照片上傳、暫存到 sessionStorage
 */
(function () {
  const cfg = window.APP_CONFIG;
  const $ = (id) => document.getElementById(id);

  const SELECTED_KEY = 'osha_selected_record';
  const FORM_KEY = 'osha_form_payload';

  // 影像處理常數
  const ID_CARD_RATIO = 1.58;     // 台灣身分證長寬比
  const ID_IMG_MAX_WIDTH = 1400;  // 壓縮輸出寬度上限（兼顧解析度與 sessionStorage 額度）
  const ID_IMG_QUALITY = 0.85;    // JPEG 壓縮品質
  const MIN_CROP_RATIO = 0.25;    // 裁切佔原圖比例若 < 此值 → 警告身分證偏小
  const MIN_CROP_SIZE = 40;       // 裁切框最小邊長（原圖座標系）

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
  function canvasToDataUrl(canvas, maxWidth = ID_IMG_MAX_WIDTH, quality = ID_IMG_QUALITY) {
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
        const imgRatio = cropState.srcW / cropState.srcH;
        let boxW, boxH;
        if (imgRatio > ID_CARD_RATIO) {
          // 原圖比 1.58:1 更寬 → 以高度 85% 為基準
          boxH = cropState.srcH * 0.85;
          boxW = boxH * ID_CARD_RATIO;
        } else {
          // 原圖比 1.58:1 更高（瘦長）→ 以寬度 85% 為基準
          boxW = cropState.srcW * 0.85;
          boxH = boxW / ID_CARD_RATIO;
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
      const MIN = MIN_CROP_SIZE;

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

    // 視窗縮放時重算裁切框位置（裝置旋轉、URL bar 收合都會觸發）
    window.addEventListener('resize', () => {
      if ($('cropModal').classList.contains('hidden')) return;
      if (!cropState.sourceCanvas || !cropState.srcW) return;
      const stage = $('cropStage');
      const canvas = $('cropCanvas');
      const scale = Math.min(stage.clientWidth / cropState.srcW, stage.clientHeight / cropState.srcH);
      cropState.displayScale = scale;
      canvas.width = Math.round(cropState.srcW * scale);
      canvas.height = Math.round(cropState.srcH * scale);
      canvas.getContext('2d').drawImage(cropState.sourceCanvas, 0, 0, canvas.width, canvas.height);
      // 防止裝置旋轉後裁切框跑出 canvas 邊界（會導致 confirmCrop 拿到黑邊）
      const b = cropState.box;
      b.w = Math.min(b.w, cropState.srcW);
      b.h = Math.min(b.h, cropState.srcH);
      b.x = Math.max(0, Math.min(cropState.srcW - b.w, b.x));
      b.y = Math.max(0, Math.min(cropState.srcH - b.h, b.y));
      updateCropBoxUI();
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
        const dataUrl = canvasToDataUrl(canvas, ID_IMG_MAX_WIDTH, ID_IMG_QUALITY);
        // 方案 B：品質警告（裁切佔原圖太小 = 學員拍太遠）
        if (cropRatio < MIN_CROP_RATIO && typeof window.showToast === 'function') {
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
      const dataUrl = canvasToDataUrl(cropState.sourceCanvas, ID_IMG_MAX_WIDTH, ID_IMG_QUALITY);
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

  // ============ 自訂全螢幕相機（解決 Android input[capture] 誤觸相簿） ============
  const cameraState = {
    stream: null,
  };

  const hasGetUserMedia = () =>
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  // 將 canvas 順時針旋轉 90°（用於相簿選到的直拍照片）
  function rotateCanvas90Direct(canvas) {
    const out = document.createElement('canvas');
    out.width = canvas.height;
    out.height = canvas.width;
    const ctx = out.getContext('2d');
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
  }

  // 從 video 擷取當前 frame，處理兩個問題：
  // 1) iOS Safari 可能把 sensor landscape 原生 frame 回傳，使用者在 portrait 裝置看到的
  //    預覽是瀏覽器旋轉過的 → drawImage 後要補旋轉才能對齊預覽
  // 2) 相機 overlay 只佔螢幕一部分，若擷取整張 video 畫面 ID 會太小 →
  //    根據 overlay 在 video 中的位置反算，裁出 overlay 區域 + 15% 邊界
  function captureFromVideo(video) {
    // Step 1：擷取原始 frame
    const raw = document.createElement('canvas');
    raw.width = video.videoWidth;
    raw.height = video.videoHeight;
    raw.getContext('2d').drawImage(video, 0, 0);

    // Step 2：若裝置為 portrait 但 sensor frame 為 landscape，補一次 90° CW 旋轉
    //         讓 canvas 方向與使用者在預覽中看到的一致
    //         優先用 screen.orientation（iOS Safari 在裝置剛旋轉時 innerHeight 會
    //         有短暫不一致），不支援才退回 innerWidth/innerHeight 比較
    let aligned = raw;
    const devicePortrait = (screen.orientation && screen.orientation.type)
      ? screen.orientation.type.startsWith('portrait')
      : (window.innerHeight > window.innerWidth);
    if (devicePortrait && raw.width > raw.height) {
      aligned = rotateCanvas90Direct(raw);
    }

    // Step 3：根據 overlay（青色 1.58:1 框）的螢幕位置，計算在 aligned canvas 中對應的範圍
    const frameEl = document.getElementById('cameraFrame');
    const vidRect = video.getBoundingClientRect();
    const frameRect = frameEl ? frameEl.getBoundingClientRect() : null;

    // 若抓不到框 rect，退回整張 aligned（不裁）
    if (!frameRect || frameRect.width < 10 || frameRect.height < 10) {
      return aligned;
    }

    const natW = aligned.width;
    const natH = aligned.height;
    const dispW = vidRect.width;
    const dispH = vidRect.height;

    // object-fit: cover → 自然內容以 max scale 填滿容器、溢出邊緣被裁切
    const scale = Math.max(dispW / natW, dispH / natH);
    const visCssW = natW * scale;
    const visCssH = natH * scale;
    const offX = (visCssW - dispW) / 2;
    const offY = (visCssH - dispH) / 2;

    // Overlay 位置（CSS 像素）→ aligned canvas 自然像素
    let cropX = (frameRect.left - vidRect.left + offX) / scale;
    let cropY = (frameRect.top - vidRect.top + offY) / scale;
    let cropW = frameRect.width / scale;
    let cropH = frameRect.height / scale;

    // 外擴 15%，給 crop modal 微調空間
    const pad = 0.15;
    cropX -= cropW * pad / 2;
    cropY -= cropH * pad / 2;
    cropW *= 1 + pad;
    cropH *= 1 + pad;

    // 夾回 canvas 邊界
    cropX = Math.max(0, Math.min(natW, cropX));
    cropY = Math.max(0, Math.min(natH, cropY));
    cropW = Math.min(natW - cropX, cropW);
    cropH = Math.min(natH - cropY, cropH);

    // 夾完後若範圍過小（計算有誤）→ 退回整張
    // 用相對比例判斷而非固定 100px，避免小螢幕誤判
    if (cropW < aligned.width * 0.1 || cropH < aligned.height * 0.1) return aligned;

    const cropped = document.createElement('canvas');
    cropped.width = Math.round(cropW);
    cropped.height = Math.round(cropH);
    cropped.getContext('2d').drawImage(
      aligned,
      cropX, cropY, cropW, cropH,
      0, 0, cropped.width, cropped.height
    );
    return cropped;
  }

  // 開啟全螢幕相機，回傳 { canvas } | { gallery: true } | { cancelled: true }
  // 用 AbortController 統一管理 listener，cleanup() 一鍵解除避免累積洩漏
  function openCameraModal(targetKey) {
    return new Promise((resolve) => {
      const modal = $('cameraModal');
      const video = $('cameraVideo');
      const overlay = $('cameraOverlay');
      const errorBox = $('cameraError');
      const hintTitle = $('cameraHintTitle');
      const shutterBtn = $('cameraShutterBtn');

      const isFront = targetKey === 'idFront';
      modal.classList.toggle('is-front', isFront);
      hintTitle.textContent = isFront ? '身分證正面' : '身分證反面';

      errorBox.classList.add('hidden');
      overlay.style.display = '';
      shutterBtn.disabled = true;
      modal.classList.remove('hidden');

      // AbortController：所有 listener 都掛在 signal 上，cleanup 一次解除
      const ac = new AbortController();
      const sig = ac.signal;

      // 延遲 pushState 到 stream 真的開起來才執行；若 getUserMedia 立刻失敗
      // (e.g. desktop 沒鏡頭)，避免使用者點「從相簿」時被 history.back 帶回首頁
      let historyPushed = false;
      let stateConsumedByPop = false;

      let resolved = false;
      const resolveOnce = (payload) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(payload);
      };

      const cleanup = () => {
        ac.abort(); // 一次解除全部 listener
        stopCameraStream();
        modal.classList.add('hidden');
        modal.classList.remove('is-front');
        // 若 cleanup 非 popstate 觸發，且當初有 push state → 彈掉
        if (historyPushed && !stateConsumedByPop && history.state && history.state.cameraOpen) {
          try { history.back(); } catch (_) {}
        }
      };

      // popstate 與 visibilitychange 是「全域事件」，掛在 window/document
      window.addEventListener('popstate', () => {
        stateConsumedByPop = true;
        resolveOnce({ cancelled: true });
      }, { signal: sig });

      document.addEventListener('visibilitychange', () => {
        // 分頁切到背景 → 釋放相機資源
        if (document.visibilityState === 'hidden') stopCameraStream();
      }, { signal: sig });

      $('cameraCloseBtn').addEventListener('click',
        () => resolveOnce({ cancelled: true }), { signal: sig });

      document.querySelectorAll('.js-camera-gallery').forEach((btn) => {
        btn.addEventListener('click',
          () => resolveOnce({ gallery: true }), { signal: sig });
      });

      // retry 按鈕「不」加 once — 多次失敗（如 OverconstrainedError 後再 NotAllowedError）
      // 仍要能重複按
      $('cameraRetryBtn').addEventListener('click', () => {
        errorBox.classList.add('hidden');
        overlay.style.display = '';
        startCameraStream(video, shutterBtn, errorBox, overlay);
      }, { signal: sig });

      shutterBtn.addEventListener('click', () => {
        if (shutterBtn.disabled) return;
        if (!video.videoWidth || !video.videoHeight) {
          window.showToast('相機還沒準備好，請稍等 1 秒', 'warn', 2000);
          return;
        }
        shutterBtn.disabled = true;
        resolveOnce({ canvas: captureFromVideo(video) });
      }, { signal: sig });

      // 啟動相機 + stream 起來後才 push history state（讓返回手勢有效但不會白 pop）
      startCameraStream(video, shutterBtn, errorBox, overlay).then((ok) => {
        if (ok && !resolved && !historyPushed) {
          try {
            history.pushState({ cameraOpen: true }, '');
            historyPushed = true;
          } catch (_) {}
        }
      });
    });
  }

  function stopCameraStream() {
    if (cameraState.stream) {
      cameraState.stream.getTracks().forEach((t) => t.stop());
      cameraState.stream = null;
    }
    const video = $('cameraVideo');
    if (video) video.srcObject = null;
  }

  // 回傳 true 代表 stream 成功啟動（讓呼叫端決定是否 pushState）
  async function startCameraStream(video, shutterBtn, errorBox, overlay) {
    if (!hasGetUserMedia()) {
      showCameraError('您的瀏覽器不支援相機，改從相簿選擇已拍好的照片。', errorBox, overlay);
      return false;
    }
    // 三層 constraint fallback：理想配置 → 僅指定後鏡頭 → 最低限度
    // 用來繞過舊版 Android webview 對 ideal 解析不良導致的 OverconstrainedError
    const attempts = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false },
    ];
    let stream = null;
    let lastErr = null;
    for (const c of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        break;
      } catch (err) {
        lastErr = err;
        // 權限 / 裝置類錯誤不重試，只有 constraint 相關才退到下一層
        if (err.name !== 'OverconstrainedError' && err.name !== 'TypeError') break;
      }
    }
    if (!stream) {
      console.warn('getUserMedia failed:', lastErr);
      let msg = '請允許本網頁使用相機，或從相簿選擇已拍好的照片。';
      if (lastErr && lastErr.name === 'NotAllowedError') {
        msg = '相機權限被拒絕。請到瀏覽器設定重新允許，或改用相簿。';
      } else if (lastErr && lastErr.name === 'NotFoundError') {
        msg = '找不到可用的相機，請改用相簿選擇照片。';
      } else if (lastErr && lastErr.name === 'NotReadableError') {
        msg = '相機目前被其他 App 佔用，請關閉其他 App 後再試。';
      }
      showCameraError(msg, errorBox, overlay);
      return false;
    }

    cameraState.stream = stream;
    video.srcObject = stream;

    // P1-3：等待 video 實際有畫面尺寸才啟用快門。
    // 先等 loadedmetadata 或 playing 事件；5 秒內沒動作就視為失敗。
    try {
      await new Promise((resolve, reject) => {
        const onReady = () => {
          if (video.videoWidth > 0) {
            cleanupVideoEvents();
            resolve();
          }
        };
        const onError = (e) => {
          cleanupVideoEvents();
          reject(e || new Error('video error'));
        };
        const cleanupVideoEvents = () => {
          video.removeEventListener('loadedmetadata', onReady);
          video.removeEventListener('playing', onReady);
          video.removeEventListener('error', onError);
          clearTimeout(timer);
        };
        const timer = setTimeout(() => {
          if (video.videoWidth > 0) { cleanupVideoEvents(); resolve(); }
          else { cleanupVideoEvents(); reject(new Error('video metadata timeout')); }
        }, 5000);
        video.addEventListener('loadedmetadata', onReady);
        video.addEventListener('playing', onReady);
        video.addEventListener('error', onError);
        video.play().catch(() => {}); // iOS 有時需手動 play，即使被 reject 也不要當失敗
      });
      shutterBtn.disabled = false;
      return true;
    } catch (err) {
      console.warn('video not ready:', err);
      showCameraError('相機無法取得畫面，請重試或改用相簿。', errorBox, overlay);
      return false;
    }
  }

  function showCameraError(msg, errorBox, overlay) {
    const msgEl = $('cameraErrorMsg');
    if (msgEl) msgEl.textContent = msg;
    overlay.style.display = 'none';
    errorBox.classList.remove('hidden');
  }

  // 觸發相簿選檔（透過 hidden input[data-fallback]）
  // P1-1：監聽 change / cancel / window focus 三路退路，避免使用者取消後 Promise 永掛
  function triggerGallery(targetKey) {
    return new Promise((resolve) => {
      const inp = document.querySelector(`input[data-fallback="${targetKey}"]`);
      if (!inp) { resolve(null); return; }

      let resolved = false;
      const done = (file) => {
        if (resolved) return;
        resolved = true;
        inp.removeEventListener('change', onChange);
        inp.removeEventListener('cancel', onCancel);
        window.removeEventListener('focus', onFocus);
        resolve(file || null);
      };
      const onChange = () => done(inp.files && inp.files[0]);
      const onCancel = () => done(null);
      // 相容舊版瀏覽器（沒 cancel event）：視窗 focus 後延遲檢查 files 是否為空
      // 800ms 給老 Android 從相機 App 切回後的 change 事件留充足時間
      const onFocus = () => setTimeout(() => {
        if (!inp.files || !inp.files.length) done(null);
      }, 800);

      inp.addEventListener('change', onChange);
      // 偵測現代瀏覽器是否支援 cancel；不支援才掛 focus fallback
      const supportsCancel = ('oncancel' in HTMLInputElement.prototype);
      if (supportsCancel) {
        inp.addEventListener('cancel', onCancel);
      } else {
        window.addEventListener('focus', onFocus, { once: true });
      }
      inp.value = '';
      inp.click();
    });
  }

  // 主入口：處理單一 target 的完整拍照流程（相機 → 裁切 → 儲存）
  async function handleCapture(targetKey) {
    const slot = document.querySelector(`.upload-slot[data-key="${targetKey}"]`);
    if (!slot) return;

    let sourceCanvas = null;

    if (hasGetUserMedia()) {
      const result = await openCameraModal(targetKey);
      if (result.cancelled) return;

      if (result.canvas) {
        sourceCanvas = result.canvas;
      } else if (result.gallery) {
        // 使用者在相機 UI 裡點了「相簿」
        const file = await triggerGallery(targetKey);
        if (!file) return;
        const img = await fileToImage(file);
        sourceCanvas = rotateImageIfPortrait(img);
      }
    } else {
      // 瀏覽器完全不支援 getUserMedia → 直接走相簿
      const file = await triggerGallery(targetKey);
      if (!file) return;
      const img = await fileToImage(file);
      sourceCanvas = rotateImageIfPortrait(img);
    }

    if (!sourceCanvas) return;

    showProcessing(slot);
    try {
      // 相機拍出來的通常已是橫式（video 依裝置旋轉），但從相簿選的需要檢查
      // P2：直接 canvas 旋轉，避免 dataURL 往返消耗（舊 Android 低階機記憶體敏感）
      if (sourceCanvas.height > sourceCanvas.width) {
        sourceCanvas = rotateCanvas90Direct(sourceCanvas);
      }
      rawStore[targetKey] = sourceCanvas;

      const dataUrl = await openCropModal(sourceCanvas, targetKey);
      if (!dataUrl) {
        restoreEmptyState(slot, targetKey);
        return;
      }
      renderPreview(slot, dataUrl);
      saveImageToPayload(targetKey, dataUrl);
    } catch (err) {
      console.error(err);
      window.showToast('圖片處理失敗：' + err.message, 'error', 5000);
      restoreEmptyState(slot, targetKey);
    }
  }

  function bindUploads() {
    // 主觸發：點擊 upload slot → 開相機
    document.querySelectorAll('[data-capture]').forEach((btn) => {
      btn.addEventListener('click', () => handleCapture(btn.dataset.capture));
    });

    // 相簿 fallback 的 change（由 triggerGallery 驅動，不需額外 listener）

    document.querySelectorAll('.btn-clear').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.clear;
        const slot = document.querySelector(`.upload-slot[data-key="${target}"]`);
        slot.classList.remove('has-image');
        restoreEmptyState(slot, target);
        const fb = document.querySelector(`input[data-fallback="${target}"]`);
        if (fb) fb.value = '';
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

    // 旋轉按鈕已移除：相機流程自動處理方向（captureFromVideo + rotateImageIfPortrait），
    // 極端情況（相簿選到 180° 顛倒照片）請使用「清除重拍」。
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
        window.showToast('請完成必填欄位：' + errors.join('、'), 'warn', 5000);
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
