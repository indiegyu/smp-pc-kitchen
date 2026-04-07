document.addEventListener('DOMContentLoaded', initShortages);

function q(selector) { return document.querySelector(selector); }
function qa(selector) { return Array.from(document.querySelectorAll(selector)); }
function todayISO() { return new Date().toISOString().split('T')[0]; }

async function initShortages() {
    const dateEl = q('#shortageDate');
    dateEl.value = todayISO();
    dateEl.addEventListener('change', () => loadShortages(dateEl.value));

    q('#resetCountsBtn').addEventListener('click', () => openConfirmModal());
    q('#viewHistoryBtn').addEventListener('click', () => toggleHistory());

    q('#confirmCancelBtn').addEventListener('click', closeConfirmModal);
    q('#confirmSubmitBtn').addEventListener('click', confirmReset);

    // setup collapsible headers and drink note
    ['drink','snack','ramen'].forEach(cat => {
        const section = q('#section-' + cat);
        if (!section) return;
        const header = section.querySelector('.section-header');
        // transform header into toggle if not already
        if (header && !header.querySelector('.section-toggle')) {
            const titleText = header.textContent.trim();
            header.innerHTML = `<div class="section-title">${titleText}</div><button class="section-toggle" aria-expanded="true" type="button"><span class="collapse-arrow">▾</span></button>`;
            const btn = header.querySelector('.section-toggle');
            btn.addEventListener('click', () => toggleCategory(cat, btn));
        }
        // insert short note for drinks
        if (cat === 'drink' && !section.querySelector('.section-note')) {
            section.querySelector('.section-header').insertAdjacentHTML('afterend', '<div class="section-note">좌측: 낱개 갯수 · 우측: 박스/팩 갯수</div>');
        }
        // restore collapsed state
        const collapsed = localStorage.getItem('shortages_collapsed_' + cat) === '1';
        if (collapsed) {
            section.classList.add('collapsed');
            const btn = section.querySelector('.section-toggle');
            const arrow = btn && btn.querySelector('.collapse-arrow');
            if (arrow) arrow.classList.add('collapsed');
            if (btn) btn.setAttribute('aria-expanded','false');
        }
    });

    await loadShortages(dateEl.value);
}

let currentData = [];

async function loadShortages(date) {
    try {
        const items = await api(`/api/shortages?date=${date}`);
        currentData = items;
        renderCategory('drink', items.filter(i => i.category === 'drink'));
        renderCategory('snack', items.filter(i => i.category === 'snack'));
        renderCategory('ramen', items.filter(i => i.category === 'ramen'));
    } catch (err) {
        showToast('데이터 불러오기 실패', 'error');
    }
}

function renderCategory(catKey, items) {
    const container = q('#list-' + catKey);
    if (!container) return;
    container.innerHTML = '';
    items.forEach(it => {
        const row = document.createElement('div');
        row.className = 'item-row';
        row.dataset.itemId = it.id;

        const left = document.createElement('div');
        left.className = 'item-name';
        left.textContent = it.name;

        const controls = document.createElement('div');
        controls.className = 'controls';

        // units control
        const unitsCtl = document.createElement('div');
        unitsCtl.className = 'count-control';
        const uMinus = document.createElement('button');
        uMinus.className = 'btn btn-outline btn-sm minus';
        uMinus.type = 'button';
        uMinus.textContent = '-';
        const uInput = document.createElement('input');
        uInput.type = 'number';
        uInput.min = '0';
        uInput.className = 'count-input';
        uInput.value = it.units || 0;
        uInput.setAttribute('aria-label', `${it.name} 부족수량`);
        const uPlus = document.createElement('button');
        uPlus.className = 'btn btn-outline btn-sm plus';
        uPlus.type = 'button';
        uPlus.textContent = '+';

        unitsCtl.appendChild(uMinus);
        unitsCtl.appendChild(uInput);
        unitsCtl.appendChild(uPlus);
        controls.appendChild(unitsCtl);

        // box control for drinks
        let boxInput = null;
        if (it.has_box) {
            const boxCtl = document.createElement('div');
            boxCtl.className = 'box-control';
            const bMinus = document.createElement('button');
            bMinus.className = 'btn btn-outline btn-sm minus';
            bMinus.type = 'button';
            bMinus.textContent = '-';
            boxInput = document.createElement('input');
            boxInput.type = 'number';
            boxInput.min = '0';
            boxInput.className = 'count-input';
            boxInput.value = (it.boxes != null) ? it.boxes : 0;
            boxInput.setAttribute('aria-label', `${it.name} 박스수량`);
            const bPlus = document.createElement('button');
            bPlus.className = 'btn btn-outline btn-sm plus';
            bPlus.type = 'button';
            bPlus.textContent = '+';

            boxCtl.appendChild(bMinus);
            boxCtl.appendChild(boxInput);
            boxCtl.appendChild(bPlus);
            controls.appendChild(boxCtl);

            bMinus.addEventListener('click', () => { boxInput.value = Math.max(0, parseInt(boxInput.value || 0) - 1); saveRow(it.id, uInput, boxInput); });
            bPlus.addEventListener('click', () => { boxInput.value = Math.max(0, parseInt(boxInput.value || 0) + 1); saveRow(it.id, uInput, boxInput); });
            boxInput.addEventListener('blur', () => saveRow(it.id, uInput, boxInput));
            boxInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') boxInput.blur(); });
        }

        // wire unit buttons
        uMinus.addEventListener('click', () => { uInput.value = Math.max(0, parseInt(uInput.value || 0) - 1); saveRow(it.id, uInput, boxInput); });
        uPlus.addEventListener('click', () => { uInput.value = Math.max(0, parseInt(uInput.value || 0) + 1); saveRow(it.id, uInput, boxInput); });
        uInput.addEventListener('blur', () => saveRow(it.id, uInput, boxInput));
        uInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') uInput.blur(); });

        const meta = document.createElement('div');
        meta.className = 'item-meta';
        meta.textContent = it.updated_by ? `수정: ${it.updated_by}` : '';

        row.appendChild(left);
        row.appendChild(controls);
        row.appendChild(meta);
        container.appendChild(row);
    });

    if (items.length === 0) {
        container.innerHTML = `<div class="note">항목이 없습니다.</div>`;
    }
}

