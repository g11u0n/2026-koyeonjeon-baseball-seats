const $ = (selector) => document.querySelector(selector);
const svgNS = 'http://www.w3.org/2000/svg';
const MAP_SIZE = 900;
const alumniBlocks = new Set(['412', '413', '414', '415']);
const baseView = () => ({ x: 0, y: 0, w: MAP_SIZE, h: MAP_SIZE });
const state = { units: {}, blocks: {}, seats: {}, geometry: null, gates: null, unit: null, block: null, gate: null, view: baseView(), dragged: false };

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const fmt = (number) => Number(number).toLocaleString('ko-KR');
const rangeText = (ranges) => ranges.map(({ seatFrom, seatTo }) => seatFrom === seatTo ? `${seatFrom}` : `${seatFrom}–${seatTo}`).join(', ');
const paramUrl = (key, value) => { const url = new URL(location.href); url.search = ''; if (value) url.searchParams.set(key, value); history.replaceState(null, '', url); };
const makeSvg = (tag, attrs = {}) => { const node = document.createElementNS(svgNS, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); return node; };
function isKuBlock(id) { return Boolean(state.blocks[id]) || alumniBlocks.has(id); }
function gateById(id) { return state.gates.gates.find((gate) => gate.id === id); }
function gateForUnitBlock(name, block) {
  const override = state.gates.gateByUnitBlock[name]?.[block];
  if (override) return override;
  return state.gates.gates.find((gate) => gate.units.some((unit) => (state.gates.unitAliases[unit] || unit) === name))?.id;
}
function gatesForBlock(id) {
  if (alumniBlocks.has(id)) return [gateById('1-3')];
  const assigned = new Set((state.blocks[id]?.units || []).map((unit) => gateForUnitBlock(unit.name, id)));
  return state.gates.gates.filter((gate) => assigned.has(gate.id));
}
function gateBadges(id) { return `<span class="gate-badges">${gatesForBlock(id).map((gate) => `<span class="gate-badge">${escapeHtml(gate.label)}</span>`).join('')}</span>`; }
function gateUnitBlocks(gateId, displayName) {
  if (displayName === '교우회석') return [...alumniBlocks];
  const name = state.gates.unitAliases[displayName] || displayName;
  return (state.units[name]?.assignments || []).filter((item) => gateForUnitBlock(name, item.block) === gateId).map((item) => item.block);
}
function addGateLabel(root, id, x, y, rotation) {
  const label = `${id} Gate`;
  const gate = makeSvg('g', { class: 'map-gate', transform: `translate(${x} ${y}) rotate(${rotation})`, 'data-gate': id, tabindex: '0', role: 'button', 'aria-label': `${gateById(id).label} 입장 단위 보기` });
  gate.append(makeSvg('rect', { x: -65, y: -23, width: 130, height: 46, class: 'map-gate-hit' }));
  gate.append(makeSvg('rect', { x: -60, y: -18, width: 120, height: 36, rx: 3, class: 'map-gate-badge' }));
  const text = makeSvg('text', { x: 0, y: 1, class: 'map-gate-label' }); text.textContent = label; gate.append(text);
  const open = () => { if (!state.dragged) showGate(id); };
  gate.addEventListener('click', open);
  gate.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showGate(id); } });
  root.append(gate);
}
function renderMap() {
  const root = $('#seat-map'); root.replaceChildren();
  const art = makeSvg('g', { transform: 'translate(43.25 77.75) scale(.5)', fill: 'none' });
  for (const item of state.geometry.paths) {
    const attrs = { d: item.d };
    for (const key of ['fill', 'stroke', 'stroke-width', 'stroke-miterlimit']) if (item[key]) attrs[key] = item[key];
    if (!item.block) {
      if (['#EBE3AA', '#BCBC87'].includes(attrs.fill)) {
        attrs.fill = '#d5d7dc';
        attrs.stroke = '#fff';
        attrs['stroke-width'] = 2.5;
      }
      art.append(makeSvg('path', attrs)); continue;
    }
    const id = item.block, ku = isKuBlock(id), alumni = alumniBlocks.has(id), data = state.blocks[id];
    attrs.class = `map-block ${ku ? 'ku' : 'neutral'}${alumni ? ' alumni' : ''}`;
    attrs['data-block'] = id;
    if (ku) Object.assign(attrs, { tabindex: '0', role: 'button', 'aria-label': alumni ? `${id}구역 교우회석` : `${id}구역, ${data.availableSeats}석` });
    const path = makeSvg('path', attrs), title = makeSvg('title');
    title.textContent = alumni ? `${id}구역 · 교우회석` : data ? `${id}구역 · ${data.availableSeats}석` : `${id}구역`;
    path.append(title);
    if (ku) {
      path.addEventListener('click', () => selectBlock(id, true));
      path.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectBlock(id, true); } });
    }
    art.append(path);
  }
  for (const item of state.geometry.paths) {
    if (!item.block) continue;
    const ku = isKuBlock(item.block);
    const label = makeSvg('text', { x: item.label[0], y: item.label[1], class: `map-label ${ku ? 'ku' : 'neutral'}`, 'data-label': item.block });
    label.textContent = item.block; art.append(label);
  }
  art.append(makeSvg('rect', { x: 779, y: -34, width: 134, height: 38, rx: 5, class: 'scoreboard' }));
  const boardLabel = makeSvg('text', { x: 846, y: -9, class: 'scoreboard-label', 'text-anchor': 'middle' });
  boardLabel.textContent = '전광판'; art.append(boardLabel);
  addGateLabel(art, '1-3', 380, 145, -40);
  addGateLabel(art, '2-1', 145, 855, 75);
  addGateLabel(art, '2-2', 365, 1240, 40);
  root.append(art);
  updateMapState();
}

