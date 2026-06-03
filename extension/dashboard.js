// ── Dashboard (full-screen tab) — ทำทุกอย่าง: สินค้า / สร้าง / ติดตาม / ตั้งค่า ──
let products = [];
let selected = new Set();
let settings = {};
let flowStatus = {};        // uid -> 'queued' | 'done'
let videoByUid = {};        // uid -> { folder, name, url }
let statDone = 0;
let view = 'lib';
let query = '';
let filter = 'all';
let batch = [];
let monTimer = null;
let busy = false;

const $ = id => document.getElementById(id);
const uid = p => p.product_id || p.basic_info?.name || '';
const port = () => settings.port || '3001';
const api = path => `http://localhost:${port()}${path}`;
const hasCart = p => !!(p.links && p.links.affiliate_link);
const ST_LABEL = { new: 'รอสร้าง', queued: 'ส่งเข้า Flow', done: 'เสร็จ' };
const CHECK = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const PH = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;

// ── init ──
chrome.storage.local.get(['products', 'panel_settings', 'statDone', 'flowStatus', 'dry_run'], d => {
  products = d.products || [];
  settings = d.panel_settings || {};
  statDone = d.statDone || 0;
  flowStatus = d.flowStatus || {};
  if ($('dryRun')) $('dryRun').checked = !!d.dry_run;
  applySettings();
  refreshVideos().then(render);
  render();
});
$('dryRun')?.addEventListener('change', e => chrome.storage.local.set({ dry_run: e.target.checked }));

// ── tabs ──
function go(v) {
  if (v !== 'mon') stopMonitor();
  view = v;
  ['lib', 'mon', 'set'].forEach(x => $('view-' + x).classList.toggle('on', x === v));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.view === v));
  if (v === 'mon') startMonitor();
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => go(t.dataset.view)));
$('goAff').addEventListener('click', () =>
  chrome.runtime.sendMessage({ action: 'navigate_tab', url: 'https://affiliate.shopee.co.th/offer/product_offer' }));

