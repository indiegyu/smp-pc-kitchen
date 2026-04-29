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
        <div style="display:flex;gap:8px;align-items:center">
          <input id="newPrioCatName" placeholder="새 체크리스트 항목 카테고리명" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px">
          <div style="display:flex;gap:8px;align-items:center;font-size:0.9rem;color:var(--text-secondary);margin-left:8px">
            <label style="display:flex;align-items:center;gap:4px;margin:0 6px 0 0"><input type="checkbox" id="defaultPrioDay" data-shift="day"> day</label>
            <label style="display:flex;align-items:center;gap:4px;margin:0 6px 0 0"><input type="checkbox" id="defaultPrioNight" data-shift="night"> night</label>
          </div>
          <button class="btn btn-primary btn-sm" id="addPrioCatBtn" style="margin-left:8px">추가</button>
        </div>
        <div id="prioCategoriesContainer" style="margin-top:8px"></div>
      </div>
    `;

    byId('addPrioCatBtn').addEventListener('click', async ()=>{
      const v = byId('newPrioCatName').value.trim(); if(!v) return;
      try {
        const defaultShift = localStorage.getItem('prio_cat_default_shift') || null;
        const res = await ajaxApi('/api/checklist/priority-categories', { method:'POST', body:{ name:v, default_shift: defaultShift }});
        if (res && res.id && defaultShift) {
          // persist per-category default shift for the newly-created category
          localStorage.setItem('prio_cat_shift_' + String(res.id), defaultShift);
        }
        byId('newPrioCatName').value=''; showToast && showToast('카테고리 추가됨'); await renderPrioCategories();
      } catch (err) {
        showToast && showToast('추가 실패','error');
      }
    });

    // initialize default selection UI for new priority categories
    (function(){
      const initDefaultUI = () => {
        const dDay = byId('defaultPrioDay');
        const dNight = byId('defaultPrioNight');
        if (!dDay || !dNight) return;
        const stored = localStorage.getItem('prio_cat_default_shift');
        dDay.checked = stored === 'day';
        dNight.checked = stored === 'night';
        dDay.addEventListener('change', function() {
          if (dDay.checked) { dNight.checked = false; localStorage.setItem('prio_cat_default_shift','day'); }
          else { const s = dNight.checked ? 'night' : null; if (s) localStorage.setItem('prio_cat_default_shift', s); else localStorage.removeItem('prio_cat_default_shift'); }
        });
        dNight.addEventListener('change', function() {
          if (dNight.checked) { dDay.checked = false; localStorage.setItem('prio_cat_default_shift','night'); }
          else { const s = dDay.checked ? 'day' : null; if (s) localStorage.setItem('prio_cat_default_shift', s); else localStorage.removeItem('prio_cat_default_shift'); }
        });
      };
      setTimeout(initDefaultUI, 0);
    })();

    async function renderPrioCategories(){
      const wrap = byId('prioCategoriesContainer');
      if(!wrap) return;
      wrap.innerHTML = '<div style="padding:8px;color:var(--text-secondary)">로딩 중...</div>';
      const today = client_get_reset_iso_date();
      const [catsRes, dayItems, nightItems, prMap] = await Promise.all([
        ajaxApi('/api/checklist/priority-categories'),
        ajaxApi(`/api/checklist/day?date=${today}`),
        ajaxApi(`/api/checklist/night?date=${today}`),
        ajaxApi('/api/checklist/priorities'),
      ]);
      let cats = catsRes || [];
      // 기본 레이블을 운영 페이지와 동일하게 폴백 (서버에 카테고리 파일이 없을 때 사용)
      const DEFAULT_PRIO_TITLES = {
        1: '우선순위 1 (Top Priority)',
        2: '우선순위 2 (주방 정리)',
        3: '우선순위 3 (업장 청소)',
        4: '우선순위 4 (재고 채우기)',
        5: '우선순위 5 (전문 작업)',
        'handoff': '오전 인수인계전 체크사항'
      };
      if (!cats || cats.length === 0) {
        cats = [1,2,3,4,5].map((id, idx) => ({ id: id, name: DEFAULT_PRIO_TITLES[id], sort_order: idx }));
      }
      const allItems = (dayItems || []).concat(nightItems || []);
      const catMap = {};
      (cats || []).forEach(c => { catMap[String(c.id)] = { meta: c, items: [] }; });
      const unassigned = { id: 'unassigned', meta: { id: 'unassigned', name: '미할당(자동)' }, items: [] };
      // include special handoff bucket if needed
      let hasHandoff = false;

      (allItems || []).forEach(it=>{
        const iid = String(it.id);
        let assigned = false;
        if (prMap && Object.prototype.hasOwnProperty.call(prMap, iid)) {
          const v = prMap[iid];
          if (v === 'handoff') {
            hasHandoff = true;
            if (!catMap['handoff']) catMap['handoff'] = { meta: { id: 'handoff', name: '인수인계' }, items: [] };
            catMap['handoff'].items.push(it);
            assigned = true;
          } else {
            const pi = parseInt(v, 10);
            if (!isNaN(pi) && catMap[String(pi)]) {
              catMap[String(pi)].items.push(it);
              assigned = true;
            }
          }
        }
        if (!assigned) unassigned.items.push(it);
      });

      // build ordered list: categories (by sort_order) then handoff (if exists) then unassigned
      const orderedCats = (cats || []).slice().sort((a,b)=> (a.sort_order||0)-(b.sort_order||0));
      const toRender = orderedCats.map(c => ({ id: String(c.id), meta: c, items: catMap[String(c.id)].items || [] }));
      if (catMap['handoff']) toRender.push({ id: 'handoff', meta: catMap['handoff'].meta, items: catMap['handoff'].items || [] });
      toRender.push({ id: 'unassigned', meta: unassigned.meta, items: unassigned.items || [] });

      // render HTML
      let html = '';
      toRender.forEach(catObj => {
        const cid = catObj.id;
        const meta = catObj.meta;
        const list = catObj.items || [];
        html += `<div class="cat-card prio-cat" data-id="${escapeHtml(String(cid))}" data-default-shift="${escapeHtml((meta && meta.default_shift) || '')}" style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;padding:10px;background:var(--bg)">
          <div class="cat-card-header" style="display:flex;align-items:center;gap:8px">
            <span class="cat-drag" style="cursor:grab">≡</span>
            <span class="cat-move-btns" style="display:none;flex-direction:column;gap:4px;margin-left:4px;">
              <button class="btn btn-sm cat-move-up" title="위로">▲</button>
              <button class="btn btn-sm cat-move-down" title="아래로">▼</button>
            </span>
            <strong class="cat-name" style="flex:1">${escapeHtml(meta.name)}</strong>
            ${cid !== 'unassigned' ? '<button class="btn btn-outline btn-sm cat-edit-btn">이름변경</button>' : ''}
            ${cid !== 'unassigned' ? '<button class="btn btn-sm cat-del-btn" style="background:var(--danger-light);color:var(--danger)">삭제</button>' : ''}
            <span class="toggle-arrow" aria-hidden="true">▾</span>
          </div>
          <div style="margin-top:8px;padding-left:24px">
            <div style="display:flex;gap:8px;margin-bottom:8px">
              <input class="new-prio-item-input" placeholder="새 항목명" style="flex:1;padding:6px;border:1px solid var(--border);border-radius:6px">
              <div style="display:flex;gap:6px">
                <button class="btn btn-primary btn-sm add-prio-item-btn">추가</button>
              </div>
            </div>
            <ul class="item-list" data-cat-id="${escapeHtml(String(cid))}" style="list-style:none;padding:0;margin:0;border-top:1px solid var(--border)">
              ${ list.length === 0 ? `<li class="empty" style="padding:8px;color:var(--text-secondary)">항목 없음</li>` :
                list.map(it => `<li data-id="${it.id}" style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--border)"><span class="drag-handle" style="cursor:grab">≡</span><span class="item-name" style="flex:1">${escapeHtml(it.name)}</span><button class="btn btn-outline btn-sm edit-item-btn">수정</button><button class="btn btn-sm del-item-btn" style="background:var(--danger-light);color:var(--danger)">삭제</button></li>`).join('') }
            </ul>
          </div>
        </div>`;
      });

      wrap.innerHTML = `<div id="prioCards">${html}</div>`;
      
      // insert per-category day/night checkboxes and wire mutual-exclusive persistence
      Array.from(wrap.querySelectorAll('.prio-cat')).forEach(card => {
        const id = card.dataset.id;
        if (!id || id === 'unassigned') return;
        const header = card.querySelector('.cat-card-header');
        if (!header) return;
        // avoid duplicate if already inserted
        if (header.querySelector('.prio-checkboxes')) return;
        const span = document.createElement('span');
        span.className = 'prio-checkboxes';
        span.style.display = 'flex';
        span.style.gap = '6px';
        span.style.alignItems = 'center';
        span.style.marginRight = '8px';
        const makeLabel = (shift, text) => {
          const lbl = document.createElement('label');
          lbl.style.display = 'flex';
          lbl.style.alignItems = 'center';
          lbl.style.gap = '4px';
          lbl.style.fontSize = '0.85rem';
          lbl.style.color = 'var(--text-secondary)';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'prio-cat-checkbox';
          cb.dataset.shift = shift;
          cb.dataset.catId = id;
          lbl.appendChild(cb);
          lbl.appendChild(document.createTextNode(' ' + text));
          return { lbl, cb };
        };
        const dayItem = makeLabel('day', 'day');
        const nightItem = makeLabel('night', 'night');
        span.appendChild(dayItem.lbl);
        span.appendChild(nightItem.lbl);
        const insertBeforeNode = header.querySelector('.cat-edit-btn') || header.querySelector('.toggle-arrow') || null;
        header.insertBefore(span, insertBeforeNode);

        // prefer server-provided default_shift, then stored state, then global default
        const stored = localStorage.getItem('prio_cat_shift_' + id);
        let effective = stored;
        const serverDefault = card && card.dataset && card.dataset.defaultShift ? card.dataset.defaultShift : null;
        if (!effective && serverDefault) effective = serverDefault;
        if (!effective) effective = localStorage.getItem('prio_cat_default_shift') || 'day';
        if (effective === 'day') { dayItem.cb.checked = true; nightItem.cb.checked = false; }
        else { dayItem.cb.checked = false; nightItem.cb.checked = true; }

        // helper to ensure at least one checked and disable single checked to prevent unchecking
        const syncDisabled = () => {
          const dChecked = dayItem.cb.checked;
          const nChecked = nightItem.cb.checked;
          // ensure at least one checked
          if (!dChecked && !nChecked) {
            // prefer global default if set
            const defaultShift = localStorage.getItem('prio_cat_default_shift');
            if (defaultShift === 'night') { nightItem.cb.checked = true; }
            else { dayItem.cb.checked = true; }
          }
          // recompute after potential adjustments
          const d = dayItem.cb.checked;
          const n = nightItem.cb.checked;
          if (d && !n) { dayItem.cb.disabled = true; nightItem.cb.disabled = false; }
          else if (!d && n) { dayItem.cb.disabled = false; nightItem.cb.disabled = true; }
          else { dayItem.cb.disabled = false; nightItem.cb.disabled = false; }
        };

        // handlers: mutual-exclusive + persist + disabled sync
        [dayItem.cb, nightItem.cb].forEach(cb => cb.addEventListener('change', function(e){
          const shift = e.target.dataset.shift;
          const other = header.querySelector('.prio-cat-checkbox[data-shift="' + (shift === 'day' ? 'night' : 'day') + '"]');
          if (e.target.checked) {
            if (other) other.checked = false;
          } else {
            // if user somehow unchecked leading to none, revert to checked (shouldn't happen because we disable single checked)
            const d = header.querySelector('.prio-cat-checkbox[data-shift="day"]').checked;
            const n = header.querySelector('.prio-cat-checkbox[data-shift="night"]').checked;
            if (!d && !n) {
              // prevent leaving none checked; re-check this one
              e.target.checked = true;
            }
          }
          syncDisabled();
          const newShift = dayItem.cb.checked ? 'day' : 'night';
          localStorage.setItem('prio_cat_shift_' + id, newShift);
          // persist to server
          ajaxApi('/api/checklist/priority-categories/' + id, { method:'PUT', body: { default_shift: newShift }})
            .catch(()=>{});
        }));

        // initial sync
        syncDisabled();
      });

      // delegated handlers similar to inventory
      const root = wrap;
      // restore collapsed state for prio categories — default collapsed, first open
      Array.from(root.querySelectorAll('.prio-cat')).forEach((card, idx) => {
        const id = card.dataset.id;
        const stored = localStorage.getItem('cat_collapsed_' + id);
        let isCollapsed;
        if (stored === '1') isCollapsed = true;
        else if (stored === '0') isCollapsed = false;
        else isCollapsed = true; // default: collapsed
        if (idx === 0) isCollapsed = false; // keep first card open by default
        if (isCollapsed) card.classList.add('collapsed'); else card.classList.remove('collapsed');
        const header = card.querySelector('.cat-card-header');
        if (header) {
          header.setAttribute('tabindex','0');
          header.setAttribute('role','button');
          header.setAttribute('aria-expanded', (!isCollapsed).toString());
        }
        const arrow = card.querySelector('.toggle-arrow');
        if (arrow) {
          arrow.setAttribute('aria-hidden','true');
          arrow.classList.toggle('collapsed', isCollapsed);
        }
      });
      root.querySelectorAll('.cat-edit-btn').forEach(btn=>{
        btn.addEventListener('click', async e=>{
          const card = e.target.closest('.prio-cat');
          const id = card.dataset.id;
          const old = card.querySelector('.cat-name').textContent.trim();
          const name = prompt('카테고리명 수정', old);
          if (!name || !name.trim()) return;
          await ajaxApi(`/api/checklist/priority-categories/${id}`, { method:'PUT', body: { name: name.trim() }});
          showToast && showToast('수정됨');
          await renderPrioCategories();

    // ensure delegated handlers are installed on initial load
    const prioRoot = byId('prioCategoriesContainer');
    if (prioRoot && !prioRoot._prioHandlerInstalled) {
      prioRoot.addEventListener('click', function(e) {
        const header = e.target.closest('.cat-card-header');
        if (!header) return;
        // ignore clicks on interactive controls inside the header
        if (e.target.closest('.cat-edit-btn') || e.target.closest('.cat-del-btn') ||
            e.target.closest('.cat-drag') || e.target.closest('.cat-move-btns') ||
            e.target.closest('.prio-checkboxes') || e.target.closest('.prio-cat-checkbox')) return;
        e.stopPropagation();
        const clickedCard = header.closest('.prio-cat') || header.closest('.cat-card');
        if (!clickedCard) return;
        clickedCard.classList.toggle('collapsed');
        const collapsed = clickedCard.classList.contains('collapsed');
        header.setAttribute('aria-expanded', (!collapsed).toString());
        const arrow = clickedCard.querySelector('.toggle-arrow');
        if (arrow) arrow.classList.toggle('collapsed', collapsed);
        try { localStorage.setItem('cat_collapsed_' + clickedCard.dataset.id, collapsed ? '1' : '0'); } catch (e) {}
      });
      prioRoot.addEventListener('keydown', function(e) {
        if (!(e.key === 'Enter' || e.key === ' ')) return;
        const header = e.target.closest('.cat-card-header');
        if (!header) return;
        e.preventDefault();
        const clickedCard = header.closest('.prio-cat') || header.closest('.cat-card');
        if (!clickedCard) return;
        clickedCard.classList.toggle('collapsed');
        const collapsed = clickedCard.classList.contains('collapsed');
        header.setAttribute('aria-expanded', (!collapsed).toString());
        const arrow = clickedCard.querySelector('.toggle-arrow');
        if (arrow) arrow.classList.toggle('collapsed', collapsed);
        try { localStorage.setItem('cat_collapsed_' + clickedCard.dataset.id, collapsed ? '1' : '0'); } catch (e) {}
      });
      prioRoot._prioHandlerInstalled = true;
    }
        });
      });
      root.querySelectorAll('.cat-del-btn').forEach(btn=>{
        btn.addEventListener('click', async e=>{
          const card = e.target.closest('.prio-cat');
          const id = card.dataset.id;
          const nm = card.querySelector('.cat-name').textContent.trim();
          if (!confirm(`"${nm}" 카테고리를 삭제하시겠습니까? 해당 카테고리에 지정된 우선순위는 제거됩니다.`)) return;
          await ajaxApi(`/api/checklist/priority-categories/${id}`, { method:'DELETE' });
          showToast && showToast('삭제됨');
          await renderPrioCategories();
        });
      });
      root.querySelectorAll('.edit-item-btn').forEach(btn=>{
        btn.addEventListener('click', e=>{
          const li = e.target.closest('li'); const id = parseInt(li.dataset.id);
          if (typeof openChecklistItemEdit === 'function') openChecklistItemEdit(id);
          else if (typeof openItemEdit === 'function') openItemEdit(id);
        });
      });
      root.querySelectorAll('.del-item-btn').forEach(btn=>{
        btn.addEventListener('click', async e=>{
          const li = e.target.closest('li'); const id = li.dataset.id; const name = li.querySelector('.item-name').textContent.trim();
          if(!confirm(`"${name}" 항목을 삭제하시겠습니까?`)) return;
          await ajaxApi(`/api/checklist/item/${id}`, { method:'DELETE' });
          showToast && showToast('삭제됨');
          await renderPrioCategories();
        });
      });

      // add new checklist item into this priority category (uses category default shift)
      root.querySelectorAll('.add-prio-item-btn').forEach(btn=>{
        btn.addEventListener('click', async e=>{
          const card = e.target.closest('.prio-cat');
          if (!card) return;
          const cid = card.dataset.id;
          const input = card.querySelector('.new-prio-item-input');
          const name = input ? input.value.trim() : '';
          if (!name) return;
          setBtnDisabled(btn, true);
          try {
            const serverDefault = card.dataset && card.dataset.defaultShift ? card.dataset.defaultShift : null;
            const localSaved = localStorage.getItem('prio_cat_shift_' + cid);
            const globalDefault = localStorage.getItem('prio_cat_default_shift') || 'day';
            const effectiveShift = (serverDefault === 'day' || serverDefault === 'night') ? serverDefault : (localSaved || globalDefault || 'day');
            const res = await ajaxApi('/api/checklist/item', { method:'POST', body:{ name: name, shift: effectiveShift }});
            const newId = res && res.id;
            if (newId && cid && cid !== 'unassigned') {
              const payload = { id: newId, priority: cid === 'handoff' ? 'handoff' : parseInt(cid,10) };
              await ajaxApi('/api/checklist/priorities', { method:'POST', body: payload });
            }
            if (input) input.value = '';
            showToast && showToast('추가됨');
            await renderPrioCategories();
          } catch (err) {
            showToast && showToast('추가 실패','error');
          } finally {
            setBtnDisabled(btn, false);
          }
        });
      });

      // make categories reorderable and items draggable between categories
      // destroy existing prio Sortables (if any) before re-init
      if (window.prioCatsSortable && typeof window.prioCatsSortable.destroy === 'function') {
        try { window.prioCatsSortable.destroy(); console.debug && console.debug('Destroyed previous prioCatsSortable'); } catch (e) { console.error(e); }
        window.prioCatsSortable = null;
      }
      if (window.prioItemSortables && Array.isArray(window.prioItemSortables)) {
        window.prioItemSortables.forEach(s => { try { s && s.destroy && s.destroy(); } catch (e) {} });
      }
      window.prioItemSortables = [];

      loadSortable(()=>{
        const cardsContainer = byId('prioCards');
        if(cardsContainer){
          window.prioCatsSortable = new Sortable(cardsContainer, {
            handle: '.cat-drag',
            animation: 150,
            draggable: '.prio-cat',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: async (evt) => {
              // persist category order (exclude unassigned)
              const order = Array.from(cardsContainer.querySelectorAll('.prio-cat')).map(c => c.dataset.id).filter(id => id !== 'unassigned');
              try {
                await ajaxApi('/api/checklist/priority-categories/reorder', { method:'POST', body:{ order }});
                showToast && showToast('카테고리 순서 저장됨');
              } catch (err) {
                showToast && showToast('카테고리 순서 저장 실패','error');
              }
              await renderPrioCategories();

            }
          });
          console.debug && console.debug('init prioCatsSortable', cardsContainer, cardsContainer.querySelectorAll('.cat-drag'));
        } else {
          console.debug && console.debug('prioCards not found during Sortable init');
        }
        root.querySelectorAll('.item-list').forEach(ul=>{
          const s = new Sortable(ul, {
            group: 'prio',
            handle: '.drag-handle',
            animation: 150,
            onEnd: async function(evt){
              const itemId = evt.item.dataset.id;
              const toUl = evt.to;
              const toCat = toUl.dataset.catId;
              try {
                if (toCat === 'unassigned') {
                  await ajaxApi('/api/checklist/priorities', { method:'POST', body:{ id: itemId, priority: 'auto' }});
                } else if (toCat === 'handoff') {
                  await ajaxApi('/api/checklist/priorities', { method:'POST', body:{ id: itemId, priority: 'handoff' }});
                } else {
                  await ajaxApi('/api/checklist/priorities', { method:'POST', body:{ id: itemId, priority: parseInt(toCat,10) }});
                }
                showToast && showToast('우선순위 저장됨');
                await renderPrioCategories();
              } catch (err) {
                showToast && showToast('저장 실패','error');
                await renderPrioCategories();
              }
            }
          });
          window.prioItemSortables.push(s);
          console.debug && console.debug('init prioItemSortable', ul, s);
        });
      });
    }

    await renderPrioCategories();
  }

    async function renderChecklistLists(){
      const today = client_get_reset_iso_date();
      const day = await ajaxApi(`/api/checklist/day?date=${today}`) || [];
      const night = await ajaxApi(`/api/checklist/night?date=${today}`) || [];
    const prMap = await ajaxApi('/api/checklist/priorities') || {};

    function prOptions(selected){
      const opts = [
        {v:'auto', t:'자동(휴리스틱)'},
        {v:'1', t:'1 - Top'},
        {v:'2', t:'2 - 주방 정리'},
        {v:'3', t:'3 - 업장 청소'},
        {v:'4', t:'4 - 재고 채우기'},
        {v:'5', t:'5 - 전문 작업'},
        {v:'handoff', t:'인수인계'}
      ];
      return opts.map(o => `<option value="${o.v}" ${o.v === selected ? 'selected' : ''}>${o.t}</option>`).join('');
    }

    const render = (elId, items) => {
      const ul = byId(elId);
      if(!ul) return;
      ul.innerHTML = items.map(it => {
        const cur = (prMap && prMap[String(it.id)] !== undefined) ? String(prMap[String(it.id)]) : 'auto';
        return `
        <li data-id="${it.id}" style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--border);background:var(--bg);">
          <span class="drag-handle" style="cursor:grab;font-size:1.1rem">≡</span>
          <span class="move-btns" style="display:none;flex-direction:column;gap:4px;">
            <button class="btn btn-sm move-up" title="위로">▲</button>
            <button class="btn btn-sm move-down" title="아래로">▼</button>
          </span>
          <select class="prio-select" style="width:120px;margin-right:8px">${prOptions(cur)}</select>
          <span class="item-name" style="flex:1">${escapeHtml(it.name)}</span>
          <input class="edit-input" type="text" style="display:none;flex:1;padding:6px;border:1px solid var(--border);border-radius:6px">
          <button class="btn btn-outline btn-sm edit-btn">수정</button>
          <button class="btn btn-sm delete-btn" style="background:var(--danger-light);color:var(--danger)">삭제</button>
        </li>
      `;
      }).join('');

      // priority change handlers
      ul.querySelectorAll('.prio-select').forEach(sel=>{
        sel.addEventListener('change', async e=>{
          const li = sel.closest('li');
          if(!li) return;
          const id = li.dataset.id;
          const val = sel.value;
          let payload;
          if (val === 'auto') payload = { id: id, priority: 'auto' };
          else if (val === 'handoff') payload = { id: id, priority: 'handoff' };
          else payload = { id: id, priority: parseInt(val, 10) };
          try {
            await ajaxApi('/api/checklist/priorities', { method:'POST', body: payload });
            showToast && showToast('우선순위 저장됨');
            await renderChecklistLists();
          } catch (err) {
            showToast && showToast('저장 실패','error');
          }
        });
      });

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
    // ensure Sortable is loaded then initialize checklist shift sortables
    loadSortable(() => {
      try {
        setupChecklistSortables();
        console.debug && console.debug('setupChecklistSortables invoked from renderChecklistLists');
      } catch (e) {
        console.error(e);
      }
    });
  }

  function setupChecklistSortables(){
    const dayEl = byId('checklistDay'); const nightEl = byId('checklistNight');
    if(!dayEl || !nightEl || !window.Sortable) return;
    // destroy previous shift sortables if present
    if (window.checklistShiftSortables) {
      try { window.checklistShiftSortables.day && window.checklistShiftSortables.day.destroy && window.checklistShiftSortables.day.destroy(); } catch (e) {}
      try { window.checklistShiftSortables.night && window.checklistShiftSortables.night.destroy && window.checklistShiftSortables.night.destroy(); } catch (e) {}
    }
    window.checklistShiftSortables = {};
    const onEnd = async function(evt){
      const movedId = evt.item.dataset.id;
      if(evt.to !== evt.from){
        const newShift = (evt.to.id === 'checklistDay') ? 'day' : 'night';
        await ajaxApi(`/api/checklist/item/${movedId}`, { method:'PUT', body:{ shift:newShift }});
      }
      await reorderChecklistShift('day'); await reorderChecklistShift('night');
      updateMoveButtonStates();
    };
    window.checklistShiftSortables.day = new Sortable(dayEl, { group:'checklist', handle:'.drag-handle', animation:150, onEnd });
    window.checklistShiftSortables.night = new Sortable(nightEl, { group:'checklist', handle:'.drag-handle', animation:150, onEnd });
    console.debug && console.debug('setupChecklistSortables initialized', dayEl, nightEl);
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
          <span class="toggle-arrow" aria-hidden="true">▾</span>
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

    // restore collapsed state for categories — default collapsed, first open
    Array.from(root.querySelectorAll('.cat-card')).forEach((card, idx) => {
      const id = card.dataset.id;
      const stored = localStorage.getItem('cat_collapsed_' + id);
      let isCollapsed;
      if (stored === '1') isCollapsed = true;
      else if (stored === '0') isCollapsed = false;
      else isCollapsed = true; // default: collapsed
      if (idx === 0) isCollapsed = false; // keep first card open by default
      if (isCollapsed) card.classList.add('collapsed'); else card.classList.remove('collapsed');
      const header = card.querySelector('.cat-card-header');
      if (header) {
        header.setAttribute('tabindex', '0');
        header.setAttribute('role', 'button');
        header.setAttribute('aria-expanded', (!isCollapsed).toString());
      }
      const arrow = card.querySelector('.toggle-arrow');
      if (arrow) {
        arrow.setAttribute('aria-hidden', 'true');
        arrow.classList.toggle('collapsed', isCollapsed);
      }
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
          const card = e.target.closest('.cat-card');
          const input = card ? card.querySelector('.new-item-input') : null;
          const name = input ? input.value.trim() : '';
          if(!name) return;
          // robust category id resolution
          let id = NaN;
          if (card) {
            id = parseInt(card.dataset.id);
            if (isNaN(id)) {
              const ul = card.querySelector('.item-list');
              if (ul && ul.dataset && ul.dataset.catId) id = parseInt(ul.dataset.catId);
            }
          }
          // fallback: lookup by category name from server
          if (isNaN(id) || !id) {
            try {
              const cats = await ajaxApi('/api/inventory/categories') || [];
              const catName = card ? (card.querySelector('.cat-name') && card.querySelector('.cat-name').textContent.trim()) : null;
              const found = cats.find(c => c.name === catName);
              if (found) id = found.id;
            } catch (err) { /* ignore */ }
          }
          if (isNaN(id) || !id) {
            showToast && showToast('카테고리를 찾을 수 없습니다','error'); return;
          }
          setBtnDisabled(btn, true);
          try {
            await ajaxApi('/api/inventory/item', { method:'POST', body:{ category_id: id, name }});
            if (input) input.value='';
            showToast && showToast('추가됨');
            await loadInventoryMgmt();
            // 재렌더링 후 같은 카테고리의 input에 포커스 복원
            const newInput = root.querySelector(`.cat-card[data-id="${id}"] .new-item-input`);
            if (newInput) newInput.focus();
          } catch (err) {
            showToast && showToast('추가 실패','error');
          } finally {
            setBtnDisabled(btn, false);
          }
        });
      });
      // allow pressing Enter in new-item-input to trigger add
      root.querySelectorAll('.new-item-input').forEach(inp=>{
        inp.addEventListener('keydown', function(e){
          if (e.key === 'Enter') {
            const card = inp.closest('.cat-card');
            const btn = card && card.querySelector('.add-item-btn');
            if (btn) btn.click();
          }
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
          const collapsed = clickedCard.classList.contains('collapsed');
          if (header) header.setAttribute('aria-expanded', (!collapsed).toString());
          const arrow = clickedCard.querySelector('.toggle-arrow');
          if (arrow) arrow.setAttribute('aria-hidden', 'true');
          localStorage.setItem('cat_collapsed_' + clickedCard.dataset.id, collapsed ? '1' : '0');
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
    
    // keyboard toggle for category header
    root.addEventListener('keydown', function(e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.classList && e.target.classList.contains('cat-card-header')) {
        e.preventDefault();
        const clickedCard = e.target.closest('.cat-card');
        if (!clickedCard) return;
        clickedCard.classList.toggle('collapsed');
        const header = clickedCard.querySelector('.cat-card-header');
        const collapsed = clickedCard.classList.contains('collapsed');
        if (header) header.setAttribute('aria-expanded', (!collapsed).toString());
        localStorage.setItem('cat_collapsed_' + clickedCard.dataset.id, collapsed ? '1' : '0');
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

  // fallback openChecklistItemEdit for editing checklist items
  if (typeof window.openChecklistItemEdit !== 'function') {
    window.openChecklistItemEdit = async function(id){
      // create modal if missing
      if (!document.getElementById('ms_checklistItemEditModal')) {
        const modal = document.createElement('div');
        modal.id = 'ms_checklistItemEditModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="modal">
            <h2>체크리스트 항목 수정</h2>
            <input type="hidden" id="ms_checklistItemEditId">
            <div class="form-group"><label>항목명</label><input type="text" id="ms_checklistItemEditName"></div>
            <div class="form-group"><label>쉬프트</label>
              <select id="ms_checklistItemEditShift" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px">
                <option value="day">day</option><option value="night">night</option>
              </select>
            </div>
            <div class="modal-actions">
              <button class="btn btn-outline" id="ms_checklistItemEditCancel">취소</button>
              <button class="btn btn-primary" id="ms_checklistItemEditSave">저장</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        // handlers
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });
        modal.querySelector('#ms_checklistItemEditCancel').addEventListener('click', () => modal.classList.remove('show'));
        modal.querySelector('#ms_checklistItemEditSave').addEventListener('click', async () => {
          const mid = modal.querySelector('#ms_checklistItemEditId').value;
          const name = modal.querySelector('#ms_checklistItemEditName').value.trim();
          const shift = modal.querySelector('#ms_checklistItemEditShift').value;
          if (!name) { showToast && showToast('이름을 입력하세요','error'); return; }
          try {
            await ajaxApi(`/api/checklist/item/${mid}`, { method:'PUT', body:{ name, shift }});
            modal.classList.remove('show');
            showToast && showToast('수정됨');
            if (typeof loadChecklistMgmt === 'function') loadChecklistMgmt();
            if (typeof renderChecklistLists === 'function') renderChecklistLists();
          } catch (err) {
            showToast && showToast('수정 실패','error');
          }
        });
      }
      const modalEl = document.getElementById('ms_checklistItemEditModal');
      modalEl.querySelector('#ms_checklistItemEditId').value = id;
      // attempt to find item name and shift by querying both shifts
      const today = client_get_reset_iso_date();
      let found = null;
      try {
        const day = await ajaxApi(`/api/checklist/day?date=${today}`) || [];
        const night = await ajaxApi(`/api/checklist/night?date=${today}`) || [];
        for (const it of day) { if (String(it.id) === String(id)) { found = { name: it.name, shift: 'day' }; break; } }
        if (!found) {
          for (const it of night) { if (String(it.id) === String(id)) { found = { name: it.name, shift: 'night' }; break; } }
        }
      } catch (err) { /* ignore */ }
      modalEl.querySelector('#ms_checklistItemEditName').value = (found && found.name) ? found.name : '';
      modalEl.querySelector('#ms_checklistItemEditShift').value = (found && found.shift) ? found.shift : 'day';
      modalEl.classList.add('show');
    };
  }

})();
