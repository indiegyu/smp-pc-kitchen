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
    };
    new Sortable(dayEl, { group:'checklist', handle:'.drag-handle', animation:150, onEnd });
    new Sortable(nightEl, { group:'checklist', handle:'.drag-handle', animation:150, onEnd });
  }

  async function reorderChecklistShift(shift){
    const el = byId(shift==='day' ? 'checklistDay' : 'checklistNight'); if(!el) return;
    const order = Array.from(el.children).map(li => parseInt(li.dataset.id));
    await ajaxApi('/api/checklist/reorder', { method:'POST', body:{ shift, order }});
  }

  /* --- Inventory management --- */
  async function loadInventoryMgmt(){
    const container = byId('inventoryMgmtContainer'); if(!container) return;
    const data = await ajaxApi('/api/inventory') || [];
    const html = data.map(cat => `
      <div class="cat-card" data-id="${cat.id}" style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;padding:10px;background:var(--bg)">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="cat-drag" style="cursor:grab">≡</span>
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
                <span class="item-name" style="flex:1">${escapeHtml(it.name)}</span>
                <button class="btn btn-outline btn-sm edit-item-btn">수정</button>
                <button class="btn btn-sm del-item-btn" style="background:var(--danger-light);color:var(--danger)">삭제</button>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    `).join('');
    container.innerHTML = html;

    // handlers
    container.querySelectorAll('.cat-edit-btn').forEach(btn=>{
      btn.addEventListener('click', e=>{
        const card = e.target.closest('.cat-card'); const id = card.dataset.id; const name = card.querySelector('.cat-name').textContent.trim();
        openCatEdit(id, name);
      });
    });
    container.querySelectorAll('.cat-del-btn').forEach(btn=>{
      btn.addEventListener('click', e=>{
        const card = e.target.closest('.cat-card'); const id = parseInt(card.dataset.id); const name = card.querySelector('.cat-name').textContent.trim();
        if(confirm(`"${name}" 카테고리를 삭제하시겠습니까?`)){
          deleteCategory(id, name).then(()=> loadInventoryMgmt());
        }
      });
    });
    container.querySelectorAll('.add-item-btn').forEach(btn=>{
      btn.addEventListener('click', async e=>{
        const card = e.target.closest('.cat-card'); const id = parseInt(card.dataset.id); const input = card.querySelector('.new-item-input'); const name = input.value.trim();
        if(!name) return;
        await ajaxApi('/api/inventory/item', { method:'POST', body:{ category_id: id, name }});
        input.value=''; showToast && showToast('추가됨'); await loadInventoryMgmt();
      });
    });
    container.querySelectorAll('.edit-item-btn').forEach(btn=>{
      btn.addEventListener('click', e=>{
        const li = e.target.closest('li'); const id = parseInt(li.dataset.id); openItemEdit(id);
      });
    });
    container.querySelectorAll('.del-item-btn').forEach(btn=>{
      btn.addEventListener('click', async e=>{
        const li = e.target.closest('li'); const id = parseInt(li.dataset.id); const name = li.querySelector('.item-name').textContent.trim();
        if(!confirm(`"${name}" 품목을 삭제하시겠습니까?`)) return;
        await ajaxApi(`/api/inventory/${id}`, { method:'DELETE' }); showToast && showToast('삭제됨'); await loadInventoryMgmt();
      });
    });

    loadSortable(()=>{
      // category reorder
      new Sortable(container, { handle: '.cat-drag', animation:150, draggable:'.cat-card', onEnd: async ()=> {
        const order = Array.from(container.querySelectorAll('.cat-card')).map(c=>parseInt(c.dataset.id));
        await ajaxApi('/api/inventory/categories/reorder', { method:'POST', body:{ order }});
        showToast && showToast('카테고리 순서 저장됨');
      }});
      // items reorder per category
      container.querySelectorAll('.item-list').forEach(ul=>{
        const catId = parseInt(ul.dataset.catId);
        new Sortable(ul, { handle: '.drag-handle', animation:150, onEnd: async ()=> {
          const order = Array.from(ul.children).map(li=>parseInt(li.dataset.id));
          await ajaxApi('/api/inventory/items/reorder', { method:'POST', body:{ category_id: catId, order }});
          showToast && showToast('품목 순서 저장됨');
        }});
      });
    });
  }

  // ensure our UI reloads after global loaders/save functions run
  if(window.loadCategories){
    const orig = window.loadCategories;
    window.loadCategories = async function(){ await orig.apply(this, arguments); await loadInventoryMgmt(); };
  }
  if(window.loadAllItems){
    const orig = window.loadAllItems;
    window.loadAllItems = async function(){ await orig.apply(this, arguments); await loadInventoryMgmt(); };
  }
  if(window.loadStaff){
    const orig = window.loadStaff;
    window.loadStaff = async function(){ await orig.apply(this, arguments); /* nothing extra needed for staff */ };
  }

  document.addEventListener('DOMContentLoaded', function(){
    if(byId('checklistMgmtContainer')) loadChecklistMgmt();
    if(byId('inventoryMgmtContainer')) loadInventoryMgmt();
  });

})();