// ── desktop status ──
async function checkDesktop() {
  try {
    const r = await fetch(api('/api/flow/status'), { signal: AbortSignal.timeout(2500) });
    if (r.ok) { $('dDot').className = 'dot on'; $('dLbl').textContent = 'เชื่อมต่อ desktop แล้ว'; return; }
  } catch {}
  $('dDot').className = 'dot warn'; $('dLbl').textContent = 'desktop ไม่ตอบ';
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
function visibleProducts() {
  const q = query.trim().toLowerCase();
  return products.filter(p => {
    if (q && !(p.basic_info?.name || '').toLowerCase().includes(q)) return false;
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
}

function renderLib() {
  const list = visibleProducts();
  $('libCount').textContent = list.length;
  $('libSel').textContent = selected.size;
  $('genBtn').disabled = busy || selected.size === 0;
  $('genLbl').textContent = busy ? 'กำลังทำงาน…' : (selected.size ? `สร้างคลิปจากที่เลือก (${selected.size})` : 'สร้างคลิปจากที่เลือก');

  const grid = $('pgrid');
  if (!products.length) {
    grid.innerHTML = `<div class="empty"><div class="eic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div><p>ยังไม่มีสินค้า<br>เปิดหน้า Affiliate แล้วใช้หน้าต่างลอย "เครื่องมือดูดสินค้า" มุมซ้ายล่าง</p></div>`;
    return;
  }
  if (!list.length) { grid.innerHTML = `<div class="empty"><p>ไม่พบสินค้าตามเงื่อนไข</p></div>`; return; }

  grid.innerHTML = list.map(p => {
    const id = uid(p);
    const name = p.basic_info?.name || 'ไม่มีชื่อ';
    const price = p.basic_info?.price ? `฿${Number(p.basic_info.price).toLocaleString()}` : '-';
    const comm = p.commission?.rate ? `<span class="co">คอม ${p.commission.rate}%</span>` : '';
    const img = (p.images || [])[0] || '';
    const sel = selected.has(id);
    const st = statusOf(p);
    const cart = hasCart(p);
    const vid = videoByUid[id];
    const thumb = img ? `<img class="pthumb" data-img="${img}" src="">` : `<div class="pthumb ph">${PH}</div>`;
    const viewBtn = vid ? `<button class="iconbtn view" data-view="${id}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> ดูคลิป</button>` : '';
    return `<div class="pcard ${sel ? 'sel' : ''}" data-id="${id}">
      <div class="chk">${sel ? CHECK : ''}</div>${thumb}
      <div class="pbody">
        <div class="pnm">${name}</div>
        <div class="pmt"><span class="pr">${price}</span>${comm}</div>
        <div class="badges">
          <span class="bdg s-${st}">${ST_LABEL[st]}</span>
          <span class="bdg ${cart ? 'cart' : 'nocart'}">${cart ? 'ตะกร้า ✓' : 'ไม่มีตะกร้า'}</span>
        </div>
        <div class="pacts">
          ${viewBtn}
          <button class="iconbtn del" data-del="${id}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> ลบ</button>
        </div>
      </div>
    </div>`;
  }).join('');

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
$('selAll').addEventListener('click', () => {
  const list = visibleProducts();
  const allSel = list.length && list.every(p => selected.has(uid(p)));
  if (allSel) list.forEach(p => selected.delete(uid(p))); else list.forEach(p => selected.add(uid(p)));
  renderLib();
});
$('clearSel').addEventListener('click', () => { selected.clear(); renderLib(); });

// ── generate (collect cart links → flow) ──
function chosenProducts() { return products.filter(p => selected.has(uid(p))); }
$('genBtn').addEventListener('click', () => collectThenGenerate());
$('cfCancel').addEventListener('click', () => { $('confirm').classList.remove('on'); });
$('cfProceed').addEventListener('click', () => { $('confirm').classList.remove('on'); launchFlow(chosenProducts()); });

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
    launchFlow(chosenProducts());
  }
}

function launchFlow(chosen) {
  if (!chosen.length) return;
  const dry = !!$('dryRun')?.checked;
  busy = true; renderLib();
  batch = chosen.map(uid);
  if (!dry) { batch.forEach(id => flowStatus[id] = 'queued'); chrome.storage.local.set({ flowStatus }); }
  go('mon');
  logTo('monLog', dry
    ? `🧪 โหมดทดสอบ: ส่ง ${chosen.length} สินค้าเข้า Flow (จะพิมพ์ prompt แต่ไม่กดส่ง — ไม่เปลืองเครดิต)`
    : `ส่ง ${chosen.length} สินค้าเข้า Flow — เปิดแท็บ Flow อัตโนมัติ`, 's');
  const clean = chosen.map(({ _uid, ...p }) => p);
  chrome.runtime.sendMessage({ action: 'flow_start', products: clean, port: port(), dry }, res => {
    busy = false; renderLib();
    if (chrome.runtime.lastError || !res?.ok) logTo('monLog', 'ผิดพลาด: ' + (res?.error || chrome.runtime.lastError?.message || '?'), 'e');
    else if (res.dry) logTo('monLog', `🧪 ทดสอบเสร็จ — พิมพ์ prompt ครบ ${res.done ?? '?'} ชิ้น ไม่กดส่ง (ไม่เปลืองเครดิต) ✓`, 's');
    else { logTo('monLog', `Flow เสร็จ — สร้าง ${res.done ?? '?'} คลิป → desktop กำลังโพสต์`, 's'); refreshVideos().then(renderMonitor); }
  });
}

// ── monitor ──
function startMonitor() {
  renderMonitor();
  if (monTimer) return;
  monTimer = setInterval(async () => {
    let queued = 0;
    try { queued = (await fetch(api('/api/flow/status')).then(r => r.json())).queued || 0; } catch {}
    await refreshVideos();
    batch.forEach(id => { if (videoByUid[id]) flowStatus[id] = 'done'; });
    chrome.storage.local.set({ flowStatus });
    renderMonitor(queued); renderLib();
  }, 5000);
}
function stopMonitor() { if (monTimer) { clearInterval(monTimer); monTimer = null; } }

function renderMonitor(queued = null) {
  const items = batch.map(id => products.find(p => uid(p) === id)).filter(Boolean);
  const done = batch.filter(id => videoByUid[id] || flowStatus[id] === 'done').length;
  $('mQueue').textContent = queued == null ? '–' : queued;
  $('mDone').textContent = done;
  $('mDoing').textContent = Math.max(0, batch.length - done);
  const box = $('mList');
  if (!items.length) { box.innerHTML = `<div class="empty" style="padding:30px"><p>ยังไม่มีงานในรอบนี้</p></div>`; return; }
  box.innerHTML = items.map(p => {
    const st = statusOf(p);
    return `<div class="listrow"><span class="bdg s-${st}">${ST_LABEL[st]}</span><span class="nm">${p.basic_info?.name || uid(p)}</span></div>`;
  }).join('');
}

// ── settings ──
function applySettings() {
  ['age', 'personality', 'style', 'bg'].forEach(k => { const el = $('cfg-' + k); if (el && settings[k]) el.value = settings[k]; });
  if (settings.port) $('cfg-port').value = settings.port;
}
$('saveBtn').addEventListener('click', async () => {
  settings = { age: $('cfg-age').value, personality: $('cfg-personality').value, style: $('cfg-style').value, bg: $('cfg-bg').value, port: $('cfg-port').value || '3001' };
  chrome.storage.local.set({ panel_settings: settings });
  try {
    const cur = await fetch(api('/api/settings')).then(r => r.json()).catch(() => ({}));
    const merged = { ...cur, age_group: settings.age, personality: settings.personality, style: settings.style, background: settings.bg };
    await fetch(api('/api/settings'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(merged) });
    $('saveBtn').textContent = 'บันทึกแล้ว — ส่งให้ desktop ✓';
  } catch { $('saveBtn').textContent = 'บันทึกในเครื่องแล้ว (desktop ไม่ตอบ)'; }
  setTimeout(() => $('saveBtn').textContent = 'บันทึกการตั้งค่า', 2200);
});

// ── messages ──
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.action === 'flow_log') logTo('monLog', msg.msg, 'i');
  if (msg.action === 'products_updated') {
    chrome.storage.local.get('products', d => { products = d.products || []; render(); logTo('monLog', `รับสินค้า +${msg.added} (รวม ${msg.total})`, 's'); });
  }
});
