// ── Dashboard (full-screen tab) — ทำทุกอย่าง: สินค้า / สร้าง / ติดตาม / ตั้งค่า ──
let products = [];
let selected = new Set();
let settings = {};
let flowStatus = {};        // uid -> 'queued' | 'done'
let videoByUid = {};        // uid -> { folder, name, url }
let statDone = 0;
let view = 'ov';
let query = '';
let filter = 'all';
let catFilter = 'all';          // กรองตามหมวดที่ติดมาตอนดูด ('all' / ชื่อหมวด / '_none')
const collapsedG = new Set();   // กลุ่มสินค้าที่ถูกพับเก็บไว้ (key: 'cart' / 'nocart')
let batch = [];
let monTimer = null;
let busy = false;

const $ = id => document.getElementById(id);
// ชื่อ/ข้อมูลสินค้ามาจากการ scrape หน้า Shopee — ต้อง escape ก่อนใส่ innerHTML เสมอ
// (หน้า extension มีสิทธิ์ chrome.* — โดน inject เท่ากับโดนยึด extension)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => p.product_id || p.basic_info?.name || '';
const port = () => settings.port || '3001';
const api = path => `http://localhost:${port()}${path}`;
const hasCart = p => !!(p.links && p.links.affiliate_link);
const ST_LABEL = { new: 'รอสร้าง', queued: 'ส่งเข้า Flow', done: 'เสร็จ' };
const CHECK = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const PH = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;

// ── init ──
chrome.storage.local.get(['products', 'panel_settings', 'statDone', 'flowStatus', 'dry_run', 'error_log'], d => {
  products = d.products || [];
  settings = d.panel_settings || {};
  statDone = d.statDone || 0;
  flowStatus = d.flowStatus || {};
  if ($('dryRun')) $('dryRun').checked = !!d.dry_run;
  // error ย้อนหลังจาก background (prompt/download พังตอนเราไม่ได้เปิดดู)
  (d.error_log || []).slice(0, 5).reverse().forEach(e =>
    logTo('monLog', `[ผิดพลาด:${e.where}] ${new Date(e.at).toLocaleString('th-TH')} — ${e.message}`, 'e'));
  applySettings();
  go('ov');
  render();
  refreshVideos().then(() => { render(); if (view === 'ov') renderOverview(); });
  checkLeftoverQueue();
});
$('dryRun')?.addEventListener('change', e => chrome.storage.local.set({ dry_run: e.target.checked }));
// sync จาก sidepanel (สวิตช์ทดสอบมีสองที่ — ใช้ storage.dry_run เป็นแหล่งจริง)
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local') return;
  if (ch.dry_run && $('dryRun')) $('dryRun').checked = !!ch.dry_run.newValue;
  // เครดิต Flow อัปเดต (จาก content/flow.js ตอนเปิดหน้า Flow) → รีเฟรชหน้าภาพรวมถ้าเปิดอยู่
  if ((ch.flow_credits || ch.flow_credits_by_email) && view === 'ov') renderOverview();
  // บัญชี Flow / เครดิตต่อบัญชี เปลี่ยน → รีเฟรชแท็บเมล + แบดจ์ตัวนับ
  if (ch.flow_accounts || ch.flow_account_credits || ch.flow_credits_by_email || ch.flow_credit_threshold || ch.flow_active_email) {
    if (view === 'mail') renderMail(); else updateMailCount();
  }
});

// ── sidebar nav ──
const VIEW_META = {
  ov:  ['ภาพรวม', 'สรุปการทำงานทั้งระบบ'],
  lib: ['คลังสินค้า', 'สินค้าทั้งหมดที่ดึงมาจาก Shopee'],
  mon: ['งาน', 'ติดตามคิวและการสร้างคลิปแบบเรียลไทม์'],
  mail:['เมล Flow', 'หมุนบัญชี Google เพื่อใช้เครดิต Flow ฟรีต่อบัญชี'],
  set: ['ตั้งค่า', 'ปรับสไตล์วิดีโอและการเชื่อมต่อ'],
};
function go(v) {
  if (v !== 'mon') stopMonitor();
  view = v;
  ['ov', 'lib', 'mon', 'mail', 'set'].forEach(x => $('view-' + x).classList.toggle('on', x === v));
  document.querySelectorAll('.navit').forEach(t => t.classList.toggle('on', t.dataset.view === v));
  const m = VIEW_META[v];
  if (m) { $('pgTitle').textContent = m[0]; $('pgPh').textContent = m[1]; }
  if (v === 'ov') renderOverview();
  if (v === 'mon') { startMonitor(); checkLeftoverQueue(); }
  if (v === 'mail') renderMail();
  if (v === 'set') checkConn();
}
document.querySelectorAll('.navit').forEach(t => t.addEventListener('click', () => go(t.dataset.view)));
$('goAff').addEventListener('click', () =>
  chrome.runtime.sendMessage({ action: 'navigate_tab', url: 'https://affiliate.shopee.co.th/offer/product_offer' }));

// ── theme (dark / light) — จำค่าไว้ใน storage ──
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  $('thDark').classList.toggle('on', dark);
  $('thLight').classList.toggle('on', !dark);
}
chrome.storage.local.get('ui_theme', d => applyTheme(d.ui_theme === 'dark'));
$('thDark').addEventListener('click', () => { applyTheme(true); chrome.storage.local.set({ ui_theme: 'dark' }); });
$('thLight').addEventListener('click', () => { applyTheme(false); chrome.storage.local.set({ ui_theme: 'light' }); });

// ── desktop status ──
async function checkDesktop() {
  try {
    const r = await fetch(api('/api/flow/status'), { signal: AbortSignal.timeout(2500) });
    if (r.ok) { $('dDot').className = 'dot on'; $('dLbl').textContent = 'เชื่อมต่อ desktop แล้ว'; return; }
  } catch {}
  $('dDot').className = 'dot off'; $('dLbl').textContent = 'ยังไม่ได้เชื่อมต่อ desktop';
}
checkDesktop(); setInterval(checkDesktop, 8000);

// ── log ──
function logTo(boxId, m, cls = 'i') {
  const box = $(boxId); if (!box) return;
  if (box.children.length === 1 && box.textContent.includes('…')) box.innerHTML = '';
  const d = document.createElement('div'); d.className = cls;
  d.textContent = `[${new Date().toLocaleTimeString('th-TH')}] ${m}`;
  box.appendChild(d); box.scrollTop = box.scrollHeight;
}

// ── videos / status ──
async function refreshVideos() {
  try {
    const j = await fetch(api('/api/videos'), { signal: AbortSignal.timeout(2500) }).then(r => r.json());
    videoByUid = {};
    (j.videos || []).forEach(v => { const m = v.name.match(/^(.+)\.mp4$/); if (m) videoByUid[m[1]] = { folder: v.folder, name: v.name, url: v.url }; });
    statDone = (j.videos || []).length;
  } catch {}
}
function statusOf(p) {
  const id = uid(p);
  if (videoByUid[id] || flowStatus[id] === 'done') return 'done';
  if (flowStatus[id] === 'queued') return 'queued';
  return 'new';
}

// ── filtering ──
function catOf(p) { const c = (p.category || '').trim(); return c || null; }
function visibleProducts() {
  const q = query.trim().toLowerCase();
  return products.filter(p => {
    if (q && !(p.basic_info?.name || '').toLowerCase().includes(q)) return false;
    if (catFilter === '_none') { if (catOf(p)) return false; }
    else if (catFilter !== 'all' && catOf(p) !== catFilter) return false;
    const st = statusOf(p);
    if (filter === 'new' || filter === 'queued' || filter === 'done') return st === filter;
    if (filter === 'link') return hasCart(p);
    if (filter === 'nolink') return !hasCart(p);
    return true;
  });
}

function render() {
  $('tabCount').textContent = products.length;
  renderLib();
  updateMailCount();
  if (view === 'ov') renderOverview();
}

// ── ภาพรวม (overview) — ต่อข้อมูลจริงจาก desktop /api/overview ──
function fmtMoney(n) { return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
function fmtNum(n) { return Number(n || 0).toLocaleString('th-TH'); }
const svgI = (p, w) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w || 2}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const PLAT_LABEL = { shopee: 'Shopee', tiktok: 'TikTok', reels: 'Reels', instagram: 'Instagram', youtube: 'YouTube' };

const OV_ICONS = {
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  bot: '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="16" y1="16" x2="16.01" y2="16"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  thermo: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>',
  ok: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  flow: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/><path d="M9.5 12h5"/>',
};

async function renderOverview() {
  let ov = null;
  try { ov = await fetch(api('/api/overview'), { signal: AbortSignal.timeout(3000) }).then(r => r.json()); } catch { /* desktop ไม่ออนไลน์ */ }

  let fc = null;
  try { fc = (await chrome.storage.local.get('flow_credits')).flow_credits; } catch { /* ไม่มีข้อมูลเครดิต */ }

  // สรุปบัญชี Flow (เมล 5 อัน) — ใช้ข้อมูลเดียวกับแท็บเมล Flow แต่ย่อให้การ์ดสรุป
  let acctSum = null;
  try {
    const d = await chrome.storage.local.get(['flow_accounts', 'flow_account_credits', 'flow_credits_by_email', 'flow_credit_threshold']);
    const accts = Array.isArray(d.flow_accounts) ? d.flow_accounts : [];
    if (accts.length) {
      const cr = d.flow_account_credits || {};
      const crEm = d.flow_credits_by_email || {};
      const thr = Number.isFinite(d.flow_credit_threshold) ? d.flow_credit_threshold : CREDIT_PER_CLIP;
      let totalCredit = 0, totalClips = 0, usable = 0;
      accts.forEach(a => {
        const c = pickAccountCredit(a, crEm, cr);
        const v = c && Number.isFinite(c.value) ? c.value : null;
        if (v != null) { totalCredit += v; totalClips += clipsLeft(v); }
        if (!a.paused && (v == null || v >= CREDIT_PER_CLIP)) usable++;
      });
      acctSum = { n: accts.length, totalCredit, totalClips, usable, thr };
    }
  } catch { /* ไม่มีข้อมูลบัญชี */ }

  const noCart = products.filter(p => !hasCart(p)).length;
  const queuedExt = products.filter(p => statusOf(p) === 'queued').length;
  const t = (ov && ov.today) || {};

  const card = (cls, ic, num, lbl) =>
    `<div class="scard"><div class="ic ${cls}">${svgI(ic)}</div><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
  $('ovStats').innerHTML =
    card('green', OV_ICONS.send, ov ? fmtNum(t.posted) : '—', 'โพสต์วันนี้') +
    card('blue', OV_ICONS.target, (ov && t.success_rate != null) ? t.success_rate + '%' : '—', 'อัตราสำเร็จ') +
    card('amber', OV_ICONS.clock, fmtNum(ov ? (t.queued ?? queuedExt) : queuedExt), 'ในคิว') +
    card('orange', OV_ICONS.link, fmtNum(noCart), 'ต้องดึงลิงก์');

  renderOvFunnel(ov);
  renderOvTodo((ov && ov.alerts) || [], noCart, fc, acctSum);
  renderOvScrapeChart();
}

// "เมื่อสักครู่ / N นาที / N ชม. / N วันที่แล้ว" จาก timestamp (ms)
function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'เมื่อสักครู่';
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
  return `${Math.floor(s / 86400)} วันที่แล้ว`;
}

// ② Pipeline funnel — ของจริงล้วน (ในคลัง→มีลิงก์→มีคลิป→โพสต์วันนี้)
function renderOvFunnel(ov) {
  const box = $('ovFunnel'); if (!box) return;
  const withClip = products.filter(p => videoByUid[uid(p)]).length;
  const steps = [
    { v: products.length, l: 'ในคลัง', c: 'muted' },
    { v: products.filter(hasCart).length, l: 'มีลิงก์ตะกร้า', c: 'blue' },
    { v: withClip, l: 'มีคลิปแล้ว', c: 'amber' },
    { v: ov ? (ov.today?.posted ?? 0) : null, l: 'โพสต์วันนี้', c: 'green' },
  ];
  const arrow = `<span class="fn-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>`;
  box.innerHTML = steps.map((s, i) => {
    const prev = i > 0 ? steps[i - 1].v : null;
    const drop = (i > 0 && prev > 0 && s.v != null) ? `${Math.round((s.v / prev) * 100)}%` : '';
    const val = s.v == null ? '—' : fmtNum(s.v);
    return `<div class="fn-step"><span class="fdot ${s.c}"></span><span class="fv">${val}</span><span class="fl">${s.l}</span><span class="fd">${drop}</span></div>` +
      (i < steps.length - 1 ? arrow : '');
  }).join('');
}

