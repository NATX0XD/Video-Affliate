// readPageTabs() — อ่านรายชื่อแท็บจากหน้า Shopee จริง (ทั้งหมด / ค่าคอมพิเศษ / สินค้าขายดี / หมวด…)
// สำคัญเพราะผู้ใช้เลือกแท็บจากลิสต์นี้ แล้วโปรแกรมไปกดแท็บนั้นให้ก่อนดูด
// ถ้าอ่านผิด = ดูดผิดแท็บ หรือลิสต์ว่างจนเลือกอะไรไม่ได้
// ดึงโค้ดจริงจาก scraper.js มารัน ไม่ได้เขียนซ้ำ
// รัน: node tests/test-scraper-tabs.mjs
import { readFileSync } from 'node:fs'
let JSDOM
try { ({ JSDOM } = await import('jsdom')) }
catch { console.log('ข้าม: ไม่มี jsdom ในเครื่อง (npm i jsdom แล้วรันใหม่)'); process.exit(0) }

const SRC = readFileSync(new URL('../extension/content/scraper.js', import.meta.url), 'utf8')
const start = SRC.indexOf('    const readPageTabs = () => {')
if (start < 0) throw new Error('ไม่เจอ readPageTabs')
const end = SRC.indexOf('\n    };\n', start)
const code = SRC.slice(start, end + 7).replace(/^\s*const readPageTabs = /, 'const readPageTabs = ')

const dom = new JSDOM('<!doctype html><html><body></body></html>')
const { window } = dom
const doc = window.document

const rects = new WeakMap()
function el(tag, text, left, top, width = 80, height = 20, parent = doc.body) {
  const e = doc.createElement(tag)
  e.textContent = text
  Object.defineProperty(e, 'innerText', { get: () => e.textContent })
  Object.defineProperty(e, 'offsetParent', { get: () => (e.closest('[data-hidden]') ? null : doc.body) })
  rects.set(e, { left, top, width, height, right: left + width, bottom: top + height })
  e.getBoundingClientRect = () => rects.get(e)
  parent.appendChild(e)
  return e
}
function box(left, top, parent = doc.body) {
  const e = doc.createElement('div')
  Object.defineProperty(e, 'offsetParent', { get: () => doc.body })
  rects.set(e, { left, top, width: 1200, height: 40, right: left + 1200, bottom: top + 40 })
  e.getBoundingClientRect = () => rects.get(e)
  parent.appendChild(e)
  return e
}

// ── หน้าจริงจากภาพผู้ใช้: เมนูซ้าย + แถวแท็บ + การ์ดสินค้า + แผงของเราเอง ──
const side = box(0, 100)
;['รายงานแสดงผล', 'ข้อเสนอ', 'ข้อเสนอ Shopee', 'แคมเปญ Affiliate'].forEach((t, i) =>
  el('div', t, 40, 130 + i * 36, 150, 20, side))

// แถวแท็บ: ห่ออีก 2 ชั้น (ทดสอบว่าไต่ขึ้นหา container เจอ)
const outer = box(270, 230)
const inner = box(270, 230, outer)
const TABS = ['ทั้งหมด', 'ค่าคอมพิเศษ', 'สินค้าขายดี', 'มือถือ และ แท็บเล็ต',
              'คอมพิวเตอร์และแล็ปท็อป', 'กีฬาและกิจกรรมกลางแจ้ง', 'เสื้อผ้าแฟชั่นผู้ชาย', 'เครื่องใช้ในบ้าน']
let x = 300
TABS.forEach(t => { el('div', t, x, 238, t.length * 12, 20, inner); x += t.length * 12 + 24 })

// การ์ดสินค้าอยู่คนละบรรทัด — ต้องไม่ถูกนับเป็นแท็บ
const grid = box(270, 300)
;['MNO.9 Tshirt T376', 'EXTRACOMM', 'เอา ลิงก์'].forEach((t, i) => el('div', t, 300 + i * 200, 560, 120, 20, grid))

// แผงของเราเอง — ต้องถูกตัดออกแม้จะอยู่บรรทัดเดียวกับแท็บ
const ours = doc.createElement('div')
ours.id = '__sc_root'
Object.defineProperty(ours, 'offsetParent', { get: () => doc.body })
rects.set(ours, { left: 1500, top: 238, width: 400, height: 600, right: 1900, bottom: 838 })
ours.getBoundingClientRect = () => rects.get(ours)
doc.body.appendChild(ours)
el('div', 'ตัวกรอง', 1520, 238, 80, 20, ours)

const make = new Function('document', `${code}\nreturn readPageTabs`)
const readPageTabs = make(doc)

let fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`      ได้: ${JSON.stringify(got)}\n      ควรได้: ${JSON.stringify(want)}`)
}