function updateMapState() {
  const selected = state.unit ? new Set(state.units[state.unit]?.assignments.map((item) => item.block) || []) : null;
  document.querySelectorAll('.map-block').forEach((node) => { const id = node.dataset.block; node.classList.toggle('dim', Boolean(selected) && !selected.has(id)); node.classList.toggle('highlight', Boolean(selected) && selected.has(id)); node.classList.toggle('active', state.block === id); });
  document.querySelectorAll('.map-label').forEach((node) => { const id = node.dataset.label; node.classList.toggle('dim', Boolean(selected) && !selected.has(id)); node.classList.toggle('highlight', Boolean(selected) && selected.has(id)); node.classList.toggle('active', state.block === id); });
  document.querySelectorAll('.map-gate, .gate-shortcut').forEach((node) => node.classList.toggle('active', node.dataset.gate === state.gate));
  document.querySelectorAll('.block-list button').forEach((node) => node.classList.toggle('active', node.dataset.block === state.block));
  $('#map-status').textContent = state.unit ? `${selected.size}개 배정 구역` : '고려대학교 48개 구역';
  $('#map-hint').textContent = state.block ? `${state.block}구역 선택됨` : '빨간색 구역을 선택하세요';
}
function renderGateShortcuts() {
  const shortcuts = $('#gate-shortcuts'); shortcuts.replaceChildren();
  for (const gate of state.gates.gates) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'gate-shortcut';
    button.dataset.gate = gate.id; button.textContent = gate.label; button.onclick = () => showGate(gate.id);
    shortcuts.append(button);
  }
}
function showGate(id) {
  const gate = gateById(id), panel = $('#gate-panel');
  state.gate = id;
  panel.hidden = false;
  panel.innerHTML = `<div class="gate-panel-heading"><div><span>입장 게이트별 단위</span><h3>${escapeHtml(gate.label)}</h3></div><button type="button" class="gate-panel-close" aria-label="게이트 안내 닫기">×</button></div><ul class="gate-unit-list">${gate.units.map((name) => {
    const blocks = gateUnitBlocks(id, name);
    return `<li><button type="button" data-gate-unit="${escapeHtml(name)}"><strong>${escapeHtml(name)}</strong><small>${blocks.length === 1 ? `${blocks[0]}구역` : `${blocks.length}개 구역`}</small></button></li>`;
  }).join('')}</ul>`;
  panel.querySelector('.gate-panel-close').onclick = () => { state.gate = null; panel.hidden = true; updateMapState(); };
  panel.querySelectorAll('[data-gate-unit]').forEach((button) => {
    button.onclick = () => {
      const name = button.dataset.gateUnit, blocks = gateUnitBlocks(id, name);
      if (name === '교우회석') selectBlock(blocks[0], true);
      else selectUnit(state.gates.unitAliases[name] || name, true, blocks[0]);
    };
  });
  updateMapState(); panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderBlockButtons() {
  const list = $('#block-list'); list.replaceChildren();
  for (const id of [...Object.keys(state.blocks), ...alumniBlocks].sort((a, b) => Number(a) - Number(b))) { const button = document.createElement('button'); button.type = 'button'; button.dataset.block = id; button.textContent = id; button.setAttribute('aria-label', `${id}구역 선택`); button.onclick = () => selectBlock(id, true); list.append(button); }
}
function selectUnit(name, updateUrl = true, preferredBlock = null) {
  if (!state.units[name]) return; state.unit = name; state.block = null;
  $('#unit-search').value = name; $('#search-results').hidden = true; $('#unit-search').setAttribute('aria-expanded', 'false');
  const unit = state.units[name];
  updateMapState();
  if (updateUrl) paramUrl('unit', name);
  const firstBlock = preferredBlock || unit.assignments[0]?.block;
  if (firstBlock) selectBlock(firstBlock, false);
  else { $('#block-detail').className = 'detail-placeholder'; $('#block-detail').textContent = '상세 좌석 시트에 배정된 좌석이 없습니다.'; }
}
function bindCopyLink(id) {
  $('#copy-link').onclick = async () => { const url = new URL(location.href); url.search = ''; url.searchParams.set('block', id); try { await navigator.clipboard.writeText(url.href); $('#copy-link').textContent = '복사됨'; } catch { prompt('구역 링크', url.href); } };
}
function renderAlumniBlock(id, updateUrl) {
  state.block = id; const container = $('#block-detail'); container.className = 'detail-card';
  container.innerHTML = `<div class="detail-title"><div class="detail-title-main"><div class="detail-heading-row"><h3>${id} BLOCK</h3>${gateBadges(id)}</div><p>외야석</p></div><button type="button" class="copy-link" id="copy-link">링크 복사</button></div><div class="alumni-card"><strong>교우회석</strong><p>412–415구역은 고려대학교 교우회석입니다.</p></div>`;
  bindCopyLink(id); updateMapState(); if (updateUrl) paramUrl('block', id); container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function selectBlock(id, updateUrl = true) {
  if (alumniBlocks.has(id)) { renderAlumniBlock(id, updateUrl); return; }
  if (!state.blocks[id]) return; state.block = id; const block = state.blocks[id];
  const mixedGateBlock = gatesForBlock(id).length > 1;
  const allocation = block.units.map((unit) => `<div class="assignment" title="${escapeHtml(unit.name)}"><span>${escapeHtml(unit.name)}${mixedGateBlock ? `<small class="assignment-gate">${escapeHtml(gateById(gateForUnitBlock(unit.name, id)).label)}</small>` : ''}</span><strong>${fmt(unit.seats)}석</strong></div>`).join('');
  const unitAssignments = state.unit ? state.units[state.unit]?.assignments || [] : [];
  const unitNav = unitAssignments.some((item) => item.block === id) && unitAssignments.length > 1
    ? `<div class="unit-block-nav" aria-label="${escapeHtml(state.unit)} 배정 구역"><strong>${escapeHtml(state.unit)} 배정 구역</strong><div>${unitAssignments.map((item) => `<button type="button" data-unit-block="${item.block}"${item.block === id ? ' class="active" aria-current="true"' : ''}>${item.block}구역 · ${fmt(item.seats)}석</button>`).join('')}</div></div>`
    : '';
  const container = $('#block-detail'); container.className = 'detail-card';
  container.innerHTML = `<div class="detail-title"><div class="detail-title-main"><div class="detail-heading-row"><h3>${id} BLOCK</h3>${gateBadges(id)}</div><p>${block.level === 4 ? '외야석' : `${block.level}층`}</p></div><button type="button" class="copy-link" id="copy-link">링크 복사</button></div>${unitNav}<div class="stats"><div class="stat"><span>상세 좌석 합계</span><strong>${fmt(block.totalSeats)}</strong></div><div class="stat"><span>배정 좌석</span><strong>${fmt(block.assignedSeats)}</strong></div><div class="stat"><span>불용 좌석</span><strong>${fmt(block.unavailableSeats)}</strong></div></div><h4>배정 단위</h4><div class="assignment-list" style="--allocation-columns:${Math.min(3, block.units.length)}">${allocation}</div><div id="seat-detail" class="seat-detail"></div>`;
  bindCopyLink(id);
  container.querySelectorAll('button[data-unit-block]').forEach((button) => { button.onclick = () => selectBlock(button.dataset.unitBlock, true); });
  renderSeats(id, $('#seat-detail'));
  updateMapState(); if (updateUrl) paramUrl('block', id); container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderSeats(id, container) {
  const list = state.seats[id] || []; if (!list.length) { container.textContent = '좌석 자료가 없습니다.'; return; }
  const minRow = Math.min(...list.map((seat) => seat.row)), maxRow = Math.max(...list.map((seat) => seat.row)), minCol = Math.min(...list.map((seat) => seat.column)), maxCol = Math.max(...list.map((seat) => seat.column));
  const lookup = new Map(list.map((seat) => [`${seat.row}:${seat.column}`, seat])), legend = new Map(); for (const seat of list) if (!seat.unavailable && seat.unit) legend.set(seat.unit, seat.color);
  const legendHtml = [...legend.entries()].map(([unit, color]) => `<span><i style="background:${color}"></i>${escapeHtml(unit)}</span>`).join('') + (list.some((seat) => seat.unavailable) ? '<span><i class="unavailable"></i>불용 좌석</span>' : '');
  container.innerHTML = `<div class="seat-grid-heading"><p>두 손가락으로 확대·축소하실 수 있습니다.</p></div><div class="seat-legend">${legendHtml}</div><div class="seat-grid-wrap" tabindex="0" aria-label="손가락으로 확대·축소할 수 있는 좌석 배치도"><div class="seat-grid-stage"><div class="seat-grid"></div></div></div>`;
  const grid = container.querySelector('.seat-grid'); grid.style.gridTemplateColumns = `36px repeat(${maxCol - minCol + 1},29px)`; const fragment = document.createDocumentFragment();
  for (let row = minRow; row <= maxRow; row++) {
    const label = document.createElement('div'); label.className = 'seat-row-label'; label.textContent = `${row - minRow + 1}열`; fragment.append(label);
    for (let col = minCol; col <= maxCol; col++) {
      const item = lookup.get(`${row}:${col}`), cell = document.createElement('div'); cell.className = `seat${!item ? ' empty' : item.unavailable ? ' unavailable' : state.unit === item.unit ? ' selected' : ''}`;
      if (item) { if (!item.unavailable) { cell.textContent = item.seat; cell.style.background = item.color; cell.style.color = contrast(item.color); } cell.title = `${item.seat}번 · ${item.unavailable ? '불용 좌석' : item.unit || '배정 단위 미확인'}`; cell.setAttribute('aria-label', cell.title); }
      fragment.append(cell);
    }
  }
  grid.append(fragment);
  setupSeatZoom(container);
}
function setupSeatZoom(container) {
  const viewport = container.querySelector('.seat-grid-wrap'), stage = container.querySelector('.seat-grid-stage'), grid = container.querySelector('.seat-grid');
  const naturalWidth = grid.scrollWidth, naturalHeight = grid.scrollHeight;
  let scale = 1, fitScale = 1;
  const applyScale = () => { stage.style.width = `${naturalWidth * scale}px`; stage.style.height = `${naturalHeight * scale}px`; grid.style.transform = `scale(${scale})`; };
  const fit = () => {
    const availableWidth = viewport.clientWidth - 36, availableHeight = viewport.clientHeight - 36;
    fitScale = Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);
    scale = fitScale; applyScale(); viewport.scrollTo(0, 0);
  };
  const zoomAt = (next, clientX, clientY) => {
    const newScale = Math.max(fitScale, Math.min(2.5, next));
    if (newScale === scale) return;
    const rect = viewport.getBoundingClientRect(), padding = 18;
    const x = clientX - rect.left, y = clientY - rect.top;
    const contentX = (viewport.scrollLeft + x - padding) / scale;
    const contentY = (viewport.scrollTop + y - padding) / scale;
    scale = newScale; applyScale();
    viewport.scrollLeft = contentX * scale + padding - x;
    viewport.scrollTop = contentY * scale + padding - y;
  };
  const pointers = new Map(); let pinchDistance = 0;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  viewport.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) pinchDistance = distance(...pointers.values());
    viewport.classList.add('dragging');
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    const previous = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], nextDistance = distance(a, b);
      if (pinchDistance) zoomAt(scale * nextDistance / pinchDistance, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchDistance = nextDistance;
    } else {
      const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
      if (scale > fitScale + .001) { viewport.scrollLeft -= dx; viewport.scrollTop -= dy; }
      else if (event.pointerType === 'touch') window.scrollBy(0, -dy);
    }
  });
  const finish = (event) => {
    pointers.delete(event.pointerId); pinchDistance = 0;
    if (!pointers.size) viewport.classList.remove('dragging');
  };
  viewport.addEventListener('pointerup', finish);
  viewport.addEventListener('pointercancel', finish);
  viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAt(scale * Math.exp(-event.deltaY * .002), event.clientX, event.clientY);
  }, { passive: false });
  viewport.addEventListener('keydown', (event) => {
    if (!['+', '=', '-', '0'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === '0') { fit(); return; }
    const rect = viewport.getBoundingClientRect();
    zoomAt(scale * (event.key === '-' ? 1 / 1.5 : 1.5), rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  fit();
  let observedWidth = viewport.getBoundingClientRect().width, observedHeight = viewport.getBoundingClientRect().height;
  const resize = new ResizeObserver(() => {
    if (!container.isConnected) { resize.disconnect(); return; }
    const rect = viewport.getBoundingClientRect();
    if (rect.width !== observedWidth || rect.height !== observedHeight) {
      observedWidth = rect.width; observedHeight = rect.height; fit();
    }
  });
  resize.observe(viewport);
}
function contrast(hex) { const rgb = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)); return rgb.reduce((sum, value, index) => sum + value * [.299, .587, .114][index], 0) < 135 ? '#fff' : '#26201e'; }
function showSearch() {
  const query = $('#unit-search').value.trim().toLocaleLowerCase(), results = $('#search-results'); results.replaceChildren();
  if (!query) { results.hidden = true; $('#unit-search').setAttribute('aria-expanded', 'false'); return; }
  const matches = Object.values(state.units).filter((unit) => unit.name.toLocaleLowerCase().includes(query)).slice(0, 12);
  for (const unit of matches) { const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'option'); const name = document.createElement('span'); name.textContent = unit.name; const count = document.createElement('small'); count.textContent = `${fmt(unit.derivedSeats)}석`; button.append(name, count); button.onclick = () => selectUnit(unit.name, true); results.append(button); }
  if (!matches.length) { const item = document.createElement('div'); item.style.padding = '15px'; item.textContent = '검색 결과가 없습니다.'; results.append(item); }
  results.hidden = false; $('#unit-search').setAttribute('aria-expanded', 'true');
}
function setView() { const view = state.view; $('#seat-map').setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); }
function zoom(factor, clientX, clientY) {
  const map = $('#seat-map'), rect = map.getBoundingClientRect(), view = state.view, px = (clientX - rect.left) / rect.width, py = (clientY - rect.top) / rect.height;
  const width = Math.max(330, Math.min(MAP_SIZE, view.w / factor)), height = width, x = Math.max(0, Math.min(MAP_SIZE - width, view.x + px * (view.w - width))), y = Math.max(0, Math.min(MAP_SIZE - height, view.y + py * (view.h - height))); state.view = { x, y, w: width, h: height }; setView();
}
function setupMapControls() {
  const map = $('#seat-map'), zoomCenter = (factor) => { const rect = map.getBoundingClientRect(); zoom(factor, rect.left + rect.width / 2, rect.top + rect.height / 2); };
  $('#zoom-in').onclick = () => zoomCenter(1.35); $('#zoom-out').onclick = () => zoomCenter(1 / 1.35); $('#zoom-reset').onclick = () => { state.view = baseView(); setView(); }; setView();
  map.addEventListener('wheel', (event) => { event.preventDefault(); zoom(event.deltaY < 0 ? 1.18 : 1 / 1.18, event.clientX, event.clientY); }, { passive: false });
  const pointers = new Map(); let pinch = null;
  map.addEventListener('pointerdown', (event) => { pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY }); if (event.pointerType !== 'mouse' && event.target.setPointerCapture) event.target.setPointerCapture(event.pointerId); state.dragged = false; pinch = null; });
  map.addEventListener('pointermove', (event) => { if (!pointers.has(event.pointerId)) return; const old = pointers.get(event.pointerId), next = { ...old, x: event.clientX, y: event.clientY }; pointers.set(event.pointerId, next); if (pointers.size === 2) { const [a, b] = [...pointers.values()], distance = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoom(distance / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch = distance; state.dragged = true; return; } const dx = event.clientX - old.x, dy = event.clientY - old.y; if (Math.hypot(event.clientX - old.startX, event.clientY - old.startY) > 8) { const rect = map.getBoundingClientRect(), view = state.view; view.x = Math.max(0, Math.min(MAP_SIZE - view.w, view.x - dx * view.w / rect.width)); view.y = Math.max(0, Math.min(MAP_SIZE - view.h, view.y - dy * view.h / rect.height)); setView(); state.dragged = true; } });
  const finish = (event) => { pointers.delete(event.pointerId); pinch = null; setTimeout(() => { state.dragged = false; }, 0); }; map.addEventListener('pointerup', finish); map.addEventListener('pointercancel', finish);
}
async function init() {
  try {
    const [units, blocks, seats, geometry, gates] = await Promise.all(['units', 'blocks', 'seats', 'stadium-geometry', 'gates'].map(async (name) => { const response = await fetch(`./data/${name}.json`); if (!response.ok) throw Error(`${name}.json: HTTP ${response.status}`); return response.json(); }));
    Object.assign(state, { units, blocks, seats, geometry, gates }); renderMap(); renderGateShortcuts(); renderBlockButtons(); setupMapControls();
    $('#unit-search').addEventListener('input', showSearch); $('#unit-search').addEventListener('keydown', (event) => { if (event.key === 'Escape') $('#search-results').hidden = true; if (event.key === 'Enter') { const first = $('#search-results button'); if (first) { event.preventDefault(); first.click(); } } });
    document.addEventListener('click', (event) => { if (!event.target.closest('.search-wrap')) $('#search-results').hidden = true; });
    const params = new URLSearchParams(location.search), unit = params.get('unit'), block = params.get('block'); if (unit && units[unit]) selectUnit(unit, false); else if (block && (blocks[block] || alumniBlocks.has(block))) selectBlock(block, false);
  } catch (error) { const box = $('#data-alert'); box.hidden = false; box.textContent = `좌석 데이터를 불러오지 못했습니다. 정적 서버로 페이지를 열고 새로고침해 주세요. (${error.message})`; }
}
init();