function renderOvTodo(alerts, noCart, fc, acctSum) {
  const box = $('ovTodo'); if (!box) return;

  // เครดิต Flow — อ่านจากหน้า Flow ตอนเปิดอยู่ (content/flow.js เก็บลง storage)
  let flowItem;
  if (fc && fc.value != null) {
    const low = fc.value <= 10;
    flowItem = { level: low ? 'warn' : 'info', icon: 'flow',
      title: `เครดิต Flow เหลือ ${fmtNum(fc.value)}`,
      detail: `อ่านจากหน้า Flow ${timeAgo(fc.at)}${low ? ' · ใกล้หมด เติมก่อนสร้างคลิป' : ''}` };
  } else {
    flowItem = { level: 'info', icon: 'flow', title: 'ตรวจเครดิต Flow',
      detail: 'เปิดหน้า Google Flow ค้างไว้ ระบบจะอ่านเครดิตให้อัตโนมัติ' };
  }

  // งานประจำที่ปักหมุดไว้เสมอ — ทำมือ ไม่หายแม้ไม่มี alert
  const pinned = [];
  if (acctSum && acctSum.n > 0) {
    // มีบัญชีแล้ว → สรุปสด: กี่บัญชี/ทำคลิปได้เท่าไหร่ (แทนทั้งเตือนสมัคร + เครดิตหน้าเดียว)
    const dry = acctSum.usable === 0;
    pinned.push({
      level: dry ? 'warn' : 'info', icon: 'mail',
      title: `บัญชี Flow ${acctSum.n}/5 · ทำคลิปได้อีก ${fmtNum(acctSum.totalClips)} คลิป`,
      detail: dry
        ? 'ทุกบัญชีเครดิตใกล้หมด — รอรีเซ็ตพรุ่งนี้ หรือเพิ่มบัญชีใหม่ในแท็บเมล Flow'
        : `เครดิตรวม ${fmtNum(acctSum.totalCredit)} · พร้อมใช้ ${acctSum.usable} บัญชี`,
    });
  } else {
    // ยังไม่มีบัญชี → เตือนให้ตั้ง + การ์ดเครดิตจากหน้า Flow ที่เปิดอยู่
    pinned.push({ level: 'warn', icon: 'mail', title: 'ตั้งบัญชี Flow (เมล 5 อัน)', detail: 'เพิ่มบัญชี Google ในแท็บเมล Flow เพื่อหมุนใช้เครดิตฟรีต่อบัญชี' });
    pinned.push(flowItem);
  }

  const items = [...pinned, ...(alerts || [])];
  if (noCart > 0) items.push({ level: 'info', icon: 'link', title: `${fmtNum(noCart)} สินค้ายังไม่มีลิงก์ตะกร้า`, detail: 'ต้องดึงลิงก์ก่อนถึงจะโพสต์ได้' });

  box.innerHTML = items.slice(0, 8).map(a => {
    const ic = OV_ICONS[a.icon] || (a.level === 'info' ? OV_ICONS.inbox : OV_ICONS.alert);
    return `<div class="todo-it ${a.level || 'info'}"><div class="ti">${svgI(ic)}</div>` +
      `<div class="tt2"><b>${esc(a.title)}</b>${a.detail ? `<span>${esc(a.detail)}</span>` : ''}</div></div>`;
  }).join('');
}

// ④ กราฟเส้นสินค้าที่ดูดเข้าคลังต่อวัน 7 วัน — จาก scraped_at ของ products (ของจริงล้วน)
// หมายเหตุ: สินค้าทุกชิ้นดูดจาก Shopee แหล่งเดียว (ไม่มี field platform) จึงเป็นเส้นเดียว
function renderOvScrapeChart() {
  const W = 560, H = 200, padT = 16, padB = 8, DAYS = 7;
  const lines = $('ovLines'), xs = $('ovChartX'), leg = $('ovChartLeg');
  if (!lines || !xs) return;

  // เตรียมช่อง 7 วันย้อนหลัง (วันนี้อยู่ขวาสุด) ใช้เวลาท้องถิ่น
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (DAYS - 1));
  const keyOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    return { key: keyOf(d), label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, count: 0 };
  });
  const idx = Object.fromEntries(days.map((d, i) => [d.key, i]));

  let total = 0;
  for (const p of products) {
    if (!p.scraped_at) continue;
    const t = new Date(p.scraped_at);
    if (isNaN(t)) continue;
    const k = keyOf(t);
    if (k in idx) { days[idx[k]].count++; total++; }
  }

  if (!total) {
    lines.innerHTML = '';
    xs.innerHTML = '<span class="ov-empty">ยังไม่มีการดูดสินค้าใน 7 วันนี้</span>';
    if (leg) leg.innerHTML = '';
    return;
  }

  const n = days.length;
  const maxC = Math.max(1, ...days.map(d => d.count));
  const y0 = H - padB, span = H - padT - padB;
  const xAt = i => n === 1 ? W / 2 : (i / (n - 1)) * W;
  const yAt = v => y0 - (v / maxC) * span;
  const pts = days.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d.count).toFixed(1)}`).join(' ');
  lines.innerHTML = `<polyline class="lc lc-shopee" points="${pts}"/>`;
  xs.innerHTML = days.map(d => `<span>${d.label}</span>`).join('');
  if (leg) leg.innerHTML = `<span class="lg lc-leg lc-shopee">ดูดจาก Shopee · รวม ${fmtNum(total)} ชิ้น</span>`;
}

// ชิปกรองหมวด — สร้างจากหมวดที่ติดมากับสินค้าจริง (ดูดหมวดไหนค่อยโผล่หมวดนั้น)
function renderCatFilters() {
  const row = $('catRow'); if (!row) return;
  const counts = new Map();   // ชื่อหมวด → จำนวน
  let noneN = 0;
  products.forEach(p => { const c = catOf(p); if (c) counts.set(c, (counts.get(c) || 0) + 1); else noneN++; });
  // ไม่มีหมวดติดเลย → ซ่อนแถบ (สินค้าเก่าก่อนมีฟีเจอร์นี้)
  if (counts.size === 0) { row.hidden = true; catFilter = 'all'; return; }
  row.hidden = false;
  const cats = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'th'));
  // ถ้าหมวดที่เลือกอยู่หายไปแล้ว ดีดกลับ 'all'
  if (catFilter !== 'all' && catFilter !== '_none' && !counts.has(catFilter)) catFilter = 'all';
  if (catFilter === '_none' && !noneN) catFilter = 'all';
  const chip = (key, label, n) =>
    `<span class="cchip ${catFilter === key ? 'on' : ''}" data-cat="${esc(key)}">${esc(label)}<span class="cn">${n}</span></span>`;
  let html = chip('all', 'ทั้งหมด', products.length);
  cats.forEach(c => { html += chip(c, c, counts.get(c)); });
  if (noneN) html += chip('_none', 'ไม่ระบุหมวด', noneN);
  $('catFilters').innerHTML = html;
}

function renderLib() {
  renderCatFilters();
  const list = visibleProducts();
  $('libCount').textContent = list.length;
  $('libSel').textContent = selected.size;
  $('genBtn').disabled = busy || selected.size === 0;
  $('genLbl').textContent = busy ? 'กำลังทำงาน…' : (selected.size ? `สร้างคลิปจากที่เลือก (${selected.size})` : 'สร้างคลิปจากที่เลือก');
  const delBtn = $('delSel');
  if (delBtn) {
    delBtn.hidden = selected.size === 0;
    delBtn.textContent = `ลบที่เลือก (${selected.size})`;
  }
  const noCartN = products.filter(p => !hasCart(p)).length;
  const delNc = $('delNoCart');
  if (delNc) {
    delNc.hidden = noCartN === 0;
    delNc.textContent = `ลบที่ไม่มีตะกร้า (${noCartN})`;
  }

  const grid = $('pgrid');
  if (!products.length) {
    grid.innerHTML = `<div class="empty"><div class="eic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div><p>ยังไม่มีสินค้า<br>เปิดหน้า Affiliate แล้วใช้หน้าต่างลอย "เครื่องมือดูดสินค้า" มุมซ้ายล่าง</p></div>`;
    return;
  }
  if (!list.length) { grid.innerHTML = `<div class="empty"><p>ไม่พบสินค้าตามเงื่อนไข</p></div>`; return; }

  const cardHtml = p => {
    const id = esc(uid(p));
    const name = esc(p.basic_info?.name || 'ไม่มีชื่อ');
    const price = p.basic_info?.price ? `฿${Number(p.basic_info.price).toLocaleString()}` : '-';
    const comm = p.commission?.rate ? `<span class="co">คอม ${esc(p.commission.rate)}%</span>` : '';
    const sold = p.basic_info?.sold_count ? `<span class="sold">ขายแล้ว ${esc(p.basic_info.sold_count)}</span>` : '';
    const img = esc((p.images || [])[0] || '');
    const sel = selected.has(uid(p));
    const st = statusOf(p);
    const cart = hasCart(p);
    const vid = videoByUid[uid(p)];
    const thumb = img ? `<img class="pthumb" data-img="${img}" src="">` : `<div class="pthumb ph">${PH}</div>`;
    const viewBtn = vid ? `<div class="pacts"><button class="iconbtn view" data-view="${id}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> ดูคลิป</button></div>` : '';
    return `<div class="pcard ${sel ? 'sel' : ''}" data-id="${id}">
      <div class="chk">${sel ? CHECK : ''}</div>
      <button class="pdel" data-del="${id}" title="ลบออกจากคลัง"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      ${thumb}
      <div class="pbody">
        <div class="pnm">${name}</div>
        <div class="pmt"><span class="pr">${price}</span>${comm}${sold}</div>
        <div class="badges">
          <span class="bdg s-${st}">${ST_LABEL[st]}</span>
          <span class="bdg ${cart ? 'cart' : 'nocart'}">${cart ? 'มีตะกร้า' : 'ไม่มีตะกร้า'}</span>
          ${catOf(p) ? `<span class="bdg cat">${esc(catOf(p))}</span>` : ''}
        </div>
        ${viewBtn}
      </div>
    </div>`;
  };

  // จัดกลุ่มตามความพร้อมโพสต์: มีลิงก์ตะกร้าแล้ว vs ยังไม่มี — แต่ละกลุ่มพับ/ขยายได้
  const chev = `<svg class="gchev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
  const groupHtml = (key, dot, ttl, sub, items) => {
    if (!items.length) return '';
    const col = collapsedG.has(key);
    const selN = items.filter(p => selected.has(uid(p))).length;
    const subTxt = selN ? `เลือกแล้ว ${selN}` : sub;
    return `<div class="pgroup ${col ? 'col' : ''}" data-g="${key}">
      <button class="pgroup-hd" type="button" data-gtoggle="${key}">
        ${chev}<span class="gdot ${dot}"></span>
        <span class="gttl">${ttl}</span><span class="pgroup-n">${items.length}</span>
        <span class="gsub">${subTxt}</span>
      </button>
      <div class="pgroup-grid">${items.map(cardHtml).join('')}</div>
    </div>`;
  };
  const cartList = list.filter(p => hasCart(p));
  const noCartList = list.filter(p => !hasCart(p));
  grid.innerHTML =
    groupHtml('cart', 'ready', 'พร้อมโพสต์ · มีตะกร้า', 'มีลิงก์ตะกร้าแล้ว', cartList) +
    groupHtml('nocart', 'wait', 'ยังไม่มีตะกร้า', 'ต้องดึงลิงก์ก่อนโพสต์', noCartList);

  grid.querySelectorAll('[data-gtoggle]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.gtoggle;
    collapsedG.has(k) ? collapsedG.delete(k) : collapsedG.add(k);
    renderLib();
  }));
  grid.querySelectorAll('.pcard').forEach(c => c.addEventListener('click', e => {
    if (e.target.closest('[data-del]') || e.target.closest('[data-view]')) return;
    const id = c.dataset.id;
    selected.has(id) ? selected.delete(id) : selected.add(id);
    renderLib();
  }));
  grid.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.del;
    products = products.filter(p => uid(p) !== id); selected.delete(id);
    chrome.storage.local.set({ products }); render();
  }));
  grid.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    const v = videoByUid[b.dataset.view]; if (v) chrome.tabs.create({ url: api(v.url) });
  }));
  loadImages();
}

function loadImages() {
  document.querySelectorAll('img[data-img]').forEach(img => {
    const url = img.dataset.img; if (!url) return;
    img.removeAttribute('data-img'); img.referrerPolicy = 'no-referrer'; img.src = url;
    img.onerror = () => chrome.runtime.sendMessage({ action: 'fetch_image', url }, res => {
      if (res?.dataUrl) img.src = res.dataUrl;
      else img.replaceWith(Object.assign(document.createElement('div'), { className: 'pthumb ph', innerHTML: PH }));
    });
  });
}

// ── search / filter / select ──
$('q').addEventListener('input', e => { query = e.target.value; renderLib(); });
$('filters').addEventListener('click', e => {
  const c = e.target.closest('.fchip'); if (!c) return;
  filter = c.dataset.f;
  document.querySelectorAll('.fchip').forEach(x => x.classList.toggle('on', x === c));
  renderLib();
});
$('catFilters').addEventListener('click', e => {
  const c = e.target.closest('.cchip'); if (!c) return;
  catFilter = c.dataset.cat;
  renderLib();
});
$('selAll').addEventListener('click', () => {
  const list = visibleProducts();
  const allSel = list.length && list.every(p => selected.has(uid(p)));
  if (allSel) list.forEach(p => selected.delete(uid(p))); else list.forEach(p => selected.add(uid(p)));
  renderLib();
});
$('clearSel').addEventListener('click', () => { selected.clear(); renderLib(); });

// ── modal ยืนยันแบบใช้ซ้ำ — คืน Promise<boolean> ──
let _askResolve = null;
function askConfirm({ title = 'ยืนยัน', msg = '', okLabel = 'ลบ' } = {}) {
  $('askTitle').textContent = title;
  $('askMsg').textContent = msg;
  $('askOk').textContent = okLabel;
  $('askModal').classList.add('on');
  return new Promise(res => { _askResolve = res; });
}
function closeAsk(result) {
  $('askModal').classList.remove('on');
  if (_askResolve) { _askResolve(result); _askResolve = null; }
}
$('askCancel').addEventListener('click', () => closeAsk(false));
$('askOk').addEventListener('click', () => closeAsk(true));
$('askModal').addEventListener('click', e => { if (e.target === $('askModal')) closeAsk(false); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('askModal').classList.contains('on')) { e.preventDefault(); closeAsk(false); }
});

// ── ลบที่เลือก (เลือกทั้งหมดก่อน = ลบทั้งหมด) — ยืนยันผ่าน modal ──
$('delSel').addEventListener('click', async () => {
  const ids = new Set(selected);
  if (!ids.size) return;
  const list = visibleProducts();
  const allVisible = list.length && list.every(p => ids.has(uid(p)));
  const ok = await askConfirm({
    title: allVisible ? 'ลบสินค้าทั้งหมด' : 'ลบสินค้าที่เลือก',
    msg: `จะลบสินค้า ${ids.size} ชิ้นออกจากคลังถาวร (คลิปที่สร้างแล้วไม่ถูกลบ) — ยืนยันไหม?`,
    okLabel: `ลบ ${ids.size} ชิ้น`,
  });
  if (!ok) return;
  products = products.filter(p => !ids.has(uid(p)));
  ids.forEach(id => selected.delete(id));
  chrome.storage.local.set({ products });
  render();
});

// ── ลบเฉพาะกลุ่ม "ไม่มีตะกร้า" ทั้งคลัง — ยืนยันผ่าน modal ──
$('delNoCart').addEventListener('click', async () => {
  const targets = products.filter(p => !hasCart(p));
  if (!targets.length) return;
  const ok = await askConfirm({
    title: 'ลบสินค้าที่ไม่มีตะกร้า',
    msg: `จะลบสินค้าที่ยังไม่มีลิงก์ตะกร้า ${targets.length} ชิ้นออกจากคลังถาวร (ที่มีตะกร้าไม่ถูกแตะ) — ยืนยันไหม?`,
    okLabel: `ลบ ${targets.length} ชิ้น`,
  });
  if (!ok) return;
  const ids = new Set(targets.map(p => uid(p)));
  products = products.filter(p => !ids.has(uid(p)));
  ids.forEach(id => selected.delete(id));
  chrome.storage.local.set({ products });
  render();
});

// ══════════════════════════════════════════════════════════
//  เมล Flow — บัญชี Google หมุนใช้เครดิต Flow ฟรีต่อบัญชี
//  เก็บใน storage.local: flow_accounts[], flow_account_credits{}, flow_credit_threshold
// ══════════════════════════════════════════════════════════
const MAIL_AUTH_MAX = 4;            // authuser 0..4 (5 บัญชี)
const DAILY_CREDIT = 50;          // Flow ให้ฟรีวันละ 50 เครดิต/บัญชี
const CREDIT_PER_CLIP = 15;       // พิสูจน์แล้ว: คลิปละ ~15 เครดิต (≈3 คลิป/วัน)
let mailAccounts = [];             // {id,email,authuser,note,paused,created_at}
let mailCredits = {};             // { [authuser]: {value, at, src} } — ของเก่า (กรอกเอง/ตั้งต้น)
let mailCreditsByEmail = {};      // { [email]: {value, at, src} } — กลไกใหม่ flow.js เก็บแม่นๆ ผูกอีเมล
let mailThreshold = CREDIT_PER_CLIP;  // เหลือต่ำกว่านี้ = ทำคลิปไม่ได้แล้ว → สลับ
let mailActiveEmail = null;       // อีเมลที่ Flow login อยู่ตอนนี้ (อ่านจาก content/flow.js)
let mailEditId = null;            // id ที่กำลังแก้ (null = เพิ่มใหม่)
let mailPickAuth = 0;            // authuser ที่เลือกใน modal

async function loadMailData() {
  const d = await chrome.storage.local.get(['flow_accounts', 'flow_account_credits', 'flow_credits_by_email', 'flow_credit_threshold', 'flow_active_email']);
  mailAccounts = Array.isArray(d.flow_accounts) ? d.flow_accounts : [];
  mailCredits = d.flow_account_credits && typeof d.flow_account_credits === 'object' ? d.flow_account_credits : {};
  mailCreditsByEmail = d.flow_credits_by_email && typeof d.flow_credits_by_email === 'object' ? d.flow_credits_by_email : {};
  mailThreshold = Number.isFinite(d.flow_credit_threshold) ? d.flow_credit_threshold : CREDIT_PER_CLIP;
  mailActiveEmail = d.flow_active_email && d.flow_active_email.email ? String(d.flow_active_email.email).toLowerCase() : null;
}
function clipsLeft(v) { return Number.isFinite(v) ? Math.floor(v / CREDIT_PER_CLIP) : 0; }
function saveMailAccounts() { return chrome.storage.local.set({ flow_accounts: mailAccounts }); }
function saveMailCredits() { return chrome.storage.local.set({ flow_account_credits: mailCredits }); }

// เลือกค่าเครดิตของบัญชี: ผูกกับ "อีเมล" ก่อน (กลไกใหม่ — Flow สลับด้วยอีเมล ไม่สน authuser
// → ค่าผูก authuser ชนกันมั่ว) ไม่มีค่อย fallback ค่าเก่าที่ผูก authuser (กรอกเอง/ตั้งต้น)
function pickAccountCredit(acc, byEmail, byAuth) {
  const em = acc && acc.email ? String(acc.email).toLowerCase() : null;
  if (em && byEmail) { const e = byEmail[em]; if (e && Number.isFinite(e.value)) return e; }
  const c = byAuth && byAuth[acc.authuser];
  return c && Number.isFinite(c.value) ? c : null;
}
function mailCreditOf(acc) { return pickAccountCredit(acc, mailCreditsByEmail, mailCredits); }
function mailStatusOf(acc) {
  if (acc.paused) return 'paused';
  const c = mailCreditOf(acc);
  if (!c) return 'unknown';
  if (c.value < CREDIT_PER_CLIP) return 'exhausted';   // ทำคลิปไม่ได้แล้ว (เหลือไม่ถึง 1 คลิป)
  if (c.value <= mailThreshold) return 'low';
  return 'active';
}
const MAIL_STATUS_LABEL = { active: 'พร้อมใช้', low: 'ใกล้หมด', exhausted: 'หมดวันนี้', paused: 'พักไว้', unknown: 'ยังไม่รู้เครดิต' };

// บัญชีที่ระบบจะหยิบไปใช้รอบถัดไป: เครดิตมากสุด (เหนือเกณฑ์ก่อน) · ไม่นับที่พัก/หมด
function mailNextAccount() {
  const usable = mailAccounts.filter(a => { const s = mailStatusOf(a); return s !== 'paused' && s !== 'exhausted'; });
  if (!usable.length) return null;
  const score = a => { const c = mailCreditOf(a); return c ? c.value : -1; };  // unknown = -1 (ใช้ทีหลังสุด)
  const above = usable.filter(a => mailStatusOf(a) === 'active');
  const pool = above.length ? above : usable;
  return pool.slice().sort((x, y) => score(y) - score(x))[0];
}

function flowUrlForAuthuser(au) {
  const n = Number(au) || 0;
  return `https://labs.google/fx/th/tools/flow${n ? `?authuser=${n}` : ''}`;
}
function openFlowFor(acc) {
  // สลับบัญชี Flow ด้วย "อีเมล" — Flow ผูกบัญชีของตัวเอง ไม่สน authuser
  // background จะโฟกัสแท็บ Flow แล้วสั่ง logout → เลือกบัญชีอีเมลนี้ให้อัตโนมัติ
  // ★ ไม่ใช้ navigate_tab — อันนั้นเล็งแท็บ affiliate.shopee จะพาแท็บผิดไป
  if (acc && acc.email) {
    chrome.runtime.sendMessage({ action: 'switch_flow_account', email: acc.email });
  } else {
    // ไม่มีอีเมล → เปิดหน้า Flow เปล่าไว้ก่อน (ผู้ใช้กรอกอีเมลในบัญชีนี้ก่อนถึงสลับได้)
    chrome.runtime.sendMessage({ action: 'open_flow_account', authuser: Number(acc && acc.authuser) || 0 });
  }
}

