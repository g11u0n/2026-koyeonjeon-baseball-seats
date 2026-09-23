const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..','data');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name+'.json'),'utf8'));
const units=read('units'),blocks=read('blocks'),seats=read('seats'),report=read('validation');
const errors=[];
const expected=[...Array(9)].map((_,i)=>114+i).concat([...Array(11)].map((_,i)=>216+i),[...Array(17)].map((_,i)=>318+i),[...Array(7)].map((_,i)=>416+i)).map(String);
for(const id of expected)if(!blocks[id]||!seats[id])errors.push(`${id}: 블록 또는 좌석 데이터 누락`);
for(const [id,block] of Object.entries(blocks)){
  const list=seats[id];if(!Array.isArray(list)){errors.push(`${id}: 좌석 목록 없음`);continue}
  const locations=new Set();let assigned=0,restricted=0;
  for(const seat of list){
    const key=`${seat.row}:${seat.column}`;
    if(locations.has(key))errors.push(`${id}: 같은 위치 중복 ${key}`);
    locations.add(key);
    if(!Number.isInteger(seat.seat)||seat.seat<1)errors.push(`${id}: 잘못된 좌석 번호`);
    if(seat.unavailable){restricted++;if(seat.unit)errors.push(`${id}: 불용 좌석에 단위 배정`)}
    else if(!units[seat.unit])errors.push(`${id}: 미등록 단위 ${seat.unit}`);
    else assigned++;
  }
  if(block.assignedSeats!==assigned||block.unavailableSeats!==restricted)errors.push(`${id}: 상세 좌석 집계 불일치`);
  const mapped=block.units.reduce((n,u)=>n+u.seats,0);
  if(mapped!==assigned)errors.push(`${id}: 단위별 합계 불일치`);
}
for(const [name,unit] of Object.entries(units)){
  const counted=unit.assignments.reduce((n,a)=>n+a.seats,0);
  if(counted!==unit.derivedSeats)errors.push(`${name}: 배정 집계 불일치`);
}
console.log(`구조 검증: ${errors.length}건 오류 / 원본 간 불일치: ${report.warnings.length}건`);
for(const error of errors)console.error(error);
if(errors.length)process.exitCode=1;
