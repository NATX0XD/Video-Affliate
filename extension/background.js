// คลิกไอคอน extension → เปิด Side Panel ติดขวา (ศูนย์ควบคุม)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ── หมุนบัญชี Flow (authuser) ─────────────────────────────────────────────
// เติม/แทนที่ ?authuser=N ใน URL ของ labs.google เพื่อเปิด Flow ด้วยบัญชี Google ที่ระบุ
function withAuthuser(url, au) {
  if (au == null) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('authuser', String(au));
    return u.toString();
  } catch {
    const clean = String(url).replace(/([?&])authuser=\d+(&|$)/, (m, p1, p2) => (p2 === '&' ? p1 : (p1 === '?' ? '' : '')));
    return clean + (clean.includes('?') ? '&' : '?') + 'authuser=' + au;
  }
}
function tabAuthuser(url) {
  const m = String(url || '').match(/[?&]authuser=(\d+)/);
  return m ? parseInt(m[1], 10) : 0; // ไม่มี = บัญชีหลัก (authuser 0)
}
// เลือกบัญชี Flow ที่จะใช้ — สะท้อน mailNextAccount() ในหน้าเมล Flow:
// ไม่หยุดพัก, เครดิต ≥ ต่อคลิป (หรือยังไม่รู้ค่า), เอาที่เครดิตเหลือมากสุด
async function pickFlowAccount() {
  const d = await chrome.storage.local.get(['flow_accounts', 'flow_account_credits', 'flow_credit_threshold']);
  const accts = Array.isArray(d.flow_accounts) ? d.flow_accounts : [];
  if (!accts.length) return null;
  const cr = d.flow_account_credits || {};
  const PER_CLIP = 15;
  const thrRaw = Number(d.flow_credit_threshold);   // storage อาจเก็บเป็น string ("15") → coerce ก่อนเช็ก ไม่งั้นตกไปใช้ default เงียบ ๆ
  const thr = Number.isFinite(thrRaw) ? thrRaw : PER_CLIP;
  const usable = accts.filter((a) => {
    if (a.paused) return false;
    const c = cr[a.authuser];
    const v = c && Number.isFinite(c.value) ? c.value : null;
    return v == null || v >= PER_CLIP;
  });
  if (!usable.length) return null;
  // จัดอันดับ: บัญชีที่เครดิตเหนือ threshold ก่อน แล้วเรียงตามเครดิตมาก→น้อย (unknown = ถือว่าเต็ม)
  const valOf = (a) => { const c = cr[a.authuser]; return c && Number.isFinite(c.value) ? c.value : 50; };
  usable.sort((a, b) => {
    const va = valOf(a), vb = valOf(b);
    const aOk = va > thr ? 1 : 0, bOk = vb > thr ? 1 : 0;
    if (aOk !== bOk) return bOk - aOk;
    return vb - va;
  });
  return usable[0];
}
function waitTabComplete(tabId, settle = 2500, cap = 15000) {
  return new Promise((resolve) => {
    const onUpd = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpd); setTimeout(resolve, settle);
      }
    };
    chrome.tabs.onUpdated.addListener(onUpd);
    setTimeout(resolve, cap);
  });
}

// หา/เปิดแท็บ Flow ของบัญชี au — ★ labs.google สลับบัญชีได้เฉพาะตอน "เปิดแท็บใหม่" เท่านั้น
// เปลี่ยน ?authuser ในแท็บเดิมไม่สลับบัญชี (Google ผูกบัญชีไว้กับแท็บแล้ว) → ถ้าไม่มีแท็บของบัญชีนี้
// ต้องปิดแท็บ Flow บัญชีอื่นทิ้งแล้วเปิดใหม่ (โมเดลแท็บเดียว). preferProject = เลือกหน้า /project/ ก่อน
async function acquireFlowTab(url, au, preferProject) {
  const tabs = await chrome.tabs.query({ url: 'https://labs.google/fx/*' });
  const sameAu = (t) => au == null || tabAuthuser(t.url) === au;
  let tab = (preferProject ? tabs.find((t) => sameAu(t) && /\/project\//.test(t.url || '')) : null) || tabs.find(sameAu);
  if (tab) {
    try {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch {}
    return { tab, fresh: false };
  }
  // ไม่มีแท็บของบัญชีนี้ → ปิดแท็บ Flow ของบัญชีอื่นทิ้งก่อน (สลับบัญชีต้องเปิดแท็บใหม่)
  for (const t of tabs) { try { await chrome.tabs.remove(t.id); } catch {} }
  const created = await chrome.tabs.create({ url, active: true });
  return { tab: created, fresh: true };
}

// เปิด/โฟกัสแท็บ Flow ให้อัตโนมัติ แล้วรันคิว Flow บนแท็บนั้น
// authuserOverride: ระบุบัญชีตรงๆ (จากปุ่ม "เปิด Flow" ในหน้าเมล) — ไม่ระบุ = ให้ระบบเลือกเอง
async function openFlowAndRun(dry = false, authuserOverride = null) {
  // เลือกบัญชี Flow (authuser) ที่จะใช้ — ระบุเอง > ระบบเลือกตามเครดิต > บัญชีหลัก
  let au = authuserOverride;
  if (au == null) { const acc = await pickFlowAccount(); au = acc ? acc.authuser : null; }
  // เปิดหน้า project ที่เคยมีช่องแชต (flow.js จำไว้) — ★ ต้องเป็นโปรเจกต์ของบัญชีนั้นเองเท่านั้น
  // ห้ามใช้ flow_project_url รวมข้ามบัญชี ไม่งั้นเปิดโปรเจกต์ที่บัญชีนี้ไม่มีสิทธิ์ → "เกิดข้อผิดพลาด"
  const BASE_FLOW = 'https://labs.google/fx/th/tools/flow';
  const saved = await chrome.storage.local.get(['flow_project_url', 'flow_project_urls']);
  let FLOW_URL;
  if (au != null) {
    const perAu = saved.flow_project_urls ? saved.flow_project_urls[au] : null;
    FLOW_URL = withAuthuser(perAu || BASE_FLOW, au);   // ไม่รู้โปรเจกต์ของบัญชีนี้ → หน้า tools เปล่า
  } else {
    FLOW_URL = saved.flow_project_url || BASE_FLOW;     // โหมดบัญชีเดียว (เดิม) ใช้ค่ารวมได้
  }
  // บอก flow.js ว่าตอนนี้ทำงานบนบัญชีไหน → ผูกเครดิต/โปรเจกต์ให้ถูกบัญชี
  try { await chrome.storage.local.set({ flow_active_authuser: au }); } catch {}
  // หา/เปิดแท็บ Flow ของบัญชีนี้ — ถ้าต้องสลับบัญชีจะปิดแท็บเก่าเปิดใหม่ (ดู acquireFlowTab)
  // ★ ต้อง active:true — แท็บเบื้องหลัง SPA ไม่เรนเดอร์เต็ม element offsetParent=null flow.js หาช่องพิมพ์ไม่เจอ
  const acq = await acquireFlowTab(FLOW_URL, au, true);
  let tab = acq.tab;
  if (acq.fresh) await waitTabComplete(tab.id, 2500);
  // ★ โฟกัสแท็บ Flow ให้เห็นจริง (active + focus window) — จำเป็นต่อการเรนเดอร์ของ SPA
  try {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    await new Promise((r) => setTimeout(r, 500));
  } catch {}
  // ★ เช็คว่า flow.js ยังตอบไหม (ping) — ถ้าไม่ (เช่นหลัง reload extension) ให้ reload แท็บ
  const alive = await new Promise((r) =>
    chrome.tabs.sendMessage(tab.id, { action: 'flow_ping' }, (res) => r(!chrome.runtime.lastError && !!res)));
  if (!alive) {
    await chrome.tabs.reload(tab.id);
    await new Promise((resolve) => {
      const onUpd = (id, info) => {
        if (id === tab.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(onUpd); setTimeout(resolve, 3000); }
      };
      chrome.tabs.onUpdated.addListener(onUpd);
      setTimeout(resolve, 15000);
    });
  }
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { action: 'flow_run_queue', dry }, (res) => {
      if (chrome.runtime.lastError) return resolve({ ok: false, error: 'flow.js ไม่ตอบ — ลองรีเฟรชแท็บ Flow เอง: ' + chrome.runtime.lastError.message });
      resolve(res || { ok: true });
    });
  });
}

// ── base URL ของ desktop — เคารพพอร์ตที่ผู้ใช้ตั้งใน Dashboard (panel_settings.port) ──
// ห้าม hardcode :3001 ตรงๆ — sidepanel/dashboard อ่านพอร์ตจาก settings อยู่แล้ว ต้องตรงกัน
let _portCache = '3001', _portAt = 0;
async function apiBase() {
  if (Date.now() - _portAt > 10000) {
    try {
      const d = await chrome.storage.local.get('panel_settings');
      _portCache = (d.panel_settings && d.panel_settings.port) || '3001';
    } catch {}
    _portAt = Date.now();
  }
  return `http://localhost:${_portCache}`;
}

