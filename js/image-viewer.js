/**
 * 圖片放大檢視器（lightbox with pinch-zoom / 按鈕縮放）
 * 使用方式：window.openImageViewer(dataUrl)
 * 支援：手機雙指縮放、桌機 +/- 按鈕、點背景或 ✕ 關閉
 */
(function () {
  'use strict';

  let overlay = null;
  let imgEl = null;
  let scale = 1;
  const MIN_SCALE = 1;
  const MAX_SCALE = 5;
  const STEP = 0.5;

  function mkBtn(action, label, text) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'iv-btn' + (action === 'close' ? ' iv-close' : '');
    b.dataset.action = action;
    b.setAttribute('aria-label', label);
    b.textContent = text;
    return b;
  }

  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'image-viewer hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const toolbar = document.createElement('div');
    toolbar.className = 'iv-toolbar';
    toolbar.appendChild(mkBtn('zoom-out', '縮小', '−'));
    toolbar.appendChild(mkBtn('reset', '還原', '1:1'));
    toolbar.appendChild(mkBtn('zoom-in', '放大', '+'));
    toolbar.appendChild(mkBtn('close', '關閉', '✕'));

    const scroll = document.createElement('div');
    scroll.className = 'iv-scroll';
    scroll.dataset.action = 'close-bg';

    imgEl = document.createElement('img');
    imgEl.className = 'iv-img';
    imgEl.alt = '放大檢視';
    scroll.appendChild(imgEl);

    const hint = document.createElement('div');
    hint.className = 'iv-hint';
    hint.textContent = '雙指縮放或使用上方 +/− 按鈕；點圖片切換 1x/2x';

    overlay.appendChild(toolbar);
    overlay.appendChild(scroll);
    overlay.appendChild(hint);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      const t = e.target;
      const action = t.dataset && t.dataset.action;
      if (action === 'close' || action === 'close-bg') close();
      else if (action === 'zoom-in') setScale(scale + STEP);
      else if (action === 'zoom-out') setScale(scale - STEP);
      else if (action === 'reset') setScale(1);
    });

    imgEl.addEventListener('click', (e) => {
      e.stopPropagation();
      setScale(scale === 1 ? 2 : 1);
    });
    imgEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      setScale(1);
    });

    document.addEventListener('keydown', (e) => {
      if (!overlay || overlay.classList.contains('hidden')) return;
      if (e.key === 'Escape') close();
      else if (e.key === '+' || e.key === '=') setScale(scale + STEP);
      else if (e.key === '-') setScale(scale - STEP);
      else if (e.key === '0') setScale(1);
    });
  }

  function setScale(s) {
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
    if (imgEl) imgEl.style.transform = 'scale(' + scale + ')';
  }

  function open(dataUrl) {
    if (!overlay) buildOverlay();
    imgEl.src = dataUrl;
    setScale(1);
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!overlay) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
    imgEl.src = '';
    setScale(1);
  }

  window.openImageViewer = open;
  window.closeImageViewer = close;
})();
