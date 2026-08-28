// busyReason() — ตัวที่บอกว่า "Flow ยังสร้างอยู่ไหม" และ "อะไรทำให้คิดแบบนั้น"
// สำคัญเพราะถ้ามันค้างเป็น true โปรแกรมจะรอเก้อจนดูเหมือนแฮงก์ก่อนสลับโหมดวิดีโอ
// ดึงโค้ดจริงจาก flow.js มารัน ไม่ได้เขียนซ้ำ
// รัน: node tests/test-flow-busy.mjs
import { readFileSync } from 'node:fs'
let JSDOM
try { ({ JSDOM } = await import('jsdom')) }
catch { console.log('ข้าม: ไม่มี jsdom ในเครื่อง (npm i jsdom แล้วรันใหม่)'); process.exit(0) }

const SRC = readFileSync(new URL('../extension/content/flow.js', import.meta.url), 'utf8')
const start = SRC.indexOf('  function busyReason(')
if (start < 0) throw new Error('ไม่เจอ busyReason')
const code = SRC.slice(start, SRC.indexOf('\n  }\n', start) + 4)

const dom = new JSDOM('<!doctype html><html><body></body></html>')
const { document } = dom.window

// jsdom ไม่มี layout จริง → offsetParent เป็น undefined ทุกตัว
// จำลองเอง: มองเห็น = ไม่มี attribute data-hidden (โค้ดจริงเช็ค `offsetParent !== null`)
const patch = (el) => Object.defineProperty(el, 'offsetParent',
  { get: () => (el.hasAttribute('data-hidden') ? null : document.body) })
const add = (html) => {
  document.body.innerHTML = html
  document.body.querySelectorAll('*').forEach(patch)
}
const busyReason = new Function('document', `${code}\nreturn busyReason()`)

let fail = 0
const check = (name, got, want) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`      ได้: ${JSON.stringify(got)}\n      ควรได้: ${JSON.stringify(want)}`)
}

add('<div>เสร็จแล้ว</div>')
check('หน้าว่าง ๆ = ไม่ busy', busyReason(document), '')

add('<div>ผลลัพธ์</div><span>100%</span>')
check('เรนเดอร์ครบ 100% = ไม่ busy', busyReason(document), '')

add('<span>42%</span>')
check('ยัง 42% = busy พร้อมบอกตัวเลข', busyReason(document), 'ตัวเลข 42%')

add('<div role="progressbar" class="xY7z"></div>')
check('progressbar ที่เห็นอยู่ = busy พร้อมบอก element', busyReason(document), 'div.xY7z')

add('<div role="progressbar" class="xY7z" data-hidden></div>')
check('progressbar ที่ซ่อนอยู่ ไม่นับว่า busy', busyReason(document), '')

add('<span data-hidden>30%</span>')
check('ตัวเลข % ที่ซ่อนอยู่ ไม่นับว่า busy', busyReason(document), '')

console.log(fail ? `\nไม่ผ่าน ${fail} ข้อ` : '\nผ่านทั้งหมด')
process.exit(fail ? 1 : 0)
