const assert = require('node:assert/strict');
const path = require('node:path');

const data = path.join(__dirname, '..', 'data');
const units = require(path.join(data, 'units.json'));
const blocks = require(path.join(data, 'blocks.json'));
const { gates, unitAliases, gateByUnitBlock } = require(path.join(data, 'gates.json'));

const gateIds = new Set(gates.map(({ id }) => id));
assert.deepEqual([...gateIds].sort(), ['1-2', '1-3', '2-1']);
assert.equal(gateByUnitBlock.KMBA['223'], '1-2');
assert.equal(gateByUnitBlock['글로벌비즈니스대학 창업경영대학원']['219'], '2-1');
const byUnit = new Map();
for (const gate of gates) {
  for (const displayedName of gate.units) {
    if (displayedName === '교우회석') continue;
    const name = unitAliases[displayedName] || displayedName;
    assert.ok(units[name], `${displayedName}: 단위 데이터 없음`);
    assert.ok(units[name].assignments.length, `${displayedName}: 배정 구역 없음`);
    if (!byUnit.has(name)) byUnit.set(name, new Set());
    byUnit.get(name).add(gate.id);
  }
}
for (const [blockId, block] of Object.entries(blocks)) {
  for (const { name } of block.units) {
    const allowed = byUnit.get(name);
    assert.ok(allowed, `${blockId}구역 ${name}: 입장 게이트 없음`);
    const override = gateByUnitBlock[name]?.[blockId];
    if (blockId.startsWith('4')) {
      assert.ok(allowed.has('1-3'), `${blockId}구역 ${name}: 외야 게이트 목록 누락`);
      assert.ok(!override || override === '1-3', `${blockId}구역 ${name}: 400번대는 외야 1-3 Gate`);
    }
    if (allowed.size > 1) assert.ok(override, `${blockId}구역 ${name}: 중복 게이트 지정 필요`);
    if (override) assert.ok(allowed.has(override), `${blockId}구역 ${name}: 잘못된 게이트`);
  }
}
for (const [name, assignments] of Object.entries(gateByUnitBlock)) {
  for (const [blockId, gateId] of Object.entries(assignments)) {
    assert.ok(gateIds.has(gateId));
    assert.ok(units[name].assignments.some((item) => item.block === blockId));
  }
}
console.log(`${gates.length}개 게이트, ${Object.keys(blocks).length + 4}개 고려대학교 구역의 배정 확인`);
