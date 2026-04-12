/*
 manage-settings.js
 체크리스트/재고 편집 · 삭제 · 순서변경 관리 UI 스크립트
 Depends: global api(), showToast(), openItemEdit(), openCatEdit(), deleteCategory()
 Loads SortableJS from CDN when needed.
*/
(function(){
  function byId(id){ return document.getElementById(id); }
  function escapeHtml(s){ return s ? String(s).replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"').replace(/'/g,'&#039;') : ''; }
  function ajaxApi(path, opts){
    if (typeof api === 'function') return api(path, opts);
    opts = opts || {};
    const method = opts.method || 'GET';
    const body = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers = opts.body ? {'Content-Type':'application/json'} : {};
    return fetch(path, { method, headers, body }).then(r => r.json());
  }

  function loadSortable(cb){
    if (window.Sortable) return cb();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  /* --- Checklist management --- */
  async function loadChecklistMgmt(){
    const container = byId('checklistMgmtContainer');
    if(!container) return;
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <div style="flex:1;min-width:300px">
            <h3 style="margin:0 0 8px 0">주간 체크리스트</h3>
            <div style="display:flex;gap:8px;margin-bottom:8px">
              <input id="newChecklistDay" placeholder="새 항목명" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px">
              <button class="btn btn-primary btn-sm" id="addDayBtn">추가</button>
            </div>
            <ul id="checklistDay" class="mgmt-list" style="list-style:none;padding:0;margin:0;border:1px solid var(--border);border-radius:6px;min-height:40px"></ul>
          </div>
          <div style="flex:1;min-width:300px">
            <h3 style="margin:0 0 8px 0">야간 체크리스트</h3>
            <div style="display:flex;gap:8px;margin-bottom:8px">
              <input id="newChecklistNight" placeholder="새 항목명" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px">
              <button class="btn btn-primary btn-sm" id="addNightBtn">추가</button>
            </div>
            <ul id="checklistNight" class="mgmt-list" style="list-style:none;padding:0;margin:0;border:1px solid var(--border);border-radius:6px;min-height:40px"></ul>
          </div>
        </div>
      </div>
    `;

    byId('addDayBtn').addEventListener('click', async ()=>{
      const v = byId('newChecklistDay').value.trim(); if(!v) return;
      await ajaxApi('/api/checklist/item', { method:'POST', body:{ name:v, shift:'day' }});
      byId('newChecklistDay').value=''; showToast && showToast('추가됨'); await renderChecklistLists();
    });
    byId('addNightBtn').addEventListener('click', async ()=>{
      const v = byId('newChecklistNight').value.trim(); if(!v) return;
      await ajaxApi('/api/checklist/item', { method:'POST', body:{ name:v, shift:'night' }});
      byId('newChecklistNight').value=''; showToast && showToast('추가됨'); await renderChecklistLists();
    });


    await renderChecklistLists();
    loadSortable(setupChecklistSortables);

    // delegated move up/down handling for checklist lists
    container.addEventListener('click', async function(e){
      const up = e.target.closest('.move-up');
      const down = e.target.closest('.move-down');
      if(!up && !down) return;
      e.stopPropagation();
      const li = (up||down).closest('li'); if(!li) return;
      const ul = li.parentElement;
      if(up){
        const prev = li.previousElementSibling;
        if(prev) ul.insertBefore(li, prev);
      } else {
        const next = li.nextElementSibling;
        if(next) ul.insertBefore(next, li);
      }
      const shift = ul.id === 'checklistDay' ? 'day' : 'night';
      await reorderChecklistShift(shift);
      updateMoveButtonStates();
      showToast && showToast('순서 저장됨');
    });
  }

  async function renderChecklistLists(){
    const today = new Date().toISOString().split('T')[0];
    const day = await ajaxApi(`/api/checklist/day?date=${today}`) || [];
    const night = await ajaxApi(`/api/checklist/night?date=${today}`) || [];

    const render = (elId, items) => {
      const ul = byId(elId);
      if(!ul) return;
      ul.innerHTML = items.map(it => `
        <li data-id="${it.id}" style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--border);background:var(--bg);">
          <span class="drag-handle" style="cursor:grab;font-size:1.1rem">≡</span>
          <span class="move-btns" style="display:none;flex-direction:column;gap:4px;">
            <button class="btn btn-sm move-up" title="위로">▲</button>
            <button class="btn btn-sm move-down" title="아래로">▼</button>
          </span>
          <span class="item-name" style="flex:1">${escapeHtml(it.name)}</span>
          <input class="edit-input" type="text" style="display:none;flex:1;padding:6px;border:1px solid var(--border);border-radius:6px">
          <button class="btn btn-outline btn-sm edit-btn">수정</button>
          <button class="btn btn-sm delete-btn" style="background:var(--danger-light);color:var(--danger)">삭제</button>
        </li>
      `).join('');

      ul.querySelectorAll('.edit-btn').forEach(btn=>{
        btn.addEventListener('click', e=>{
          const li = e.target.closest('li');
          const nameEl = li.querySelector('.item-name');
          const input = li.querySelector('.edit-input');
          if(input.style.display === 'none'){
            input.value = nameEl.textContent.trim();
            nameEl.style.display = 'none';
            input.style.display = '';
            input.focus();
            return;
          }
          const newName = input.value.trim();
          if(!newName) return;
          const id = li.dataset.id;
          ajaxApi(`/api/checklist/item/${id}`, { method:'PUT', body:{ name:newName }}).then(()=> {
            nameEl.textContent = newName;
            nameEl.style.display=''; input.style.display='none'; showToast && showToast('수정됨');
          });
        });
      });
      ul.querySelectorAll('.edit-input').forEach(inp=>{
        inp.addEventListener('keydown', e=>{
          if(e.key==='Enter'){ inp.nextElementSibling.click(); }
          else if(e.key==='Escape'){ const li = inp.closest('li'); li.querySelector('.item-name').style.display=''; inp.style.display='none'; }
        });
      });
      ul.querySelectorAll('.delete-btn').forEach(btn=>{
        btn.addEventListener('click', async e=>{
          const li = e.target.closest('li'); const id = li.dataset.id; const name = li.querySelector('.item-name').textContent.trim();
          if(!confirm(`"${name}" 항목을 삭제하시겠습니까?`)) return;
          await ajaxApi(`/api/checklist/item/${id}`, { method:'DELETE' }); showToast && showToast('삭제됨'); await renderChecklistLists();
        });
      });
    };

    render('checklistDay', day);
    render('checklistNight', night);
    updateMoveButtonStates();
  }

  function setupChecklistSortables(){
    const dayEl = byId('checklistDay'); const nightEl = byId('checklistNight');
    if(!dayEl || !nightEl || !window.Sortable) return;
    const onEnd = async function(evt){
      const movedId = evt.item.dataset.id;
      if(evt.to !== evt.from){
        const newShift = (evt.to.id === 'checklistDay') ? 'day' : 'night';
        await ajaxApi(`/api/checklist/item/${movedId}`, { method:'PUT', body:{ shift:newShift }});
      }
      await reorderChecklistShift('day'); await reorderChecklistShift('night');
      updateMoveButtonStates();
    };
    new Sortable(dayEl, { group:'checklist', handle:'.drag-handle', animation:150, onEnd });
    new Sortable(nightEl, { group:'checklist', handle:'.drag-handle', animation:150, onEnd });
  }

  async function reorderChecklistShift(shift){
    const el = byId(shift==='day' ? 'checklistDay' : 'checklistNight'); if(!el) return;
    const order = Array.from(el.children).map(li => parseInt(li.dataset.id));
    await ajaxApi('/api/checklist/reorder', { method:'POST', body:{ shift, order }});
  }

  function setBtnDisabled(btn, disabled){
    if(!btn) return;
    if(disabled){ btn.setAttribute('disabled','disabled'); btn.classList.add('disabled'); } else { btn.removeAttribute('disabled'); btn.classList.remove('disabled'); }
  }
  function updateMoveButtonStates(){
    // checklist lists
    ['checklistDay','checklistNight'].forEach(id => {
      const ul = byId(id);
      if(!ul) return;
      const lis = Array.from(ul.children);
      lis.forEach((li, idx) => {
        const up = li.querySelector('.move-up');
        const down = li.querySelector('.move-down');
        setBtnDisabled(up, idx === 0);
        setBtnDisabled(down, idx === lis.length - 1);
      });
    });
    // inventory item lists
    Array.from(document.querySelectorAll('.item-list')).forEach(ul => {
      const lis = Array.from(ul.children);
      lis.forEach((li, idx) => {
        const up = li.querySelector('.move-up');
        const down = li.querySelector('.move-down');
        setBtnDisabled(up, idx === 0);
        setBtnDisabled(down, idx === lis.length - 1);
      });
    });
    // category cards
    const cards = Array.from(document.querySelectorAll('#inventoryCards .cat-card'));
    cards.forEach((card, idx) => {
      const up = card.querySelector('.cat-move-up');
      const down = card.querySelector('.cat-move-down');
      setBtnDisabled(up, idx === 0);
      setBtnDisabled(down, idx === cards.length - 1);
    });
  }
  function toggleChecklistReorderUI(enable){
    Array.from(document.querySelectorAll('#checklistDay li, #checklistNight li')).forEach(li=>{
      const dh = li.querySelector('.drag-handle');
      const mb = li.querySelector('.move-btns');
      if(dh) dh.style.display = enable ? 'none' : '';
      if(mb) mb.style.display = enable ? 'flex' : 'none';
    });
    updateMoveButtonStates();
  }

  /* --- Inventory management --- */
  async function loadInventoryMgmt(){
    const container = byId('inventoryMgmtContainer'); if(!container) return;
    const data = await ajaxApi('/api/inventory') || [];
    const html = data.map(cat => `
      <div class="cat-card" data-id="${cat.id}" style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;padding:10px;background:var(--bg)">
        <div class="cat-card-header" style="display:flex;align-items:center;gap:8px">
          <span class="cat-drag" style="cursor:grab">≡</span>
          <span class="cat-move-btns" style="display:none;flex-direction:column;gap:4px;margin-left:4px;">
            <button class="btn btn-sm cat-move-up" title="위로">▲</button>
            <button class="btn btn-sm cat-move-down" title="아래로">▼</button>
          </span>
          <strong class="cat-name" style="flex:1">${escapeHtml(cat.name)}</strong>
          <button class="btn btn-outline btn-sm cat-edit-btn">이름변경</button>
          <button class="btn btn-sm cat-del-btn" style="background:var(--danger-light);color:var(--danger)">삭제</button>
        </div>
        <div style="margin-top:8px;padding-left:24px">
          <div style="display:flex;gap:8px;margin-bottom:8px">
            <input class="new-item-input" placeholder="새 품목명" style="flex:1;padding:6px;border:1px solid var(--border);border-radius:6px">
            <button class="btn btn-primary btn-sm add-item-btn">추가</button>
          </div>
          <ul class="item-list" data-cat-id="${cat.id}" style="list-style:none;padding:0;margin:0;border-top:1px solid var(--border)">
            ${cat.items.map(it => `
              <li data-id="${it.id}" style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--border)">
                <span class="drag-handle" style="cursor:grab">≡</span>
                <span class="move-btns" style="display:none;flex-direction:column;gap:4px;">
                  <button class="btn btn-sm move-up" title="위로">▲</button>
                  <button class="btn btn-sm move-down" title="아래로">▼</button>
                </span>
                <span class="item-name" style="flex:1">${escapeHtml(it.name)}</span>
                <button class="btn btn-outline btn-sm edit-item-btn">수정</button>
                <button class="btn btn-sm del-item-btn" style="background:var(--danger-light);color:var(--danger)">삭제</button>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div id="inventoryCards">${html}</div>
    `;

    // handlers
    const root = byId('inventoryMgmtContainer');

    // restore collapsed state for categories
    root.querySelectorAll('.cat-card').forEach(card => {
      const id = card.dataset.id;
      if (localStorage.getItem('cat_collapsed_' + id) === '1') card.classList.add('collapsed');
    });

    root.querySelectorAll('.cat-edit-btn').forEach(btn=>{
      btn.addEventListener('click', e=>{
        const card = e.target.closest('.cat-card'); const id = card.dataset.id; const name = card.querySelector('.cat-name').textContent.trim();
        openCatEdit(id, name);
      });
    });
    root.querySelectorAll('.cat-del-btn').forEach(btn=>{
      btn.addEventListener('click', e=>{
        const card = e.target.closest('.cat-card'); const id = parseInt(card.dataset.id); const name = card.querySelector('.cat-name').textContent.trim();
        if(confirm(`"${name}" 카테고리를 삭제하시겠습니까?`)){
          deleteCategory(id, name).then(()=> loadInventoryMgmt());
        }
      });
    });
    root.querySelectorAll('.add-item-btn').forEach(btn=>{
      btn.addEventListener('click', async e=>{
        const card = e.target.closest('.cat-card'); const id = parseInt(card.dataset.id); const input = card.querySelector('.new-item-input'); const name = input.value.trim();
        if(!name) return;
        await ajaxApi('/api/inventory/item', { method:'POST', body:{ category_id: id, name }});
        input.value=''; showToast && showToast('추가됨'); await loadInventoryMgmt();
      });
    });
    root.querySelectorAll('.edit-item-btn').forEach(btn=>{
      btn.addEventListener('click', e=>{
        const li = e.target.closest('li'); const id = parseInt(li.dataset.id); openItemEdit(id);
      });
    });
    root.querySelectorAll('.del-item-btn').forEach(btn=>{
      btn.addEventListener('click', async e=>{
        const li = e.target.closest('li'); const id = parseInt(li.dataset.id); const name = li.querySelector('.item-name').textContent.trim();
        if(!confirm(`"${name}" 품목을 삭제하시겠습니까?`)) return;
        await ajaxApi(`/api/inventory/${id}`, { method:'DELETE' }); showToast && showToast('삭제됨'); await loadInventoryMgmt();
      });
    });


    // delegated move handling for categories/items and other delegated actions
    root.addEventListener('click', async function(e){
      // edit item delegation
      const editItemBtn = e.target.closest('.edit-item-btn');
      if (editItemBtn) {
        e.stopPropagation();
        const li = editItemBtn.closest('li');
        if (!li) return;
        const id = parseInt(li.dataset.id);
        if (typeof openItemEdit === 'function') openItemEdit(id);
        return;
      }
      // category header toggle (click header area to collapse)
      const clickedCard = e.target.closest('.cat-card');
      if (clickedCard) {
        const header = clickedCard.querySelector('.cat-card-header');
        if (header && header.contains(e.target) && !e.target.closest('.cat-edit-btn') && !e.target.closest('.cat-del-btn') && !e.target.closest('.cat-drag') && !e.target.closest('.cat-move-btns')) {
          e.stopPropagation();
          clickedCard.classList.toggle('collapsed');
          localStorage.setItem('cat_collapsed_' + clickedCard.dataset.id, clickedCard.classList.contains('collapsed') ? '1' : '0');
          return;
        }
      }
      const catUp = e.target.closest('.cat-move-up');
      const catDown = e.target.closest('.cat-move-down');
      const up = e.target.closest('.move-up');
      const down = e.target.closest('.move-down');
      if(catUp || catDown){
        e.stopPropagation();
        const card = (catUp||catDown).closest('.cat-card');
        const parent = card.parentElement; // inventoryCards
        if(catUp){
          const prev = card.previousElementSibling;
          if(prev) parent.insertBefore(card, prev);
        } else {
          const next = card.nextElementSibling;
          if(next) parent.insertBefore(next, card);
        }
        await persistCategoryOrder();
        updateMoveButtonStates();
        showToast && showToast('카테고리 순서 저장됨');
        return;
      }
      if(up || down){
        e.stopPropagation();
        const li = (up||down).closest('li'); if(!li) return;
        const ul = li.parentElement;
        if(up){
          const prev = li.previousElementSibling; if(prev) ul.insertBefore(li, prev);
        } else {
          const next = li.nextElementSibling; if(next) ul.insertBefore(next, li);
        }
        const catId = parseInt(ul.dataset.catId);
        await persistItemOrder(catId);
        updateMoveButtonStates();
        showToast && showToast('품목 순서 저장됨');
      }
    });

    loadSortable(()=>{
      // category reorder
      const cardsContainer = byId('inventoryCards');
      new Sortable(cardsContainer, { handle: '.cat-drag', animation:150, draggable:'.cat-card', onEnd: async ()=> {
        await persistCategoryOrder();
        showToast && showToast('카테고리 순서 저장됨');
      }});
      // items reorder per category
      root.querySelectorAll('.item-list').forEach(ul=>{
        const catId = parseInt(ul.dataset.catId);
        new Sortable(ul, { handle: '.drag-handle', animation:150, onEnd: async ()=> {
          await persistItemOrder(catId);
          showToast && showToast('품목 순서 저장됨');
        }});
      });
    });
    updateMoveButtonStates();
  }

  async function persistCategoryOrder(){
    const container = byId('inventoryCards');
    if(!container) return;
    const order = Array.from(container.querySelectorAll('.cat-card')).map(c=>parseInt(c.dataset.id));
    await ajaxApi('/api/inventory/categories/reorder', { method:'POST', body:{ order }});
  }

  async function persistItemOrder(catId){
    const ul = document.querySelector(`.item-list[data-cat-id="${catId}"]`);
    if(!ul) return;
    const order = Array.from(ul.children).map(li=>parseInt(li.dataset.id));
    await ajaxApi('/api/inventory/items/reorder', { method:'POST', body:{ category_id: catId, order }});
  }

  function toggleInventoryReorderUI(enable){
    Array.from(document.querySelectorAll('.cat-move-btns')).forEach(el => el.style.display = enable ? 'flex' : 'none');
    Array.from(document.querySelectorAll('.item-list .move-btns')).forEach(el => el.style.display = enable ? 'flex' : 'none');
    Array.from(document.querySelectorAll('.cat-drag, .item-list .drag-handle')).forEach(el => el.style.display = enable ? 'none' : '');
  }

  // ensure our UI reloads after global loaders/save functions run
  if(window.loadCategories){
    const orig = window.loadCategories;
    window.loadCategories = async function(){ await orig.apply(this, arguments); await loadInventoryMgmt(); };
  }
  if(window.loadAllItems){
    const orig2 = window.loadAllItems;
    window.loadAllItems = async function(){ await orig2.apply(this, arguments); await loadInventoryMgmt(); };
  }
  if(window.loadStaff){
    const orig3 = window.loadStaff;
    window.loadStaff = async function(){ await orig3.apply(this, arguments); /* nothing extra needed for staff */ };
  }

  document.addEventListener('DOMContentLoaded', function(){
    if(byId('checklistMgmtContainer')) loadChecklistMgmt();
    if(byId('inventoryMgmtContainer')) loadInventoryMgmt();
  });

  // fallback openItemEdit for pages that don't expose admin openItemEdit
  if (typeof window.openItemEdit !== 'function') {
    window.openItemEdit = async function(id){
      // create modal if missing
      if (!document.getElementById('ms_itemEditModal')) {
        const modal = document.createElement('div');
        modal.id = 'ms_itemEditModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="modal">
            <h2>품목 수정</h2>
            <input type="hidden" id="ms_itemEditId">
            <div class="form-group"><label>품목명</label><input type="text" id="ms_itemEditName"></div>
            <div class="form-group"><label>카테고리</label><select id="ms_itemEditCat" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px"></select></div>
            <div class="form-group"><label>최소 수량 (부족 알림 기준)</label><input type="number" id="ms_itemEditThreshold" min="0" value="2" inputmode="numeric"></div>
            <div class="modal-actions">
              <button class="btn btn-outline" id="ms_itemEditCancel">취소</button>
              <button class="btn btn-primary" id="ms_itemEditSave">저장</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        // handlers
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });
        modal.querySelector('#ms_itemEditCancel').addEventListener('click', () => modal.classList.remove('show'));
        modal.querySelector('#ms_itemEditSave').addEventListener('click', async () => {
          const mid = modal.querySelector('#ms_itemEditId').value;
          const name = modal.querySelector('#ms_itemEditName').value.trim();
          const catId = parseInt(modal.querySelector('#ms_itemEditCat').value);
          const threshold = parseInt(modal.querySelector('#ms_itemEditThreshold').value) || 0;
          if (!name) { showToast && showToast('이름을 입력하세요','error'); return; }
          try {
            await ajaxApi(`/api/inventory/${mid}`, { method:'PUT', body:{ name, category_id: catId, min_threshold: threshold }});
            modal.classList.remove('show');
            showToast && showToast('수정됨');
            await loadInventoryMgmt();
          } catch (err) {
            showToast && showToast('수정 실패','error');
          }
        });
      }
      const modalEl = document.getElementById('ms_itemEditModal');
      const idEl = modalEl.querySelector('#ms_itemEditId');
      idEl.value = id;
      // load categories
      const cats = await ajaxApi('/api/inventory/categories') || [];
      const catSelect = modalEl.querySelector('#ms_itemEditCat');
      catSelect.innerHTML = cats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
      // fetch item detail
      let item = null;
      try {
        item = await ajaxApi(`/api/inventory/item-detail/${id}`);
      } catch (err) {
        const all = await ajaxApi('/api/inventory/all-items') || [];
        item = all.find(a => a.id == id) || { name:'', category_id: (cats[0] && cats[0].id) || '', location:'', min_threshold:2 };
      }
      modalEl.querySelector('#ms_itemEditName').value = item.name || '';
      if (item.category_id) catSelect.value = item.category_id;
      else if (item.category) {
        const found = cats.find(c => c.name === item.category);
        if (found) catSelect.value = found.id;
      }
      modalEl.querySelector('#ms_itemEditThreshold').value = item.min_threshold ?? 2;
      modalEl.classList.add('show');
    };
  }

})();
