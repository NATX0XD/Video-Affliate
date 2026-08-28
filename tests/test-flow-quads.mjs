// ทดสอบการหาจุดกึ่งกลางของ element จาก DOM.getContentQuads (background.js)
// quad = [x1,y1, x2,y2, x3,y3, x4,y4] ตามเข็มนาฬิกา — เบราว์เซอร์เป็นคนคืนค่ามาให้
// รัน: node tests/test-flow-quads.mjs
import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8')
const m = SRC.match(/^const quadArea = [\s\S]*?;$/m)
if (!m) { console.log('ไม่เจอ quadArea ใน background.js'); process.exit(1) }
const quadArea = new Function(`${m[0]}\nreturn quadArea`)()

// จุดกึ่งกลางคำนวณแบบเดียวกับใน trustedClickNode
const center = (q) => [Math.round((q[0] + q[2] + q[4] + q[6]) / 4), Math.round((q[1] + q[3] + q[5] + q[7]) / 4)]

let fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { fail++; console.log(`FAIL  ${name}\n      ได้: ${JSON.stringify(got)}  ควรได้: ${JSON.stringify(want)}`) }
  else console.log(`PASS  ${name}`)
}

// ปุ่มโหมดจาก dump จริง: 153x34 ที่ (880,779)
const btn = [880, 779, 1033, 779, 1033, 813, 880, 813]
check('พื้นที่ปุ่ม 153x34', quadArea(btn), 153 * 34)
check('จุดกึ่งกลางปุ่ม', center(btn), [957, 796])   // (880+1033)/2 = 956.5 ปัดขึ้น

// element ที่ถูกซ่อน (กว้าง 0) ต้องถูกกรองทิ้งด้วยเงื่อนไข area > 1
check('element ที่ยุบแล้วมีพื้นที่ 0', quadArea([10, 10, 10, 10, 10, 40, 10, 40]), 0)

// quad เอียง (element ที่โดน transform: rotate) ยังคำนวณพื้นที่ได้
check('quad เอียงยังได้พื้นที่ถูก', quadArea([0, 0, 10, 10, 0, 20, -10, 10]), 200)

// หลายจุดกึ่งกลางต้องไม่ขึ้นกับ zoom — quads ที่เบราว์เซอร์คืนมาสเกลมาแล้ว
const zoomed = btn.map((v) => v * 1.5)
check('quad ที่สเกลแล้ว จุดกึ่งกลางสเกลตาม', center(zoomed), [1435, 1194])

console.log(fail ? `\n${fail} ข้อไม่ผ่าน` : '\nผ่านทั้งหมด')
process.exit(fail ? 1 : 0)