function updateMailCount() {
  const el = $('mailCount'); if (!el) return;
  el.textContent = mailAccounts.length;
  el.style.display = mailAccounts.length ? '' : 'none';
}

async function renderMail() {
  await loadMailData();
  updateMailCount();
  $('mailThr').value = mailThreshold;
  thrClipHint();
  renderMailStats();
  renderMailList();
  renderMailNext();
}

function renderMailStats() {
  const counts = { active: 0, low: 0, exhausted: 0, paused: 0, unknown: 0 };
  let totalCredit = 0, totalClips = 0;
  mailAccounts.forEach(a => {
    counts[mailStatusOf(a)]++;
    const c = mailCreditOf(a);
    if (c) { totalCredit += c.value; totalClips += clipsLeft(c.value); }
  });
  const attn = counts.low + counts.exhausted;
  const capCredit = mailAccounts.length * DAILY_CREDIT;
  const cards = [
    { ic: 'mail', cls: 'green', num: `${mailAccounts.length}<span style="font-size:var(--t-lg);color:var(--faint)">/5</span>`, lbl: 'บัญชีทั้งหมด' },
    { ic: 'flow', cls: 'blue', num: `${fmtNum(totalCredit)}<span style="font-size:var(--t-lg);color:var(--faint)">/${fmtNum(capCredit)}</span>`, lbl: 'เครดิตรวมเหลือวันนี้' },
    { ic: 'send', cls: 'green', num: `≈${fmtNum(totalClips)}`, lbl: 'คลิปที่ทำได้วันนี้' },
    { ic: 'alert', cls: attn ? 'amber' : 'green', num: fmtNum(attn), lbl: 'ใกล้หมด / หมดวันนี้' },
  ];
  $('mailStats').innerHTML = cards.map(c => `
    <div class="scard">
      <div class="ic ${c.cls}">${svgI(OV_ICONS[c.ic])}</div>
      <div class="num">${c.num}</div>
      <div class="lbl">${c.lbl}</div>
    </div>`).join('');
}

function renderMailList() {
  const box = $('mailList');
  if (!mailAccounts.length) {
    box.innerHTML = `<div class="m-empty">
      ${svgI(OV_ICONS.mail, 1.6)}
      <div class="mt">ยังไม่มีบัญชี Flow</div>
      <div class="ms">เพิ่มบัญชี Google ที่ล็อกอินไว้ใน Chrome เดียวกัน ระบบจะหมุนใช้เครดิต Flow ฟรีของแต่ละบัญชีให้</div>
    </div>`;
    return;
  }
  const next = mailNextAccount();
  const ordered = mailAccounts.slice().sort((a, b) => a.authuser - b.authuser);
  box.innerHTML = ordered.map(a => {
    const st = mailStatusOf(a);
    const c = mailCreditOf(a);
    const isNext = next && a.id === next.id;
    const isActive = mailActiveEmail && a.email && a.email.toLowerCase() === mailActiveEmail;
    const pct = c ? Math.max(2, Math.min(100, (c.value / DAILY_CREDIT) * 100)) : 0;
    const clips = c ? clipsLeft(c.value) : 0;
    const credLine = c
      ? `<div class="cbar"><i style="width:${pct}%"></i></div>
         <span class="cval"><b>${fmtNum(c.value)}</b><span class="un">/${DAILY_CREDIT}</span></span>
         <span class="mclips">ทำได้อีก <b>${clips}</b> คลิป</span>`
      : `<span class="cval" style="color:var(--faint)">ยังไม่ทราบเครดิต — เปิดหน้า Flow ให้ระบบอ่าน</span>`;
    const srcTxt = c && c.src === 'manual' ? 'กรอกเอง' : (c && c.src === 'assumed' ? 'ตั้งต้นเต็มวัน' : 'อ่านจาก Flow');
    const when = c && c.at ? ` · ${srcTxt} ${timeAgo(c.at)}` : '';
    return `<div class="macc s-${st} ${isNext ? 'next' : ''} ${isActive ? 'now' : ''}" data-id="${esc(a.id)}">
      <div class="mau">u${a.authuser}</div>
      <div class="mbody">
        <div class="memail">${esc(a.email || '(ไม่ระบุอีเมล)')} ${isActive ? '<span class="mchip now">● login อยู่ตอนนี้</span>' : ''} ${isNext ? '<span class="mchip active">ใช้รอบถัดไป</span>' : ''}</div>
        ${a.note ? `<div class="mnote">${esc(a.note)}</div>` : ''}
        <div class="mcredit">${credLine}<span class="mchip ${st}">${MAIL_STATUS_LABEL[st]}</span></div>
        <div class="mmeta">authuser=${a.authuser}${when}</div>
      </div>
      <div class="macts">
        <button class="micon go" data-act="open" title="สลับแท็บ Flow มาใช้บัญชีนี้">${svgI('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>')}</button>
        <button class="micon" data-act="pause" title="${a.paused ? 'เลิกพัก' : 'พักบัญชีนี้'}">${svgI(a.paused ? '<polygon points="5 3 19 12 5 21 5 3"/>' : '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>')}</button>
        <button class="micon" data-act="edit" title="แก้ไข">${svgI('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>')}</button>
        <button class="micon del" data-act="del" title="ลบ">${svgI('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>')}</button>
      </div>
    </div>`;
  }).join('');
}

