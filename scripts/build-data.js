// Converts the read-only workbook extract to files safe to publish.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const workbook = JSON.parse(fs.readFileSync(path.join(root, 'private-source/workbook.json'), 'utf8')).sheets;
const out = path.join(root, 'data');
fs.mkdirSync(out, { recursive: true });

const unitRows = workbook['단위별 좌석'];
if (!unitRows) throw Error('단위별 좌석 시트가 없습니다.');
const units = {};
const byColor = new Map();
for (const [row, cells] of Object.entries(unitRows)) {
  const name = cells[`B${row}`]?.value;
  if (!name || name === '단위' || name === '불용석' || !cells[`E${row}`]?.fill) continue;
  const color = cells[`E${row}`].fill.toUpperCase();
  units[name] = {
    name,
    reportedSeats: Number(cells[`C${row}`]?.value) || 0,
    assignments: [],
    sourceDescription: cells[`D${row}`]?.value || ''
  };
  byColor.set(color, [...(byColor.get(color) || []), name]);
}
units['자유석'] = { name: '자유석', reportedSeats: Number(unitRows['44']?.C44?.value) || 0, assignments: [], sourceDescription: '' };

const blocks = {};
const seats = {};
const warnings = [];
const warn = (type, subject, detail) => warnings.push({ type, subject, detail });
const colorCorrections = {
  FF124F5C: '자유전공학부',
  FFFEE499: '심리융합과학대학원',
  FF1255CC: '동아리연합회',
  FFCA7B7A: '간호대학',
  FFFD9800: '국제대학'
};
const specialAssignments = {
  '219:FFFFF2CC': '세종 총동아리연합회',
  '417:FFFFE599': 'E-MBA 23기 24기',
  '420:FFF9CB9C': '자유석'
};
const freeColors = new Set(['FF5B0F00', 'FF660000']);
for (const [sheetName, sheet] of Object.entries(workbook)) {
  const match = sheetName.match(/^(\d{3}) \((\d+)\)$/);
  if (!match) continue;
  const [, id, sourceAvailable] = match;
  const list = [];
  const seen = new Set();
  const counts = {};
  for (const cells of Object.values(sheet)) for (const [address, cell] of Object.entries(cells)) {
    const location = address.match(/^([A-Z]+)(\d+)$/);
    const number = Number(cell.value);
    if (!location || Number(location[2]) < 4 || !Number.isInteger(number) || number < 1 || !cell.fill) continue;
    let column = 0;
    for (const char of location[1]) column = column * 26 + char.charCodeAt(0) - 64;
    if (column < 2) continue;
    if (seen.has(number)) warn('duplicate-seat', id, `좌석 ${number} 중복`);
    seen.add(number);
    const fill = cell.fill.toUpperCase();
    let unit = null;
    let unavailable = fill === 'FFFF0000';
    let excluded = id === '217' && ['FFFCE5CD', 'FFE6B8AF'].includes(fill);
    if (!unavailable && !excluded) {
      unit = specialAssignments[`${id}:${fill}`] || colorCorrections[fill] || null;
      if (!unit && freeColors.has(fill)) unit = '자유석';
      if (!unit) {
        const candidates = byColor.get(fill) || [];
        unit = candidates.length === 1 ? candidates[0] : null;
        if (candidates.length > 1) unit = id === '122' ? 'CEMS Global MIM' : 'KMBA';
      }
      if (!unit) { warn('unmapped-color', `${id} ${number}`, fill); excluded = true; }
    }
    if (unit) counts[unit] = (counts[unit] || 0) + 1;
    const color = id === '420' && fill === 'FFF9CB9C' ? '#5B0F00' : `#${fill.slice(-6)}`;
    list.push({ seat: number, row: Number(location[2]), column, unit, unavailable, excluded, color });
  }
  list.sort((a, b) => a.seat - b.seat);
  const unavailableSeats = list.filter(seat => seat.unavailable).length;
  const excludedSeats = list.filter(seat => seat.excluded).length;
  const assignedSeats = list.length - unavailableSeats - excludedSeats;
  if (assignedSeats !== Number(sourceAvailable)) warn('sheet-title', id, `상세 시트 이름 ${sourceAvailable}석 / 색상 셀 배정 ${assignedSeats}석`);
  blocks[id] = {
    id, level: Number(id[0]), totalSeats: list.length,
    availableSeats: assignedSeats, assignedSeats, unavailableSeats, excludedSeats,
    sourceTotalSeats: list.length, sourceAvailableSeats: Number(sourceAvailable), note: '',
    units: Object.entries(counts).map(([name, count]) => ({ name, seats: count }))
  };
  seats[id] = list;
}

for (const unit of Object.values(units)) {
  for (const block of Object.values(blocks)) {
    const found = block.units.find(item => item.name === unit.name);
    if (!found) continue;
    const numbers = seats[block.id].filter(item => item.unit === unit.name).map(item => item.seat);
    const ranges = [];
    for (const number of numbers) {
      const last = ranges[ranges.length - 1];
      if (last && last.seatTo + 1 === number) last.seatTo = number;
      else ranges.push({ seatFrom: number, seatTo: number });
    }
    unit.assignments.push({ block: block.id, seats: found.seats, ranges });
  }
  const derived = unit.assignments.reduce((sum, item) => sum + item.seats, 0);
  unit.derivedSeats = derived;
  unit.sourceReportedSeats = unit.reportedSeats;
  unit.reportedSeats = derived;
  if (derived !== unit.sourceReportedSeats) warn('unit-total', unit.name, `단위별 좌석 ${unit.sourceReportedSeats}석 / 상세 색상 ${derived}석`);
}
if (Object.keys(blocks).length !== 43 || blocks['216']) warn('block-count', '전체', `대상 ${Object.keys(blocks).length}/43개, 216 제외`);
const report = { generatedAt: new Date().toISOString(), blockCount: Object.keys(blocks).length, unitCount: Object.keys(units).length, warnings };
for (const [name, data] of Object.entries({ 'units.json': units, 'blocks.json': blocks, 'seats.json': seats, 'validation.json': report })) {
  fs.writeFileSync(path.join(out, name), JSON.stringify(data));
}
fs.writeFileSync(path.join(root, 'validation-report.md'), [
  '# 좌석 데이터 검증 보고서', '',
  `대상 블록: ${report.blockCount}/43개 (216 제외)`, `단위: ${report.unitCount}개`, `불일치: ${warnings.length}건`, '',
  '공개 데이터의 좌석 수는 각 블록 상세 시트의 실제 색상 셀을 기준으로 계산했습니다.', '',
  ...warnings.map(item => `- **${item.type} · ${item.subject}**: ${item.detail}`), ''
].join('\n'));
console.log(`Generated ${report.blockCount} blocks, ${report.unitCount} units, ${warnings.length} warnings`);
for (const item of warnings) console.log(`${item.type} ${item.subject}: ${item.detail}`);
