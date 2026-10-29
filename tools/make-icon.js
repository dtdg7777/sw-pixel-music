// Draw the PIXEL MUSIC icon at 32x32 (logical) and export ICO + PNGs
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const S = 32
const BG = [10, 9, 6]
const AMBER = [255, 176, 0]

// --- logical 32x32 RGBA, top-down ---
const art = Buffer.alloc(S * S * 4)
function set (x, y, c, a = 255) {
  if (x < 0 || y < 0 || x >= S || y >= S) return
  const i = (y * S + x) * 4
  art[i] = c[0]; art[i + 1] = c[1]; art[i + 2] = c[2]; art[i + 3] = a
}
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) set(x, y, BG)
for (let x = 0; x < S; x++) { set(x, 1, AMBER); set(x, S - 2, AMBER) }
for (let y = 0; y < S; y++) { set(1, y, AMBER); set(S - 2, y, AMBER) }
// stepped triangle: heights 18 / 12 / 6, three 6px columns
;[18, 12, 6].forEach((h, i) => {
  const x0 = 9 + i * 6
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < 6; dx++) set(x0 + dx, (S - h) / 2 + dy, AMBER)
})

// --- PNG encoder (RGBA, no dependencies) ---
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32 (buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk (type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}
function png (size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}
function scale (size) {
  const out = Buffer.alloc(size * size * 4)
  const f = S / size
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.min(S - 1, Math.floor(x * f))
      const sy = Math.min(S - 1, Math.floor(y * f))
      art.copy(out, (y * size + x) * 4, (sy * S + sx) * 4, (sy * S + sx) * 4 + 4)
    }
  }
  return out
}

// --- ICO (32x32, BMP based) ---
const bmp = Buffer.alloc(S * S * 4)
for (let y = 0; y < S; y++) art.copy(bmp, (S - 1 - y) * S * 4, y * S * 4, (y + 1) * S * 4)   // bottom-up BGRA already
const bih = Buffer.alloc(40)
bih.writeUInt32LE(40, 0); bih.writeInt32LE(S, 4); bih.writeInt32LE(S * 2, 8)
bih.writeUInt16LE(1, 12); bih.writeUInt16LE(32, 14)
const image = Buffer.concat([bih, bmp, Buffer.alloc((S * S) / 8)])
const dir = Buffer.alloc(6); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(1, 4)
const ent = Buffer.alloc(16)
ent[0] = S; ent[1] = S; ent.writeUInt16LE(1, 4); ent.writeUInt16LE(32, 6)
ent.writeUInt32LE(image.length, 8); ent.writeUInt32LE(22, 12)

const outDir = path.join(__dirname, '..', 'assets')
fs.writeFileSync(path.join(outDir, 'icon.ico'), Buffer.concat([dir, ent, image]))
fs.writeFileSync(path.join(outDir, 'icon-192.png'), png(192, scale(192)))
fs.writeFileSync(path.join(outDir, 'icon-512.png'), png(512, scale(512)))
console.log('icon.ico / icon-192.png / icon-512.png written')