function whoamiLine() {
  // แถบบอกว่าตอนนี้ Flow login เมลไหน + ปุ่มตรวจสอบใหม่
  const who = mailActiveEmail
    ? `<span class="who-on">● Flow login อยู่: <b>${esc(mailActiveEmail)}</b></span>`
    : `<span class="who-off">ยังไม่รู้ว่า Flow login เมลไหน — กดตรวจสอบ</span>`;
  return `<div class="mwhoami">${who}
    <button class="btn-ghost sm" id="mailWhoami" title="เปิดเมนูบัญชีใน Flow แล้วอ่านอีเมลที่ login อยู่">ตรวจสอบ</button>
  </div>
  <div class="who-diag" id="mailWhoDiag"></div>`;
}
function whoDiagText(d) {
  // แปลงผลตรวจเป็นข้อความบอกว่าติดตรงไหน
  if (!d) return '';
  if (d.fromLabel) return `อ่านอีเมลจากหน้าได้เลย: ${esc(d.email || '?')}`;
  const parts = [];
  parts.push(d.foundBtn ? `เจอปุ่มโปรไฟล์ (${esc(d.foundBtn)})` : 'ไม่เจอปุ่มโปรไฟล์มุมขวาบน');
  if (d.foundBtn) {
    parts.push(d.clicked ? 'คลิกติด' : 'คลิกไม่ติด (debugger?)');
    parts.push(d.openedMenu ? 'เมนูเปิด' : 'เมนูไม่เปิด');
  }
  if (d.email) parts.push(`ได้อีเมล: ${esc(d.email)}`);
  else if (d.emailsSeen && d.emailsSeen.length) parts.push(`เห็นอีเมล: ${esc(d.emailsSeen.join(', '))}`);
  else parts.push('ยังอ่านอีเมลไม่ได้');
  return parts.join(' · ');
}
function bindWhoami() {
  const b = $('mailWhoami');
  if (!b) return;
  b.addEventListener('click', async () => {
    b.disabled = true; b.textContent = 'กำลังเช็ก…';
    const setDiag = (t) => { const el = $('mailWhoDiag'); if (el) el.textContent = t; };
    setDiag('เปิดแท็บ Flow แล้วเปิดเมนูบัญชี…');
    try {
      // โฟกัสแท็บ Flow ก่อน (ถ้าไม่มีให้เปิด) แล้วสั่งอ่านอีเมลโดยเปิดเมนูบัญชี
      const tabs = await chrome.tabs.query({ url: 'https://labs.google/fx/*' });
      let tab = tabs[0];
      let fresh = false;
      if (!tab) { tab = await chrome.tabs.create({ url: 'https://labs.google/fx/th/tools/flow', active: true }); fresh = true; }
      else { try { await chrome.tabs.update(tab.id, { active: true }); } catch {} }
      // แท็บเพิ่งเปิด → flow.js ยังไม่พร้อม รอสักครู่ค่อยสั่ง; ส่งซ้ำเผื่อรอบแรกพลาด
      const ping = async () => {
        try {
          const res = await chrome.tabs.sendMessage(tab.id, { action: 'read_active_email', openMenu: true });
          if (res && res.diag) setDiag(whoDiagText(res.diag));
          return res;
        } catch (e) { setDiag('ส่งคำสั่งไปแท็บ Flow ไม่ได้ — เปิดหน้า Flow ค้างไว้แล้วลองใหม่'); return null; }
      };
      if (fresh) await new Promise(r => setTimeout(r, 3000));
      const r1 = await ping();
      if (!r1 || !r1.email) setTimeout(ping, 2500);
    } catch {}
    // ผลจะอัปเดตผ่าน storage (flow_active_email) → onChanged รีเฟรชเอง; เผื่อไว้รีเฟรชอีกที
    setTimeout(() => { if ($('mailWhoami')) renderMailNext(); }, 7000);
  });
}
function renderMailNext() {
  const box = $('mailNext');
  const next = mailNextAccount();
  if (!next) {
    box.innerHTML = whoamiLine() + `<div class="mnext-none">${svgI(OV_ICONS.alert, 1.8)}<div>ยังไม่มีบัญชีที่ใช้ได้<br>เพิ่มบัญชีหรือเติมเครดิตก่อน</div></div>`;
    bindWhoami();
    return;
  }
  const c = mailCreditOf(next);
  const onNextAlready = mailActiveEmail && next.email && next.email.toLowerCase() === mailActiveEmail;
  box.innerHTML = whoamiLine() + `<div class="mnext-card">
    <div class="nx-au">
      <div class="nx-badge">u${next.authuser}</div>
      <div style="min-width:0">
        <div class="nx-email">${esc(next.email || '(ไม่ระบุอีเมล)')}</div>
        <div class="nx-sub">${c ? `เหลือ ${fmtNum(c.value)} เครดิต · ทำได้อีก ${clipsLeft(c.value)} คลิป` : 'ยังไม่ทราบเครดิต'}</div>
      </div>
    </div>
    <button class="btn-accent" id="mailNextOpen"${onNextAlready ? ' disabled' : ''}>
      ${svgI('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>', 2.2)}
      ${onNextAlready ? 'ใช้บัญชีนี้อยู่แล้ว' : 'สลับ Flow มาบัญชีนี้'}
    </button>
  </div>`;
  bindWhoami();
  $('mailNextOpen').addEventListener('click', () => openFlowFor(next));
}

// ── modal เพิ่ม/แก้บัญชี ──
function renderAuthPicker() {
  $('mailMAuth').innerHTML = Array.from({ length: MAIL_AUTH_MAX + 1 }, (_, n) =>
    `<button type="button" data-au="${n}" class="${n === mailPickAuth ? 'on' : ''}">u${n}</button>`).join('');
}
function openMailModal(acc) {
  mailEditId = acc ? acc.id : null;
  mailPickAuth = acc ? acc.authuser : firstFreeAuth();
  $('mailMTitle').textContent = acc ? 'แก้ไขบัญชี Flow' : 'เพิ่มบัญชี Flow';
  $('mailMEmail').value = acc ? (acc.email || '') : '';
  $('mailMNote').value = acc ? (acc.note || '') : '';
  const c = acc ? mailCreditOf(acc) : null;
  $('mailMCredit').value = c && c.src !== 'assumed' ? c.value : '';
  mCreditClipHint();
  $('mailMErr').hidden = true;
  renderAuthPicker();
  $('mailModal').classList.add('on');
  setTimeout(() => $('mailMEmail').focus(), 50);
}
function firstFreeAuth() {
  const used = new Set(mailAccounts.map(a => a.authuser));
  for (let n = 0; n <= MAIL_AUTH_MAX; n++) if (!used.has(n)) return n;
  return 0;
}
function closeMailModal() { $('mailModal').classList.remove('on'); mailEditId = null; }
function mailModalErr(msg) { const e = $('mailMErr'); e.textContent = msg; e.hidden = false; }

async function saveMailAccount() {
  const email = $('mailMEmail').value.trim();
  const note = $('mailMNote').value.trim();
  const au = mailPickAuth;
  const credRaw = $('mailMCredit').value.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return mailModalErr('รูปแบบอีเมลไม่ถูกต้อง');
  // authuser ซ้ำกับบัญชีอื่นไม่ได้ (1 authuser = 1 บัญชีใน Chrome)
  const clash = mailAccounts.find(a => a.authuser === au && a.id !== mailEditId);
  if (clash) return mailModalErr(`authuser u${au} ถูกใช้กับ ${clash.email || 'บัญชีอื่น'} แล้ว`);
  if (!mailEditId && mailAccounts.length >= MAIL_AUTH_MAX + 1) return mailModalErr('ครบ 5 บัญชีแล้ว (authuser 0–4)');

  if (mailEditId) {
    const acc = mailAccounts.find(a => a.id === mailEditId);
    if (acc) { acc.email = email; acc.note = note; acc.authuser = au; }
  } else {
    mailAccounts.push({ id: 'acc_' + au + '_' + mailAccounts.length, email, note, authuser: au, paused: false, created_at: Date.now() });
  }
  await saveMailAccounts();
  // เครดิต: กรอกเอง → manual, เว้นว่างตอนเพิ่มใหม่ → ถือว่าเต็มวัน 50
  if (credRaw !== '') {
    const v = Math.max(0, Math.min(DAILY_CREDIT, parseFloat(credRaw)));
    if (Number.isFinite(v)) { mailCredits[au] = { value: v, at: Date.now(), src: 'manual' }; await saveMailCredits(); }
  } else if (!mailCredits[au]) {
    mailCredits[au] = { value: DAILY_CREDIT, at: Date.now(), src: 'assumed' }; await saveMailCredits();
  }
  closeMailModal();
  renderMail();
}

async function deleteMailAccount(acc) {
  const ok = await askConfirm({
    title: 'ลบบัญชี Flow',
    msg: `ลบบัญชี ${acc.email || 'u' + acc.authuser} (authuser=${acc.authuser}) ออกจากรายการหมุนเครดิต — ยืนยันไหม? (ไม่กระทบบัญชี Google จริง)`,
    okLabel: 'ลบบัญชี',
  });
  if (!ok) return;
  mailAccounts = mailAccounts.filter(a => a.id !== acc.id);
  await saveMailAccounts();
  renderMail();
}

async function toggleMailPause(acc) {
  acc.paused = !acc.paused;
  await saveMailAccounts();
  renderMail();
}

// events: รายการบัญชี (delegation)
$('mailList').addEventListener('click', e => {
  const btn = e.target.closest('.micon'); if (!btn) return;
  const row = btn.closest('.macc'); if (!row) return;
  const acc = mailAccounts.find(a => a.id === row.dataset.id); if (!acc) return;
  const act = btn.dataset.act;
  if (act === 'open') openFlowFor(acc);
  else if (act === 'pause') toggleMailPause(acc);
  else if (act === 'edit') openMailModal(acc);
  else if (act === 'del') deleteMailAccount(acc);
});
$('mailAdd').addEventListener('click', () => openMailModal(null));
// ล็อกอิน Google เพิ่มบัญชีเข้า Chrome เดียวกัน (สมัคร/ยืนยันตัวตนยังต้องทำมือ ระบบช่วยแค่เปิดหน้า)
// ★ ห้ามใส่ ?continue= ที่ชี้ออกนอกโดเมน Google — โดน 400 malformed (labs.google ไม่ผ่าน)
//   ใช้ AddSession เปล่า ล็อกอินเสร็จแล้วค่อยกดปุ่ม "เปิด Flow" ของบัญชีนั้นเอง
$('mailLogin').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://accounts.google.com/AddSession', active: true });
});
$('mailMAuth').addEventListener('click', e => {
  const b = e.target.closest('button[data-au]'); if (!b) return;
  mailPickAuth = Number(b.dataset.au); renderAuthPicker();
});
$('mailMSave').addEventListener('click', saveMailAccount);
$('mailMCancel').addEventListener('click', closeMailModal);
$('mailMX').addEventListener('click', closeMailModal);
$('mailModal').addEventListener('click', e => { if (e.target === $('mailModal')) closeMailModal(); });
$('mailMEmail').addEventListener('keydown', e => { if (e.key === 'Enter') saveMailAccount(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('mailModal').classList.contains('on')) { e.preventDefault(); closeMailModal(); }
});

// แสดง "= N คลิป" สดข้าง ๆ ช่องตัวเลข
function thrClipHint() {
  const v = Number($('mailThr').value) || 0;
  $('mailThrClips').textContent = `(≈ ${clipsLeft(v)} คลิป)`;
}
function mCreditClipHint() {
  const raw = $('mailMCredit').value.trim();
  const v = raw === '' ? DAILY_CREDIT : (Number(raw) || 0);
  $('mailMCreditClips').textContent = `(≈ ${clipsLeft(v)} คลิป)`;
}
$('mailMCredit').addEventListener('input', mCreditClipHint);

// threshold: บันทึกเมื่อแก้ค่า
$('mailThr').addEventListener('input', () => { $('mailThrSave').hidden = false; thrClipHint(); });
$('mailThrSave').addEventListener('click', async () => {
  const v = Math.max(0, Math.floor(Number($('mailThr').value) || 0));
  mailThreshold = v; $('mailThr').value = v;
  await chrome.storage.local.set({ flow_credit_threshold: v });
  $('mailThrSave').hidden = true;
  renderMailStats(); renderMailList(); renderMailNext();
});

// โหลดตัวนับแบดจ์ครั้งแรก
loadMailData().then(updateMailCount);

// ── generate (collect cart links → modal เลือกตัวละคร/สไตล์ → flow) ──
function chosenProducts() { return products.filter(p => selected.has(uid(p))); }
$('genBtn').addEventListener('click', () => collectThenGenerate());
$('cfCancel').addEventListener('click', () => { $('confirm').classList.remove('on'); });
$('cfProceed').addEventListener('click', () => { $('confirm').classList.remove('on'); openGenModal(chosenProducts()); });

