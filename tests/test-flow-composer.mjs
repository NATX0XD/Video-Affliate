// ทดสอบตัวเลือกปุ่มใน flow.js กับ DOM ที่จำลองจาก dump จริงของผู้ใช้ (v3.30.0)
// ดึงโค้ดฟังก์ชันจริงออกมาจาก flow.js มารัน ไม่ได้เขียนซ้ำเอง
// รัน: node tests/test-flow-composer.mjs   (ต้องมี jsdom: npm i -g jsdom หรือ npx -p jsdom node ...)
import { readFileSync } from 'node:fs'
let JSDOM
try { ({ JSDOM } = await import('jsdom')) }
catch { console.log('ข้าม: ไม่มี jsdom ในเครื่อง (npm i jsdom แล้วรันใหม่)'); process.exit(0) }

const SRC = readFileSync(new URL('../extension/content/flow.js', import.meta.url), 'utf8')

// ตัดเฉพาะฟังก์ชันที่จะทดสอบ (ตามชื่อ ถึงวงเล็บปิดที่ระดับคอลัมน์ 2)
function grab(name) {
  const start = SRC.indexOf(`  function ${name}(`)
  if (start < 0) throw new Error('ไม่เจอฟังก์ชัน ' + name)
  const end = SRC.indexOf('\n  }\n', start)
  return SRC.slice(start, end + 4)
}
function grabConst(name) {
  const re = new RegExp(`^  const ${name} = .*$`, 'm')
  const m = SRC.match(re)
  if (!m) throw new Error('ไม่เจอ const ' + name)
  return m[0]
}

const dom = new JSDOM('<!doctype html><html><body></body></html>')
const { window } = dom
global.window = window
global.document = window.document
global.getComputedStyle = window.getComputedStyle.bind(window)

// ── สร้าง element พร้อมพิกัดตาม dump จริง ──────────────────────────────────
const rects = new WeakMap()
function el(tag, text, left, top, width, height, attrs = {}) {
  const e = window.document.createElement(tag)
  e.textContent = text
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v))
  Object.defineProperty(e, 'innerText', { get: () => e.textContent })
  rects.set(e, { left, top, width, height, right: left + width, bottom: top + height })
  e.getBoundingClientRect = () => rects.get(e)
  window.document.body.appendChild(e)
  return e
}

// แถบซ้าย (sidebar) — ต้องถูกตัดทิ้งด้วย left > 110
el('span', 'รูปภาพ', 68, 143, 69, 20)
el('button', 'image ดูรูปภาพ', 20, 133, 40, 40)
// แผงขวา = ป้ายกำกับรูปที่สร้างแล้ว — ตัวหลอกที่เคยทำ findModeBtn เลือกผิด
el('div', '🍌 Nano Banana 2', 1148, 260, 400, 16)
el('div', 'crop_free 768x1376', 1148, 278, 400, 16)
el('div', 'crop_16_9 16:9', 1148, 966, 400, 16)
// ป้ายใต้สื่อในแผงขวา — ตัวหลอกจากรันจริง v3.42.0
// มีคำว่า "รูปภาพ"/"วิดีโอ" อยู่ในข้อความ ทำให้เคยถูกนับเป็นแท็บในป๊อปอัปโหมด
// ผลคือโปรแกรมคิดว่าป๊อปอัปเปิดแล้ว เลยไม่กดปุ่มโหมด แล้วหาแท็บ "วิดีโอ" ไม่เจอครบ 5 รอบ
el('div', 'รูปภาพที่อัปโหลด', 871, 568, 200, 16)
el('div', 'ความยาววิดีโอ: 10s', 871, 592, 200, 16)
// ช่องพิมพ์ prompt
const edit = el('div', '', 488, 739, 582, 36, { contenteditable: 'true' })
// แถบเครื่องมือใต้ช่องพิมพ์
const bAdd   = el('button', 'add_2 สร้าง', 488, 780, 104, 32)
const bAgent = el('button', 'Agent', 525, 780, 60, 32, { 'aria-pressed': 'false' })
const bMode  = el('button', '🍌 Nano Banana 2 crop_9_16', 880, 779, 153, 34)
const bSend  = el('button', 'arrow_forward', 1040, 779, 34, 34)