const tabs = readPageTabs()
check('อ่านแท็บได้ครบ เรียงซ้าย→ขวาตามหน้าจริง', tabs, TABS)
check('ไม่เอาเมนูซ้ายมาเป็นแท็บ', tabs.some(t => t.includes('แคมเปญ')), false)
check('ไม่เอาการ์ดสินค้าคนละบรรทัดมาเป็นแท็บ', tabs.some(t => t.includes('EXTRACOMM')), false)
check('ไม่เอาแผงของเราเองมาเป็นแท็บ', tabs.includes('ตัวกรอง'), false)

// ── จอแคบ: แถวแท็บตกบรรทัด ต้องยังได้ครบและเรียงตามที่ตาเห็น ──────────────
{
  const dom2 = new JSDOM('<!doctype html><html><body></body></html>')
  const d2 = dom2.window.document
  const r2 = new WeakMap()
  const mk = (tag, text, left, top, width, parent) => {
    const e = d2.createElement(tag)
    e.textContent = text
    Object.defineProperty(e, 'innerText', { get: () => e.textContent })
    Object.defineProperty(e, 'offsetParent', { get: () => d2.body })
    r2.set(e, { left, top, width, height: 20, right: left + width, bottom: top + 20 })
    e.getBoundingClientRect = () => r2.get(e)
    ;(parent || d2.body).appendChild(e)
    return e
  }
  const row = mk('div', '', 0, 238, 900)
  row.textContent = ''
  // บรรทัดแรก 4 แท็บ · บรรทัดสอง 4 แท็บ (จอแคบทำให้ wrap)
  const L1 = ['ทั้งหมด', 'ค่าคอมพิเศษ', 'สินค้าขายดี', 'มือถือ และ แท็บเล็ต']
  const L2 = ['คอมพิวเตอร์และแล็ปท็อป', 'กีฬาและกิจกรรมกลางแจ้ง', 'เสื้อผ้าแฟชั่นผู้ชาย', 'เครื่องใช้ในบ้าน']
  let x1 = 40; L1.forEach(t => { mk('div', t, x1, 238, t.length * 10, row); x1 += t.length * 10 + 20 })
  let x2 = 40; L2.forEach(t => { mk('div', t, x2, 276, t.length * 10, row); x2 += t.length * 10 + 20 })
  const read2 = new Function('document', `${code}\nreturn readPageTabs`)(d2)
  check('จอแคบ แท็บตกบรรทัด → ยังอ่านครบ เรียงบน→ล่าง ซ้าย→ขวา', read2(), [...L1, ...L2])
}

// ── การ์ดสินค้าที่อยู่ "ใต้แถวแท็บลงมามาก" ต้องไม่ถูกดูดเข้ามา ─────────────
{
  const dom3 = new JSDOM('<!doctype html><html><body></body></html>')
  const d3 = dom3.window.document
  const r3 = new WeakMap()
  const mk = (tag, text, left, top, width, parent) => {
    const e = d3.createElement(tag)
    e.textContent = text
    Object.defineProperty(e, 'innerText', { get: () => e.textContent })
    Object.defineProperty(e, 'offsetParent', { get: () => d3.body })
    r3.set(e, { left, top, width, height: 20, right: left + width, bottom: top + 20 })
    e.getBoundingClientRect = () => r3.get(e)
    ;(parent || d3.body).appendChild(e)
    return e
  }
  const row = mk('div', '', 0, 238, 1200)
  row.textContent = ''
  mk('div', 'ทั้งหมด', 40, 238, 70, row)
  mk('div', 'ค่าคอมพิเศษ', 130, 238, 100, row)
  mk('div', 'สินค้าขายดี', 250, 238, 100, row)
  mk('div', 'EXTRACOMM', 40, 400, 100, row)     // ห่างเกิน 3 บรรทัด — ต้องไม่ถูกนับ
  const read3 = new Function('document', `${code}\nreturn readPageTabs`)(d3)
  check('ของที่อยู่ไกลลงไปกว่า 3 บรรทัด ไม่ถูกนับเป็นแท็บ',
    read3(), ['ทั้งหมด', 'ค่าคอมพิเศษ', 'สินค้าขายดี'])
}

// หน้าที่ไม่มีแท็บ (เช่นหน้าผลค้นหา) → ต้องคืนลิสต์ว่าง ไม่ใช่เดามั่ว
;[...doc.body.querySelectorAll('div')].forEach(d => { if (d.textContent === 'ทั้งหมด') d.remove() })
check('ไม่มีแท็บ "ทั้งหมด" บนหน้า → คืนลิสต์ว่าง', readPageTabs(), [])

console.log(fail ? `\n${fail} ข้อไม่ผ่าน` : '\nผ่านทั้งหมด')
process.exit(fail ? 1 : 0)