async function collectThenGenerate() {
  if (busy) return;
  const sel = chosenProducts();
  if (!sel.length) return;
  busy = true; renderLib();
  go('mon');

  const need = sel.filter(p => !hasCart(p));
  const names = need.map(p => p.basic_info?.name).filter(Boolean);

  if (names.length) {
    logTo('monLog', `เก็บลิงก์ตะกร้า ${names.length} ชิ้น (ต้องเปิดหน้า Affiliate ที่มีสินค้าค้างไว้)…`);
    const res = await new Promise(r =>
      chrome.runtime.sendMessage({ action: 'collect_links', names }, x => r(x || { success: false, error: 'ไม่ตอบ' })));
    (res.debug || []).forEach(line => logTo('monLog', '· ' + line, 'dim'));
    if (!res.success) {
      logTo('monLog', 'เก็บลิงก์ไม่สำเร็จ: ' + res.error, 'e');
    } else {
      const links = res.links || {}; let merged = 0;
      products.forEach(p => {
        const nm = p.basic_info?.name;
        if (nm && links[nm] && !hasCart(p)) { p.links = p.links || {}; p.links.affiliate_link = links[nm]; merged++; }
      });
      chrome.storage.local.set({ products });
      logTo('monLog', `เก็บลิงก์ตะกร้าได้ ${merged}/${names.length} ชิ้น`, merged ? 's' : 'e');
    }
  }

  const still = chosenProducts().filter(p => !hasCart(p));
  busy = false; renderLib();
  if (still.length) {
    go('lib');
    $('confirmMsg').textContent = `ยังมี ${still.length} ชิ้นที่ไม่มีลิงก์ตะกร้า — ถ้าสร้างต่อจะใช้ลิงก์สินค้าปกติแทน (โพสต์ได้ แต่ไม่ใช่ตะกร้า) ต้องการสร้างต่อไหม?`;
    $('confirm').classList.add('on');
  } else {
    openGenModal(chosenProducts());
  }
}

