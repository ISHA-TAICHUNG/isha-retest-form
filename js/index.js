/**
 * 首頁邏輯：身分證查詢 → 跳轉到表單頁
 *
 * 安全強化：不再前端 cache 全清冊。每次查詢直接打 GAS lookup。
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const els = {
    idInput: $('idInput'),
    searchBtn: $('searchBtn'),
    status: $('status'),
    candidatesBlock: $('candidatesBlock'),
    candidateList: $('candidateList'),
  };

  function showStatus(msg, type = 'info', extraNote = '') {
    els.status.className = 'status ' + type;
    els.status.replaceChildren();
    const main = document.createElement('div');
    main.textContent = msg;
    els.status.appendChild(main);
    if (extraNote) {
      const sub = document.createElement('div');
      sub.className = 'muted';
      sub.style.marginTop = '4px';
      sub.textContent = extraNote;
      els.status.appendChild(sub);
    }
    els.status.classList.remove('hidden');
  }
  function hideStatus() { els.status.classList.add('hidden'); }

  function setBusy(busy) {
    els.searchBtn.disabled = busy;
    els.searchBtn.replaceChildren();
    if (busy) {
      const loader = document.createElement('span');
      loader.className = 'loader';
      els.searchBtn.appendChild(loader);
      els.searchBtn.appendChild(document.createTextNode('查詢中…'));
    } else {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '20'); svg.setAttribute('height', '20');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2.5'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>';
      els.searchBtn.appendChild(svg);
      els.searchBtn.appendChild(document.createTextNode('查詢'));
    }
  }

  async function performSearch() {
    hideStatus();
    els.candidatesBlock.classList.add('hidden');
    els.candidateList.replaceChildren();

    const id = els.idInput.value.trim().toUpperCase();
    if (!id) {
      showStatus('請輸入身分證字號', 'warn');
      els.idInput.focus();
      return;
    }

    setBusy(true);
    try {
      const result = await window.lookupById(id);
      const matches = result.records;

      if (matches.length === 0) {
        showStatus('查無此身分證資料', 'error', '請確認字號正確，或聯繫訓練單位確認您是否已在報名清冊內。');
        return;
      }

      if (matches.length === 1) {
        gotoForm(matches[0]);
        return;
      }

      // 多筆 → 顯示候選卡片
      els.candidatesBlock.classList.remove('hidden');
      els.candidateList.replaceChildren();

      const note = document.createElement('p');
      note.className = 'candidates-note';
      note.textContent = `系統找到 ${matches.length} 筆「${matches[0].name}」的補考紀錄，請選擇您要列印的職類與梯次：`;
      els.candidateList.appendChild(note);

      matches.forEach((r) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'candidate-card';
        card.setAttribute('aria-label', `選擇 ${r.year} 年第 ${r.batch} 梯 ${r.jobName}`);

        const badge = document.createElement('div');
        badge.className = 'candidate-badge';
        badge.textContent = r.jobCode || '—';

        const info = document.createElement('div');
        info.className = 'candidate-info';

        const title = document.createElement('div');
        title.className = 'candidate-title';
        title.textContent = r.jobName || '未指定職類';
        info.appendChild(title);

        const sub = document.createElement('div');
        sub.className = 'candidate-sub';
        sub.textContent = `${r.year} 年第 ${r.batch} 梯 · 期別 ${r.classNo}`;
        info.appendChild(sub);

        const period = document.createElement('div');
        period.className = 'candidate-period';
        period.textContent = `訓練期間：${window.formatRocDate(r.trainStart)} – ${window.formatRocDate(r.trainEnd)}`;
        info.appendChild(period);

        const arrow = document.createElement('div');
        arrow.className = 'candidate-arrow';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '22'); svg.setAttribute('height', '22');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2.5'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', '5'); line.setAttribute('y1', '12'); line.setAttribute('x2', '19'); line.setAttribute('y2', '12');
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        poly.setAttribute('points', '12 5 19 12 12 19');
        svg.appendChild(line); svg.appendChild(poly);
        arrow.appendChild(svg);

        card.appendChild(badge);
        card.appendChild(info);
        card.appendChild(arrow);
        card.addEventListener('click', () => gotoForm(r));
        els.candidateList.appendChild(card);
      });
    } catch (err) {
      console.error(err);
      showStatus('查詢失敗：' + err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function gotoForm(record) {
    sessionStorage.setItem('osha_selected_record', JSON.stringify(record));
    window.location.href = 'form.html';
  }

  // ============ 事件繫結 ============
  els.searchBtn.addEventListener('click', performSearch);

  els.idInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.searchBtn.click();
  });

  els.idInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });
})();