let saveTimers = {};
function saveRow(itemId, uInput, boxInput) {
    const units = parseInt(uInput.value || 0);
    const boxes = boxInput ? (boxInput.value === '' ? null : parseInt(boxInput.value || 0)) : null;
    // debounce per item
    clearTimeout(saveTimers[itemId]);
    saveTimers[itemId] = setTimeout(() => {
        updateCount(itemId, units, boxes);
    }, 250);
}

async function updateCount(itemId, units, boxes) {
    const date = q('#shortageDate').value || todayISO();
    const payload = { item_id: itemId, date: date, units: units };
    if (boxes !== undefined) payload.boxes = boxes;
    payload.updated_by = (typeof getSelectedStaff === 'function') ? getSelectedStaff() : '';
    try {
        // save silently on success (no per-button toast)
        await api('/api/shortages', { method: 'POST', body: payload });
    } catch (err) {
        // show error only on failure
        showToast('저장 실패', 'error');
    }
}

// collapsible helper
function toggleCategory(catKey, btn) {
    const section = document.getElementById('section-' + catKey);
    if (!section) return;
    const body = section.querySelector('.section-list');
    const collapsed = section.classList.toggle('collapsed');
    const arrow = btn && btn.querySelector('.collapse-arrow');
    if (arrow) arrow.classList.toggle('collapsed', collapsed);
    if (btn) btn.setAttribute('aria-expanded', (!collapsed).toString());
    localStorage.setItem('shortages_collapsed_' + catKey, collapsed ? '1' : '0');
}

function openConfirmModal() {
    const modal = q('#shortageConfirmModal');
    if (!modal) return;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    q('#confirmText').value = '';
    q('#adminCode').value = '';
    setTimeout(() => q('#confirmText').focus(), 80);
}

function closeConfirmModal() {
    const modal = q('#shortageConfirmModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
}

async function confirmReset() {
    const confirmText = q('#confirmText').value.trim();
    const adminCode = q('#adminCode').value.trim();
    if (confirmText !== '초기화') {
        showToast('확인 문구를 정확히 입력하세요', 'error');
        return;
    }
    if (!adminCode) {
        showToast('관리자 코드를 입력하세요', 'error');
        return;
    }
    const date = q('#shortageDate').value || todayISO();
    try {
        const res = await api(`/api/shortages?date=${date}`, { method: 'DELETE', body: { password: adminCode } });
        if (res && res.ok) {
            showToast('초기화 완료', 'success');
            closeConfirmModal();
            await loadShortages(date);
        } else {
            showToast(res && res.error ? res.error : '초기화 실패', 'error');
        }
    } catch (err) {
        showToast('초기화 실패', 'error');
    }
}

let historyVisible = false;
async function toggleHistory() {
    historyVisible = !historyVisible;
    const panel = q('#historyPanel');
    if (!panel) return;
    panel.style.display = historyVisible ? 'block' : 'none';
    if (historyVisible) {
        await loadHistory();
    }
}

async function loadHistory() {
    const days = 7;
    try {
        const hist = await api(`/api/shortages/history?days=${days}`);
        const container = q('#historyContent');
        container.innerHTML = '';
        hist.forEach(day => {
            const h = document.createElement('div');
            h.className = 'history-day';
            const title = document.createElement('div');
            title.className = 'history-date';
            title.textContent = day.date;
            h.appendChild(title);
            const list = document.createElement('div');
            list.className = 'history-list';
            if (!day.counts.length) {
                list.textContent = '기록 없음';
            } else {
                day.counts.forEach(c => {
                    const row = document.createElement('div');
                    row.className = 'history-row';
                    row.textContent = `${c.item_id}: ${c.units}${c.boxes != null ? ' / ' + c.boxes + ' box' : ''} (${c.updated_by || '-'})`;
                    list.appendChild(row);
                });
            }
            h.appendChild(list);
            container.appendChild(h);
        });
    } catch (err) {
        showToast('기록을 불러오지 못했습니다', 'error');
    }
}