// ── modal ตั้งค่าก่อนสร้าง: เลือกตัวละคร + สไตล์ → ยืนยันแล้วค่อยเข้า Flow ──
// ตัวละคร 3D จริง (.glb) เป็น default ของโปรแกรม — หมุนดูได้ในพรีวิว
// robot: three.js RobotExpressive (MIT) · fox3d: Khronos Fox (CC0/CC-BY) · duck: Khronos Duck
const GEN_CHARS = [
  { id: 'robot', name: 'บอตตี้', tag: 'หุ่นยนต์ขี้เล่น สดใส', hue: '#facc15', model: 'models/robot.glb',
    desc: 'หุ่นยนต์การ์ตูน 3D สีเหลืองน่ารัก ขี้เล่น สดใส' },
  { id: 'duck', name: 'ก๊าบก๊าบ', tag: 'เป็ดเหลืองสุดน่ารัก', hue: '#fbbf24', model: 'models/duck.glb',
    desc: 'เป็ดยางสีเหลืองการ์ตูน 3D น่ารัก สดใส' },
  { id: 'fox3d', name: 'ฟ็อกซ์', tag: 'จิ้งจอกโลว์โพลี เท่', hue: '#f97316', model: 'models/fox3d.glb',
    desc: 'จิ้งจอกการ์ตูน 3D โลว์โพลีน่ารัก ฉลาด ขายเก่ง' },
  { id: 'self', name: 'ตัวละครของฉัน', tag: 'อัปรูปหรือโมเดล .glb', hue: '#a855f7', desc: '' },
];
const GEN_STYLES = [
  { id: 'hardsell', name: 'ขายดุดัน', desc: 'เปิดมาขายทันที พลังสูง ย้ำราคา เร่งด่วน สั่งกดตะกร้าเดี๋ยวนี้ — เปิดก็ขาย จบก็ขาย' },
  { id: 'selfie', name: 'เซลฟี่รีวิว', desc: 'เหมือนถ่ายหน้ากล้องเอง จริงใจ เนียนเป็นรีวิวจริงไม่ใช่โฆษณา' },
  { id: 'shock', name: 'ตกใจราคา', desc: 'เปิดคลิปด้วยช็อตตกใจ — หยุดนิ้วคนเลื่อนฟีดใน 1 วินาทีแรก' },
  { id: 'demo', name: 'สาธิตของ', desc: 'โชว์ใช้งานจริงให้เห็นผลชัด แล้วปิดด้วยประโยคขายประโยคเดียว' },
];
// กลุ่มเป้าหมาย — ป้อนเข้า Gemini ให้ปรับ hook/ภาษา/บรรยากาศตามคนดู
const GEN_AUDS = [
  { id: 'all', name: 'ทุกคน', desc: 'ภาษาเข้าใจง่าย เน้นความคุ้มค่า ใครดูก็อิน', hint: 'คนทั่วไปทุกวัย — ภาษาง่าย เน้นความคุ้มค่าและประโยชน์ที่เห็นภาพทันที' },
  { id: 'teen', name: 'วัยรุ่น Gen Z', desc: 'จังหวะเร็ว สีจัดจ้าน ภาษาเทรนด์ พลังสูง', hint: 'วัยรุ่น Gen Z — จังหวะเร็ว มีพลัง ใช้คำติดเทรนด์แบบธรรมชาติ สีสันจัดจ้าน ห้ามดูพยายามเป็นวัยรุ่น' },
  { id: 'worker', name: 'คนทำงาน', desc: 'แก้ปัญหาชีวิตประจำวัน ประหยัดเวลา ดูเนี้ยบ', hint: 'คนทำงานออฟฟิศ — เปิดด้วยปัญหาชีวิตประจำวันที่อินทันที เน้นประหยัดเวลา/สะดวก โทนเนี้ยบทันสมัย' },
  { id: 'family', name: 'แม่บ้าน & ครอบครัว', desc: 'ของใช้ในบ้าน ความคุ้ม น่าเชื่อถือ อบอุ่น', hint: 'แม่บ้านและคนดูแลครอบครัว — เน้นความคุ้มราคา ใช้งานจริงในบ้าน ปลอดภัย โทนอบอุ่นจริงใจเหมือนเพื่อนบ้านแนะนำ' },
  { id: 'gadget', name: 'สายแกดเจ็ต', desc: 'โชว์ฟังก์ชันเด่น ลูกเล่นเท่ๆ สเปกชัด', hint: 'สายแกดเจ็ต/เทค — โชว์ฟังก์ชันเด็ดที่สุดให้เห็นจริง ลูกเล่นเท่ มุมกล้องไดนามิก โทนล้ำสมัย' },
  { id: 'beauty', name: 'สายบิวตี้ & สุขภาพ', desc: 'ผลลัพธ์เห็นชัด ผิวสวย ก่อน-หลัง', hint: 'สายความงาม/สุขภาพ — เน้นผลลัพธ์ที่เห็นด้วยตา (ผิว/รูปลักษณ์ก่อน-หลัง) แสงสวยผิวโกลว์ โทนสะอาดหรู' },
];
// ฉากหลัง — ป้อนเข้า prompt ตรงๆ
const GEN_BGS = [
  { id: 'studio', name: 'สตูดิโอสว่าง', p: 'สตูดิโอแสงสว่างสะอาดตา พื้นหลังสีพาสเทล' },
  { id: 'living', name: 'ห้องนั่งเล่นอบอุ่น', p: 'ห้องนั่งเล่นโทนอบอุ่น แสงธรรมชาติจากหน้าต่าง บรรยากาศบ้านจริง' },
  { id: 'kitchen', name: 'ครัว', p: 'ครัวสมัยใหม่สว่างสะอาด มีอุปกรณ์ครัวเป็นฉากหลังเบลอๆ' },
  { id: 'outdoor', name: 'กลางแจ้งแดดสวย', p: 'กลางแจ้งแสงแดดสวยตอนเย็น โทนสดชื่นมีชีวิตชีวา' },
  { id: 'neon', name: 'นีออนกลางคืน', p: 'ฉากกลางคืนแสงนีออนชมพู-ฟ้า สไตล์ไวรัลทันสมัย' },
  { id: 'minimal', name: 'มินิมอลพื้นขาว', p: 'ฉากมินิมอลพื้นหลังขาวเรียบ เงานุ่ม ดูพรีเมียม' },
];
// บรรยากาศ — คุมแสง + โทนสี + อารมณ์ภาพรวม (ลง lighting/color_grade/ambiance)
const GEN_MOODS = [
  { id: 'warm',     name: 'อบอุ่น',      p: 'บรรยากาศอบอุ่นเป็นกันเอง แสงนวลโทนทอง สีอุ่นสบายตา' },
  { id: 'premium',  name: 'พรีเมียมหรู',  p: 'บรรยากาศพรีเมียมหรูหรา แสงนุ่มคุมเงา โทนสีลึกสะอาด ดูมีระดับ' },
  { id: 'fun',      name: 'สนุกสดใส',     p: 'บรรยากาศสนุกสดใสมีพลัง สีจัดสว่าง จังหวะมีชีวิตชีวา' },
  { id: 'minimal',  name: 'มินิมอลสะอาด', p: 'บรรยากาศมินิมอลสะอาดตา โทนสีเดียวเรียบ พื้นที่ว่างเยอะ เน้นสินค้าเด่น' },
  { id: 'dramatic', name: 'ดราม่าเข้ม',   p: 'บรรยากาศดราม่าคอนทราสต์สูง แสงเน้นเฉพาะจุด เงาเข้ม ดูน่าตื่นเต้น' },
];
// โหมดเสียง — ตัวคุมหลัก: ไม่มีเสียงพูด = ต้องขายด้วยภาพ ดูตอนปิดเสียงก็เข้าใจ
const GEN_SOUNDS = [
  { id: 'voice', name: 'มีเสียงพูด',    d: 'ตัวละครพูดขายเต็มเสียง มีบทพูด' },
  { id: 'mute',  name: 'ไม่มีเสียงพูด', d: 'ขายด้วยภาพ-แอ็กชัน ดูตอนปิดเสียงก็เข้าใจ' },
];
// น้ำเสียง — ลง audio.voice (ใช้เมื่อมีเสียงพูด)
const GEN_VOICES = [
  { id: 'bright',   name: 'สดใสกระตือรือร้น', p: 'น้ำเสียงสดใสกระตือรือร้น พลังบวก พูดชวนเชื่อ' },
  { id: 'calm',     name: 'นุ่มน่าเชื่อถือ',   p: 'น้ำเสียงนุ่มหนักแน่นน่าเชื่อถือ พูดชัดสุขุม' },
  { id: 'lux',      name: 'หรูมีระดับ',        p: 'น้ำเสียงหรูมีระดับ นุ่มลึก ดูพรีเมียม' },
  { id: 'hype',     name: 'ดุดันเร่งเร้า',     p: 'น้ำเสียงดุดันเร่งเร้า พลังสูง กระตุ้นให้รีบกด' },
  { id: 'friendly', name: 'เป็นกันเองจริงใจ',  p: 'น้ำเสียงเป็นกันเองจริงใจ เหมือนเพื่อนแนะนำ' },
];
// ภาษาบทพูด — ลง dialogue language
const GEN_LANGS = [
  { id: 'th',    name: 'ไทย',         p: 'พูดภาษาไทยกลางชัดเจน' },
  { id: 'en',    name: 'อังกฤษ',       p: 'speak natural fluent English' },
  { id: 'north', name: 'คำเมือง',      p: 'พูดภาษาเหนือ (คำเมือง) เป็นธรรมชาติ' },
  { id: 'isan',  name: 'อีสาน',        p: 'พูดภาษาอีสานเป็นธรรมชาติ' },
  { id: 'mix',   name: 'ไทยปนอังกฤษ',  p: 'พูดไทยปนคำอังกฤษแบบวัยรุ่นเป็นธรรมชาติ' },
];
// แนวเพลงประกอบ — ลง audio.music
const GEN_MUSICS = [
  { id: 'upbeat', name: 'อัปบีตสนุก', p: 'เพลงอัปบีตจังหวะสนุกมีพลัง' },
  { id: 'edm',    name: 'EDM เร้าใจ', p: 'เพลง EDM จังหวะเร้าใจ ดรอปมันส์' },
  { id: 'cute',   name: 'น่ารักสดใส', p: 'เพลงน่ารักสดใสจังหวะเด้ง' },
  { id: 'chill',  name: 'ชิลฟังสบาย', p: 'เพลงชิลฟังสบายโทนอุ่น' },
  { id: 'lux',    name: 'หรูมินิมอล', p: 'เพลงโทนหรูมินิมอล เปียโน/บีตเบาๆ' },
  { id: 'none',   name: 'ไม่ใส่เพลง', p: '' },
];
// Veo สร้างทีละ 8 วิ — ยาวกว่านั้น = หลายคลิปต่อเนื่องกัน (desktop ต่อเป็นไฟล์เดียวให้)
const GEN_LENS = [
  { n: 1, t: '10 วิ', d: '1 คลิป · 1 เครดิต' },
  { n: 2, t: '20 วิ', d: '2 คลิปต่อเนียน · 2 เครดิต' },
  { n: 3, t: '30 วิ', d: '3 คลิปต่อเนียน · 3 เครดิต' },
];
const GEN_ENGINES = [
  { id: 'i2v', t: 'หน้าเป๊ะ', d: 'รูปจริง→วิดีโอ (nano banana) หน้าเหมือนสุด' },
  { id: 'agent', t: 'เอเจนต์', d: 'AI เขียนเอง · เร็ว แต่หน้าอาจเพี้ยน' },
];
const GM_CK = `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const GM_CAM = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
const GM_PLUS = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
let genOpt = { charId: 'robot', engine: 'i2v', style: 'hardsell', aud: 'all', bg: 'studio', len: 1,
  mood: 'warm', sound: 'voice', voice: 'bright', lang: 'th', music: 'upbeat' };
let pendingGen = [];
let selfPhoto = null;

let gmStep = 1;
let gmMax = 1;   // ขั้นไกลสุดที่เคยไปถึง — ให้กดย้อน/ข้ามกลับมาที่ขั้นนั้นได้
let charModelUrl = null;   // blob URL ของโมเดล .glb (เก็บไฟล์จริงใน IndexedDB — ใหญ่เกิน chrome.storage)

// IndexedDB เก็บไฟล์ใหญ่ (โมเดล 3D)
const idb = {
  open: () => new Promise((res, rej) => {
    const r = indexedDB.open('vgap', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }),
  async set(k, v) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('files', 'readwrite');
      t.objectStore('files').put(v, k);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  },
  async get(k) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const q = db.transaction('files').objectStore('files').get(k);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  },
};

function renderGmChars() {
  $('gmChars').innerHTML = GEN_CHARS.map(c => {
    const face = c.id === 'self'
      ? (selfPhoto ? `<img src="${selfPhoto}">` : `<div class="ph">${GM_CAM}</div>`)
      : `<img src="avatars/${c.id}.png">`;
    return `<div class="gm-thumb ${genOpt.charId === c.id ? 'on' : ''}" data-id="${c.id}">
      ${face}<div class="nm">${esc(c.name)}</div></div>`;
  }).join('');
  $('gmSelf').classList.toggle('on', genOpt.charId === 'self');
  $('gmSlot').style.backgroundImage = selfPhoto ? `url(${selfPhoto})` : '';
  $('gmSlot').innerHTML = selfPhoto ? '' : GM_PLUS;
  $('gmSlotGlb').innerHTML = charModelUrl
    ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`
    : GM_PLUS;
  renderGmPreview();
}
// พรีวิวใหญ่ฝั่งซ้าย (สไตล์ Rodin): พื้นเรืองสีประจำตัว + ตัวละครลอย + ป้ายชื่อ
function renderGmPreview() {
  const c = GEN_CHARS.find(x => x.id === genOpt.charId);
  const prev = $('gmPrev');
  prev.style.setProperty('--ph', c.hue || '#1f5c3d');
  const img = $('gmPrevImg');
  const mv = $('gmModel');
  mv.style.display = 'none'; img.style.display = 'none'; $('gmPrevPh').style.display = 'none';
  let tag = c.tag;
  if (c.model) {                       // ตัวละคร default = โมเดล 3D จริง
    mv.src = c.model; mv.style.display = '';
    tag = `${c.tag} — ลากหมุนดูได้`;
  } else if (c.id === 'self') {
    if (charModelUrl) { mv.src = charModelUrl; mv.style.display = ''; tag = 'โมเดล 3D — ลากหมุนดูได้'; }
    else if (selfPhoto) { img.src = selfPhoto; img.style.display = ''; tag = 'ตัวละครของคุณ'; }
    else { $('gmPrevPh').style.display = 'flex'; tag = 'อัปรูปหรือโมเดลด้านล่างก่อน'; }
  } else {
    img.src = `avatars/${c.id}.png`; img.style.display = '';
  }
  $('gmPrevName').textContent = c.name;
  $('gmPrevTag').textContent = tag;
  prev.classList.remove('pop'); void prev.offsetWidth; prev.classList.add('pop');   // เด้งเข้าใหม่ทุกครั้งที่สลับตัว
}
// เอียงตามเมาส์ — ให้ความรู้สึกหมุนดูโมเดล 3D
$('gmPrev').addEventListener('mousemove', (e) => {
  const r = $('gmPrev').getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  $('gmPrevImg').style.transform = `rotateY(${(x * 18).toFixed(1)}deg) rotateX(${(-y * 14).toFixed(1)}deg)`;
});
$('gmPrev').addEventListener('mouseleave', () => { $('gmPrevImg').style.transform = ''; });
function renderGmAuds() {
  $('gmAuds').innerHTML = GEN_AUDS.map(a => `
    <div class="gm-style ${genOpt.aud === a.id ? 'on' : ''}" data-id="${a.id}">
      <div class="t"><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></div>
      <div class="ck">${GM_CK}</div>
    </div>`).join('');
}
function renderGmStyles() {
  $('gmStyles').innerHTML = GEN_STYLES.map(s => `
    <div class="gm-style ${genOpt.style === s.id ? 'on' : ''}" data-id="${s.id}">
      <div class="t"><b>${esc(s.name)}</b><span>${esc(s.desc)}</span></div>
      <div class="ck">${GM_CK}</div>
    </div>`).join('');
  $('gmLens').innerHTML = GEN_LENS.map(l => `
    <div class="gm-len ${(genOpt.len || 1) === l.n ? 'on' : ''}" data-n="${l.n}">
      <b>${l.t}</b><span>${l.d}</span>
    </div>`).join('');
  if ($('gmEngine')) $('gmEngine').innerHTML = GEN_ENGINES.map(e => `
    <div class="gm-len ${(genOpt.engine || 'i2v') === e.id ? 'on' : ''}" data-id="${e.id}">
      <b>${esc(e.t)}</b><span>${esc(e.d)}</span></div>`).join('');
  $('gmBgs').innerHTML = GEN_BGS.map(b => `
    <span class="gm-bg ${genOpt.bg === b.id ? 'on' : ''}" data-id="${b.id}">${esc(b.name)}</span>`).join('');
  $('gmMoods').innerHTML = GEN_MOODS.map(m => `
    <span class="gm-bg ${genOpt.mood === m.id ? 'on' : ''}" data-id="${m.id}">${esc(m.name)}</span>`).join('');
  $('gmSounds').innerHTML = GEN_SOUNDS.map(s => `
    <div class="gm-len ${genOpt.sound === s.id ? 'on' : ''}" data-id="${s.id}">
      <b>${esc(s.name)}</b><span>${esc(s.d)}</span></div>`).join('');
  $('gmMusics').innerHTML = GEN_MUSICS.map(m => `
    <span class="gm-bg ${genOpt.music === m.id ? 'on' : ''}" data-id="${m.id}">${esc(m.name)}</span>`).join('');
  // ไม่มีเสียงพูด → ซ่อนน้ำเสียง+ภาษา (ไม่มีบทพูดให้ปรับ)
  const speak = genOpt.sound !== 'mute';
  $('gmVoiceWrap').style.display = speak ? '' : 'none';
  $('gmLangWrap').style.display = speak ? '' : 'none';
  if (speak) {
    $('gmVoices').innerHTML = GEN_VOICES.map(v => `
      <span class="gm-bg ${genOpt.voice === v.id ? 'on' : ''}" data-id="${v.id}">${esc(v.name)}</span>`).join('');
    $('gmLangs').innerHTML = GEN_LANGS.map(l => `
      <span class="gm-bg ${genOpt.lang === l.id ? 'on' : ''}" data-id="${l.id}">${esc(l.name)}</span>`).join('');
  }
  gmAdvSummary();
}
// สรุปย่อค่าใน accordion ให้เห็นได้โดยไม่ต้องกางออก
function gmAdvSummary() {
  const sBg = (GEN_BGS.find(b => b.id === genOpt.bg) || {}).name || '';
  const sMood = (GEN_MOODS.find(m => m.id === genOpt.mood) || {}).name || '';
  const sSnd = genOpt.sound === 'mute' ? 'ไม่มีเสียงพูด' : ((GEN_MUSICS.find(m => m.id === genOpt.music) || {}).name || '');
  $('gmAdvSum').textContent = [sBg, sMood, sSnd].filter(Boolean).join(' · ');
}
// เลือก option แบบอัปเดตไฮไลต์ในที่ (ไม่ re-render ทั้งสเต็ป — ลื่นกว่า)
function gmSelIn(wrap, sel, attr, val) {
  const v = String(val);
  $(wrap).querySelectorAll(sel).forEach(el => el.classList.toggle('on', String(el.dataset[attr]) === v));
}
function renderGmSummary() {
  const ch = GEN_CHARS.find(c => c.id === genOpt.charId);
  const st = GEN_STYLES.find(s => s.id === genOpt.style);
  const face = $('gmSumFace');
  if (genOpt.charId === 'self' && selfPhoto) { face.style.backgroundImage = `url(${selfPhoto})`; face.innerHTML = ''; }
  else { face.style.backgroundImage = ''; face.innerHTML = `<img src="avatars/${genOpt.charId}.png">`; }
  $('gmSumChar').textContent = ch.name;
  const len = GEN_LENS.find(l => l.n === (genOpt.len || 1)) || GEN_LENS[0];
  const aud = GEN_AUDS.find(a => a.id === genOpt.aud) || GEN_AUDS[0];
  const bg = GEN_BGS.find(b => b.id === genOpt.bg) || GEN_BGS[0];
  const mood = GEN_MOODS.find(m => m.id === genOpt.mood) || GEN_MOODS[0];
  const mus = GEN_MUSICS.find(m => m.id === genOpt.music) || GEN_MUSICS[0];
  let extra = ` · ${mood.name}`;
  if (genOpt.sound === 'mute') extra += ' · ไม่มีเสียงพูด';
  else {
    const vo = GEN_VOICES.find(v => v.id === genOpt.voice) || GEN_VOICES[0];
    const lg = GEN_LANGS.find(l => l.id === genOpt.lang) || GEN_LANGS[0];
    extra += ` · เสียง${vo.name} · ${lg.name}`;
  }
  if (mus.id !== 'none') extra += ` · เพลง${mus.name}`;
  $('gmSumStyle').textContent = `${st.name} · ขายให้${aud.name} · ฉาก${bg.name} · ยาว ${len.t}${len.n > 1 ? ` (${len.n} คลิปต่อเนียน)` : ''}${extra}`;
  const names = pendingGen.map(p => p.basic_info?.name || '?');
  $('gmSumList').textContent = `จะสร้าง ${pendingGen.length} คลิป: ${names.slice(0, 3).map(n => String(n).slice(0, 28)).join(' · ')}${names.length > 3 ? ` และอีก ${names.length - 3} ตัว` : ''}`;
}
const GM_TITLES = { 1: 'ใครเป็นคนรีวิว?', 2: 'ขายให้ใคร?', 3: 'คลิปแนวไหน?', 4: 'พร้อมสร้างแล้ว' };
function showGmStep(n) {
  gmStep = n;
  [1, 2, 3, 4].forEach(i => $('gmS' + i).classList.toggle('on', i === n));
  $('gmStepLbl').textContent = `ขั้นที่ ${n} จาก 4`;
  $('gmTitle').textContent = GM_TITLES[n];
  $('gmBar').style.width = `${Math.round(n / 4 * 100)}%`;
  gmMax = Math.max(gmMax, n);
  document.querySelectorAll('.gm-stp').forEach(s => {
    const i = +s.dataset.s;
    s.classList.toggle('on', i === n);
    s.classList.toggle('done', i < n);
    s.classList.toggle('clickable', i <= gmMax && i !== n);
  });
  $('gmBack').textContent = n === 1 ? 'ยกเลิก' : 'ย้อนกลับ';
  $('gmTry').style.display = n === 4 ? '' : 'none';
  $('gmGo').textContent = n === 4 ? `สร้างจริง ${pendingGen.length} คลิป` : 'ถัดไป';
  if (n === 1) renderGmChars();
  if (n === 2) renderGmAuds();
  if (n === 3) renderGmStyles();
  if (n === 4) renderGmSummary();
  // ขั้น 1 ต้องมีรูปหรือโมเดลก่อนถ้าเลือก "ตัวละครของฉัน"
  $('gmGo').disabled = n === 1 && genOpt.charId === 'self' && !selfPhoto && !charModelUrl;
}
async function openGenModal(prods) {
  if (!prods.length) return;
  pendingGen = prods;
  const d = await chrome.storage.local.get(['gen_options', 'engine_profile']);
  if (d.gen_options) genOpt = { ...genOpt, ...d.gen_options };
  if (!GEN_CHARS.some(c => c.id === genOpt.charId)) genOpt.charId = 'robot';   // ค่าเก่าจากชุดตัวละครก่อนหน้า
  selfPhoto = (((d.engine_profile || {}).presenter || {}).photos || [])[0] || null;
  if (!charModelUrl) {
    try {
      const blob = await idb.get('char_model');
      if (blob) charModelUrl = URL.createObjectURL(blob);
    } catch {}
  }
  $('gmAdv').classList.remove('open');   // เริ่มแบบพับไว้เสมอ ให้ขั้น 3 โล่ง
  gmMax = 1;
  showGmStep(1);
  $('gmodal').classList.add('on');
}
async function gmStart(dry) {
  // โมเดล 3D โชว์อยู่ → แคปภาพจากมุมที่ผู้ใช้หมุนไว้ ใช้เป็นรูปอ้างอิงส่งเข้า Flow
  let snapshot = null;
  if ($('gmModel').style.display !== 'none') {
    try {
      const snap = $('gmModel').toDataURL('image/png');
      if (snap && snap.length > 200) snapshot = snap;
    } catch {}
  }
  if (genOpt.charId === 'self' && snapshot) {
    // เก็บไว้ใช้รอบหน้า/แชร์กับ sidepanel ด้วย
    selfPhoto = snapshot;
    const d = await chrome.storage.local.get('engine_profile');
    const prof = d.engine_profile || {};
    prof.presenter = prof.presenter || {};
    prof.presenter.photos = [snapshot, ...(prof.presenter.photos || []).slice(1)];
    await chrome.storage.local.set({ engine_profile: prof });
  }
  chrome.storage.local.set({ gen_options: genOpt });
  $('gmodal').classList.remove('on');
  const ch = GEN_CHARS.find(c => c.id === genOpt.charId);
  const aud = GEN_AUDS.find(a => a.id === genOpt.aud) || GEN_AUDS[0];
  const bg = GEN_BGS.find(b => b.id === genOpt.bg) || GEN_BGS[0];
  const mood = GEN_MOODS.find(m => m.id === genOpt.mood) || GEN_MOODS[0];
  const vo = GEN_VOICES.find(v => v.id === genOpt.voice) || GEN_VOICES[0];
  const lg = GEN_LANGS.find(l => l.id === genOpt.lang) || GEN_LANGS[0];
  const mus = GEN_MUSICS.find(m => m.id === genOpt.music) || GEN_MUSICS[0];
  launchFlow(pendingGen, {
    charId: genOpt.charId, engine: genOpt.engine || 'i2v', style: genOpt.style, len: genOpt.len || 1,
    charName: ch.name, charDesc: ch.desc, snapshot,
    audName: aud.name, audHint: aud.hint, bgName: bg.name, bgPrompt: bg.p,
    moodName: mood.name, moodPrompt: mood.p,
    sound: genOpt.sound,
    voiceName: vo.name, voicePrompt: vo.p,
    langName: lg.name, langPrompt: lg.p,
    musicName: mus.name, musicPrompt: mus.p,
  }, dry);
}
function gmDownscale(file) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 512 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => res(null);
    img.src = URL.createObjectURL(file);
  });
}
$('gmChars').addEventListener('click', e => {
  const c = e.target.closest('.gm-thumb'); if (!c) return;
  genOpt.charId = c.dataset.id; showGmStep(1);
});
$('gmStyles').addEventListener('click', e => {
  const s = e.target.closest('.gm-style'); if (!s) return;
  genOpt.style = s.dataset.id; gmSelIn('gmStyles', '.gm-style', 'id', genOpt.style);
});
$('gmLens').addEventListener('click', e => {
  const l = e.target.closest('.gm-len'); if (!l) return;
  genOpt.len = +l.dataset.n; gmSelIn('gmLens', '.gm-len', 'n', genOpt.len);
});
$('gmEngine')?.addEventListener('click', e => {
  const x = e.target.closest('.gm-len'); if (!x) return;
  genOpt.engine = x.dataset.id; gmSelIn('gmEngine', '.gm-len', 'id', genOpt.engine);
});
$('gmSlot').addEventListener('click', () => $('gmFile').click());
$('gmSlotGlb').addEventListener('click', () => $('gmGlb').click());
$('gmGlb').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { await idb.set('char_model', f); } catch {}
  if (charModelUrl) URL.revokeObjectURL(charModelUrl);
  charModelUrl = URL.createObjectURL(f);
  genOpt.charId = 'self';
  showGmStep(1);
});
$('gmFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const url = await gmDownscale(f);
  if (!url) return;
  selfPhoto = url;
  // เซฟกลับ engine_profile ให้ sidepanel ใช้ร่วมกัน
  const d = await chrome.storage.local.get('engine_profile');
  const prof = d.engine_profile || {};
  prof.presenter = prof.presenter || {};
  prof.presenter.photos = [url, ...(prof.presenter.photos || []).slice(1)];
  await chrome.storage.local.set({ engine_profile: prof });
  showGmStep(1);
});
$('gmCancel').addEventListener('click', () => $('gmodal').classList.remove('on'));
$('gmodal').addEventListener('click', e => { if (e.target === $('gmodal')) $('gmodal').classList.remove('on'); });
$('gmBack').addEventListener('click', () => {
  if (gmStep === 1) $('gmodal').classList.remove('on');
  else showGmStep(gmStep - 1);
});
$('gmGo').addEventListener('click', () => {
  if (gmStep < 4) showGmStep(gmStep + 1);
  else gmRun(false);          // สร้างจริง
});
// คีย์บอร์ด: Esc ปิด · Enter ไปต่อ/สร้าง
document.addEventListener('keydown', e => {
  if (!$('gmodal').classList.contains('on')) return;
  if (e.key === 'Escape') { e.preventDefault(); $('gmodal').classList.remove('on'); }
  else if (e.key === 'Enter') {
    if ($('gmGo').disabled) return;
    e.preventDefault();
    if (gmStep < 4) showGmStep(gmStep + 1); else gmRun(false);
  }
});
document.querySelectorAll('.gm-stp').forEach(s => s.addEventListener('click', () => {
  const i = +s.dataset.s;
  if (i <= gmMax && i !== gmStep) showGmStep(i);   // ข้ามกลับไปขั้นที่เคยไปถึงแล้วเท่านั้น
}));
$('gmAuds').addEventListener('click', e => {
  const a = e.target.closest('.gm-style'); if (!a) return;
  genOpt.aud = a.dataset.id; gmSelIn('gmAuds', '.gm-style', 'id', genOpt.aud);
});
$('gmBgs').addEventListener('click', e => {
  const b = e.target.closest('.gm-bg'); if (!b) return;
  genOpt.bg = b.dataset.id; gmSelIn('gmBgs', '.gm-bg', 'id', genOpt.bg); gmAdvSummary();
});
$('gmMoods').addEventListener('click', e => {
  const x = e.target.closest('.gm-bg'); if (!x) return;
  genOpt.mood = x.dataset.id; gmSelIn('gmMoods', '.gm-bg', 'id', genOpt.mood); gmAdvSummary();
});
$('gmSounds').addEventListener('click', e => {
  const x = e.target.closest('.gm-len'); if (!x) return;
  genOpt.sound = x.dataset.id; gmSelIn('gmSounds', '.gm-len', 'id', genOpt.sound);
  // มีเสียงพูด → โชว์น้ำเสียง+ภาษา (เติม chip ถ้ายังว่าง), ไม่มีเสียง → ซ่อน
  const speak = genOpt.sound !== 'mute';
  $('gmVoiceWrap').style.display = speak ? '' : 'none';
  $('gmLangWrap').style.display = speak ? '' : 'none';
  if (speak && !$('gmVoices').children.length) {
    $('gmVoices').innerHTML = GEN_VOICES.map(v => `<span class="gm-bg ${genOpt.voice === v.id ? 'on' : ''}" data-id="${v.id}">${esc(v.name)}</span>`).join('');
    $('gmLangs').innerHTML = GEN_LANGS.map(l => `<span class="gm-bg ${genOpt.lang === l.id ? 'on' : ''}" data-id="${l.id}">${esc(l.name)}</span>`).join('');
  }
  gmAdvSummary();
});
$('gmVoices').addEventListener('click', e => {
  const x = e.target.closest('.gm-bg'); if (!x) return;
  genOpt.voice = x.dataset.id; gmSelIn('gmVoices', '.gm-bg', 'id', genOpt.voice);
});
$('gmLangs').addEventListener('click', e => {
  const x = e.target.closest('.gm-bg'); if (!x) return;
  genOpt.lang = x.dataset.id; gmSelIn('gmLangs', '.gm-bg', 'id', genOpt.lang);
});
$('gmMusics').addEventListener('click', e => {
  const x = e.target.closest('.gm-bg'); if (!x) return;
  genOpt.music = x.dataset.id; gmSelIn('gmMusics', '.gm-bg', 'id', genOpt.music); gmAdvSummary();
});
$('gmAdvHd').addEventListener('click', () => $('gmAdv').classList.toggle('open'));   // กาง/พับ ปรับแต่งเพิ่มเติม

