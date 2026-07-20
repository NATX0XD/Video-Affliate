// ตัวเลือกสำหรับ wizard สร้างคลิป — ยกมาจาก extension/dashboard.js (คงค่าตรงกันเป๊ะ)
// ใช้โดยหน้า คลังสินค้า (products) → GenWizard → ส่งเข้า /api/queue/push ให้ extension ขับ Google Flow

export const GEN_CHARS = [
  { id: 'robot', name: 'บอตตี้',        tag: 'หุ่นยนต์ขี้เล่น สดใส',  hue: '#facc15', model: 'models/robot.glb', desc: 'หุ่นยนต์การ์ตูน 3D สีเหลืองน่ารัก ขี้เล่น สดใส' },
  { id: 'duck',  name: 'ก๊าบก๊าบ',      tag: 'เป็ดเหลืองสุดน่ารัก',   hue: '#fbbf24', model: 'models/duck.glb',  desc: 'เป็ดยางสีเหลืองการ์ตูน 3D น่ารัก สดใส' },
  { id: 'fox3d', name: 'ฟ็อกซ์',         tag: 'จิ้งจอกโลว์โพลี เท่',   hue: '#f97316', model: 'models/fox3d.glb', desc: 'จิ้งจอกการ์ตูน 3D โลว์โพลีน่ารัก ฉลาด ขายเก่ง' },
  { id: 'self',  name: 'ตัวละครของฉัน', tag: 'อัปรูปหรือโมเดล .glb', hue: '#a855f7', desc: '' },
]

export const GEN_STYLES = [
  { id: 'hardsell', name: 'ขายดุดัน',    desc: 'เปิดมาขายทันที พลังสูง ย้ำราคา เร่งด่วน สั่งกดตะกร้าเดี๋ยวนี้ — เปิดก็ขาย จบก็ขาย' },
  { id: 'selfie',   name: 'เซลฟี่รีวิว', desc: 'เหมือนถ่ายหน้ากล้องเอง จริงใจ เนียนเป็นรีวิวจริงไม่ใช่โฆษณา' },
  { id: 'shock',    name: 'ตกใจราคา',    desc: 'เปิดคลิปด้วยช็อตตกใจ — หยุดนิ้วคนเลื่อนฟีดใน 1 วินาทีแรก' },
  { id: 'demo',     name: 'สาธิตของ',    desc: 'โชว์ใช้งานจริงให้เห็นผลชัด แล้วปิดด้วยประโยคขายประโยคเดียว' },
]

export const GEN_AUDS = [
  { id: 'all',    name: 'ทุกคน',              desc: 'ภาษาเข้าใจง่าย เน้นความคุ้มค่า ใครดูก็อิน',      hint: 'คนทั่วไปทุกวัย — ภาษาง่าย เน้นความคุ้มค่าและประโยชน์ที่เห็นภาพทันที' },
  { id: 'teen',   name: 'วัยรุ่น Gen Z',      desc: 'จังหวะเร็ว สีจัดจ้าน ภาษาเทรนด์ พลังสูง',       hint: 'วัยรุ่น Gen Z — จังหวะเร็ว มีพลัง ใช้คำติดเทรนด์แบบธรรมชาติ สีสันจัดจ้าน ห้ามดูพยายามเป็นวัยรุ่น' },
  { id: 'worker', name: 'คนทำงาน',            desc: 'แก้ปัญหาชีวิตประจำวัน ประหยัดเวลา ดูเนี้ยบ',    hint: 'คนทำงานออฟฟิศ — เปิดด้วยปัญหาชีวิตประจำวันที่อินทันที เน้นประหยัดเวลา/สะดวก โทนเนี้ยบทันสมัย' },
  { id: 'family', name: 'แม่บ้าน & ครอบครัว', desc: 'ของใช้ในบ้าน ความคุ้ม น่าเชื่อถือ อบอุ่น',      hint: 'แม่บ้านและคนดูแลครอบครัว — เน้นความคุ้มราคา ใช้งานจริงในบ้าน ปลอดภัย โทนอบอุ่นจริงใจเหมือนเพื่อนบ้านแนะนำ' },
  { id: 'gadget', name: 'สายแกดเจ็ต',         desc: 'โชว์ฟังก์ชันเด่น ลูกเล่นเท่ๆ สเปกชัด',          hint: 'สายแกดเจ็ต/เทค — โชว์ฟังก์ชันเด็ดที่สุดให้เห็นจริง ลูกเล่นเท่ มุมกล้องไดนามิก โทนล้ำสมัย' },
  { id: 'beauty', name: 'สายบิวตี้ & สุขภาพ', desc: 'ผลลัพธ์เห็นชัด ผิวสวย ก่อน-หลัง',               hint: 'สายความงาม/สุขภาพ — เน้นผลลัพธ์ที่เห็นด้วยตา (ผิว/รูปลักษณ์ก่อน-หลัง) แสงสวยผิวโกลว์ โทนสะอาดหรู' },
]

