// Converts the read-only workbook extract to files safe to publish.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const workbook = JSON.parse(fs.readFileSync(path.join(root, 'private-source/workbook.json'), 'utf8')).sheets;
const out = path.join(root, 'data');
fs.mkdirSync(out, { recursive: true });
const value = (rows, row, col) => rows[String(row)]?.[`${col}${row}`]?.value ?? '';
const unitRows = workbook['단위별 좌석'];
const blockRows = workbook['구역별 좌석수'];
const units = {};
const byColor = new Map();
for (let row = 2; row <= 45; row++) {
  const name = value(unitRows, row, 'B');
  if (!name || name === '불용석') continue;
  const reportedSeats = Number(value(unitRows, row, 'C')) || 0;
  const color = unitRows[String(row)]?.[`E${row}`]?.fill;
  units[name] = { name, reportedSeats, assignments: [], sourceDescription: value(unitRows, row, 'D') };
  if (color) byColor.set(color, [...(byColor.get(color) || []), name]);
}
if (!units['자유석']) units['자유석'] = { name: '자유석', reportedSeats: 0, assignments: [], sourceDescription: '' };
const blocks = {};
const seats = {};
const warnings = [];
const fail = (type, subject, detail) => warnings.push({ type, subject, detail });
const overrides = {
  '219:FFFFF2CC': '세종 총동아리연합회',
  '417:FFFFE599': 'E-MBA 23기 24기'
};
for (let row = 2; row <= 45; row++) {
  const id = value(blockRows, row, 'A');
  if (!/^[0-9]{3}$/.test(id)) continue;
  const totalSeats = Number(value(blockRows, row, 'B'));
  const availableSeats = Number(value(blockRows, row, 'C'));
  const note = value(blockRows, row, 'D');
  const sourceUnits = [];
  for (let i = 0; i < 6; i++) {
    const nameCol = String.fromCharCode(69 + i * 2);
    const countCol = String.fromCharCode(70 + i * 2);
    const name = value(blockRows, row, nameCol);
    const count = Number(value(blockRows, row, countCol));
    if (name) sourceUnits.push({ name, seats: count });
  }
  const sheetName = Object.keys(workbook).find(name => name.startsWith(`${id} (`));
  if (!sheetName) { fail('missing-sheet', id, '좌석 상세 시트가 없습니다.'); continue; }
  const titleCount = Number(sheetName.match(/\(([0-9]+)\)/)?.[1]);
  if (titleCount !== availableSeats) fail('sheet-title', id, `상세 시트 이름 ${titleCount}석 / 구역 요약 가용 ${availableSeats}석`);
  const sheet = workbook[sheetName];
  const list = [];
  const seen = new Set();
  const counts = {};
  for (const cells of Object.values(sheet)) for (const [address, cell] of Object.entries(cells)) {
    if (!/^[A-Z]+[0-9]+$/.test(address) || !/^[0-9]+$/.test(cell.value) || !cell.fill) continue;
    const match = address.match(/^([A-Z]+)([0-9]+)$/);
    const letters = match[1];
    let col = 0;
    for (const char of letters) col = col * 26 + char.charCodeAt(0) - 64;
    const gridRow = Number(match[2]);
    if (col < 3 || gridRow < 4 || Number(cell.value) > totalSeats + 50) continue;
    const seat = Number(cell.value);
    if (seen.has(seat)) fail('duplicate-seat', id, `좌석 ${seat} 중복`);
    seen.add(seat);
    const unavailable = cell.fill.toUpperCase() === 'FFFF0000';
    let unit = null;
    if (!unavailable) {
      unit = overrides[`${id}:${cell.fill.toUpperCase()}`] || null;
      if (!unit && cell.fill.toUpperCase() === 'FF660000') unit = '자유석';
      if (!unit) {
        const candidates = byColor.get(cell.fill.toUpperCase()) || [];
        unit = candidates.length === 1 ? candidates[0] : null;
        if (candidates.length > 1) unit = id === '122' ? 'CEMS Global MIM' : 'KMBA';
      }
      if (!unit) fail('unmapped-color', `${id} ${seat}`, cell.fill);
    }
    if (unit) counts[unit] = (counts[unit] || 0) + 1;
    list.push({ seat, row: gridRow, column: col, unit, unavailable, color: `#${cell.fill.slice(-6)}` });
  }
  list.sort((a, b) => a.seat - b.seat);
  const unavailableSeats = list.filter(seat => seat.unavailable).length;
  const assignedSeats = list.filter(seat => !seat.unavailable && seat.unit).length;
  blocks[id] = { id, level: Number(id[0]), totalSeats:list.length, availableSeats:assignedSeats, assignedSeats, unavailableSeats, sourceTotalSeats:totalSeats, sourceAvailableSeats:availableSeats, note, units: Object.entries(counts).map(([name, seats]) => ({ name, seats })) };
  seats[id] = list;
}
for (const unit of Object.values(units)) {
  for (const block of Object.values(blocks)) {
    const found = block.units.find(item => item.name === unit.name);
    if (!found) continue;
    const numbers = seats[block.id].filter(item => item.unit === unit.name).map(item => item.seat).sort((a,b)=>a-b);
    const ranges = [];
    for (const n of numbers) {
      const last = ranges[ranges.length-1];
      if (last && last.seatTo + 1 === n) last.seatTo = n;
      else ranges.push({ seatFrom:n, seatTo:n });
    }
    unit.assignments.push({ block:block.id, seats:found.seats, ranges });
  }
  const derived = unit.assignments.reduce((sum, item) => sum + item.seats, 0);
  unit.derivedSeats = derived;
  unit.sourceReportedSeats = unit.reportedSeats;
  unit.reportedSeats = derived;
}
if (Object.keys(blocks).length !== 44) fail('block-count', '전체', `대상 ${Object.keys(blocks).length}/44개`);
const report = { generatedAt:new Date().toISOString(), blockCount:Object.keys(blocks).length, unitCount:Object.keys(units).length, warnings };
for (const [name, data] of Object.entries({ 'units.json':units, 'blocks.json':blocks, 'seats.json':seats, 'validation.json':report })) {
  fs.writeFileSync(path.join(out,name), JSON.stringify(data));
}
fs.writeFileSync(path.join(root,'validation-report.md'), [
  '# 좌석 데이터 검증 보고서', '',
  `대상 블록: ${report.blockCount}/44개`, `단위: ${report.unitCount}개`, `불일치: ${warnings.length}건`, '',
  '공개 데이터의 좌석 수는 각 블록 상세 시트의 실제 색상 셀을 기준으로 계산했습니다. 요약 시트 값은 참고용 원본 값으로만 보존했습니다.', '',
  ...warnings.map(w=>`- **${w.type} · ${w.subject}**: ${w.detail}`), ''
].join('\n'));
console.log(`Generated ${report.blockCount} blocks, ${report.unitCount} units, ${warnings.length} warnings`);
for (const item of warnings) console.log(`${item.type} ${item.subject}: ${item.detail}`);
