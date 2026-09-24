const $ = (selector) => document.querySelector(selector);
const svgNS = 'http://www.w3.org/2000/svg';
const MAP_SIZE = 900;
const alumniBlocks = new Set(['412', '413', '414', '415']);
const baseView = () => ({ x: 0, y: 0, w: MAP_SIZE, h: MAP_SIZE });
const state = { units: {}, blocks: {}, seats: {}, unit: null, block: null, view: baseView(), dragged: false };

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const fmt = (number) => Number(number).toLocaleString('ko-KR');
const rangeText = (ranges) => ranges.map(({ seatFrom, seatTo }) => seatFrom === seatTo ? `${seatFrom}` : `${seatFrom}–${seatTo}`).join(', ');
const paramUrl = (key, value) => { const url = new URL(location.href); url.search = ''; if (value) url.searchParams.set(key, value); history.replaceState(null, '', url); };
const makeSvg = (tag, attrs = {}) => { const node = document.createElementNS(svgNS, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); return node; };
function polar(cx, cy, radius, degree) { const rad = degree * Math.PI / 180; return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)]; }
function arcPath(cx, cy, inner, outer, start, end) {
  const a = polar(cx, cy, outer, start), b = polar(cx, cy, outer, end), c = polar(cx, cy, inner, end), d = polar(cx, cy, inner, start);
  return `M${a[0]} ${a[1]} A${outer} ${outer} 0 0 1 ${b[0]} ${b[1]} L${c[0]} ${c[1]} A${inner} ${inner} 0 0 0 ${d[0]} ${d[1]} Z`;
}
function allBlockIds() {
  return {
    4: Array.from({ length: 22 }, (_, i) => String(422 - i)),
    3: Array.from({ length: 34 }, (_, i) => String(301 + i)),
    2: Array.from({ length: 26 }, (_, i) => String(201 + i)),
    1: Array.from({ length: 22 }, (_, i) => String(101 + i)),
  };
}
function isKuBlock(id) { return Boolean(state.blocks[id]) || alumniBlocks.has(id); }
function drawField(root) {
  const field = makeSvg('g', { class: 'field-art', transform: 'translate(450 455) scale(.35) translate(-846 -613)' });
  field.append(makeSvg('path', { d: 'M1361.96 531.751C1357.7 517.3 1353.15 503.292 1348.36 489.727C1345.98 481.676 1341.11 467.064 1332.38 448.427C1238.34 225.909 1063 132.281 846.026 132.281C603.695 132.281 413.252 249.055 330.047 531.791L460.471 609.358L547.42 755.959L527.333 790.657C547.098 846.689 589.486 925.022 640.689 984.274C676.153 1025.29 744.464 1095.01 846.026 1095.01C947.587 1095.01 1015.9 1025.29 1051.36 984.274C1102.57 925.022 1144.99 846.689 1164.72 790.657L1144.63 755.959L1231.58 609.358L1362 531.791Z', class: 'field' }));
  field.append(makeSvg('path', { d: 'M845.268 930.495L560.066 645.304C560.066 645.304 630.189 449.514 845.268 449.514C1060.35 449.514 1131.88 645.585 1131.88 645.585L845.268 930.495Z', class: 'infield-dirt' }));
  field.append(makeSvg('circle', { cx: 844.731, cy: 893.154, r: 46.733, class: 'infield-dirt' }));
  field.append(makeSvg('path', { d: 'M961.493 738.565C961.493 746.253 964.19 753.337 968.699 758.892L872.25 855.338C864.521 849.703 855.021 846.402 844.756 846.402C834.491 846.402 824.951 849.703 817.262 855.338L720.129 758.208C724.315 752.774 726.811 745.931 726.811 738.524C726.811 731.118 724.315 724.315 720.129 718.841L823.059 615.914C828.775 621.107 836.383 624.287 844.716 624.287C853.048 624.287 860.656 621.107 866.373 615.914L968.699 718.237C964.19 723.792 961.493 730.836 961.493 738.565Z', class: 'infield-grass' }));
  field.append(makeSvg('circle', { cx: 844.756, cy: 738.524, r: 32.3, class: 'infield-dirt' }));
  field.append(makeSvg('path', { d: 'M870.329 883.848L1324.97 430.348M816.89 884.327L367.531 434.943', class: 'foul-line' }));
  field.append(makeSvg('path', { d: 'M855.693 580.208L844.734 569.25L833.776 580.208L844.734 591.166ZM695.881 739.46L684.923 728.502L673.964 739.46L684.923 750.418ZM1013.79 738.435L1002.83 727.477L991.876 738.435L1002.83 749.393Z', class: 'base' }));
  field.append(makeSvg('path', { d: 'M850.558 904.547L843.594 911.229L836.671 904.547L836.671 888.084L850.558 888.084Z', class: 'base' }));
  root.append(field);
}
function addBlock(root, id, inner, outer, start, end) {
  const ku = isKuBlock(id), alumni = alumniBlocks.has(id), data = state.blocks[id];
  const attrs = { d: arcPath(450, 455, inner, outer, start, end), class: `map-block ${ku ? 'ku' : 'neutral'}${alumni ? ' alumni' : ''}`, 'data-block': id };
  if (ku) Object.assign(attrs, { tabindex: '0', role: 'button', 'aria-label': alumni ? `${id}구역 교우회석` : `${id}구역, ${data.availableSeats}석` });
  const path = makeSvg('path', attrs), title = makeSvg('title'); title.textContent = alumni ? `${id}구역 · 교우회석` : data ? `${id}구역 · ${data.availableSeats}석` : `${id}구역`; path.append(title);
  if (ku) {
    path.addEventListener('click', () => selectBlock(id, true));
    path.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectBlock(id, true); } });
  }
  root.append(path);
  const mid = (start + end) / 2, [x, y] = polar(450, 455, (inner + outer) / 2, mid);
  const label = makeSvg('text', { x: x.toFixed(1), y: y.toFixed(1), class: `map-label ${ku ? 'ku' : 'neutral'}`, 'data-label': id }); label.textContent = id; root.append(label);
}
function renderMap() {
  const root = $('#seat-map'); root.replaceChildren(); const ids = allBlockIds();
  const configs = { 4: { inner: 342, outer: 405, start: 198, end: 342 }, 3: { inner: 335, outer: 398, start: -12, end: 192 }, 2: { inner: 270, outer: 329, start: -18, end: 198 }, 1: { inner: 205, outer: 264, start: -25, end: 205 } };
  drawField(root);
  for (const level of [4, 3, 2, 1]) { const config = configs[level], span = (config.end - config.start) / ids[level].length; ids[level].forEach((id, index) => addBlock(root, id, config.inner, config.outer, config.start + index * span + .45, config.start + (index + 1) * span - .45)); }
  root.append(makeSvg('rect', { x: 402, y: 7, width: 96, height: 30, rx: 4, class: 'scoreboard' }));
  const boardLabel = makeSvg('text', { x: 450, y: 27, class: 'scoreboard-label', 'text-anchor': 'middle' }); boardLabel.textContent = '전광판'; root.append(boardLabel);
  updateMapState();
}
function updateMapState() {
  const selected = state.unit ? new Set(state.units[state.unit]?.assignments.map((item) => item.block) || []) : null;
  document.querySelectorAll('.map-block').forEach((node) => { const id = node.dataset.block; node.classList.toggle('dim', Boolean(selected) && !selected.has(id)); node.classList.toggle('highlight', Boolean(selected) && selected.has(id)); node.classList.toggle('active', state.block === id); });
  document.querySelectorAll('.map-label').forEach((node) => { const id = node.dataset.label; node.classList.toggle('dim', Boolean(selected) && !selected.has(id)); node.classList.toggle('highlight', Boolean(selected) && selected.has(id)); node.classList.toggle('active', state.block === id); });
  document.querySelectorAll('.block-list button').forEach((node) => node.classList.toggle('active', node.dataset.block === state.block));
  $('#map-status').textContent = state.unit ? `${selected.size}개 배정 구역` : '고려대학교 48개 구역';
  $('#map-hint').textContent = state.block ? `${state.block}구역 선택됨` : '빨간색 구역을 선택하세요';
}
function renderBlockButtons() {
  const list = $('#block-list'); list.replaceChildren();
  for (const id of [...Object.keys(state.blocks), ...alumniBlocks].sort((a, b) => Number(a) - Number(b))) { const button = document.createElement('button'); button.type = 'button'; button.dataset.block = id; button.textContent = id; button.setAttribute('aria-label', `${id}구역 선택`); button.onclick = () => selectBlock(id, true); list.append(button); }
}
function selectUnit(name, updateUrl = true) {
  if (!state.units[name]) return; state.unit = name; state.block = null;
  $('#unit-search').value = name; $('#search-results').hidden = true; $('#unit-search').setAttribute('aria-expanded', 'false');
  const unit = state.units[name], box = $('#selected-unit'); box.hidden = false;
  const assignments = unit.assignments.map((item) => `<button type="button" data-block="${item.block}">${item.block}구역 · ${escapeHtml(rangeText(item.ranges))}번 · ${fmt(item.seats)}석</button>`).join('');
  box.innerHTML = `<div class="unit-top"><div><span class="section-index">선택한 단위</span><h2>${escapeHtml(name)}</h2></div><strong>${fmt(unit.derivedSeats)}석</strong></div><p>상세 좌석 색상 기준 · 배정 구역 ${unit.assignments.length}곳</p><div class="unit-links">${assignments || '상세 좌석 시트에 배정된 좌석이 없습니다.'}</div>`;
  box.querySelectorAll('button[data-block]').forEach((button) => { button.onclick = () => selectBlock(button.dataset.block, true); });
  updateMapState();
  if (updateUrl) paramUrl('unit', name);
  const firstBlock = unit.assignments[0]?.block;
  if (firstBlock) selectBlock(firstBlock, false);
  else { $('#block-detail').className = 'detail-placeholder'; $('#block-detail').textContent = '상세 좌석 시트에 배정된 좌석이 없습니다.'; }
}
function bindCopyLink(id) {
  $('#copy-link').onclick = async () => { const url = new URL(location.href); url.search = ''; url.searchParams.set('block', id); try { await navigator.clipboard.writeText(url.href); $('#copy-link').textContent = '복사됨'; } catch { prompt('구역 링크', url.href); } };
}
function renderAlumniBlock(id, updateUrl) {
  state.block = id; const container = $('#block-detail'); container.className = 'detail-card';
  container.innerHTML = `<div class="detail-title"><div><h3>${id} BLOCK</h3><p>4층 · 교우회석</p></div><button type="button" class="copy-link" id="copy-link">링크 복사</button></div><div class="alumni-card"><strong>교우회석</strong><p>412–415구역은 고려대학교 교우회석입니다.</p></div>`;
  bindCopyLink(id); updateMapState(); if (updateUrl) paramUrl('block', id); container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function selectBlock(id, updateUrl = true) {
  if (alumniBlocks.has(id)) { renderAlumniBlock(id, updateUrl); return; }
  if (!state.blocks[id]) return; state.block = id; const block = state.blocks[id];
  const allocation = block.units.map((unit) => { const found = state.units[unit.name]?.assignments.find((item) => item.block === id), ranges = found ? rangeText(found.ranges) : ''; return `<div class="assignment"><span>${escapeHtml(unit.name)}<small>${escapeHtml(ranges)}번</small></span><strong>${fmt(unit.seats)}석</strong></div>`; }).join('');
  const unitAssignments = state.unit ? state.units[state.unit]?.assignments || [] : [];
  const unitNav = unitAssignments.some((item) => item.block === id) && unitAssignments.length > 1
    ? `<div class="unit-block-nav" aria-label="${escapeHtml(state.unit)} 배정 구역"><strong>${escapeHtml(state.unit)} 배정 구역</strong><div>${unitAssignments.map((item) => `<button type="button" data-unit-block="${item.block}"${item.block === id ? ' class="active" aria-current="true"' : ''}>${item.block}구역 · ${fmt(item.seats)}석</button>`).join('')}</div></div>`
    : '';
  const container = $('#block-detail'); container.className = 'detail-card';
  container.innerHTML = `<div class="detail-title"><div><h3>${id} BLOCK</h3><p>${block.level}층 · ${escapeHtml(block.note || '고려대학교 배정 구역')}</p></div><button type="button" class="copy-link" id="copy-link">링크 복사</button></div>${unitNav}<div class="stats"><div class="stat"><span>상세 좌석 합계</span><strong>${fmt(block.totalSeats)}</strong></div><div class="stat"><span>배정 좌석</span><strong>${fmt(block.assignedSeats)}</strong></div><div class="stat"><span>불용 좌석</span><strong>${fmt(block.unavailableSeats)}</strong></div></div><h4>배정 단위</h4><div class="assignment-list">${allocation}</div><div id="seat-detail" class="seat-detail"></div>`;
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
  container.innerHTML = `<div class="seat-grid-heading"><p>전체 좌석 배치도를 확대해 좌석 번호를 확인하세요.</p><div class="seat-zoom-controls" aria-label="좌석 배치도 확대 축소"><button type="button" data-seat-zoom="out" aria-label="좌석 배치도 축소">−</button><button type="button" data-seat-zoom="in" aria-label="좌석 배치도 확대">+</button><button type="button" data-seat-zoom="fit">전체 보기</button></div></div><div class="seat-legend">${legendHtml}</div><div class="seat-grid-wrap"><div class="seat-grid-stage"><div class="seat-grid"></div></div></div>`;
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
    const availableWidth = viewport.clientWidth - 36, availableHeight = Math.min(window.innerHeight * .58, 520);
    fitScale = Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);
    scale = fitScale; applyScale(); viewport.scrollTo(0, 0);
  };
  container.querySelectorAll('[data-seat-zoom]').forEach((button) => { button.onclick = () => {
    if (button.dataset.seatZoom === 'fit') { fit(); return; }
    const next = button.dataset.seatZoom === 'in' ? scale * 1.5 : scale / 1.5;
    scale = Math.max(fitScale, Math.min(2.5, next)); applyScale();
  }; });
  fit();
  let observedWidth = viewport.clientWidth;
  const resize = new ResizeObserver(() => {
    if (!container.isConnected) { resize.disconnect(); return; }
    if (viewport.clientWidth !== observedWidth) { observedWidth = viewport.clientWidth; if (scale === fitScale) fit(); }
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
    const [units, blocks, seats] = await Promise.all(['units', 'blocks', 'seats'].map(async (name) => { const response = await fetch(`./data/${name}.json`); if (!response.ok) throw Error(`${name}.json: HTTP ${response.status}`); return response.json(); }));
    Object.assign(state, { units, blocks, seats }); renderMap(); renderBlockButtons(); setupMapControls();
    $('#unit-search').addEventListener('input', showSearch); $('#unit-search').addEventListener('keydown', (event) => { if (event.key === 'Escape') $('#search-results').hidden = true; if (event.key === 'Enter') { const first = $('#search-results button'); if (first) { event.preventDefault(); first.click(); } } });
    document.addEventListener('click', (event) => { if (!event.target.closest('.search-wrap')) $('#search-results').hidden = true; });
    const params = new URLSearchParams(location.search), unit = params.get('unit'), block = params.get('block'); if (unit && units[unit]) selectUnit(unit, false); else if (block && (blocks[block] || alumniBlocks.has(block))) selectBlock(block, false);
  } catch (error) { const box = $('#data-alert'); box.hidden = false; box.textContent = `좌석 데이터를 불러오지 못했습니다. 정적 서버로 페이지를 열고 새로고침해 주세요. (${error.message})`; }
}
init();