// เริ่มสร้าง/ทดสอบ — มีสถานะ "กำลังเริ่ม" กันกดซ้ำ
let gmRunning = false;
async function gmRun(dry) {
  if (gmRunning) return;
  gmRunning = true;
  const btn = dry ? $('gmTry') : $('gmGo');
  const old = btn.textContent;
  $('gmGo').disabled = true; $('gmTry').disabled = true;
  btn.textContent = 'กำลังเริ่ม…';
  try { await gmStart(dry); }
  finally {
    gmRunning = false;
    $('gmTry').disabled = false;
    $('gmGo').disabled = false;   // ขั้น 4 เสมอ — ปุ่มสร้างต้องกดได้ (เผื่อ start ล้มเหลว)
    btn.textContent = old;
  }
}
$('gmTry').addEventListener('click', () => gmRun(true));   // ทดสอบก่อน ฟรี

function launchFlow(chosen, gen, dryArg) {
  if (!chosen.length) return;
  const dry = dryArg !== undefined ? !!dryArg : !!$('dryRun')?.checked;
  $('geminiWarn')?.classList.remove('on');   // รอบใหม่ → ซ่อนเตือนเก่า (เผื่อเพิ่งเติมเครดิต)
  $('nanoWarn')?.classList.remove('on');
  busy = true; renderLib();
  batch = chosen.map(uid);
  if (!dry) { batch.forEach(id => flowStatus[id] = 'queued'); chrome.storage.local.set({ flowStatus }); }
  go('mon');
  logTo('monLog', dry
    ? `[ทดสอบ] ส่ง ${chosen.length} สินค้าเข้า Flow (จะพิมพ์ prompt แต่ไม่กดส่ง — ไม่เปลืองเครดิต)`
    : `ส่ง ${chosen.length} สินค้าเข้า Flow — เปิดแท็บ Flow อัตโนมัติ`, 's');
  if (gen) logTo('monLog', `ผู้รีวิว: ${gen.charName} · สไตล์: ${(GEN_STYLES.find(s => s.id === gen.style) || {}).name || gen.style}`, 'i');
  const clean = chosen.map(({ _uid, ...p }) => p);
  // ผลสำเร็จรายงานผ่าน broadcast "flow_queue_done" จาก flow.js (ทนกว่า —
  // คิวยาวๆ service worker อาจ restart แล้ว callback นี้หาย) ที่นี่จับเฉพาะ error
  chrome.runtime.sendMessage({ action: 'flow_start', products: clean, port: port(), dry, gen }, res => {
    if (chrome.runtime.lastError || (res && !res.ok)) {
      busy = false; renderLib();
      logTo('monLog', 'ผิดพลาด: ' + (res?.error || chrome.runtime.lastError?.message || '?'), 'e');
    }
  });
}

// ── คิวค้างจากรอบก่อน (แท็บ Flow ถูกปิด/reload กลางทาง) → เสนอให้รันต่อ ──
async function checkLeftoverQueue() {
  const bar = $('resumeBar'); if (!bar) return;
  const d = await chrome.storage.local.get(['flow_jobs', 'flow_queue_state']);
  const left = (d.flow_jobs || []).length;
  const st = d.flow_queue_state || {};
  // ถ้า state บอกกำลังรันแต่เงียบเกิน 15 นาที = ตายกลางทาง (ถือว่าค้าง)
  const stale = st.running && Date.now() - (st.at || 0) > 15 * 60 * 1000;
  if (left && (!st.running || stale) && !busy) {
    $('resumeMsg').textContent = `มีคิวค้างจากรอบก่อน ${left} ชิ้น — รันต่อจากที่ค้างได้เลย หรือล้างทิ้งถ้าไม่ต้องการแล้ว`;
    bar.classList.add('on');
  } else bar.classList.remove('on');
}
$('resumeBtn')?.addEventListener('click', () => {
  $('resumeBar').classList.remove('on');
  busy = true; renderLib(); go('mon');
  logTo('monLog', 'รันคิวค้างต่อจากรอบก่อน…', 's');
  chrome.runtime.sendMessage({ action: 'flow_start', dry: !!$('dryRun')?.checked }, res => {
    if (chrome.runtime.lastError || (res && !res.ok)) {
      busy = false; renderLib();
      logTo('monLog', 'ผิดพลาด: ' + (res?.error || chrome.runtime.lastError?.message || '?'), 'e');
    }
  });
});
$('geminiWarnX')?.addEventListener('click', () => $('geminiWarn')?.classList.remove('on'));
$('nanoWarnX')?.addEventListener('click', () => $('nanoWarn')?.classList.remove('on'));
$('resumeClear')?.addEventListener('click', async () => {
  await chrome.storage.local.set({ flow_jobs: [], flow_queue_state: null });
  $('resumeBar').classList.remove('on');
  logTo('monLog', 'ล้างคิวค้างแล้ว', 'i');
});

// ── monitor (หน้างาน: โฟกัสตอนนี้ + แกลเลอรี) ──
let flowQ = null;          // flow_queue_state ล่าสุด
let lastFlowMsg = '';      // ข้อความ flow_log ล่าสุด → ใช้เป็นบรรทัดสถานะสดในการ์ด hero
let heroTick = null;       // ตัวจับเวลา 1 วิ อัปเดต "ผ่านไป mm:ss" ให้รู้สึกสด
let monCurId = null;       // uid ที่กำลังสร้างอยู่ตอนนี้

const PLAY_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;

function startMonitor() {
  chrome.storage.local.get('flow_queue_state').then(d => { flowQ = d.flow_queue_state || null; renderMonitor(); });
  if (monTimer) return;
  monTimer = setInterval(async () => {
    let queued = 0;
    try { queued = (await fetch(api('/api/flow/status')).then(r => r.json())).queued || 0; } catch {}
    try { flowQ = (await chrome.storage.local.get('flow_queue_state')).flow_queue_state || null; } catch {}
    await refreshVideos();
    batch.forEach(id => { if (videoByUid[id]) flowStatus[id] = 'done'; });
    chrome.storage.local.set({ flowStatus });
    renderMonitor(queued); renderLib();
  }, 5000);
}
function stopMonitor() {
  if (monTimer) { clearInterval(monTimer); monTimer = null; }
  setHeroTick(false);
}

