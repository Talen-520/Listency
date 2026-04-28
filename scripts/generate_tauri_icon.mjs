import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const size = 512;
const output = resolve("app/desktop/src-tauri/icons/icon.png");

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function mix(c1, c2, t) {
  return [
    lerp(c1[0], c2[0], t),
    lerp(c1[1], c2[1], t),
    lerp(c1[2], c2[2], t),
    255,
  ];
}

const page = [7, 11, 20];
const violet = [124, 92, 255];
const pink = [243, 107, 255];
const cyan = [62, 231, 255];

const raw = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y += 1) {
  const row = y * (size * 4 + 1);
  raw[row] = 0;
  for (let x = 0; x < size; x += 1) {
    const nx = x / (size - 1);
    const ny = y / (size - 1);
    const dx = nx - 0.5;
    const dy = ny - 0.5;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const corner = Math.max(Math.abs(dx), Math.abs(dy));
    const rounded = corner > 0.48 && dist > 0.62;

    let color = mix(page, violet, Math.max(0, 1 - dist * 1.55));
    const glow = Math.max(0, 1 - Math.hypot(nx - 0.78, ny - 0.2) * 2.2);
    color = mix(color, cyan, glow * 0.65);

    const wave = Math.sin((nx * 7.5 + ny * 1.5) * Math.PI) * 0.055 + 0.52;
    const waveBand = Math.abs(ny - wave);
    if (waveBand < 0.018 || Math.abs(ny - (1 - wave)) < 0.014) {
      color = mix(color, cyan, 0.9);
    }

    const core = Math.hypot(nx - 0.5, ny - 0.52);
    if (core < 0.19) {
      color = mix(color, pink, 0.72);
    }
    if (core < 0.095) {
      color = mix(color, [245, 247, 251], 0.92);
    }

    const index = row + 1 + x * 4;
    raw[index] = color[0];
    raw[index + 1] = color[1];
    raw[index + 2] = color[2];
    raw[index + 3] = rounded ? 0 : 255;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);

console.log(`Generated ${output}`);