// ── stub ของ helper ที่ฟังก์ชันเรียกใช้ ───────────────────────────────────
const all = () => [...window.document.body.children]
const isVisible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
const ctx = {
  window, document: window.document, isVisible,
  allClickable: () => all().filter((e) => e.tagName === 'BUTTON' && isVisible(e)),
  deepAll: (sel) => all().filter((e) => e.matches(sel)),
  findEditable: () => edit,
  norm: (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(),
  MODE_ALT: { 'รูปภาพ': ['รูปภาพ', 'image'], 'วิดีโอ': ['วิดีโอ', 'video'], 'เฟรม': ['เฟรม', 'frames'] },
}

const code = [grab('composerButtons'), grab('visibleTexts'), grabConst('newTextsAfter'),
              grab('findModeBtn'), grab('findModeOption'), grab('hitCheck'),
              grabConst('popupOpen'), grabConst('popupTabsShown')].join('\n')
const make = new Function(...Object.keys(ctx),
  `${code}\nreturn { composerButtons, visibleTexts, newTextsAfter, findModeBtn, findModeOption, hitCheck, popupTabsShown }`)
const F = make(...Object.values(ctx))

// ── ตรวจผล ────────────────────────────────────────────────────────────────
let fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`      ได้: ${JSON.stringify(got)}\n      ควรได้: ${JSON.stringify(want)}`)
}

const names = (list) => list.map((e) => e.innerText)

check('composerButtons เรียงตามแกน x และตัดปุ่มส่งออก',
  names(F.composerButtons()), ['add_2 สร้าง', 'Agent', '🍌 Nano Banana 2 crop_9_16'])

check('composerButtons ไม่เอา sidebar (x<110)',
  F.composerButtons().some((e) => e.getBoundingClientRect().left < 110), false)

check('composerButtons ไม่เอาป้ายแผงขวา',
  F.composerButtons().some((e) => e.getBoundingClientRect().left > 1100), false)

check('findModeBtn เลือกปุ่มในแถบ ไม่ใช่ป้ายแผงขวา',
  F.findModeBtn() === bMode, true)

check('ยังไม่เปิดเมนู → หาแท็บ วิดีโอ ไม่เจอ',
  !!F.findModeOption('วิดีโอ'), false)

check('sidebar "รูปภาพ" ที่ x=68 ไม่ถูกนับเป็นแท็บเมนู',
  !!F.findModeOption('รูปภาพ'), false)

check('ป้าย "รูปภาพที่อัปโหลด" ในแผงขวา ไม่ถูกนับเป็นแท็บ "รูปภาพ"',
  !!F.findModeOption('รูปภาพ'), false)
check('ป้าย "ความยาววิดีโอ: 10s" ไม่ถูกนับเป็นแท็บ "วิดีโอ"',
  !!F.findModeOption('วิดีโอ'), false)
check('ยังไม่ได้กดปุ่มโหมด → ต้องยังไม่ถือว่าป๊อปอัปเปิด',
  F.popupTabsShown(), false)

// จำลองเมนูโหมดเปิดขึ้นมา
const before = F.visibleTexts()
const tabVid = el('button', 'วิดีโอ', 500, 600, 90, 36, { role: 'tab' })
el('button', 'เฟรม', 600, 600, 80, 36, { role: 'tab' })

check('เมนูเปิดแล้ว → เจอแท็บ วิดีโอ', F.findModeOption('วิดีโอ') === tabVid, true)
check('newTextsAfter รายงานเฉพาะของใหม่', F.newTextsAfter(before), 'วิดีโอ | เฟรม')

