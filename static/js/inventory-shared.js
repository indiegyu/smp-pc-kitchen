/*
 inventory-shared.js
 Shared inventory rendering + folding logic used by public and admin pages.
 Depends on global api(), showToast(), getSelectedStaff() (if present).
*/
(function(){
  // shared state
  window.inventoryData = window.inventoryData || [];
  window.activeCat = window.activeCat ?? null;
  window.collapsedCats = window.collapsedCats || {};

  function toggleSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const collapsed = el.classList.toggle('collapsed');
    const header = el.previousElementSibling;
    if (header) {
      const arrow = header.querySelector('.toggle-arrow') || header.querySelector('.collapse-arrow');
      if (arrow) arrow.classList.toggle('collapsed', collapsed);
      if (header.setAttribute) {
        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');
        header.setAttribute('aria-expanded', (!collapsed).toString());
      }
      try { localStorage.setItem('section_collapsed_' + id, collapsed ? '1' : '0'); } catch (e) {}
      if (!header.dataset.keydownAttached) {
        header.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleSection(id);
          }
        });
        header.dataset.keydownAttached = '1';
      }
    }
  }

  async function loadStaff() {
    const container = document.getElementById('staffButtons');
    if (!container) return;
    let staff = [];
    try { staff = await api('/api/staff') || []; } catch (e) { staff = []; }
    const saved = localStorage.getItem('smp_staff');
    container.innerHTML = staff.map(s =>
      `<button class="staff-btn ${s.name === saved ? 'selected' : ''}" data-name="${s.name}" onclick="selectStaff(this)">${s.name}</button>`
    ).join('');
  }

  function selectStaff(btn) {
    if (!btn) return;
    document.querySelectorAll('.staff-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    try { localStorage.setItem('smp_staff', btn.dataset.name); } catch (e) {}
  }
  window.selectStaff = selectStaff;

  async function loadSearchDropdown() {
    const dl = document.getElementById('itemList');
    if (!dl) return;
    try {
      const items = await api('/api/inventory/all-items') || [];
      dl.innerHTML = items.map(i => `<option value="${i.name}">`).join('');
    } catch (e) {
      dl.innerHTML = '';
    }
  }

  async function loadInventory() {
    try { window.inventoryData = await api('/api/inventory') || []; } catch (e) { window.inventoryData = []; }
    // restore per-category collapsed preference (default collapsed, first open)
    window.inventoryData.forEach((cat, idx) => {
      if (window.collapsedCats[cat.id] === undefined) {
        let stored = null;
        try { stored = localStorage.getItem('cat_collapsed_' + cat.id); } catch (e) { stored = null; }
        if (stored === '1') window.collapsedCats[cat.id] = true;
        else if (stored === '0') window.collapsedCats[cat.id] = false;
        else window.collapsedCats[cat.id] = (idx !== 0); // default: first open
      }
    });
    renderCatPills();
    renderInventory();
    // update low-stock and admin inventory status if present
    await loadLowStock();
  }

  async function loadLowStock() {
    let items = [];
    try { items = await api('/api/inventory/low-stock') || []; } catch (e) { items = []; }

    // update badge if present
    const badge = document.getElementById('lowStockBadge');
    if (badge) badge.textContent = (items && items.length) ? items.length : 0;

    // Render shortage grouped card into any present target (public lowStockAlert or admin lowStockBody)
    const shortageTargets = ['lowStockAlert','lowStockBody'];
    for (const tid of shortageTargets) {
      const el = document.getElementById(tid);
      if (!el) continue;
      if (!items || items.length === 0) {
        el.innerHTML = '<div style="padding:16px;color:var(--text-secondary)">부족한 재고가 없습니다</div>';
        continue;
      }
      const byCat = {};
      items.forEach(i => {
        const cat = i.category || '미분류';
        if (!byCat[cat]) byCat[cat] = [];
        byCat[cat].push(i);
      });
      const catNames = Object.keys(byCat);
      let html = '<div class="inventory-status-card shortage-card">';
      catNames.forEach((name, idx) => {
        const key = encodeURIComponent(name);
       html += `<div class="inventory-category shortage-cat" data-cat-key="${key}">`;
       html += `<div class="inventory-cat-title"><strong>${name}</strong></div>`;
       html += `<div class="inventory-cat-body"><ul class="inventory-items">`;
       byCat[name].forEach(it => {
         const shortage = (typeof it.min_threshold === 'number') ? Math.max(0, it.min_threshold - it.quantity) : 0;
         html += `<li class="inventory-item low-stock"><span class="inventory-item-name">${it.name}</span><span class="inventory-item-qty">${it.quantity}</span></li>`;
       });
       html += `</ul></div></div>`;
      });
      html += '</div>';
      el.innerHTML = html;

    }

    // Render full inventory into #inventoryStatus (admin) if present
    const statusEl = document.getElementById('inventoryStatus');
    if (!statusEl) return;
    try {
      const inv = await api('/api/inventory') || [];
      if (!inv.length) {
        statusEl.innerHTML = '<div style="padding:16px;color:var(--text-secondary)">재고가 없습니다</div>';
        return;
      }
      let invHtml = '<div class="inventory-status-card">';
      inv.forEach((cat, idx) => {
        const key = encodeURIComponent(cat.name || String(idx));
        let stored = null;
        try { stored = localStorage.getItem('inventory_cat_collapsed_' + key); } catch (e) { stored = null; }
        const isCollapsed = (stored === '1') ? true : (stored === '0') ? false : (idx !== 0);
        invHtml += `<div class="inventory-category" data-cat-key="${key}">`;
        invHtml += `<div class="inventory-cat-header" role="button" tabindex="0" aria-expanded="${!isCollapsed}" data-cat-key="${key}"><strong>${cat.name}</strong><span class="toggle-arrow ${isCollapsed ? 'collapsed' : ''}">▾</span></div>`;
        invHtml += `<div class="inventory-cat-body ${isCollapsed ? 'collapsed' : ''}">`;
        if (cat.items && cat.items.length) {
          invHtml += '<ul class="inventory-items">';
          cat.items.forEach(it => {
            const shortage = (typeof it.min_threshold === 'number') ? Math.max(0, it.min_threshold - it.quantity) : 0;
            invHtml += `<li class="inventory-item"><span class="inventory-item-name">${it.name}</span><span class="inventory-item-qty">${it.quantity}</span></li>`;
          });
          invHtml += '</ul>';
        } else {
          invHtml += '<div class="inventory-empty">품목 없음</div>';
        }
        invHtml += '</div></div>';
      });
      invHtml += '</div>';
      statusEl.innerHTML = invHtml;

      // attach handlers for inventory categories
      statusEl.querySelectorAll('.inventory-cat-header').forEach(h => {
        const key = h.dataset.catKey;
        h.addEventListener('click', () => {
          const body = h.nextElementSibling;
          if (!body) return;
          const collapsed = body.classList.toggle('collapsed');
          h.setAttribute('aria-expanded', (!collapsed).toString());
          const arrow = h.querySelector('.toggle-arrow');
          if (arrow) arrow.classList.toggle('collapsed', collapsed);
          try { localStorage.setItem('inventory_cat_collapsed_' + key, collapsed ? '1' : '0'); } catch (e) {}
        });
        h.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            h.click();
          }
        });
      });
    } catch (err) {
      statusEl.innerHTML = '<div style="padding:16px;color:var(--text-secondary)">불러오기 실패</div>';
    }
  }

  function renderCatPills() {
    const container = document.getElementById('catPills');
    if (!container) return;
    container.innerHTML = '';
    const makePill = (id, label) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-pill' + (window.activeCat === id ? ' active' : '');
      btn.setAttribute('aria-pressed', window.activeCat === id ? 'true' : 'false');
      btn.dataset.catId = (id === null) ? '' : String(id);
      btn.textContent = label;
      btn.addEventListener('click', () => selectCat(id));
      btn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          btn.click();
        }
      });
      return btn;
    };
    container.appendChild(makePill(null, '전체'));
    (window.inventoryData || []).forEach(cat => container.appendChild(makePill(cat.id, cat.name)));
  }

  function selectCat(catId) {
    window.activeCat = catId;
    const si = document.getElementById('searchInput');
    if (si) si.value = '';
    if (catId !== null) {
      (window.inventoryData || []).forEach(cat => { window.collapsedCats[cat.id] = cat.id !== catId; });
    }
    // update pill active/aria state without full re-render to preserve focus
    const container = document.getElementById('catPills');
    if (container) {
      container.querySelectorAll('.cat-pill').forEach(b => {
        const bid = b.dataset.catId;
        const isActive = (catId === null && bid === '') || (catId !== null && bid === String(catId));
        b.classList.toggle('active', !!isActive);
        b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }
    renderInventory();
  }

  function onSearch() {
    window.activeCat = null;
    const si = document.getElementById('searchInput');
    const search = si ? si.value.toLowerCase() : '';
    if (search) {
      (window.inventoryData || []).forEach(cat => { window.collapsedCats[cat.id] = false; });
    }
    renderCatPills();
    renderInventory();
  }

  function toggleCat(catId) {
    window.collapsedCats[catId] = !window.collapsedCats[catId];
    renderInventory();
  }

  function renderInventory() {
    const si = document.getElementById('searchInput');
    const search = si ? si.value.toLowerCase() : '';
    const container = document.getElementById('inventoryContainer');
    if (!container) return;
    container.innerHTML = (window.inventoryData || []).map(cat => {
      if (window.activeCat !== null && cat.id !== window.activeCat) return '';
      const filteredItems = (cat.items || []).filter(i => !search || i.name.toLowerCase().includes(search));
      if (search && filteredItems.length === 0) return '';
      const lowCount = filteredItems.filter(i => i.low_stock).length;
      const isCollapsed = window.collapsedCats[cat.id] && !search;
      return `
        <div class="card" id="cat-${cat.id}">
          <div class="inv-card-header ${isCollapsed ? 'collapsed' : ''}" onclick="toggleCat(${cat.id})">
            <span>${cat.name}
              ${lowCount ? `<span class="badge badge-danger">${lowCount} 부족</span>` : ''}
            </span>
            <span class="toggle-arrow ${isCollapsed ? 'collapsed' : ''}">&#9660;</span>
          </div>
          <div class="card-body ${isCollapsed ? 'collapsed' : ''}">
            <ul class="inv-list">
              ${filteredItems.map(item => `
                <li class="inv-item ${item.low_stock ? 'low-stock' : ''}">
                  <div class="inv-name">
                    ${item.name}
                    ${item.location ? `<div class="inv-location">${item.location}</div>` : ''}
                  </div>
                  <div class="inv-qty">
                    <span class="current-label">현재</span>
                    <button class="qty-btn minus" onclick="quickAdjust(${item.id}, -1, event)">-</button>
                    <span class="qty-value ${item.low_stock ? 'low' : ''}">${item.quantity}</span>
                    <button class="qty-btn plus" onclick="quickAdjust(${item.id}, 1, event)">+</button>
                  </div>
                  <button class="btn btn-outline btn-sm" onclick="openTxModal(${item.id}, '${String(item.name).replace(/'/g, "\\'")}')">입출고</button>
                  <button class="btn btn-outline btn-sm" onclick="showHistory(${item.id}, '${String(item.name).replace(/'/g, "\\'")}')">이력</button>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      `;
    }).join('');
  }

  async function quickAdjust(itemId, delta, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    const staff = (typeof getSelectedStaff === 'function') ? getSelectedStaff() : null;
    await api(`/api/inventory/${itemId}/transaction`, {
      method: 'POST',
      body: { type: delta > 0 ? 'in' : 'out', quantity: Math.abs(delta), staff_name: staff, note: '빠른 조정' }
    });
    for (const cat of (window.inventoryData || [])) {
      const item = (cat.items || []).find(i => i.id === itemId);
      if (item) { item.quantity = Math.max(0, item.quantity + delta); item.low_stock = item.quantity <= item.min_threshold; break; }
    }
    renderInventory();
  }

  function openTxModal(itemId, itemName) {
    const txNameEl = document.getElementById('txItemName');
    if (!txNameEl) return;
    document.getElementById('txItemId').value = itemId;
    txNameEl.value = itemName;
    const qtyEl = document.getElementById('txQty');
    if (qtyEl) qtyEl.value = 1;
    const noteEl = document.getElementById('txNote');
    if (noteEl) noteEl.value = '';
    const modal = document.getElementById('txModal');
    if (modal) modal.classList.add('show');
  }

  async function submitTransaction() {
    const itemId = document.getElementById('txItemId').value;
    const type = document.getElementById('txType').value;
    const qty = parseInt(document.getElementById('txQty').value);
    const note = document.getElementById('txNote').value;
    if (!qty || qty < 1) { showToast('수량을 입력하세요', 'error'); return; }
    await api(`/api/inventory/${itemId}/transaction`, {
      method: 'POST', body: { type, quantity: qty, note, staff_name: (typeof getSelectedStaff === 'function') ? getSelectedStaff() : null }
    });
    const modal = document.getElementById('txModal');
    if (modal) modal.classList.remove('show');
    showToast(`${type === 'in' ? '입고' : '출고'} 완료`);
    await loadInventory();
  }

  async function showHistory(itemId, itemName) {
    const titleEl = document.getElementById('historyTitle');
    if (!titleEl) return;
    titleEl.textContent = `${itemName} 이력`;
    let txs = [];
    try { txs = await api(`/api/inventory/${itemId}/history`) || []; } catch (e) { txs = []; }
    const list = document.getElementById('historyList');
    if (!list) return;
    list.innerHTML = txs.length === 0
      ? '<li style="padding:16px;color:var(--text-secondary)">이력이 없습니다</li>'
      : txs.map(tx => `
          <li class="history-item">
            <span class="${tx.type === 'in' ? 'tx-in' : 'tx-out'}">${tx.type === 'in' ? '+' : '-'}${tx.quantity}</span>
            <span>${tx.note || ''}</span>
            <span style="color:var(--text-secondary)">${tx.created_by || ''} ${tx.created_at || ''}</span>
          </li>`).join('');
    const modal = document.getElementById('historyModal');
    if (modal) modal.classList.add('show');
  }

  // expose public API
  window.loadInventory = loadInventory;
  window.loadLowStock = loadLowStock;
  window.loadStaff = loadStaff;
  window.loadSearchDropdown = loadSearchDropdown;
  window.toggleSection = toggleSection;
  window.toggleCat = toggleCat;
  window.quickAdjust = quickAdjust;
  window.openTxModal = openTxModal;
  window.submitTransaction = submitTransaction;
  window.showHistory = showHistory;

  // auto-init on DOM ready for pages including inventory elements (ensures admin/manage loads too)
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        const hasInventory = document.getElementById('inventoryContainer') || document.getElementById('inventoryStatus') || document.getElementById('lowStockBody');
        if (hasInventory) {
          if (typeof loadStaff === 'function') loadStaff();
          if (typeof loadInventory === 'function') loadInventory();
          if (typeof loadSearchDropdown === 'function') loadSearchDropdown();
          // ensure search input event is bound
          const si = document.getElementById('searchInput');
          if (si) {
            si.removeAttribute('oninput');
            si.addEventListener('input', onSearch);
          }
          // keyboard support for cat pills
          const pillContainer = document.getElementById('catPills');
          if (pillContainer) {
            pillContainer.addEventListener('keydown', e => {
              if (e.target && e.target.classList && e.target.classList.contains('cat-pill') && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                e.target.click();
              }
            });
          }
        }
      } catch (e) {}
    });
  }
})();