export const GEN_BGS = [
  { id: 'studio',  name: 'สตูดิโอสว่าง',      p: 'สตูดิโอแสงสว่างสะอาดตา พื้นหลังสีพาสเทล' },
  { id: 'living',  name: 'ห้องนั่งเล่นอบอุ่น', p: 'ห้องนั่งเล่นโทนอบอุ่น แสงธรรมชาติจากหน้าต่าง บรรยากาศบ้านจริง' },
  { id: 'kitchen', name: 'ครัว',              p: 'ครัวสมัยใหม่สว่างสะอาด มีอุปกรณ์ครัวเป็นฉากหลังเบลอๆ' },
  { id: 'outdoor', name: 'กลางแจ้งแดดสวย',    p: 'กลางแจ้งแสงแดดสวยตอนเย็น โทนสดชื่นมีชีวิตชีวา' },
  { id: 'neon',    name: 'นีออนกลางคืน',      p: 'ฉากกลางคืนแสงนีออนชมพู-ฟ้า สไตล์ไวรัลทันสมัย' },
  { id: 'minimal', name: 'มินิมอลพื้นขาว',    p: 'ฉากมินิมอลพื้นหลังขาวเรียบ เงานุ่ม ดูพรีเมียม' },
]

export const GEN_MOODS = [
  { id: 'warm',     name: 'อบอุ่น',         p: 'บรรยากาศอบอุ่นเป็นกันเอง แสงนวลโทนทอง สีอุ่นสบายตา' },
  { id: 'premium',  name: 'พรีเมียมหรู',    p: 'บรรยากาศพรีเมียมหรูหรา แสงนุ่มคุมเงา โทนสีลึกสะอาด ดูมีระดับ' },
  { id: 'fun',      name: 'สนุกสดใส',       p: 'บรรยากาศสนุกสดใสมีพลัง สีจัดสว่าง จังหวะมีชีวิตชีวา' },
  { id: 'minimal',  name: 'มินิมอลสะอาด',   p: 'บรรยากาศมินิมอลสะอาดตา โทนสีเดียวเรียบ พื้นที่ว่างเยอะ เน้นสินค้าเด่น' },
  { id: 'dramatic', name: 'ดราม่าเข้ม',     p: 'บรรยากาศดราม่าคอนทราสต์สูง แสงเน้นเฉพาะจุด เงาเข้ม ดูน่าตื่นเต้น' },
]

export const GEN_SOUNDS = [
  { id: 'voice', name: 'มีเสียงพูด',    d: 'ตัวละครพูดขายเต็มเสียง มีบทพูด' },
  { id: 'mute',  name: 'ไม่มีเสียงพูด', d: 'ขายด้วยภาพ-แอ็กชัน ดูตอนปิดเสียงก็เข้าใจ' },
]

export const GEN_VOICES = [
  { id: 'bright',   name: 'สดใสกระตือรือร้น', p: 'น้ำเสียงสดใสกระตือรือร้น พลังบวก พูดชวนเชื่อ' },
  { id: 'calm',     name: 'นุ่มน่าเชื่อถือ',  p: 'น้ำเสียงนุ่มหนักแน่นน่าเชื่อถือ พูดชัดสุขุม' },
  { id: 'lux',      name: 'หรูมีระดับ',       p: 'น้ำเสียงหรูมีระดับ นุ่มลึก ดูพรีเมียม' },
  { id: 'hype',     name: 'ดุดันเร่งเร้า',    p: 'น้ำเสียงดุดันเร่งเร้า พลังสูง กระตุ้นให้รีบกด' },
  { id: 'friendly', name: 'เป็นกันเองจริงใจ', p: 'น้ำเสียงเป็นกันเองจริงใจ เหมือนเพื่อนแนะนำ' },
]

export const GEN_LANGS = [
  { id: 'th',    name: 'ไทย',           p: 'พูดภาษาไทยกลางชัดเจน' },
  { id: 'en',    name: 'อังกฤษ',        p: 'speak natural fluent English' },
  { id: 'north', name: 'คำเมือง',       p: 'พูดภาษาเหนือ (คำเมือง) เป็นธรรมชาติ' },
  { id: 'isan',  name: 'อีสาน',         p: 'พูดภาษาอีสานเป็นธรรมชาติ' },
  { id: 'mix',   name: 'ไทยปนอังกฤษ',   p: 'พูดไทยปนคำอังกฤษแบบวัยรุ่นเป็นธรรมชาติ' },
]

