const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const sourceName = fs.readdirSync(repo).find((name) => name.endsWith('.svg'));
if (!sourceName) throw Error('Place the local stadium vector SVG in the project folder before regenerating the map');
const source = path.join(repo, sourceName);
const svg = fs.readFileSync(source, 'utf8');
const paths = [...svg.matchAll(/<path\b([^>]*)\/>/g)].map((match) => {
  const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((item) => [item[1], item[2]]));
  return Object.fromEntries(['d', 'fill', 'stroke', 'stroke-width', 'stroke-miterlimit'].filter((name) => attrs[name]).map((name) => [name, attrs[name]]));
});
if (paths.length !== 135) throw Error(`Expected 135 vector paths, found ${paths.length}`);

function boundary(d) {
  const tokens = d.match(/[MCLZ]|-?(?:\d+\.?\d*|\.\d+)/g);
  const points = []; let index = 0, command = '', current = [0, 0];
  while (index < tokens.length) {
    if (/[MCLZ]/.test(tokens[index])) { command = tokens[index++]; if (command === 'Z') continue; }
    if (command === 'M' || command === 'L') {
      current = [Number(tokens[index++]), Number(tokens[index++])]; points.push(current);
      if (command === 'M') command = 'L';
    } else if (command === 'C') {
      const a = [Number(tokens[index++]), Number(tokens[index++])];
      const b = [Number(tokens[index++]), Number(tokens[index++])];
      const end = [Number(tokens[index++]), Number(tokens[index++])];
      for (let step = 1; step <= 8; step++) {
        const t = step / 8, u = 1 - t;
        points.push([0, 1].map((axis) => u ** 3 * current[axis] + 3 * u ** 2 * t * a[axis] + 3 * u * t ** 2 * b[axis] + t ** 3 * end[axis]));
      }
      current = end;
    } else throw Error(`Unexpected SVG path command ${command}`);
  }
  return points;
}

function centroid(points) {
  let twiceArea = 0, x = 0, y = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index], b = points[(index + 1) % points.length], cross = a[0] * b[1] - b[0] * a[1];
    twiceArea += cross; x += (a[0] + b[0]) * cross; y += (a[1] + b[1]) * cross;
  }
  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

const ranges = [
  { level: 1, indices: [...range(41, 51), ...range(94, 104)] },
  { level: 2, indices: [...range(28, 40), ...range(81, 93)] },
  { level: 3, indices: [...range(11, 27), ...range(64, 80)] },
  { level: 4, indices: [...range(53, 63), ...range(106, 116)] },
];
function range(start, end) { return Array.from({ length: end - start + 1 }, (_, index) => start + index); }
for (const { level, indices } of ranges) {
  const locations = indices.map((index) => {
    const [x, y] = centroid(boundary(paths[index].d));
    let angle = Math.atan2(y - 701, x - 846) * 180 / Math.PI;
    if (level !== 4 && angle < -90) angle += 360;
    return { index, x, y, angle };
  }).sort((a, b) => level === 4 ? b.angle - a.angle : a.angle - b.angle);
  locations.forEach(({ index, x, y }, position) => {
    paths[index].block = String(level * 100 + position + 1);
    paths[index].label = [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });
}
const blocks = paths.filter((item) => item.block);
if (blocks.length !== 104 || new Set(blocks.map((item) => item.block)).size !== 104) throw Error('Block mapping is incomplete');
fs.writeFileSync(path.join(repo, 'data', 'stadium-geometry.json'), JSON.stringify({ paths }), 'utf8');
console.log(`Generated ${paths.length} paths and ${blocks.length} blocks`);