// ── mirror สินค้าไป desktop (G3) — additive อย่างเดียว ─────────────────────
// แปลง product ทรงซ้อน (basic_info/commission/links/images) จาก scraper → flat dict
// ที่ตาราง products ใน SQLite รับ (name/price/commission/image_url/cart_link/source).
// dedup ฝั่ง desktop ใช้ cart_link → ใช้ affiliate_link ก่อน ไม่มีค่อย product_url (คงที่ต่อสินค้า).
function mapProductForDesktop(p) {
  const bi = (p && p.basic_info) || {};
  const links = (p && p.links) || {};
  const rate = p && p.commission && p.commission.rate != null ? p.commission.rate : '';
  return {
    name: bi.name || '',
    price: bi.price != null ? String(bi.price) : '',
    commission: rate === '' ? '' : String(rate),
    image_url: (p && p.images && p.images[0]) || '',
    cart_link: links.affiliate_link || links.product_url || '',
    source: 'shopee',
  };
}
// ยิงไป POST {apiBase}/api/products แบบ fire-and-forget — เงียบเสมอถ้า desktop ปิด
// (chrome.storage ยังเป็นแหล่งข้อมูลหลัก ไม่พังถ้ายิงไม่ได้). service worker fetch localhost ได้ตรง.
async function postProductsToDesktop(products) {
  if (!products || !products.length) return;
  try {
    const base = await apiBase();
    await fetch(`${base}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: products.map(mapProductForDesktop) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    // desktop อาจไม่เปิด/พอร์ตไม่ตรง — ไม่รบกวน flow เดิม (products ยังอยู่ครบใน chrome.storage)
  }
}

// ── broadcast ไปหน้า extension (sidepanel/dashboard) แบบไม่พ่น error ──
// ถ้าไม่มีหน้าไหนเปิดรับ sendMessage จะ reject "Receiving end does not exist"
// ซึ่ง try/catch จับไม่ได้ (เป็น promise) — ใช้ callback + แตะ lastError แทน
function notifyPages(msg) {
  try { chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError); } catch {}
}

// ── error ledger — เก็บ 50 รายการล่าสุดให้ Dashboard ดูย้อนหลัง + แจ้ง monitor สด ──
async function reportError(where, message) {
  try {
    const d = await chrome.storage.local.get('error_log');
    const log = d.error_log || [];
    log.unshift({ where, message: String(message), at: Date.now() });
    await chrome.storage.local.set({ error_log: log.slice(0, 50) });
  } catch {}
  notifyPages({ action: 'flow_log', msg: `[ผิดพลาด:${where}] ${message}` });
}

// ── สร้าง prompt ฝั่ง extension (desktop = post-only ไม่ยุ่งกับการสร้างคลิป) ──
// ดึง key + ค่าตั้งจาก desktop (localhost เท่านั้น) → key อยู่ใน service worker ไม่หลุดเข้าหน้าเว็บ
let _flowCfg = null, _flowCfgAt = 0;
// เครดิต/โควต้า Gemini หมดในรอบนี้ → กันยิงซ้ำทั้ง batch (รีเซ็ตตอน flow_start รอบใหม่)
let geminiBlocked = null;
// อาการ "เรียกไปก็พังเหมือนเดิม": เครดิตหมด/quota เกิน/rate-limit/billing
const isQuotaError = (m) => /quota|exceeded your current quota|RESOURCE_EXHAUSTED|credits? (are )?depleted|prepayment|billing|rate.?limit|limit:\s*0/i.test(String(m || ''));
async function getFlowConfig(force = false) {
  if (!force && _flowCfg && Date.now() - _flowCfgAt < 30000) return _flowCfg;
  const r = await fetch(`${await apiBase()}/api/flow/config`, { signal: AbortSignal.timeout(5000) })
    .then((x) => x.json()).catch(() => null);
  if (r && r.ok) { _flowCfg = r; _flowCfgAt = Date.now(); }
  return _flowCfg;
}
function fillVars(t, v) {
  return Object.keys(v).reduce((s, k) => s.split(k).join(v[k] == null ? '' : v[k]), t || '');
}

// ── ตัวละคร + สไตล์ จาก modal "ตั้งค่าก่อนสร้าง" (dashboard ส่งมากับ flow_start) ──
const CHAR_META = {
  robot: { name: 'บอตตี้', desc: 'หุ่นยนต์การ์ตูน 3D สีเหลืองน่ารัก ขี้เล่น สดใส' },
  duck: { name: 'ก๊าบก๊าบ', desc: 'เป็ดยางสีเหลืองการ์ตูน 3D น่ารัก สดใส' },
  fox3d: { name: 'ฟ็อกซ์', desc: 'จิ้งจอกการ์ตูน 3D โลว์โพลีน่ารัก ฉลาด ขายเก่ง' },
};
// who = ประโยคบรรยายผู้รีวิว (มีรูปอ้างอิง → บังคับคงหน้า), name/price จากสินค้า
const STYLE_TMPL = {
  selfie: (who, name, price) =>
    `วิดีโอแนวตั้ง 9:16 ยาว 10 วินาที ช็อตเดียวต่อเนื่อง สไตล์เซลฟี่ถือกล้องเอง กล้องสั่นเล็กน้อยแบบธรรมชาติ — เปิดวินาทีแรก ${who}โผล่เข้าเฟรมยิ้มกว้างทักกล้อง แล้วยก${name} (ตามรูปสินค้าที่แนบ) ขึ้นโชว์ใกล้กล้อง สีหน้าตื่นเต้นจริงใจ พูดภาษาไทยเสียงชัดว่า "บอกเลยตัวนี้ดีจริง ราคาแค่ ${price} บาทเอง คุ้มมาก!" วินาทีสุดท้ายยิ้มมองกล้องแล้วชี้ลงด้านล่างชวนกดตะกร้า ค้างท่าให้คลิปจบสมบูรณ์ แสงธรรมชาติ โทนอบอุ่นเหมือนรีวิวจริง ไม่ใช่โฆษณา — ไม่มีซับไตเติล ไม่มีตัวหนังสือ ไม่มีโลโก้ ไม่มีการตัดฉาก`,
  shock: (who, name, price) =>
    `วิดีโอแนวตั้ง 9:16 ยาว 10 วินาที ช็อตเดียวต่อเนื่อง คุณภาพระดับโฆษณา — เปิดวินาทีแรก ${who}ทำสีหน้าตกใจมองกล้อง พูดภาษาไทยว่า "เดี๋ยวนะ... อันนี้ราคา ${price} บาทเองเหรอ?!" แล้วยก${name} (ตามรูปสินค้าที่แนบ) ขึ้นโชว์ใกล้กล้อง ยิ้มกว้าง กล้องซูมเข้ามีไดนามิก วินาทีสุดท้ายชูสินค้านิ่งเด่นกลางเฟรมพร้อมยิ้มมองกล้องค้างไว้ ให้คลิปจบสมบูรณ์ แสงสวยคมชัด สีจัดจ้าน สไตล์คอนเทนต์ไวรัล — ไม่มีซับไตเติล ไม่มีตัวหนังสือ ไม่มีโลโก้ ไม่มีการตัดฉาก`,
  demo: (who, name, price) =>
    `วิดีโอแนวตั้ง 9:16 ยาว 10 วินาที ช็อตเดียวต่อเนื่อง กล้องตั้งนิ่ง — เปิดวินาทีแรก ${who}หยิบ${name} (ตามรูปสินค้าที่แนบ) เข้าเฟรมอย่างมีจังหวะ สาธิตการใช้ให้เห็นผลจริง 1 อย่างชัดเจน แล้วหันมามองกล้องพูดภาษาไทยว่า "ของมันต้องมี ${price} บาทเอง คุ้มสุดๆ" วินาทีสุดท้ายวางสินค้าเด่นกลางเฟรม พยักหน้ายิ้มให้กล้องค้างไว้ ให้คลิปจบสมบูรณ์ แสงสว่างคมชัด ฉากเรียบสะอาด เหมือนรีวิวจริง — ไม่มีซับไตเติล ไม่มีตัวหนังสือ ไม่มีโลโก้ ไม่มีการตัดฉาก`,
  hardsell: (who, name, price) =>
    `วิดีโอแนวตั้ง 9:16 ยาว 10 วินาที ช็อตเดียวต่อเนื่อง คุณภาพระดับโฆษณา จังหวะเร็วมีพลัง — เปิดวินาทีแรก ${who}พุ่งเข้าหากล้องชู${name} (ตามรูปสินค้าที่แนบ) พูดภาษาไทยเสียงดังมั่นใจว่า "หยุดก่อน! ของมันต้องมี!" แล้วโชว์จุดเด่นสินค้าเร็วๆ ย้ำว่า "คุ้มสุด ราคาแค่ ${price} บาท ของใกล้หมดแล้ว!" วินาทีสุดท้ายชี้ลงด้านล่างสั่ง "กดตะกร้าเลยตอนนี้!" พร้อมชูสินค้านิ่งกลางเฟรม สีหน้าเด็ดขาดค้างไว้ ให้คลิปจบสมบูรณ์ แสงสว่างจัดจ้านมีพลัง — ไม่มีซับไตเติล ไม่มีตัวหนังสือ ไม่มีโลโก้ ไม่มีการตัดฉาก`,
};
function describeWho(gen, hasCharImage) {
  if (hasCharImage) {
    const desc = gen && gen.charDesc ? `${gen.charDesc} — ` : '';
    // ครอบทั้งคนจริงและตัวการ์ตูน/มาสคอต — สั่งคงดีไซน์ ไม่ใช่แค่ใบหน้า
    return `ตัวละครจากรูปอ้างอิงที่แนบมา (${desc}คงหน้าตา ดีไซน์ สี และสัดส่วนให้ตรงกับรูปอ้างอิงทุกประการ ห้ามเปลี่ยนเป็นตัวอื่น) `;
  }
  return `${(gen && gen.charDesc) || 'คนไทยหน้าตาดี บุคลิกสดใสมีเสน่ห์'} `;
}
async function productImageB64(product) {
  const b = (product.images_b64 || [])[0];
  if (b && b.startsWith('data:')) return b.split(',')[1];
  let url = (product.images || [])[0] || '';
  url = url.replace(/@resize_[^/?#]*/i, '').replace(/_tn(?=$|[?#.])/i, '');   // → hi-res
  if (!url.startsWith('http')) return null;
  try {
    const blob = await fetch(url, { headers: { Referer: 'https://shopee.co.th/' } }).then((r) => r.blob());
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1]);
      fr.onerror = () => res(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}
async function geminiFlowPrompt(product, cfg, gen, hasCharImage, charImg, i2v = false) {
  const bi = product.basic_info || {};
  const name = bi.name || 'สินค้า Shopee', price = bi.price ?? '', sold = bi.sold_count ?? '';
  const bg = cfg.background || 'สตูดิโอ', pers = cfg.personality || 'สนุกสนาน';
  // เอกลักษณ์บังคับต่อสไตล์ — แต่ละสไตล์ต้องออกมา "ต่างกันชัด" ทั้งการเปิด/กล้อง/จังหวะ/บทพูด/โฟกัส
  const STYLE_SPEC = {
    hardsell: {
      name: 'ขายดุดัน',
      open: 'เฟรมแรกตัวละครพุ่งเข้าหากล้อง (fast push-in) พลังเต็มร้อยทันที โยนฮุกสะกิดสั้นที่สุดให้สะดุด',
      camera: 'กล้องบุกเข้าเร็วแบบ snap push-in ระยะ close-up จี้หน้า/สินค้า มีแรงกระแทก',
      pacing: 'เร็วสุด กระชับ ทุกวินาทีมีของ ไม่มีจังหวะพักเลย',
      dialogue: 'ประโยคสั้นกระแทก เสียงดังมั่นใจ ย้ำราคา+ความเร่งด่วนซ้ำ สั่งกดตะกร้าตรงๆ แบบไม่อ้อม',
      focus: 'พลังของคนขาย + สินค้า เด่นพร้อมกัน',
    },
    selfie: {
      name: 'เซลฟี่รีวิว',
      open: 'เฟรมแรกถือกล้องเซลฟี่เอง (แขนยื่นถือ) ตัวละครยิ้มทักทายเป็นกันเองเหมือนคุยกับเพื่อน',
      camera: 'มุมเซลฟี่แขนเดียว กล้องสั่นเล็กน้อยตามธรรมชาติ ระยะใกล้แบบถือมือ ไม่เนี้ยบเกินจนดูเป็นโฆษณา',
      pacing: 'สบายๆ เป็นธรรมชาติ เหมือนเล่าให้เพื่อนฟัง ไม่เร่ง',
      dialogue: 'พูดคุยจริงใจเป็นกันเอง เล่าความรู้สึก/ประสบการณ์จริง ไม่ขายโจ่งแจ้ง ปิดท้ายชวนแบบเพื่อนแนะนำ',
      focus: 'ใบหน้า+อารมณ์จริงของผู้รีวิวเป็นหลัก สินค้าถือใกล้กล้อง',
    },
    shock: {
      name: 'ตกใจราคา',
      open: 'เฟรมแรกตัวละครทำสีหน้าตกใจ/อึ้งเกินจริง (double-take) มองกล้องค้าง ทวนราคาแบบไม่อยากเชื่อ',
      camera: 'snap zoom เข้าหน้าตอนตกใจ แล้วค่อยเผยสินค้า มีจังหวะหยุด-ค้าง-แล้วระเบิด',
      pacing: 'จังหวะ "ค้าง/เงียบสั้น แล้วพุ่ง" สร้าง suspense นิดก่อนเฉลยความคุ้ม',
      dialogue: 'เปิดด้วยอุทานตกใจราคา แล้วเฉลยว่าทำไมคุ้มขนาดนี้ ปิดด้วยรีบกดก่อนหมด',
      focus: 'สีหน้าตกใจ = ฮุก แล้วดึงสายตามาที่ราคา/สินค้า',
    },
    demo: {
      name: 'สาธิตของ',
      open: 'เฟรมแรกมือกำลังหยิบ/เริ่มใช้สินค้าอยู่แล้ว (อยู่กลางการสาธิต) ไม่ทักทาย ไม่เกริ่น',
      camera: 'กล้องตั้งนิ่งบนขาตั้ง (locked) ระยะกลาง-ใกล้จับที่สินค้า/มือ อาจมุมก้มดูการใช้งาน',
      pacing: 'เป็นขั้นตอนชัดเจน ใจเย็น เน้นให้เห็น "ผลลัพธ์" 1 อย่างเต็มตา',
      dialogue: 'พูดน้อย ปล่อยให้ภาพสาธิตเล่า บรรยายผลที่เห็น แล้วปิดด้วยประโยคขายสั้นประโยคเดียวตอนจบ',
      focus: 'สินค้ากำลังทำงาน/ผลลัพธ์เป็นพระเอก ใบหน้าเป็นรอง',
    },
  };
  const dur = (gen && gen.len > 1) ? gen.len * 10 : 10;
  const whoLine = hasCharImage
    ? `"ตัวละครตามรูปที่สองที่แนบมา" — ดูรูปที่สองแล้วบรรยายเพศ/อายุ/หน้าตา/ทรงผม/เสื้อผ้า ให้ตรงกับรูปนั้นเป๊ะ ${(gen && gen.charDesc) ? `(ข้อมูลเสริม: ${gen.charDesc}) ` : ''}ห้ามเดาหรือสมมติเพศเอง ถ้ารูปเป็นผู้หญิงต้องเป็นผู้หญิง ถ้าเป็นผู้ชายต้องเป็นผู้ชาย ห้ามสลับเพศเด็ดขาด ห้ามเปลี่ยนเป็นคนอื่น`
    : `${(gen && gen.charDesc) || 'คนไทย 1 คน หน้าตาดีมีเสน่ห์ บุคลิกสดใสมีพลัง'}`;
  const sspec = (gen && STYLE_SPEC[gen.style]) || null;
  const styleHint = sspec ? `${sspec.name} — ${sspec.open}` : 'รีวิวจริงใจ น่าเชื่อถือ';
  // บล็อกบังคับเอกลักษณ์สไตล์ → ฉีดเข้า prompt ให้แต่ละสไตล์ออกมาต่างกันชัด (ไม่ใช่แค่ hint บรรทัดเดียว)
  const styleDirective = sspec ? `เอกลักษณ์สไตล์ "${sspec.name}" (บังคับ — คลิปสไตล์นี้ต้องดูต่างจากสไตล์อื่นทันทีที่เห็น สะท้อนลงทุก field ที่เกี่ยวข้อง):
  • การเปิดคลิป (ช่วงฮุก): ${sspec.open}
  • ภาษากล้อง/ช็อต: ${sspec.camera}
  • จังหวะ (pacing): ${sspec.pacing}
  • โทน/โครงบทพูด: ${sspec.dialogue}
  • โฟกัสภาพ: ${sspec.focus}` : '';
  // ── creative cockpit → ตัวแปรที่ฝังลง prompt (เคารพค่าที่ผู้ใช้เลือกก่อนสร้าง) ──
  const mute = !!(gen && gen.sound === 'mute');                 // ไม่มีเสียงพูด = ขายด้วยภาพ
  const moodLine = (gen && gen.moodPrompt) || '';
  const voiceLine = (gen && gen.voicePrompt) || '';
  const langLine = (gen && gen.langPrompt) || 'พูดภาษาไทยกลางชัดเจน';
  const langName = (gen && gen.langName) || 'ไทย';
  const musicLine = (gen && gen.musicPrompt) || '';
  const noMusic = !!(gen && gen.musicName === 'ไม่ใส่เพลง');
  // ── งบเวลา: สงวนหางคลิป ~1.5 วิ เป็นภาพปิดเงียบ บทพูดต้องจบในหน้าต่างพูดจริงเท่านั้น (กันจบค้างกลางคำ) ──
  const tailSec = 1.5;                                          // ช่วงท้ายเงียบล้วน (FREEZE) ปิดสวย
  const speakEnd = Math.max(2, +(dur - tailSec).toFixed(1));    // วินาทีที่บทพูดต้องจบ
  const words = Math.round((dur - tailSec) * 2.2);              // งบคำพูดจริง (ไทย ~2.2 คำ/วิ ในหน้าต่างพูด ไม่ใช่ทั้งคลิป)
  const fmtT = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1)); // 5→"5", 8.5→"8.5"
  const hookEnd = Math.min(1.5, +(speakEnd / 2).toFixed(1));    // HOOK สั้นกระชับ เฟรมแรกอยู่กลางแอ็กชัน
  const midT = +(hookEnd + (speakEnd - hookEnd) / 2).toFixed(1);// รอยต่อ โชว์ของ → ปิดการขาย
  // บทพูด: สูตรขาย 3 จังหวะ H-V-C + คลังฮุก 5 แบบ (โหมดเงียบ = ปล่อยว่าง)
  const dialogueSpec = mute
    ? '""'
    : `"<บทพูด${langName !== 'ไทย' ? `${langName} (${langLine})` : 'ไทย'} พูดจริงได้แค่ ~${words} คำ และต้องพูดจบภายใน ${fmtT(speakEnd)} วิ (เหลือท้าย ~${fmtT(tailSec)} วิ เป็นภาพปิดเงียบ ห้ามมีคำพูด) — ใช้สูตรขาย 3 จังหวะ H-V-C: [HOOK เลือก 1 ฮุกที่เข้ากับสินค้าตัวนี้สุด จาก: ปัญหาแหย่ใจ('เบื่อไหม...')/ตัวเลขช็อก/คำสั่งหยุด('หยุดเลื่อน!')/ผลลัพธ์เกินคาด/คำถามกระตุก('รู้ไหมว่า...') — ต้องสะดุดใน 1 วิแรก] + [VALUE จุดขายเด็ดสุด 'จุดเดียว' พูดเป็นประโยชน์ที่เห็นภาพได้ ไม่ใช่สเปกเทคนิค (พูดผลลัพธ์ที่ผู้ใช้ได้ ไม่ใช่ตัวเลขสเปก) + ราคา ${price} บาท] + [CLOSE ความคุ้มแบบเทียบของถูกๆ + คำเร่งด่วน(ก่อนหมด/เฉพาะวันนี้) + สั่งกดตะกร้าตรงๆ] — ห้ามเกริ่นยาว ห้ามอ่านสรรพคุณเป็นลิสต์ ห้ามเคลมเกินจริง(ขาวใน X วัน/รักษา/100%) บทพูดต้องจบไม่เกิน ${fmtT(speakEnd)} วิ ห้ามค้างกลางคำตอนคลิปจบ>"`;
  const voiceSpec = mute
    ? '"ไม่มีเสียงพูดในคลิปนี้"'
    : `"<โทนเสียงพูด${voiceLine ? ': ' + voiceLine : ''} — เพศต้องตรงกับตัวละครในรูปที่สอง (ผู้หญิง=เสียงผู้หญิง ผู้ชาย=เสียงผู้ชาย) ระบุอารมณ์/ความเร็ว ลิปซิงค์แม่น>"`;
  const musicSpec = noMusic
    ? '"ไม่ใส่เพลงประกอบ — ใช้เสียงบรรยากาศ/เอฟเฟกต์แทน"'
    : `"<${musicLine || 'เพลงประกอบเร้าใจ ~120bpm'} เล่นคลอตลอดทั้งคลิป ${mute ? 'เป็นเสียงนำหลักเพราะไม่มีเสียงพูด ดังเต็มที่' : 'ดังพอเร้าอารมณ์แต่ไม่กลบเสียงพูด'} ไต่ขึ้นช่วงปิดการขาย แล้วจบลงพอดีตอน ending_freeze>"`;
  const mixSpec = mute
    ? '"ไม่มีเสียงพูด — เพลง/เอฟเฟกต์เป็นเสียงหลักของคลิป"'
    : '"เสียงพูดอยู่บนสุดได้ยินชัดเสมอ เพลงคลออยู่ใต้เสียงพูด"';
  // ── ให้ Gemini "ละเลง" ออกมาเป็น JSON prompt ละเอียด (Veo อ่าน structured ได้แม่นกว่า paragraph) ──
  const instrFull = `คุณคือผู้กำกับโฆษณาวิดีโอสั้นระดับโลก + ผู้เชี่ยวชาญ prompt engineering สำหรับ Veo 3
ภารกิจ: ออกแบบคลิปขายของ ${dur} วินาที ที่หยุดนิ้วคนเลื่อนฟีดตั้งแต่วินาทีแรก แล้วส่งออกมาเป็น JSON prompt ที่ "ละเอียดที่สุด" เพื่อป้อนเข้า Veo โดยตรง — จงละเลงความคิดสร้างสรรค์เต็มที่ คิด hook และมุกขายที่เฉพาะสินค้าตัวนี้ ห้ามจืด ห้ามกลางๆ ห้ามใช้สูตรสำเร็จ

ข้อมูล:
- ${hasCharImage ? 'รูปแนบ 2 รูป: รูปแรก = สินค้าจริง / รูปที่สอง = ตัวละครผู้รีวิว (ห้ามสลับหรือผสมสองรูป) — สำคัญ: ดูเพศของตัวละครจากรูปที่สองให้ชัดก่อนเขียน ทุก field ที่พูดถึงตัวละคร (description/performance/voice) ต้องเป็นเพศเดียวกับรูปที่สอง ห้ามสลับเพศ' : 'รูปแนบ 1 รูป = สินค้าจริง'}
- สินค้า: ${name} | ราคา: ${price} บาท | ขายแล้ว: ${sold}
- ตัวละครผู้รีวิว: ${whoLine}
- แนวคลิป: ${styleHint}
${styleDirective}
${gen && gen.audHint ? `- กลุ่มเป้าหมาย: ${gen.audName} — ${gen.audHint} (hook/บทพูด/โทนภาพต้องคุยกับคนกลุ่มนี้โดยตรง)` : ''}
- ฉาก: ${gen && gen.bgPrompt ? gen.bgPrompt : `${bg} อารมณ์${pers}`}
${moodLine ? `- บรรยากาศ/อารมณ์ภาพรวม: ${moodLine} — สะท้อนลง lighting + color_grade ให้เป็นโทนเดียวกันทั้งคลิป` : ''}
${mute
  ? '- โหมดเสียง: "ไม่มีเสียงพูด" — ตัวละครห้ามพูด/ห้ามขยับปากพูด ขายด้วยภาพ+แอ็กชัน+การสาธิตล้วน ต้องเข้าใจได้แม้ปิดเสียง เน้นการเคลื่อนไหวที่เล่าเรื่องและจังหวะเพลง'
  : `- ภาษาบทพูด: ${langLine}${voiceLine ? ` | น้ำเสียง: ${voiceLine}` : ''}`}
${musicLine ? `- แนวเพลงประกอบ: ${musicLine}` : (noMusic ? '- ไม่ใส่เพลงประกอบ (ใช้เสียงบรรยากาศ/เอฟเฟกต์แทน)' : '')}
${gen && gen.len > 1 ? `- ความยาว ${dur} วินาที = ${gen.len} คลิปต่อเนื่องกัน คลิปละ 10 วินาที: ใน timeline ให้ระบุรอยต่อว่า "ท้ายช่วงก่อนค้างท่าไหน ช่วงถัดไปเริ่มจากท่านั้นเป๊ะ" กันภาพกระโดด ฉาก/ตัวละคร/แสงเดิมทั้งคลิป` : ''}

ส่งออกเป็น JSON ตาม schema นี้เป๊ะ (ภาษาไทยในทุก value, ละเอียดทุก field):
{
  "video_spec": {"duration_sec": ${dur}, "aspect_ratio": "9:16", "look": "<สไตล์ภาพละเอียด>", "pacing": "<จังหวะ — ถ้าเร็วให้ใช้การเคลื่อนกล้อง/แอ็กชันต่อเนื่อง ห้ามใช้คำว่าตัดต่อ/ตัดสลับ เพราะต้องเป็นช็อตเดียวยาว>", "motion_intensity": "<ความแรงการเคลื่อนไหวรวม (low/medium) — ช่วงโชว์สินค้าให้ low หมุนช้านิ่ง เพราะยิ่งภาพขยับแรง Veo ยิ่งวาดสินค้า/มือเพี้ยน>", "color_grade": "<โทนสีที่ใช้ทั้งคลิป เช่น clean commercial อุ่นเล็กน้อย คมชัด — white balance ต้องสม่ำเสมอทุกช่วง ไม่สีเพี้ยนสลับช็อต>"},
  "character": {"source": "${hasCharImage ? 'รูปที่สอง' : '-'}", "description": "<บรรยายตัวละครให้ตรงรูปอ้างอิง: เพศ อายุ หน้าตา ทรงผม เสื้อผ้า>", "performance": "<micro-expressions กระพริบตาธรรมชาติ อารมณ์จริง ไม่นิ่งเป็นหุ่น>", "face_lock": "หน้าเดียวกันเป๊ะตามรูปอ้างอิงทุกเฟรม ห้ามมอร์ฟ/สลับ แม้ตอนหันหน้า"},
  "product": {"source": "${hasCharImage ? 'รูปแรก' : 'รูปที่แนบ'}", "name": "${name}", "appearance": "<รูปทรง/สีสินค้าตามรูปจริง>", "lock": "ห้ามเปลี่ยนเป็นของอื่น ห้ามแต่งกล่อง/ฉลากเพิ่ม"},
  "scene": "<ฉากหลังละเอียด>",
  "lighting": "<แสง+วัสดุละเอียด — ระบุทิศแสง (เช่น soft key 45°), rim light, และ specular highlight บนผิวสินค้าให้ดูเป็นวัสดุจริง (พลาสติก/โลหะสะท้อนถูกต้อง) สีสินค้า true-to-life>",
  "timeline": [
    {"time": "0-${fmtT(hookEnd)}s", "beat": "HOOK (เปิดทันที)", "action": "<แอ็กชันตัวละคร — เฟรมแรก (0s) ต้องอยู่กลางแอ็กชันแล้ว ห้าม fade-in/establishing/intro>", "shot": "<ระยะช็อต+เลนส์ เช่น medium close-up, 85mm>", "camera": "<การเคลื่อนกล้องเจาะจง เช่น fast push-in, gimbal นิ่งไม่สั่น>", "emotion": "<อารมณ์/สีหน้าที่สะดุดตาทันที>"},
    {"time": "${fmtT(hookEnd)}-${fmtT(midT)}s", "beat": "โชว์ของ + จุดขายเด็ด", "action": "<...>", "shot": "<...>", "camera": "<...>", "emotion": "<...>"},
    {"time": "${fmtT(midT)}-${fmtT(speakEnd)}s", "beat": "ปิดการขาย — ราคา+เร่งด่วน+สั่งกดตะกร้า (บทพูดจบที่นี่)", "action": "<สั่งกดตะกร้า ชูสินค้านิ่งกลางเฟรม/ชี้ลง — บทพูดต้องจบภายในช่วงนี้>", "shot": "<...>", "camera": "<...>", "emotion": "<...>"},
    {"time": "${fmtT(speakEnd)}-${fmtT(dur)}s", "beat": "FREEZE ปิดสวย (เงียบล้วน ไม่มีคำพูด)", "action": "<ท่า hero ค้าง สินค้ากลางเฟรม มี micro-motion เบา ๆ ไม่ตัดห้วน>", "shot": "<hero framing สินค้าเด่นกลางเฟรม>", "camera": "<นิ่ง หรือ push-in ช้ามาก>", "emotion": "<ยิ้มมั่นใจค้างไว้>"}
  ],
  "dialogue_th": ${dialogueSpec},
  "audio": {"music": ${musicSpec}, "sfx": "<เสียงเอฟเฟกต์เฉพาะจุด เช่น whoosh ตอน push-in, ปุ๊งตอนชูสินค้า, และเสียงจริงของสินค้าที่กระตุ้นความอยาก (เช่นเสียงเทของเหลว/เสียงสัมผัสวัสดุ)>", "voice": ${voiceSpec}, "mix": ${mixSpec}},
  "ending_freeze": "<ท่าค้างปิดสวยช่วง ${fmtT(speakEnd)}-${fmtT(dur)}s (~${fmtT(tailSec)} วิ) เงียบล้วนไม่มีคำพูด: จัดองค์ประกอบ hero ชัด สินค้ากลางเฟรมโลโก้หันกล้อง ตัวละครยิ้มมั่นใจ เว้นที่ว่างด้านล่างให้ปุ่มตะกร้า มี micro-motion เบาๆ ไม่ตัดห้วน ไม่ค้างกลางคำพูด>",
  "negative_prompt": ["ซับไตเติล", "ตัวหนังสือซ้อนบนจอ", "คำบรรยาย", "แคปชั่น", "kinetic typography", "title card", "โลโก้แบรนด์อื่น", "การตัดสลับฉาก", "อวัยวะหรือสินค้าบิดเบี้ยวผิดรูป", "จบแบบตัดกลางคัน", "สีเพี้ยนสลับช็อต"]
}

กฎเวลา (สำคัญสุดสำหรับคลิป ${dur} วิ): timeline ทุกบีตรวมกันต้องได้ ${fmtT(dur)} วิเป๊ะ ห้ามเกินห้ามขาด · เฟรมแรก (0s) ต้องอยู่กลางแอ็กชันแล้ว สะดุดตาใน 1 วิแรก ห้าม fade-in/establishing/intro · บทพูดทั้งหมดต้องจบภายใน ${fmtT(speakEnd)} วิ แล้วช่วง ${fmtT(speakEnd)}-${fmtT(dur)}s เป็นภาพปิดเงียบล้วน (ending_freeze) ห้ามมีคำพูด · ห้ามจบแบบค้างกลางคำหรือตัดห้วน
กฎเหล็ก: ตอบเป็น JSON ที่ valid อย่างเดียว ห้ามมี markdown fence (\`\`\`) ห้ามมีคำอธิบายนอก JSON และ "pacing/motion_intensity ห้ามขัดกับ negative_prompt" (ถ้าบอกไม่ตัดฉาก pacing ห้ามพูดถึงการตัดต่อ · ถ้าโชว์สินค้าช่วงไหน motion_intensity ช่วงนั้นต้อง low) · camera/timeline/dialogue_th/pacing ต้องสะท้อน "เอกลักษณ์สไตล์" ด้านบนให้ชัด ห้ามออกมากลางๆ จนเหมือนสไตล์อื่น`;

  // ── i2v (frames-to-video): ภาพ/หน้า/ฉาก มาจาก "เฟรมเริ่ม" แล้ว → prompt เขียนแค่ "การเคลื่อนไหว + บทพูด" (ตัดบรรยายภาพ/หน้าตา/ฉาก/แสง ที่จะไปทับเฟรม) ──
  const instrI2V = `คุณคือผู้กำกับวิดีโอสั้น + ผู้เชี่ยวชาญ prompt สำหรับ Veo โหมด frames-to-video
ภารกิจ: ออกแบบ "การเคลื่อนไหว + บทพูดขาย" คลิป ${dur} วินาที — โดย "ภาพเริ่มต้น (บุคคลถือสินค้า)" มาจากเฟรมที่ให้แล้ว
★ สำคัญสุด: ใบหน้า/ตัวละคร/เสื้อผ้า/สินค้า/ฉาก/แสง = คงตามเฟรมเริ่มเป๊ะทุกอย่าง ห้ามบรรยายหน้าตา ห้ามวาดใหม่ ห้ามเปลี่ยน — เขียนแค่ "บุคคลในเฟรมขยับยังไง + พูดอะไร + จบยังไง" เท่านั้น

ข้อมูล:
- สินค้า: ${name} | ราคา: ${price} บาท | ขายแล้ว: ${sold}
- แนวการขาย: ${styleHint}
${styleDirective}
${gen && gen.audHint ? `- กลุ่มเป้าหมาย: ${gen.audName} — ${gen.audHint} (hook/บทพูดต้องคุยกับคนกลุ่มนี้)` : ''}
${mute ? '- โหมดเสียง: ไม่มีเสียงพูด — ขายด้วยการเคลื่อนไหว/สีหน้า ห้ามขยับปากพูด' : `- ภาษาบทพูด: ${langLine}${voiceLine ? ` | น้ำเสียง: ${voiceLine}` : ''}`}

ส่งออกเป็น JSON เป๊ะตาม schema นี้ (ภาษาไทยทุก value · โฟกัสการเคลื่อนไหว+เสียง · ห้ามมี field บรรยายภาพนิ่ง/หน้าตา/ฉาก/แสง):
{
  "duration_sec": ${dur},
  "keep_from_first_frame": "คงบุคคล ใบหน้า เสื้อผ้า สินค้า ฉาก แสง ตามเฟรมเริ่มที่ให้เป๊ะทุกเฟรม ห้ามเปลี่ยน/มอร์ฟ/วาดใหม่",
  "dialogue_th": ${dialogueSpec},
  "voice": ${voiceSpec},
  "timeline": [
    {"time": "0-${fmtT(hookEnd)}s", "beat": "HOOK", "action": "<บุคคลในเฟรมเริ่มขยับ/สีหน้าเปิดสะดุดทันที — อยู่กลางแอ็กชันแล้ว ห้าม fade-in>"},
    {"time": "${fmtT(hookEnd)}-${fmtT(midT)}s", "beat": "VALUE", "action": "<ขยับยก/หันสินค้าในมือเล็กน้อยให้เห็นชัด พูดจุดขายเด็ด>"},
    {"time": "${fmtT(midT)}-${fmtT(speakEnd)}s", "beat": "CLOSE", "action": "<พูดปิดการขาย+ราคา+เร่งด่วน แล้วยกมือชี้นิ้วลงล่างชวนกดตะกร้า>"},
    {"time": "${fmtT(speakEnd)}-${fmtT(dur)}s", "beat": "FREEZE", "action": "<ค้างท่าชี้ตะกร้า เงียบ ไม่มีคำพูด micro-motion เบา>"}
  ],
  "motion_intensity": "low-medium — ขยับธรรมชาติ ไม่แรง (ยิ่งแรง หน้า/มือยิ่งเพี้ยน)",
  "camera": "กล้องนิ่ง หน้าตรงเข้ากล้องตลอด ตัวละครอยู่กลางเฟรมไม่ออกนอกจอ ไม่แพน ไม่ตัด",
  "audio": {"music": ${musicSpec}, "voice": ${voiceSpec}, "mix": ${mixSpec}},
  "negative_prompt": ["เปลี่ยนใบหน้า/ตัวละครจากเฟรมเริ่ม", "วาดหน้า/ฉาก/สินค้าใหม่ไม่ตรงเฟรม", "ตัวละครออกนอกเฟรม", "มือ/นิ้วเกินหรือผิดรูป", "ปากไม่ตรงเสียง", "ซับไตเติล", "ตัวหนังสือซ้อนบนจอ", "คำบรรยาย", "แคปชั่น", "kinetic typography", "การตัดสลับฉาก", "จบค้างกลางคำ"]
}

กฎเหล็ก: ตอบ JSON valid อย่างเดียว ห้าม markdown fence ห้ามคำอธิบายนอก JSON · ห้ามมี field บรรยายรูปร่าง/หน้าตา/สีผิว/ทรงผม/ฉาก/แสง (เฟรมจัดการแล้ว) · บีตรวม ${fmtT(dur)} วิเป๊ะ · บทพูดจบไม่เกิน ${fmtT(speakEnd)} วิ ห้ามค้างกลางคำ · camera/timeline(action)/dialogue_th/pacing ต้องสะท้อน "เอกลักษณ์สไตล์" ด้านบนให้ชัด ห้ามออกมากลางๆ จนเหมือนสไตล์อื่น`;

  const instruction = i2v ? instrI2V : instrFull;
  const parts = [{ text: instruction }];
  const img = await productImageB64(product);
  if (img) parts.push({ inline_data: { mime_type: 'image/jpeg', data: img } });   // รูปแรก = สินค้า
  // รูปที่สอง = ตัวละคร — ส่งให้ Gemini เห็นด้วย จะได้บรรยายเพศ/หน้าตาตรงรูป ไม่เดาเอง (กันได้เพศผิด)
  if (charImg && charImg.startsWith('data:')) {
    const m = charImg.match(/^data:([^;]+);base64,(.+)$/s);
    if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }
  const model = cfg.prompt_model || 'gemini-2.0-flash';
  // เรียก Gemini ผ่าน proxy ของ desktop — key ไม่หลุดออกนอกเครื่อง (desktop ถือ GOOGLE_API_KEY เอง)
  // ไม่มี token = desktop รุ่นเก่าที่ไม่มี proxy → error ชัดเลย ไม่ยิง key ดิบเงียบ (เลิกใช้ key ดิบแล้ว)
  if (!cfg.token) throw new Error('desktop รุ่นนี้ยังไม่รองรับ AI proxy — อัปเดตโปรแกรมหลักในเครื่องก่อน');
  const url = `${await apiBase()}/api/ai/gemini`;
  const reqHeaders = { 'Content-Type': 'application/json', 'X-VGAP-Token': cfg.token };
  // responseMimeType=json บังคับ valid JSON · thinkingBudget 0 = ปิดคิดในใจรุ่น 2.5 (กันโทเคนหมด คำตอบโดนตัด)
  // proxy รับ {model,contents,generationConfig} แล้วส่งต่อ Gemini → คืน JSON รูปเดิม (candidates/usageMetadata/error)
  const reqBody = JSON.stringify({
    model,
    contents: [{ parts }],
    generationConfig: { temperature: 1.0, maxOutputTokens: 2048, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
  });
  // auto-retry เมื่อ Gemini "แน่นชั่วคราว" (high demand/overloaded/503/timeout) — ไม่ retry error ถาวร (quota/key เพี้ยน)
  const isTransient = (m) => /high demand|overload|temporar|try again later|unavailable|internal|deadline|timeout|503|500|network|failed to fetch/i.test(String(m || ''));
  let res = null, lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(url, { method: 'POST', headers: reqHeaders, body: reqBody, signal: AbortSignal.timeout(60000) }).then((r) => r.json());
    } catch (e) { res = { error: { message: String((e && e.message) || e) } }; }   // network/timeout → ถือเป็น transient
    if (!res || !res.error) break;                                                  // สำเร็จ → ออกลูป
    lastErr = res.error.message || res.error.status || 'unknown error';
    if (isTransient(lastErr) && attempt < 3) {
      notifyPages({ action: 'flow_log', msg: `[prompt] Gemini แน่น (${String(lastErr).slice(0, 45)}) — ลองใหม่ครั้งที่ ${attempt + 1} ใน ${attempt * 3} วิ` });
      await new Promise((r) => setTimeout(r, attempt * 3000));                      // backoff 3s → 6s
      continue;
    }
    throw new Error(`Gemini: ${lastErr}`);                                          // error ถาวร หรือ retry หมด → fallback
  }
  // รายงานการใช้ token กลับ desktop → usage ledger (J)
  const tokens = (res && res.usageMetadata && res.usageMetadata.totalTokenCount) || 0;
  if (tokens) {
    fetch(`${await apiBase()}/api/flow/usage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'prompt', qty: 1, tokens }),
    }).catch(() => {});
  }
  const text = res && res.candidates && res.candidates[0]?.content?.parts?.[0]?.text;
  if (!text || !text.trim()) return '';
  // ตรวจว่าเป็น JSON จริง แล้ว "เสริมกำลัง" ด้วยกฎคุณภาพถาวร ก่อน pretty-print ส่งเข้า Flow
  // (บังคับใส่ทุกครั้ง ไม่พึ่งว่า Gemini จะนึกใส่ — ครอบอาการเพี้ยนที่เจอบ่อย)
  try { return JSON.stringify(reinforce(JSON.parse(text), hasCharImage, gen, i2v), null, 2); }
  catch { return text.trim(); }
}

// ── เสริมกำลัง prompt: ผนวกกฎ fidelity + negative มาตรฐานเข้าทุก JSON ──
// อาการที่กัน: สินค้าเพี้ยน/ผิดรูป · ปากไม่ตรงเสียง · มือ/นิ้วเพี้ยน · ตัวละครไม่นิ่ง
const FIDELITY_RULES = [
  'ตัวละครต้องเป็นคนเดียวกันเป๊ะตามรูปอ้างอิงทุกเฟรม — หน้า ตา จมูก ปาก โครงหน้า สีผิว ทรงผม เสื้อผ้า เพศ ห้ามเปลี่ยน/มอร์ฟ/สลับ แม้ตอนหันหน้าหรือเปลี่ยนมุมกล้อง',
  'สินค้าคงรูปทรง สี ฉลาก โลโก้ ตามรูปอ้างอิงเป๊ะ ห้ามแต่งแพ็กเกจ · มือจับธรรมชาติ นิ้วครบ 5 ไม่ผิดรูป สินค้าสัมผัสมือจริงไม่ลอย',
  'พูดไทยชัด ลิปซิงค์ตรงเสียง · การเคลื่อนไหวลื่นไม่กระตุก ไม่วาร์ป ทุกเฟรมสมจริง',
];
// ── กฎ "งานภาพระดับโปร" (cinematography) บังคับใส่ทุกคลิป ครอบเรื่องเลนส์/การเคลื่อนไหว/แสง/โทนสี/ปิดสวย ──
const CINEMATIC_RULES = [
  'ภาษากล้องจริง: ระบุระยะช็อต+เลนส์ (เช่น medium close-up 85mm) กล้องเคลื่อนนุ่มด้วย gimbal นิ่ง ไม่สั่นแบบมือถือ',
  'ช่วงโชว์/เห็นหน้าให้ motion ต่ำ กล้องนิ่ง หน้าตรงเข้ากล้อง — ยิ่งขยับแรง หน้า/สินค้า/มือยิ่งเพี้ยน',
  'แสงสมจริง soft key + rim light, specular บนผิวสินค้าให้เป็นวัสดุจริง · color grade คงที่ white balance สม่ำเสมอทั้งคลิป',
  'มี hero moment ชัด 1 ช็อต: สินค้าทำงาน/ให้ผลเห็นเต็มตา + sensory cue (ควัน/หยดน้ำ/ประกายวัสดุ) ตามชนิดสินค้า',
  'ปิดสวย: ท้ายคลิปเป็นภาพ hero ค้าง สินค้ากลางเฟรม micro-motion เบา บทพูดจบก่อนแล้ว ไม่ตัดห้วน ไม่ค้างกลางคำ',
];
const FIDELITY_NEG = [
  'นิ้วเกิน', 'นิ้วขาด', 'มือผิดรูป',
  'สินค้าบิดเบี้ยว', 'ฉลากเปลี่ยน', 'สินค้าลอยผิดธรรมชาติ',
  'ใบหน้าเปลี่ยนกลางคลิป', 'หน้าไม่ตรงกับรูปอ้างอิง', 'ตัวละครมอร์ฟ', 'เปลี่ยนเพศตัวละคร',
  'ปากขยับไม่ตรงเสียง', 'จบแบบตัดกลางคัน', 'ค้างกลางคำพูด', 'กล้องสั่นแบบมือถือ', 'สีเพี้ยนสลับช็อต',
  // กันตัวหนังสือบนจอ — ต้องเป็น "คำเปล่า" (สิ่งที่ไม่อยากได้) ห้ามขึ้นต้น "ไม่มี" เพราะ Veo จะ double-negative กลับมาใส่ตัวหนังสือ
  'ตัวหนังสือบนจอ', 'ซับไตเติล', 'คำบรรยาย', 'แคปชั่น', 'ข้อความซ้อนจอ', 'kinetic typography', 'title card', 'text overlay', 'subtitles', 'captions', 'watermark', 'โลโก้แบรนด์อื่น',
];
const DEFAULT_MUSIC = 'เพลงประกอบสากลจังหวะสนุกเร้าใจ ~120bpm คลอตลอดทั้งคลิป ดังพอเร้าอารมณ์แต่ไม่กลบเสียงพูด ไต่ขึ้นช่วงปิดการขายแล้วจบลงพอดีตอนจบ';
function reinforce(j, hasCharImage, gen, i2v = false) {
  if (!j || typeof j !== 'object') return j;
  if (!i2v) {   // i2v: กฎพวกนี้บรรยายหน้าตา/แสง/เลนส์ → จะไปทับเฟรมเริ่ม จึงไม่ใส่ (เฟรมจัดการภาพแล้ว)
    j.fidelity_rules = FIDELITY_RULES.slice();      // คำสั่งคุมความสมจริง (เชิงบวก)
    j.cinematic_rules = CINEMATIC_RULES.slice();    // คำสั่งคุมงานภาพระดับโปร (เชิงบวก)
  }
  const noMusic = gen && gen.musicName === 'ไม่ใส่เพลง';   // ผู้ใช้เลือก "ไม่ใส่เพลง" อย่างตั้งใจ
  const mute = gen && gen.sound === 'mute';               // ผู้ใช้เลือก "ไม่มีเสียงพูด"
  // เพลง: เคารพ "ไม่ใส่เพลง" · ไม่งั้นใช้แนวที่ผู้ใช้เลือก · สุดท้ายค่อย default (ไม่ทับค่าที่ Gemini เขียนดีแล้ว)
  if (typeof j.audio === 'string') j.audio = { music: j.audio || '' };
  if (!j.audio || typeof j.audio !== 'object') j.audio = {};
  if (noMusic) j.audio.music = 'ไม่ใส่เพลงประกอบ — ใช้เสียงบรรยากาศ/เอฟเฟกต์แทน';
  else if (!j.audio.music || !String(j.audio.music).trim()) j.audio.music = (gen && gen.musicPrompt) || DEFAULT_MUSIC;
  // โหมดไม่มีเสียงพูด: ลบบทพูด + บังคับ voice/mix + กันปาก-ลิปซิงค์-ซับ
  if (mute) {
    j.dialogue_th = '';
    j.audio.voice = 'ไม่มีเสียงพูดในคลิปนี้';
    j.audio.mix = 'ไม่มีเสียงพูด — เพลง/เอฟเฟกต์เป็นเสียงหลักของคลิป';
    const mn = ['ไม่มีเสียงพูด', 'ปากขยับเหมือนพูด', 'ลิปซิงค์'];
    j.negative_prompt = Array.isArray(j.negative_prompt) ? [...j.negative_prompt, ...mn]
      : (j.negative_prompt ? [j.negative_prompt, ...mn] : mn);
  } else if (!j.audio.mix) j.audio.mix = 'เสียงพูดอยู่บนสุดได้ยินชัดเสมอ เพลงคลออยู่ใต้เสียงพูด';
  // รวม negative เดิมของ Gemini + มาตรฐาน แล้ว dedup
  const old = Array.isArray(j.negative_prompt) ? j.negative_prompt : (j.negative_prompt ? [j.negative_prompt] : []);
  j.negative_prompt = [...new Set([...old, ...FIDELITY_NEG])];
  return j;
}
async function buildFlowPrompt(product, dry = false, i2v = false) {
  const cfg = await getFlowConfig();
  if (!cfg) throw new Error('desktop ไม่ตอบ (/api/flow/config) — เปิดโปรแกรมก่อน');
  const bi = product.basic_info || {};
  const name = bi.name || 'สินค้า', price = bi.price ?? '', comm = (product.commission || {}).rate ?? '';
  const dur = cfg.duration || 8, shop = cfg.shop_name || '';
  const vars = { '{name}': name, '{price}': String(price), '{commission}': String(comm), '{duration}': String(dur), '{shop}': shop };
  // ตัวเลือกจาก modal "ตั้งค่าก่อนสร้าง" (ตัวละคร + สไตล์ + มีรูปอ้างอิงไหม)
  const d = await chrome.storage.local.get(['flow_gen', 'flow_char_img']);
  const gen = d.flow_gen || null;
  const hasCharImage = !!d.flow_char_img;
  const tmpl = (cfg.prompt_template || '').trim();
  // fallback ตามสไตล์ที่เลือก > เทมเพลตที่ผู้ใช้ตั้งใน desktop > ประโยคกลาง
  let styleFb = gen && STYLE_TMPL[gen.style]
    ? STYLE_TMPL[gen.style](describeWho(gen, hasCharImage), name, String(price || '?'))
    : null;
  // หลายคลิปต่อเนียน: ครอบ template เดี่ยวด้วยคำสั่งแบ่งตอน + กฎท่าต่อท่า
  if (styleFb && gen && gen.len > 1) {
    const who = describeWho(gen, hasCharImage);
    styleFb = `สร้างวิดีโอต่อเนื่อง ${gen.len} คลิป คลิปละ 10 วินาที ฉากเดียวกัน ตัวละครเดิม แสงเดิมทุกคลิป `
      + `ท้ายแต่ละคลิปตัวละครค้างท่าไหน คลิปถัดไปต้องเริ่มจากท่าและตำแหน่งนั้นเป๊ะ — `
      + `คลิปที่ 1: ${styleFb} `
      + `คลิปที่ ${gen.len}: ${who}สาธิตจุดเด่นของ${name}ต่อจากท่าเดิม แล้วปิดท้ายพูดภาษาไทยว่า `
      + `"ราคาแค่ ${price} บาทเอง กดตะกร้าด้านล่างเลย!" จบด้วยชูสินค้านิ่งกลางเฟรม ยิ้มมองกล้องค้างไว้ `
      + `— ไม่มีซับไตเติล ไม่มีตัวหนังสือ ไม่มีโลโก้`;
  }
  const dflt = styleFb || (tmpl ? fillVars(tmpl, vars)
    : `สร้างวิดีโอโฆษณาแนวตั้ง 9:16 ความยาว ${dur} วินาที ของ ${name} กล้องค่อยๆ ซูมเข้า แสงสตูดิโอ สไตล์โฆษณาสินค้า`);
  const plog = (m) => notifyPages({ action: 'flow_log', msg: `[prompt] ${m}` });
  // โหมดทดสอบ: เรียก Gemini สร้าง JSON จริงให้เห็น (dry ไม่กดส่ง Flow → ไม่เสียเครดิต Flow, เปลือง Gemini แค่ ~1 call)
  if (dry) plog('โหมดทดสอบ → จะลองเรียก Gemini สร้าง JSON จริง (ไม่กดส่ง Flow, ไม่เสียเครดิต Flow)');
  if (cfg.prompt_mode === 'template') { plog('โหมด template (ตั้งใน desktop) → ใช้ paragraph ไม่ใช่ JSON'); return dflt; }
  // โหมด AI: เรียก Gemini เอง (ถ้าพลาด → fallback สไตล์)
  if (!cfg.google_api_key_set) { plog('ไม่มี API key → ใช้ paragraph (ตั้ง key ใน desktop ก่อนถึงได้ JSON)'); return dflt; }
  // เครดิต/โควต้าหมดตั้งแต่ชิ้นก่อนในรอบนี้ → ข้ามการยิง Gemini เลย (ไม่งั้นทั้งคิวจะพังรัวๆ เปลืองเวลา + spam error)
  // โหมดทดสอบ (dry) = ผู้ใช้กดดู JSON เอง → ข้ามธงบล็อกเสมอ ลองยิง Gemini จริงทุกครั้ง (ไม่งั้น flag ค้างจะทำให้เห็นแต่ paragraph)
  if (!dry) {
    // SW อาจถูก evict กลางคิว → ธงในตัวแปรหาย; กู้จาก storage แต่หมดอายุใน 10 นาที (กันค้างถาวรข้ามรอบ)
    if (!geminiBlocked) {
      try {
        const b = (await chrome.storage.local.get('gemini_blocked')).gemini_blocked;
        if (b && b.at && Date.now() - b.at < 10 * 60 * 1000) geminiBlocked = b.msg || true;
        else if (b) await chrome.storage.local.remove('gemini_blocked');   // หมดอายุ → ล้างทิ้ง
      } catch {}
    }
    if (geminiBlocked) { plog(`Gemini ถูกบล็อกตั้งแต่คลิปก่อน (${String(geminiBlocked).slice(0, 80)}) → ใช้ paragraph`); return dflt; }
  }
  try {
    const j = await geminiFlowPrompt(product, cfg, gen, hasCharImage, d.flow_char_img, i2v);
    let p = j || dflt;
    plog(j ? 'JSON จาก Gemini สำเร็จ ✓' : 'Gemini ตอบว่าง → ใช้ paragraph');
    const note = (cfg.prompt_style_note || '').trim();
    if (note) p = `${p}\n${fillVars(note, vars)}`;
    return p;
  } catch (e) {
    const emsg = String((e && e.message) || e);
    // เครดิต/โควต้าหมด → ตั้งธงกันยิงซ้ำทั้ง batch + เด้งเตือนชัดๆ บนหน้าจอ (broadcast ครั้งเดียว)
    if (isQuotaError(emsg)) {
      if (!geminiBlocked) notifyPages({ action: 'gemini_quota', message: emsg });
      geminiBlocked = emsg;
      try { chrome.storage.local.set({ gemini_blocked: { msg: emsg, at: Date.now() } }); } catch {}   // คงธงข้าม SW restart (หมดอายุ 10 นาที)
    }
    // ใช้ fallback ต่อได้ แต่ต้องให้ผู้ใช้รู้ (quota หมด/เน็ตพัง จะได้ไม่งงว่าทำไม prompt จืด)
    reportError('prompt-ai', `${emsg} — ใช้ template สไตล์แทน`);
    return dflt;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // extension เขียน prompt เอง (template/AI) — flow.js เรียกก่อนป้อน Flow
  if (msg.action === 'build_prompt') {
    (async () => {
      try {
        const cfg = await getFlowConfig();
        if (cfg && cfg.budget && cfg.budget.exceeded) { sendResponse({ ok: false, budgetExceeded: true }); return; }
        const prompt = await buildFlowPrompt(msg.product || {}, !!msg.dry, !!msg.i2v);
        sendResponse({ ok: true, prompt });
      } catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
    })();
    return true;
  }

  // รับสินค้าจาก floating scraper panel (content script) — เก็บ storage + แจ้ง Side Panel
  if (msg.action === 'add_products') {
    chrome.storage.local.get('products', (d) => {
      const existing = d.products || [];
      // ดักซ้ำด้วยทั้ง product_id และชื่อ — กันกรณีรอบแรกยังไม่ได้ id (ใช้ชื่อ) รอบหลังได้ id จริง → ซ้ำ
      const byId = new Map(existing.filter(p => p.product_id).map(p => [p.product_id, p]));
      const byName = new Map(existing.filter(p => p.basic_info?.name).map(p => [p.basic_info.name, p]));
      const findDup = (p) => (p.product_id && byId.get(p.product_id)) || (p.basic_info?.name && byName.get(p.basic_info.name)) || null;
      const index = (p) => { if (p.product_id) byId.set(p.product_id, p); if (p.basic_info?.name) byName.set(p.basic_info.name, p); };
      const fresh = [];
      let enriched = 0;
      for (const p of (msg.products || [])) {
        const dup = findDup(p);
        if (dup) {
          // ของเดิมยังขาดรูป/ลิงก์ตะกร้า แต่ตัวใหม่มี → เติมให้ (เช่นจิ้มซ้ำหลังแก้บั๊กรูป)
          let touched = false;
          if ((!dup.images || !dup.images.length) && p.images?.length) { dup.images = p.images; dup.images_b64 = p.images_b64 || dup.images_b64; touched = true; }
          if (!dup.links?.affiliate_link && p.links?.affiliate_link) { dup.links = dup.links || {}; dup.links.affiliate_link = p.links.affiliate_link; touched = true; }
          if (!dup.product_id && p.product_id) { dup.product_id = p.product_id; dup.links = { ...(dup.links || {}), shop_id: p.links?.shop_id, product_url: p.links?.product_url }; touched = true; }
          if (touched) enriched++;
          continue;
        }
        fresh.push(p);
        index(p);     // กันซ้ำภายใน batch เดียวกันด้วย
      }
      const merged = [...existing, ...fresh];
      chrome.storage.local.set({ products: merged }, () => {
        notifyPages({ action: 'products_updated', added: fresh.length, total: merged.length });
        postProductsToDesktop(fresh);   // G3: mirror สินค้าใหม่ไป SQLite ควบคู่ (ไม่ await ไม่บล็อก, เก็บ storage เหมือนเดิม)
        sendResponse({ ok: true, added: fresh.length, total: merged.length, enriched });
      });
    });
    return true;
  }

  if (msg.action === 'fetch_image') {
    fetch(msg.url, { headers: { 'Referer': 'https://affiliate.shopee.co.th/' } })
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onload = () => sendResponse({ dataUrl: reader.result });
        reader.readAsDataURL(blob);
      })
      .catch(() => sendResponse({ dataUrl: null }));
    return true;
  }

  if (msg.action === 'scrape_tab') {
    // หาแท็บ Shopee Affiliate โดยตรง
    chrome.tabs.query({ url: 'https://affiliate.shopee.co.th/*' }, async tabs => {
      if (!tabs.length) {
        sendResponse({ success: false, error: 'ไม่พบแท็บ affiliate.shopee.co.th — กรุณาเปิดหน้า Affiliate ก่อน' });
        return;
      }
      const tab = tabs[0];
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/util.js', 'content/scraper.js'] });
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, { action: 'scrape', extracommOnly: msg.extracommOnly }, res => {
            if (chrome.runtime.lastError) { sendResponse({ success: false, error: 'scraper ไม่ตอบ: ' + chrome.runtime.lastError.message }); return; }
            sendResponse(res || { success: false, error: 'scraper ไม่ตอบ' });
          });
        }, 800);
      } catch(e) {
        sendResponse({ success: false, error: e.message });
      }
    });
    return true;
  }

  // ── เก็บลิงก์ตะกร้า (affiliate short link) เฉพาะชุดที่จะสร้าง ──
  // sidepanel ส่ง names[] ของสินค้าที่เลือก → forward ไป scraper.js บนหน้า Affiliate
  if (msg.action === 'collect_links') {
    chrome.tabs.query({ url: 'https://affiliate.shopee.co.th/*' }, async tabs => {
      if (!tabs.length) {
        sendResponse({ success: false, error: 'เปิดหน้า Affiliate ที่มีสินค้าเหล่านี้ก่อน แล้วลองใหม่' });
        return;
      }
      const tab = tabs[0];
      try {
        // inject util.js ก่อน scraper.js เสมอ (มี guard กัน re-inject ซ้ำ)
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/util.js', 'content/scraper.js'] });
        chrome.tabs.sendMessage(tab.id, { action: 'get_links', names: msg.names || [] }, res => {
          if (chrome.runtime.lastError) { sendResponse({ success: false, error: chrome.runtime.lastError.message }); return; }
          sendResponse(res || { success: false, error: 'scraper ไม่ตอบ' });
        });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    });
    return true;
  }

  // ── เปิด Dashboard จอใหญ่ (จาก scraper popup / ที่อื่น) — โฟกัสแท็บเดิมถ้ามี ──
  if (msg.action === 'open_dashboard') {
    const url = chrome.runtime.getURL('dashboard.html');
    chrome.tabs.query({}, tabs => {
      const ex = tabs.find(t => (t.url || '').startsWith(url));
      if (ex) { chrome.tabs.update(ex.id, { active: true }); chrome.windows.update(ex.windowId, { focused: true }); }
      else chrome.tabs.create({ url });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.action === 'navigate_tab') {
    // หาแท็บ Shopee Affiliate ที่เปิดอยู่
    chrome.tabs.query({ url: 'https://affiliate.shopee.co.th/*' }, tabs => {
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { url: msg.url });
      } else {
        // ถ้าไม่มีให้เปิดใหม่
        chrome.tabs.create({ url: msg.url });
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.action === 'get_tab_url') {
    // หาแท็บ Shopee Affiliate โดยตรง
    chrome.tabs.query({ url: 'https://affiliate.shopee.co.th/*' }, tabs => {
      if (tabs.length > 0) {
        sendResponse({ url: tabs[0].url, tabId: tabs[0].id });
      } else {
        // ไม่พบแท็บ Affiliate
        sendResponse({ url: '' });
      }
    });
    return true;
  }

  // ── trusted input ผ่าน chrome.debugger (สำหรับ Flow ที่ guard isTrusted) ──
  if (msg.action === 'flow_trusted_click' || msg.action === 'flow_trusted_hover' || msg.action === 'flow_trusted_key' || msg.action === 'flow_trusted_type') {
    const tabId = sender.tab && sender.tab.id;
    if (!tabId) { sendResponse({ ok: false, error: 'no tab' }); return true; }
    (async () => {
      const run = async () => {
        await attachDebugger(tabId);
        if (msg.action === 'flow_trusted_click') {
          await trustedClick(tabId, msg.x, msg.y);
        } else if (msg.action === 'flow_trusted_hover') {
          await trustedHover(tabId, msg.x, msg.y);
        } else if (msg.action === 'flow_trusted_type') {
          await trustedType(tabId, msg.text, !!msg.clear, !!msg.mac);
        } else {
          await trustedEnter(tabId, !!msg.ctrl);
        }
      };
      try {
        await run();
        sendResponse({ ok: true });
      } catch (e) {
        // debugger หลุดกลางทาง (ผู้ใช้กดปิดแถบเตือน / SW restart) → cdp() เคลียร์
        // _attached ให้แล้ว ลอง attach ใหม่อีกรอบเดียวก่อนยอมแพ้
        try {
          await run();
          sendResponse({ ok: true });
        } catch (e2) {
          sendResponse({ ok: false, error: String(e2 && e2.message || e2) });
        }
      }
    })();
    return true;
  }

  // ── ดาวน์โหลดวิดีโอจาก Flow (chrome.downloads แนบ cookie ของ labs.google ให้เอง) ──
  // ทนเน็ตขาดช่วง: interrupted → resume (ถ้าได้) ไม่ได้ก็ดาวน์โหลดใหม่ (overwrite ชื่อเดิม)
  // retry สูงสุด 6 ครั้ง backoff 4s,8s,… (รวม ~1.5 นาที) เผื่อเน็ตกลับมา
  if (msg.action === 'flow_download') {
    const filename = msg.filename || `flow/video_${Date.now()}.mp4`;
    const url = msg.url;
    const MAX_TRIES = 6;
    let tries = 0, settled = false;
    const done = (r) => { if (!settled) { settled = true; sendResponse(r); } };

    const retryLater = (why) => {
      if (tries >= MAX_TRIES) {
        reportError('download', `${filename} ล้มเหลวหลังลอง ${tries} ครั้ง (${why})`);
        return done({ ok: false, error: `download ล้มเหลวหลังลอง ${tries} ครั้ง (${why}) — เน็ตอาจหลุดนานเกินไป` });
      }
      const wait = 4000 * tries;            // 4s, 8s, 12s, …
      console.log(`[flow_download] ${why} → retry #${tries + 1} ใน ${wait}ms`);
      setTimeout(attempt, wait);
    };

    // สำเร็จ → แนบ mime/ขนาดไฟล์ (จาก chrome.downloads) ให้ flow.js เช็คว่าเป็นวิดีโอจริง (defensive)
    // additive อย่างเดียว — ไม่เปลี่ยนพฤติกรรมดาวน์โหลด (ok/downloadId/filename ยังเหมือนเดิม)
    const finishOk = (id) => {
      chrome.downloads.search({ id }, (items) => {
        const it = (items && items[0]) || {};
        const fileSize = (it.fileSize != null && it.fileSize >= 0) ? it.fileSize
          : ((it.totalBytes != null && it.totalBytes >= 0) ? it.totalBytes : null);
        done({ ok: true, downloadId: id, filename, mime: it.mime || '', fileSize, totalBytes: it.totalBytes });
      });
    };

    const watch = (id, onInterrupt) => {
      let handled = false;
      const finish = (fn) => {
        if (handled) return;
        handled = true;
        chrome.downloads.onChanged.removeListener(onChange);
        fn();
      };
      const onChange = (delta) => {
        if (delta.id !== id || !delta.state) return;
        if (delta.state.current === 'complete') finish(() => finishOk(id));
        else if (delta.state.current === 'interrupted') finish(() => onInterrupt(id));
      };
      chrome.downloads.onChanged.addListener(onChange);
      // กัน race: download จบ/พังไปแล้ว "ก่อน" เราเริ่มฟัง onChanged → ค้างตลอดกาล
      chrome.downloads.search({ id }, (items) => {
        const it = items && items[0];
        if (!it) return;
        if (it.state === 'complete') finish(() => finishOk(id));
        else if (it.state === 'interrupted') finish(() => onInterrupt(id));
      });
    };

    const onInterrupt = (id) => {
      // ลอง resume การดาวน์โหลดเดิมก่อน (ต่อจากที่ค้าง) — ถ้าทำไม่ได้ค่อยเริ่มใหม่
      chrome.downloads.search({ id }, (items) => {
        const it = items && items[0];
        if (it && it.canResume) {
          watch(id, () => retryLater('resume ไม่สำเร็จ'));
          chrome.downloads.resume(id, () => { if (chrome.runtime.lastError) retryLater('resume error'); });
        } else {
          retryLater('interrupted (resume ไม่ได้)');
        }
      });
    };

    const attempt = () => {
      tries++;
      // overwrite เพื่อให้ชื่อไฟล์คงเดิมเสมอ (desktop อ่านชื่อนี้) ไม่เกิด _1.mp4
      chrome.downloads.download({ url, filename, saveAs: false, conflictAction: 'overwrite' }, (id) => {
        if (chrome.runtime.lastError || id == null) return retryLater(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'no id');
        watch(id, onInterrupt);
      });
    };
    attempt();
    return true;
  }

  // ── คุยกับ desktop (FastAPI) — เลี่ยง mixed-content ผ่าน service worker ──
  if (msg.action === 'flow_desktop') {
    (async () => {
      const base = await apiBase();
      const opt = { method: msg.method || 'GET', signal: AbortSignal.timeout(15000) };
      if (msg.body) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(msg.body); }
      try {
        const data = await fetch(base + msg.path, opt).then(r => r.json());
        sendResponse({ ok: true, data });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    return true;
  }

  // จาก Side Panel/Dashboard: คิวสินค้าอยู่ที่ extension เอง → เก็บลง storage → เปิดแท็บ Flow → รันสร้างคลิป
  if (msg.action === 'flow_start') {
    (async () => {
      if (msg.products && msg.products.length) {
        await chrome.storage.local.set({ flow_jobs: msg.products });   // work-list ของ extension
      }
      // ตัวเลือกจาก modal: ตัวละคร + สไตล์ → เก็บไว้ให้ buildFlowPrompt/flow.js ใช้
      // (resume คิวค้างจะไม่ส่ง gen มา → ใช้ค่าที่เก็บไว้รอบก่อน)
      if (msg.gen && msg.gen.charId) {
        const meta = CHAR_META[msg.gen.charId] || null;
        const gen = {
          style: msg.gen.style || 'selfie',
          len: Math.max(1, Math.min(3, msg.gen.len || 1)),   // จำนวนคลิป 8 วิ ที่ต่อกัน
          charId: msg.gen.charId,
          charName: msg.gen.charName || (meta ? meta.name : ''),
          charDesc: msg.gen.charId === 'self' ? (msg.gen.charDesc || '') : (meta ? meta.desc : msg.gen.charDesc || ''),
          audName: msg.gen.audName || '', audHint: msg.gen.audHint || '',
          bgName: msg.gen.bgName || '', bgPrompt: msg.gen.bgPrompt || '',
          // creative cockpit: บรรยากาศ/โหมดเสียง/น้ำเสียง/ภาษา/เพลง → ป้อนเข้า geminiFlowPrompt เขียน prompt
          moodName: msg.gen.moodName || '', moodPrompt: msg.gen.moodPrompt || '',
          sound: msg.gen.sound || 'voice',
          voiceName: msg.gen.voiceName || '', voicePrompt: msg.gen.voicePrompt || '',
          langName: msg.gen.langName || '', langPrompt: msg.gen.langPrompt || '',
          musicName: msg.gen.musicName || '', musicPrompt: msg.gen.musicPrompt || '',
          engine: msg.gen.engine === 'i2v' ? 'i2v' : 'agent',   // i2v = nano banana → frames-to-video (หน้าเป๊ะ) · agent = runGenerate เดิม
        };
        // รูปอ้างอิง: ใช้ snapshot จากพรีวิว 3D (มุมที่ผู้ใช้หมุนไว้) ก่อนเสมอ
        let img = msg.gen.snapshot || null;
        try {
          if (img) {
            // ใช้ snapshot ที่ส่งมา
          } else if (msg.gen.charId === 'self') {
            // รูปจริงของผู้ใช้จาก engine_profile (modal/wizard เซฟไว้)
            const p = await chrome.storage.local.get('engine_profile');
            img = (((p.engine_profile || {}).presenter || {}).photos || [])[0] || null;
          } else {
            // avatar ตัวละคร → dataURL (flow.js เอาไปอัปเป็นรูปอ้างอิงใน Flow)
            const blob = await fetch(chrome.runtime.getURL(`avatars/${msg.gen.charId}.png`)).then((r) => r.blob());
            img = await new Promise((res) => {
              const fr = new FileReader();
              fr.onload = () => res(String(fr.result));
              fr.onerror = () => res(null);
              fr.readAsDataURL(blob);
            });
          }
        } catch {}
        await chrome.storage.local.set({ flow_gen: gen, flow_char_img: img });
      }
      _flowCfg = null;   // โหลด config สดสำหรับรอบนี้ (เผื่อผู้ใช้เพิ่งแก้ settings)
      geminiBlocked = null;   // เริ่มรอบใหม่ → ลองเรียก Gemini อีกครั้ง (เผื่อเพิ่งเติมเครดิต)
      try { await chrome.storage.local.remove('gemini_blocked'); } catch {}
      const r = await openFlowAndRun(!!msg.dry);
      sendResponse(r);
    })();
    return true;
  }

  // เปิด/โฟกัสแท็บ Flow ของบัญชีที่ระบุ (ปุ่ม "เปิด Flow" ในหน้าเมล Flow) — ไม่รันคิว
  if (msg.action === 'open_flow_account') {
    (async () => {
      const au = Number.isFinite(msg.authuser) ? msg.authuser : null;
      const BASE_FLOW = 'https://labs.google/fx/th/tools/flow';
      // ★ ปุ่มเปิดมือ = หน้า tools เปล่าของบัญชีนั้นเสมอ (ไม่แตะลิงก์โปรเจกต์ที่จำไว้)
      //   Flow จะพาเข้า workspace ของบัญชีเอง — กันทั้งโปรเจกต์ข้ามบัญชี + ลิงก์เก่าที่จำผิด
      const url = au != null ? withAuthuser(BASE_FLOW, au) : BASE_FLOW;
      try { await chrome.storage.local.set({ flow_active_authuser: au }); } catch {}
      // สลับบัญชี = ปิดแท็บ Flow เดิมแล้วเปิดใหม่ที่บัญชีถูกต้อง (navigate แท็บเดิมไม่สลับ — ดู acquireFlowTab)
      try {
        const { tab } = await acquireFlowTab(url, au, false);
        sendResponse({ ok: true, tabId: tab.id });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    return true;
  }

  // สลับบัญชี Flow ด้วย "อีเมล" (logout → เลือกบัญชีใหม่ — Flow ไม่สน authuser)
  if (msg.action === 'switch_flow_account') {
    (async () => {
      const email = msg.email;
      if (!email) { sendResponse({ ok: false, error: 'ไม่มีอีเมล' }); return; }
      try { await chrome.storage.local.set({ flow_switch: { email, at: Date.now() } }); } catch {}
      const BASE_FLOW = 'https://labs.google/fx/th/tools/flow';
      try {
        // ใช้แท็บ Flow ที่เปิดอยู่ (ไม่ต้องปิด/สลับ authuser แล้ว) ไม่มีก็เปิดใหม่
        const tabs = await chrome.tabs.query({ url: 'https://labs.google/fx/*' });
        let tab = tabs[0];
        if (!tab) {
          tab = await chrome.tabs.create({ url: BASE_FLOW, active: true });
          await waitTabComplete(tab.id, 2500);
        } else {
          try {
            await chrome.tabs.update(tab.id, { active: true });
            await chrome.windows.update(tab.windowId, { focused: true });
          } catch {}
        }
        // สั่ง flow.js เริ่มกระบวนการสลับ (logout → เลือกบัญชี)
        try { await chrome.tabs.sendMessage(tab.id, { action: 'flow_switch_account', email }); } catch {}
        sendResponse({ ok: true, tabId: tab.id });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    return true;
  }

  if (msg.action === 'flow_detach') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId) {
      chrome.debugger.detach({ tabId }).catch(() => {});
      // detach เองโปรแกรม → onDetach ไม่ยิง ต้องเคลียร์ tracking เอง
      // (ไม่งั้น attachDebugger รอบหน้า short-circuit ทั้งที่ไม่ได้ attach แล้ว)
      _attached.delete(tabId);
    }
    sendResponse({ ok: true });
    return true;
  }

});

const _attached = new Set();
function attachDebugger(tabId) {
  return new Promise((resolve, reject) => {
    if (_attached.has(tabId)) return resolve();
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        const m = chrome.runtime.lastError.message || '';
        // ถ้าแนบอยู่แล้วถือว่าโอเค
        if (/already attached/i.test(m)) { _attached.add(tabId); return resolve(); }
        return reject(new Error(m));
      }
      _attached.add(tabId);
      resolve(); // Input domain ไม่ต้อง enable — ยิง event ได้เลย
    });
  });
}
function cdp(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params || {}, (res) => {
      if (chrome.runtime.lastError) {
        const m = chrome.runtime.lastError.message || '';
        // หลุดจาก debugger โดยที่ onDetach ไม่ยิง (เช่น detach เองโปรแกรม)
        // → เคลียร์ tracking ให้รอบหน้า attach ใหม่ได้ ไม่งั้นแท็บนี้พังถาวร
        if (/not attached|detached/i.test(m)) _attached.delete(tabId);
        return reject(new Error(m));
      }
      resolve(res);
    });
  });
}
async function trustedClick(tabId, x, y) {
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}
// ขยับเมาส์จริงไปวางค้างที่พิกัด (ไม่กด) → trigger CSS :hover ให้ปุ่มที่ซ่อน (เช่น ⋮ บนรูป) โผล่
async function trustedHover(tabId, x, y) {
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
}
async function trustedKey(tabId, key, code, vk, mods, text) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods || 0 };
  await cdp(tabId, 'Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text } : {}) });
  await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
async function trustedType(tabId, text, clear, mac) {
  if (clear) {
    // เลือกทั้งหมด (Cmd+A บน mac / Ctrl+A) แล้วลบ → เคลียร์ช่องแบบ trusted
    const sel = mac ? 4 /* Meta */ : 2 /* Ctrl */;
    await trustedKey(tabId, 'a', 'KeyA', 65, sel);
    await trustedKey(tabId, 'Backspace', 'Backspace', 8, 0);
  }
  // insertText = พิมพ์เหมือนคีย์บอร์ดจริง → Lexical รับ state ถูกต้อง
  await cdp(tabId, 'Input.insertText', { text });
}
async function trustedEnter(tabId, ctrl) {
  const mods = ctrl ? 2 /* Ctrl */ : 0;
  await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', modifiers: mods });
  await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: mods });
}
// เก็บกวาดเมื่อแท็บปิด
chrome.tabs.onRemoved.addListener((tabId) => _attached.delete(tabId));
chrome.debugger.onDetach && chrome.debugger.onDetach.addListener((src) => { if (src.tabId) _attached.delete(src.tabId); });