export const GEN_MUSICS = [
  { id: 'upbeat', name: 'อัปบีตสนุก',   p: 'เพลงอัปบีตจังหวะสนุกมีพลัง' },
  { id: 'edm',    name: 'EDM เร้าใจ',    p: 'เพลง EDM จังหวะเร้าใจ ดรอปมันส์' },
  { id: 'cute',   name: 'น่ารักสดใส',   p: 'เพลงน่ารักสดใสจังหวะเด้ง' },
  { id: 'chill',  name: 'ชิลฟังสบาย',   p: 'เพลงชิลฟังสบายโทนอุ่น' },
  { id: 'lux',    name: 'หรูมินิมอล',   p: 'เพลงโทนหรูมินิมอล เปียโน/บีตเบาๆ' },
  { id: 'none',   name: 'ไม่ใส่เพลง',   p: '' },
]

export const GEN_LENS = [
  { n: 1, t: '10 วิ', d: '1 คลิป · 1 เครดิต' },
  { n: 2, t: '20 วิ', d: '2 คลิปต่อเนียน · 2 เครดิต' },
  { n: 3, t: '30 วิ', d: '3 คลิปต่อเนียน · 3 เครดิต' },
]

export const GEN_ENGINES = [
  { id: 'i2v',   t: 'หน้าเป๊ะ',  d: 'รูปจริง→วิดีโอ (nano banana) หน้าเหมือนสุด' },
  { id: 'agent', t: 'เอเจนต์',   d: 'AI เขียนเอง · เร็ว แต่หน้าอาจเพี้ยน' },
]

export const GEN_DEFAULT = {
  charId: 'robot', engine: 'i2v', style: 'hardsell', aud: 'all', bg: 'studio',
  len: 1, mood: 'warm', sound: 'voice', voice: 'bright', lang: 'th', music: 'upbeat',
}

// ── รูปแบบสินค้า ──────────────────────────────────────────────────────────────
// desktop DB คืน flat: {id,name,price,commission,image_url,cart_link,status}
// extension pipeline คาด nested: {product_id,basic_info,links,images,commission}
// ฟังก์ชันด้านล่างรองรับทั้งสองแบบ (web อ่าน flat, ตอน push คิว map เป็น nested)

export const productUid = p => String(p.product_id || p.id || p.name || p.basic_info?.name || '')
export const hasCart    = p => !!(p.cart_link || (p.links && p.links.affiliate_link))
export const productName  = p => p.name || p.basic_info?.name || ''
export const productPrice = p => p.price ?? p.basic_info?.price ?? ''
export const productImg   = p => p.image_url || (p.images || [])[0] || (p.images_b64 || [])[0] || ''

// ดึงตัวเลข % คอมมิชชันจาก field ที่อาจเป็น number/string/dict-repr ("{'rate': 12}")
export function commissionRate(p) {
  const c = p.commission
  if (c == null) return null
  if (typeof c === 'object') return c.rate ?? null
  const m = String(c).match(/(\d+(\.\d+)?)/)
  return m ? Number(m[1]) : null
}

// map flat desktop product → nested shape ที่ extension flow pipeline อ่าน
export function toExtProduct(p) {
  if (p.basic_info) return p   // เป็น nested อยู่แล้ว
  const cart = p.cart_link || ''
  const rate = commissionRate(p)
  return {
    product_id: String(p.id || p.name || ''),
    basic_info: { name: p.name || '', price: p.price ?? '' },
    commission: rate != null ? { rate } : {},
    links: { affiliate_link: cart, product_url: cart },
    images: p.image_url ? [p.image_url] : [],
  }
}

// แปลง genOpt (เก็บเป็น id) → gen object รูปแบบเดียวกับที่ extension ส่งเข้า flow_start
// selfPhoto = dataURL รูปผู้ใช้ (เฉพาะตัวละคร 'self') ใช้เป็นภาพอ้างอิงหน้า
export function buildGen(o, selfPhoto = null) {
  const pick = (arr, id, key = 'id') => arr.find(x => x[key] === id) || arr[0]
  const ch   = pick(GEN_CHARS, o.charId)
  const aud  = pick(GEN_AUDS, o.aud)
  const bg   = pick(GEN_BGS, o.bg)
  const mood = pick(GEN_MOODS, o.mood)
  const vo   = pick(GEN_VOICES, o.voice)
  const lg   = pick(GEN_LANGS, o.lang)
  const mus  = pick(GEN_MUSICS, o.music)
  return {
    charId: o.charId, engine: o.engine || 'i2v', style: o.style, len: o.len || 1,
    charName: ch.name, charDesc: ch.desc, charModel: ch.model || null,
    snapshot: o.charId === 'self' ? (selfPhoto || null) : null,
    audName: aud.name, audHint: aud.hint,
    bgName: bg.name, bgPrompt: bg.p,
    moodName: mood.name, moodPrompt: mood.p,
    sound: o.sound,
    voiceName: vo.name, voicePrompt: vo.p,
    langName: lg.name, langPrompt: lg.p,
    musicName: mus.name, musicPrompt: mus.p,
  }
}