function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function setHeroTick(on) {
  if (on && !heroTick) {
    heroTick = setInterval(() => {
      const el = $('heroElapsed');
      if (el && flowQ?.at) el.textContent = `ผ่านไป ${fmtClock(Date.now() - flowQ.at)}`;
    }, 1000);
  } else if (!on && heroTick) { clearInterval(heroTick); heroTick = null; }
}

function renderMonitor(queued = null) {
  const items = batch.map(id => products.find(p => uid(p) === id)).filter(Boolean);
  const isDone = id => !!(videoByUid[id] || flowStatus[id] === 'done');
  const done = batch.filter(isDone).length;
  const total = batch.length;
  const running = !!(flowQ && flowQ.running);

  // หา item ที่กำลังทำ: จับคู่ชื่อจาก flow_queue_state ก่อน ไม่ได้ค่อยใช้ตัวแรกที่ยังไม่เสร็จ
  monCurId = null;
  if (running && total) {
    const cn = (flowQ.current || '').trim();
    if (cn) monCurId = batch.find(id => {
      const p = products.find(x => uid(x) === id);
      return p && (p.basic_info?.name || '').slice(0, 40) === cn;
    }) || null;
    if (!monCurId) monCurId = batch.find(id => !isDone(id)) || null;
  }

  // ── การ์ด hero "โฟกัสตอนนี้" ──
  const hero = $('monHero');
  const setThumb = p => {
    const img = esc((p?.images || [])[0] || '');
    $('heroThumb').innerHTML = img
      ? `<img data-img="${img}" src="">`
      : `<div class="pthumb ph">${PH}</div>`;
  };
  if (!total) {
    hero.className = 'hero idle';
    $('heroEyebrow').textContent = 'หน้างาน';
    $('heroCount').textContent = '';
    $('heroName').textContent = 'ยังไม่มีงานในรอบนี้';
    $('heroStatus').textContent = 'กดสร้างคลิปในหน้าคลังสินค้า แล้วหน้านี้จะคอยรายงานทุกขั้นตอนแบบสด ๆ';
    $('heroMeta').innerHTML = '';
    $('heroThumb').innerHTML = `<div class="pthumb ph">${PH}</div>`;
    setHeroTick(false);
  } else if (running) {
    const cur = products.find(p => uid(p) === monCurId);
    const pos = Math.min(done + 1, total);
    hero.className = 'hero active';
    $('heroEyebrow').textContent = 'กำลังสร้างตอนนี้';
    $('heroCount').textContent = `${pos}/${total}`;
    $('heroName').textContent = cur?.basic_info?.name || flowQ.current || 'กำลังประมวลผล…';
    $('heroStatus').textContent = lastFlowMsg || 'กำลังให้ Flow เรนเดอร์คลิป…';
    $('heroMeta').innerHTML = `<span class="hm-l" id="heroElapsed">${flowQ.at ? `ผ่านไป ${fmtClock(Date.now() - flowQ.at)}` : ''}</span><span class="hm-r">เหลือในคิว ${Math.max(0, total - pos)} ตัว</span>`;
    setThumb(cur);
    setHeroTick(true);
  } else if (done >= total) {
    const last = [...batch].reverse().find(isDone);
    hero.className = 'hero done';
    $('heroEyebrow').textContent = 'เสร็จทั้งหมด';
    $('heroCount').textContent = `${done}/${total}`;
    $('heroName').textContent = `สร้างครบ ${done} คลิปแล้ว`;
    $('heroStatus').textContent = 'ไฟล์คลิปถูกส่งให้ desktop โพสต์ต่อแล้ว — กดที่คลิปด้านล่างเพื่อดูตัวอย่างได้';
    $('heroMeta').innerHTML = '';
    setThumb(products.find(p => uid(p) === last));
    setHeroTick(false);
  } else {
    hero.className = 'hero idle';
    $('heroEyebrow').textContent = 'หยุดพักอยู่';
    $('heroCount').textContent = `${done}/${total}`;
    $('heroName').textContent = `ทำไปแล้ว ${done} จาก ${total} คลิป`;
    $('heroStatus').textContent = queued ? `ยังมีงานค้างในคิว Flow ${queued} ชิ้น` : 'คิวหยุดอยู่ — กดสร้างใหม่หรือรันคิวค้างต่อเพื่อทำต่อ';
    $('heroMeta').innerHTML = '';
    setThumb(products.find(p => uid(p) === batch.find(id => !isDone(id))));
    setHeroTick(false);
  }

  // ── แกลเลอรีผลงานในรอบนี้ ──
  $('galHint').textContent = total ? `${done}/${total} เสร็จ` : '';
  const gal = $('monGallery');
  if (!items.length) {
    gal.innerHTML = `<div class="empty" style="padding:30px"><p>ยังไม่มีงานในรอบนี้</p></div>`;
  } else {
    gal.innerHTML = items.map(p => {
      const id = uid(p);
      const dn = isDone(id), cur = id === monCurId;
      const cls = dn ? 'done' : cur ? 'doing' : 'queued';
      const lbl = dn ? 'เสร็จ' : cur ? 'ทำอยู่' : 'รอคิว';
      const img = esc((p.images || [])[0] || '');
      const thumb = img ? `<img data-img="${img}" src="">` : `<div class="pthumb ph">${PH}</div>`;
      const nm = esc(p.basic_info?.name || id);
      const play = dn ? `<button class="gplay" data-play="${id}" title="ดูคลิป"><span class="pb">${PLAY_ICON}</span></button>` : '';
      return `<div class="gcell ${cls}" title="${nm}">${thumb}<span class="gst">${lbl}</span>${play}<span class="gnm">${nm}</span></div>`;
    }).join('');
    gal.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => {
      const v = videoByUid[b.dataset.play]; if (v) chrome.tabs.create({ url: api(v.url) });
    }));
  }
  loadImages();
}

// ── ทดสอบการเชื่อมต่อ desktop ──
let connSeq = 0;   // กันผลลัพธ์เก่าทับใหม่ ถ้ากดทดสอบรัวๆ
function setConn(state, text, meta) {
  const box = $('connStatus'); if (!box) return;
  box.dataset.state = state;
  $('connText').textContent = text;
  $('connMeta').textContent = meta || '';
}
async function checkConn() {
  const p = ($('cfg-port').value || '3001').trim();
  if (!/^\d{2,5}$/.test(p)) { setConn('fail', 'พอร์ตไม่ถูกต้อง — ใส่เลข 2–5 หลัก'); return; }
  const seq = ++connSeq;
  const btn = $('testConn');
  btn.classList.add('busy');
  setConn('checking', 'กำลังเชื่อมต่อ desktop…');
  const t0 = Date.now();
  try {
    // ใช้ /api/status (มีอยู่แล้วในเซิร์ฟเวอร์) — ตรงกับสถานะที่ sidebar เช็ค
    const r = await fetch(`http://localhost:${p}/api/status`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error('bad status');
    const d = await r.json();
    if (seq !== connSeq) return;   // มีการทดสอบใหม่กว่าแล้ว — ทิ้งผลนี้
    const nDev = (d.devices || []).length;
    const bits = [];
    if (nDev > 0) bits.push(`พบ ${fmtNum(nDev)} เครื่อง`);
    if (d.pilot_running) bits.push('ออโต้ไพลอตทำงาน');
    setConn('ok', bits.length ? `เชื่อมต่อแล้ว · ${bits.join(' · ')}` : 'เชื่อมต่อแล้ว',
      `ตอบใน ${Date.now() - t0} มิลลิวินาที · พอร์ต ${p}`);
  } catch (e) {
    if (seq !== connSeq) return;
    const timedOut = e && e.name === 'TimeoutError';
    setConn('fail',
      timedOut ? 'desktop ไม่ตอบสนอง (หมดเวลา)' : `ต่อ desktop ไม่ได้ที่พอร์ต ${p}`,
      'เปิดโปรแกรม desktop แล้วตรวจสอบหมายเลขพอร์ตอีกครั้ง');
  } finally {
    if (seq === connSeq) btn.classList.remove('busy');
  }
}
$('testConn').addEventListener('click', checkConn);

// ── settings: ติดตามการแก้ไข (dirty) + บันทึกแบบมีสถานะ ──
const CFG_KEYS = ['shop_name', 'port'];
const CFG_EL = { shop_name: 'cfg-shop', port: 'cfg-port' };
const cfgEl = k => $(CFG_EL[k]);
let savedSnap = {};   // ค่าที่บันทึกไว้ล่าสุด — ใช้เทียบหา dirty

function readForm() {
  return { shop_name: ($('cfg-shop').value || '').trim(),
    port: ($('cfg-port').value || '3001').trim() };
}
function snapOf(s) { return CFG_KEYS.map(k => s[k] ?? '').join(''); }

function applySettings() {
  $('cfg-shop').value = settings.shop_name || '';
  if (settings.port) $('cfg-port').value = settings.port;
  savedSnap = readForm();
  refreshDirty();
}
function refreshDirty() {
  const dirty = snapOf(readForm()) !== snapOf(savedSnap);
  $('saveBar').classList.toggle('dirty', dirty);
  $('saveBtn').disabled = !dirty;
  $('resetBtn').hidden = !dirty;
  if (!$('saveBtn').classList.contains('saving') && !$('saveBtn').classList.contains('done'))
    $('sbState').querySelector('span').textContent =
      dirty ? 'มีการเปลี่ยนแปลงที่ยังไม่บันทึก' : 'ตั้งค่าตรงกับที่บันทึกไว้';
}
CFG_KEYS.forEach(k => { const el = cfgEl(k); if (el) el.addEventListener('input', refreshDirty); });
// ช่องพอร์ต: รับเฉพาะตัวเลข
$('cfg-port').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5); });

$('resetBtn').addEventListener('click', () => {
  CFG_KEYS.forEach(k => { const el = cfgEl(k); if (el) el.value = savedSnap[k]; });
  refreshDirty();
});

async function saveSettings() {
  const btn = $('saveBtn');
  if (btn.disabled || btn.classList.contains('saving')) return;
  settings = readForm();
  btn.classList.remove('done'); btn.classList.add('saving');
  btn.disabled = true;
  $('saveLbl').textContent = 'กำลังบันทึก…';
  $('sbState').querySelector('span').textContent = 'กำลังบันทึก…';
  chrome.storage.local.set({ panel_settings: settings });
  let online = true;
  try {
    const cur = await fetch(api('/api/settings'), { signal: AbortSignal.timeout(4000) }).then(r => r.json()).catch(() => ({}));
    const merged = { ...cur, shop_name: settings.shop_name };
    const r = await fetch(api('/api/settings'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(merged), signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error('bad');
  } catch { online = false; }
  savedSnap = readForm();
  btn.classList.remove('saving'); btn.classList.add('done');
  $('saveLbl').textContent = online ? 'บันทึกแล้ว' : 'บันทึกในเครื่องแล้ว';
  $('sbState').querySelector('span').textContent = online ? 'ส่งให้ desktop เรียบร้อย' : 'desktop ไม่ตอบ — เก็บไว้ในเครื่อง';
  $('saveBar').classList.remove('dirty');
  $('resetBtn').hidden = true;
  setTimeout(() => {
    btn.classList.remove('done');
    $('saveLbl').textContent = 'บันทึกการตั้งค่า';
    refreshDirty();
  }, 2200);
  checkConn();   // พอร์ตอาจเปลี่ยน — เช็คสถานะใหม่
}
$('saveBtn').addEventListener('click', saveSettings);
// Cmd/Ctrl+S บันทึกได้เมื่ออยู่หน้าตั้งค่า
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S') && view === 'set') {
    e.preventDefault(); saveSettings();
  }
});

// ── messages ──
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.action === 'flow_log') {
    const m = String(msg.msg || '');
    logTo('monLog', msg.msg, m.startsWith('[ผิดพลาด') ? 'e' : 'i');
    // อัปเดตบรรทัดสถานะสดในการ์ด hero ทันที (ไม่ต้องรอ poll 5 วิ) — ข้ามตัวคั่น "──"
    if (m && !/^──/.test(m.trim())) {
      lastFlowMsg = m;
      if (view === 'mon' && $('monHero')?.classList.contains('active')) $('heroStatus').textContent = m;
    }
  }
  if (msg.action === 'gemini_quota') { go('mon'); $('geminiWarn')?.classList.add('on'); }
  if (msg.action === 'nano_quota') { go('mon'); if (msg.message) { const m = $('nanoWarnMsg'); if (m) m.textContent = msg.message; } $('nanoWarn')?.classList.add('on'); }
  if (msg.action === 'flow_queue_done') {
    busy = false; renderLib();
    logTo('monLog', msg.dry
      ? `[ทดสอบ] เสร็จ — พิมพ์ prompt ครบ ${msg.done}/${msg.total} ชิ้น ไม่กดส่ง (ไม่เปลืองเครดิต)`
      : `Flow เสร็จ — สร้าง ${msg.done}/${msg.total} คลิป → desktop กำลังโพสต์`, 's');
    chrome.storage.local.get('flow_queue_state').then(d => { flowQ = d.flow_queue_state || null; });
    refreshVideos().then(() => { renderMonitor(); renderLib(); });
    checkLeftoverQueue();
  }
  if (msg.action === 'products_updated') {
    chrome.storage.local.get('products', d => { products = d.products || []; render(); logTo('monLog', `รับสินค้า +${msg.added} (รวม ${msg.total})`, 's'); });
  }
});