// ── hitCheck: จับกรณีพิกัดคลาดเพราะ zoom ────────────────────────────────
window.document.elementFromPoint = (x, y) =>
  all().find((e) => { const r = e.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom }) || null

check('พิกัดกลางปุ่ม → ไม่เตือน', F.hitCheck(bMode, 956, 796), '')
check('พิกัดเลยไปโดนปุ่มส่ง → เตือน',
  /ไม่ใช่ปุ่มเป้าหมาย/.test(F.hitCheck(bMode, 1050, 796)), true)
check('พิกัดนอกจอ → บอกว่าไม่โดนอะไรเลย',
  /ไม่โดน element ใดเลย/.test(F.hitCheck(bMode, 5000, 5000)), true)

// ── เมนูโหมดเปิดอยู่: แท็บในเมนูต้องไม่ถูกเข้าใจผิดว่าเป็นปุ่มโหมด ──────────
// เคสจริง: แท็บ "crop_free เฟรม" กว้าง 132 · ปุ่มโหมดจริง "วิดีโอ · 720p · 10s crop_9_16" กว้าง 142
// findModeBtn เรียงตามความกว้างน้อยไปมาก → เคยเลือกแท็บเฟรมมาเป็นปุ่มโหมด
// แล้ว findModeOption ก็ตัดแท็บนั้นทิ้ง → หาตัวเลือก "เฟรม" ไม่เจอตลอด
for (const old of [...window.document.body.children]) {
  const t = old.textContent
  if (t === 'วิดีโอ' || t === 'เฟรม') old.remove()   // แท็บจำลองจากเคสก่อนหน้า ข้อความสั้นกว่า จะชนะการเรียงตามความยาว
}
rects.set(bMode, { left: 475, top: 771, width: 142, height: 34, right: 617, bottom: 805 })
bMode.textContent = 'วิดีโอ · 720p · 10s crop_9_16 x1'
rects.set(edit, { left: 72, top: 731, width: 582, height: 36, right: 654, bottom: 767 })

const tabImg   = el('button', 'image รูปภาพ',            353, 438, 132, 34, { role: 'tab' })
const tabVideo = el('button', 'videocam วิดีโอ',          485, 438, 132, 34, { role: 'tab' })
const tabFrame = el('button', 'crop_free เฟรม',           353, 476, 132, 34, { role: 'tab' })
const tabMix   = el('button', 'chrome_extension ส่วนผสม', 485, 476, 132, 34, { role: 'tab' })
const tab916   = el('button', 'crop_9_16 9:16',           353, 514, 132, 34, { role: 'tab' })

check('เมนูเปิดอยู่ → findModeBtn ยังชี้ปุ่มในแถบพิมพ์ ไม่ใช่แท็บในเมนู',
  F.findModeBtn() === bMode, true)
check('หาแท็บ "เฟรม" เจอ (ข้อความ "crop_free เฟรม")',
  F.findModeOption('เฟรม') === tabFrame, true)
check('หาแท็บ "ส่วนผสม" เจอ',   F.findModeOption('ส่วนผสม') === tabMix, true)
check('หาตัวเลือก "9:16" เจอ (ข้อความ "crop_9_16 9:16")',
  F.findModeOption('9:16') === tab916, true)
check('หาแท็บ "วิดีโอ" เจอ',    F.findModeOption('วิดีโอ') === tabVideo, true)
check('หาแท็บ "รูปภาพ" เจอ',    F.findModeOption('รูปภาพ') === tabImg, true)
check('เมนูเปิดจริง (มีทั้งรูปภาพและวิดีโอ) → ถือว่าป๊อปอัปเปิด',
  F.popupTabsShown(), true)


console.log(fail ? `\n${fail} ข้อไม่ผ่าน` : '\nผ่านทั้งหมด')
process.exit(fail ? 1 : 0)
