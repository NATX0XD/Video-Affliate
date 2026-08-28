// ดึงรูปตัวอย่าง "ฉาก/อารมณ์" มาเก็บใน web/public/previews/ (webp 800px)
// รูปทั้งหมดเป็น CC0 จาก StockSnap — ใช้เชิงพาณิชย์ได้ ไม่ต้องให้เครดิต (แต่เก็บไว้ใน CREDITS.md)
// รันซ้ำได้: cd web && node scripts/fetch-previews.mjs
// อยากเปลี่ยนรูปไหน แก้ url ในตารางด้านล่างบรรทัดเดียว แล้วรันใหม่
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const OUT = path.join(process.cwd(), 'public', 'previews')

const IMAGES = [
  { key: 'scene-studio', url: 'https://cdn.stocksnap.io/img-thumbs/960w/HNM0EAC9LW.jpg', title: "Abstract Defocused", creator: "HD Wallpapers", license: 'cc0', src: 'https://stocksnap.io/photo/abstract-defocused-HNM0EAC9LW' },
  { key: 'scene-living', url: 'https://cdn.stocksnap.io/img-thumbs/960w/6KJ12UWOKQ.jpg', title: "House Home", creator: "Mike Birdy", license: 'cc0', src: 'https://stocksnap.io/photo/house-home-6KJ12UWOKQ' },
  { key: 'scene-kitchen', url: 'https://cdn.stocksnap.io/img-thumbs/960w/3ZX53UFU8B.jpg', title: "Kitchen Interior", creator: "Matt Bango", license: 'cc0', src: 'https://stocksnap.io/photo/kitchen-interior-3ZX53UFU8B' },
  { key: 'scene-outdoor', url: 'https://cdn.stocksnap.io/img-thumbs/960w/6F9D5EAEC7.jpg', title: "Sunset Field", creator: "Dakota Roos", license: 'cc0', src: 'https://stocksnap.io/photo/sunset-field-6F9D5EAEC7' },
  { key: 'scene-neon', url: 'https://cdn.stocksnap.io/img-thumbs/960w/GO8WSAD6EJ.jpg', title: "Neon Street", creator: "Ethan Brooke", license: 'cc0', src: 'https://stocksnap.io/photo/neon-street-GO8WSAD6EJ' },
  { key: 'scene-minimal', url: 'https://cdn.stocksnap.io/img-thumbs/960w/WTSQO9T3DK.jpg', title: "Laptop Desk", creator: "Lisa Fotios", license: 'cc0', src: 'https://stocksnap.io/photo/laptop-desk-WTSQO9T3DK' },
  { key: 'mood-warm', url: 'https://cdn.stocksnap.io/img-thumbs/960w/79KTHM0VTK.jpg', title: "Rustic Restaurant", creator: "Lisa Fotios", license: 'cc0', src: 'https://stocksnap.io/photo/rustic-restaurant-79KTHM0VTK' },
  { key: 'mood-premium', url: 'https://cdn.stocksnap.io/img-thumbs/960w/HQWDZQWNES.jpg', title: "Marble Background", creator: "Kristin Hardwick", license: 'cc0', src: 'https://stocksnap.io/photo/marble-background-HQWDZQWNES' },
  { key: 'mood-fun', url: 'https://cdn.stocksnap.io/img-thumbs/960w/DNWA3H3LCU.jpg', title: "Balloons Party", creator: "Fernando Arcos", license: 'cc0', src: 'https://stocksnap.io/photo/balloons-party-DNWA3H3LCU' },
  { key: 'mood-minimal', url: 'https://cdn.stocksnap.io/img-thumbs/960w/CZWGWFXJYB.jpg', title: "Minimal Office", creator: "Altered Reality", license: 'cc0', src: 'https://stocksnap.io/photo/minimal-office-CZWGWFXJYB' },
  { key: 'mood-dramatic', url: 'https://cdn.stocksnap.io/img-thumbs/960w/9YNG14PQJO.jpg', title: "Spotlight Music", creator: "Joe Watts", license: 'cc0', src: 'https://stocksnap.io/photo/spotlight-music-9YNG14PQJO' },
]

await fs.mkdir(OUT, { recursive: true })

const failed = []
for (const im of IMAGES) {
  const dest = path.join(OUT, `${im.key}.webp`)
  try {
    const res = await fetch(im.url, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    await sharp(buf).resize(800, 600, { fit: 'cover' }).webp({ quality: 80 }).toFile(dest)
    const { size } = await fs.stat(dest)
    console.log(`✓ ${im.key}.webp  ${Math.round(size / 1024)}KB`)
  } catch (e) {
    failed.push(im.key)
    console.error(`✗ ${im.key}: ${e.message}`)
  }
}

const credits = [
  '# เครดิตรูปตัวอย่าง',
  '',
  'รูปทั้งหมดเป็น CC0 (Public Domain) จาก StockSnap.io — ใช้เชิงพาณิชย์ได้ ไม่ต้องให้เครดิต',
  'เก็บรายการไว้เพื่อให้ตามต้นทางได้ · ดึงใหม่ด้วย `cd web && node scripts/fetch-previews.mjs`',
  '',
  '| ไฟล์ | ชื่อภาพ | ผู้ถ่าย | สัญญาอนุญาต | ต้นทาง |',
  '|---|---|---|---|---|',
  ...IMAGES.map(i => `| ${i.key}.webp | ${i.title} | ${i.creator} | ${i.license.toUpperCase()} | ${i.src} |`),
  '',
].join('\n')
await fs.writeFile(path.join(OUT, 'CREDITS.md'), credits)

if (failed.length) {
  console.error(`\nโหลดไม่สำเร็จ ${failed.length} รูป: ${failed.join(', ')} — การ์ดจะตกกลับไปใช้ไล่สีแทน`)
  process.exit(1)
}
console.log(`\nครบ ${IMAGES.length} รูป → public/previews/`)
