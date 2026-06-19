// ── Side panel = ศูนย์ควบคุม ──
let settings = {};
let pilotRunning = false;
let errLog = [];   // ต้องประกาศก่อน boot() — boot ใช้ตัวแปรนี้ (ประกาศทีหลังจะ TDZ ตายทั้งไฟล์)
const $ = id => document.getElementById(id);
const port = () => settings.port || '3001';
const api  = path => `http://localhost:${port()}${path}`;
const DASH_URL = chrome.runtime.getURL('dashboard.html');
const PROG_C   = 766.5; // 2π × r=122

// ════ VIEW CONTROL ════

function showMain() {
  $('view-lock').style.display = 'none';
  $('view-main').style.display = 'flex';
  if (!window._booted) {
    window._booted = true;
    pollStatus();
    setInterval(pollStatus, 5000);
  }
}
function showLock() {
  $('view-lock').style.display = 'flex';
  $('view-main').style.display = 'none';
}
function setLicMsg(type, msg) {
  const el = $('licMsg');
  if (!msg) { el.style.display = 'none'; return; }
  el.className = `lic-msg ${type}`;
  el.textContent = msg;
  el.style.display = 'block';
}

// ════ BOOT ════

async function boot() {
  chrome.storage.local.get(['panel_settings', 'dry_run', 'error_log'], d => {
    settings = d.panel_settings || {};
    if (settings.shop_name) $('shopName').textContent = settings.shop_name;
    $('spDry').checked = !!d.dry_run;
    errLog = d.error_log || [];
    updateErrDot();
  });
  refreshQueueUI();
  showMain(); // TODO: re-enable license gate before shipping
}
boot();

// ════ ACTIVATE ════

async function doActivate() {
  const key = $('licKey').value.trim();
  if (!key) { setLicMsg('err', 'กรุณาระบุ License Key'); return; }
  $('licBtn').disabled = true;
  $('licBtn').textContent = 'กำลังตรวจสอบ…';
  setLicMsg('info', 'กำลังส่งไปยัง Desktop…');
  try {
    const r = await fetch(api('/api/license/activate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json();
    if (j.ok) {
      setLicMsg('ok', '✓ เปิดใช้งานสำเร็จ');
      setTimeout(showMain, 900);
    } else {
      setLicMsg('err', j.reason || 'License Key ไม่ถูกต้อง');
    }
  } catch {
    setLicMsg('err', 'ไม่สามารถเชื่อมต่อ Desktop ได้ — ตรวจสอบว่าเปิดอยู่');
  }
  $('licBtn').disabled = false;
  $('licBtn').textContent = 'เปิดใช้งาน';
}
$('licBtn').addEventListener('click', doActivate);
$('licKey').addEventListener('keydown', e => { if (e.key === 'Enter') doActivate(); });

// ════ NUMBER ANIMATION ════

let _displayNum = 0;
let _targetNum  = 0;
let _raf        = null;

function _tickNum() {
  const diff = _targetNum - _displayNum;
  if (Math.abs(diff) < 0.6) {
    _displayNum = _targetNum;
    $('engCount').textContent = Math.round(_displayNum);
    return;
  }
  _displayNum += diff * 0.1;
  $('engCount').textContent = Math.round(_displayNum);
  _raf = requestAnimationFrame(_tickNum);
}

function animateNum(n) {
  _targetNum = n;
  if (_raf) cancelAnimationFrame(_raf);
  _tickNum();
}

// ════ ENGINE STATE ════

function updateEngineVisuals(running, num, progress) {
  $('engWrap').classList.toggle('running', running);

  // Progress arc
  $('engProg').style.strokeDashoffset = PROG_C * (1 - Math.min(1, progress));

  // Status pill text — CSS handles color/glow via #engWrap.running
  $('engStatus').textContent = running ? 'RUNNING' : 'STANDBY';

  // Count + label
  const hasActivity = running || num > 0;
  $('engCount').classList.toggle('show', hasActivity);
  $('engLbl').classList.toggle('active', hasActivity);
  if (hasActivity) {
    animateNum(num);
    $('engLbl').textContent = running ? 'ในคิว' : 'วันนี้';
  } else {
    $('engCount').textContent = '';
    $('engLbl').textContent   = '';
  }
}

// ════ POLL + UPDATE ════

function updateEngine(state) {
  pilotRunning = !!state.pilot_running;
  $('ctaWrap').classList.toggle('running', pilotRunning);

  const max      = state.max_per_day || 50;
  const progress = Math.min(1, (state.done || 0) / max);
  const num      = pilotRunning ? (state.queue ?? 0) : (state.done ?? 0);

  updateEngineVisuals(pilotRunning, num, progress);

  $('engQueue').textContent = state.queue  ?? 0;
  $('engDone').textContent  = state.done   ?? 0;
  $('engErr').textContent   = state.errors ?? 0;

  // update shop name if API provides it
  if (state.shop_name) $('shopName').textContent = state.shop_name;

  // สถานะปุ่มคุมด้วยคลาส .start/.stop (CSS อยู่ใน sidepanel.html — ไม่ใช้ Tailwind แล้ว)
  const btn = $('engineBtn');
  btn.classList.toggle('stop', pilotRunning);
  btn.classList.toggle('start', !pilotRunning);
  btn.innerHTML = pilotRunning
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> STOP ENGINE`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> START ENGINE`;
}

async function pollStatus() {
  try {
    const j = await fetch(api('/api/flow/status'), { signal: AbortSignal.timeout(2500) }).then(r => r.json());
    updateEngine(j);
    $('dDot').className = 'dot on';
    $('dLbl').textContent = 'เชื่อมต่อแล้ว';
  } catch {
    $('dDot').className = 'dot warn';
    $('dLbl').textContent = 'ไม่ตอบ';
  }
  refreshQueueUI();   // เช็คความสด (stale) ของคิวซ้ำทุกรอบ poll ด้วย
}

// ════ QUEUE LIVE STATE + RESUME (อ่าน flow_queue_state/flow_jobs จาก storage) ════

const escSp = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const QUEUE_STALE_MS = 15 * 60 * 1000;   // running แต่เงียบเกิน 15 นาที = ค้างกลางทาง

async function refreshQueueUI() {
  const d = await chrome.storage.local.get(['flow_jobs', 'flow_queue_state']);
  const left = (d.flow_jobs || []).length;
  const st = d.flow_queue_state || {};
  const stalled = st.running && Date.now() - (st.at || 0) > QUEUE_STALE_MS;
  const running = st.running && !stalled;

  // บรรทัด "กำลังทำ" — โชว์เฉพาะตอนคิวเดินจริง
  const row = $('nowDoing');
  if (running) {
    const idx = Math.max(1, Math.min(st.total || 1, (st.total || 0) - (st.left || 0) + 1));
    $('nowTxt').textContent = `${st.dry ? '[ทดสอบ] ' : ''}กำลังสร้าง (${idx}/${st.total}): ${st.current || '…'}`;
    row.classList.add('on');
  } else row.classList.remove('on');

  // แถบคิวค้าง — มีของเหลือ + ไม่ได้รันอยู่ (หรือรันแต่เงียบจนถือว่าตาย)
  const bar = $('spResume');
  if (left && !running) {
    $('spResumeTxt').textContent = stalled
      ? `คิวเงียบไปนาน — ค้างอยู่ ${left} ชิ้น (แท็บ Flow อาจถูกปิด/reload)`
      : `คิวค้างจากรอบก่อน ${left} ชิ้น`;
    bar.classList.add('on');
  } else bar.classList.remove('on');
}

$('spResumeBtn').addEventListener('click', () => {
  $('spResume').classList.remove('on');
  $('spGeminiWarn')?.classList.remove('on');
  chrome.runtime.sendMessage({ action: 'flow_start', dry: $('spDry').checked }, () => {
    if (chrome.runtime.lastError) { /* ผลจริงตามมาทาง flow_queue_done/storage */ }
    refreshQueueUI();
  });
});
$('spResumeClear').addEventListener('click', async () => {
  await chrome.storage.local.set({ flow_jobs: [], flow_queue_state: null });
  refreshQueueUI();
});

// ════ ERROR PANEL (จาก error_log ที่ background เก็บไว้ — ตัวแปร errLog ประกาศหัวไฟล์) ════

function updateErrDot() { $('errDot').classList.toggle('on', errLog.length > 0); }
function renderErrors() {
  const list = $('errList');
  if (!errLog.length) { list.innerHTML = '<div class="err-empty">ยังไม่มีข้อผิดพลาด</div>'; return; }
  list.innerHTML = errLog.slice(0, 50).map(e => `
    <div class="err-item">
      <div class="err-meta"><span class="tag">${escSp(e.where || '?')}</span><span>${new Date(e.at).toLocaleString('th-TH')}</span></div>
      <div class="err-msg">${escSp(e.message || '')}</div>
    </div>`).join('');
}
$('errCell').addEventListener('click', () => { renderErrors(); $('errPanel').classList.add('on'); });
$('errClose').addEventListener('click', () => $('errPanel').classList.remove('on'));
$('errClear').addEventListener('click', async () => {
  errLog = [];
  await chrome.storage.local.set({ error_log: [] });
  renderErrors(); updateErrDot();
});

// ════ DRY-RUN TOGGLE (sync กับ Dashboard ผ่าน storage.dry_run) ════

$('spDry').addEventListener('change', e => chrome.storage.local.set({ dry_run: e.target.checked }));

// ════ STORAGE SYNC — อัปเดต UI สดโดยไม่ต้อง poll ════

chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local') return;
  if (ch.flow_queue_state || ch.flow_jobs) refreshQueueUI();
  if (ch.error_log) {
    errLog = ch.error_log.newValue || [];
    updateErrDot();
    if ($('errPanel').classList.contains('on')) renderErrors();
  }
  if (ch.dry_run) $('spDry').checked = !!ch.dry_run.newValue;
  if (ch.panel_settings) {
    settings = ch.panel_settings.newValue || {};
    if (settings.shop_name) $('shopName').textContent = settings.shop_name;
  }
});

// ════ ENGINE BUTTON → PRE-FLIGHT WIZARD ════
// กด START: ครั้งแรกเดิน wizard 4 ขั้น / มีโปรไฟล์แล้วขึ้นการ์ดสรุปให้ยืนยันก่อนเริ่ม
// กด STOP: หยุดทันทีเหมือนเดิม

const DEFAULT_PROFILE = {
  presenter: { preset: 'f-sunny', mode: 'ai', photos: [], desc: '', gender: 'หญิง', age: 'วัยทำงาน', personality: 'สดใสมีพลัง', pronoun: '' },
  style: { age_target: 'ทุกวัย', bg: 'ไลฟ์สไตล์', look: 'คอนเทนต์ไวรัล', hooks: ['ตกใจราคา', 'สาธิตของ'], cta: '', hashtags: '', prompt_mode: 'ai' },
  source: { mode: 'manual', min_comm: '', min_sold: '', price_min: '', price_max: '', sort: 'comm', require_cart: true },
  run: { per_day: 10, time_start: '09:00', time_end: '22:00', platforms: ['tiktok'], budget: '', review: false },
  saved_at: 0,
};
const PLAT_LABEL = { tiktok: 'TikTok', shopee: 'Shopee Video', instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube' };

// ── แกลเลอรีตัวละครผู้รีวิว (เลือกการ์ดเดียวจบ — preset กำหนด เพศ/วัย/บุคลิก/หน้าตา ให้เอง) ──
// รูปใน avatars/*.png สร้างจาก DiceBear สไตล์ "Big Smile" (CC BY 4.0 — เครดิต: Ashley Seo)
const IC_SPARK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/></svg>`;
const IC_CAM = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
const IC_SLIDER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`;
const CK_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const CHARACTERS = [
  { id: 'f-sunny', name: 'มายด์', tag: 'สดใส · วัยรุ่น', hue: '#f472b6',
    gender: 'หญิง', age: 'วัยรุ่น', personality: 'สดใสมีพลัง', desc: 'หญิงไทยวัย 20 ผมเปีย ยิ้มสดใส มีพลัง' },
  { id: 'f-pro', name: 'พลอย', tag: 'มือโปร · ทำงาน', hue: '#a855f7',
    gender: 'หญิง', age: 'วัยทำงาน', personality: 'มืออาชีพ', desc: 'หญิงไทยวัย 28 บุคลิกดี น่าเชื่อถือ พูดฉะฉาน' },
  { id: 'm-fun', name: 'ภูมิ', tag: 'ขายเก่ง · สนุก', hue: '#38bdf8',
    gender: 'ชาย', age: 'วัยทำงาน', personality: 'ขายของเก่ง', desc: 'ชายไทยวัย 25 อารมณ์ดี พูดเก่ง ปิดการขายเก่ง' },
  { id: 'm-pro', name: 'เคน', tag: 'สุภาพ · น่าเชื่อถือ', hue: '#34d399',
    gender: 'ชาย', age: 'วัยทำงาน', personality: 'มืออาชีพ', desc: 'ชายไทยวัย 30 สุภาพ เนี้ยบ น่าเชื่อถือ' },
  { id: 'f-warm', name: 'ป้าแอน', tag: 'อบอุ่น · ผู้ใหญ่', hue: '#fbbf24',
    gender: 'หญิง', age: 'ผู้ใหญ่', personality: 'เป็นกันเอง', desc: 'หญิงไทยวัย 45 ใจดี อบอุ่น รีวิวเหมือนคนใช้จริง' },
  { id: 'auto', name: 'ให้ระบบเลือก', tag: 'เปลี่ยนตามสินค้า', icon: IC_SPARK, special: true },
  { id: 'self', name: 'ใช้รูปตัวเอง', tag: 'อัปรูปถ่ายจริง', icon: IC_CAM, special: true },
  { id: 'custom', name: 'กำหนดเอง', tag: 'ตั้งค่าละเอียด', icon: IC_SLIDER, special: true },
];
const WZ_META = {
  1: { t: 'ผู้รีวิว', d: 'เลือกหน้าคนที่จะโผล่รีวิวสินค้าในทุกคลิป' },
  2: { t: 'สไตล์คลิป', d: 'ทุกตัวเลือกจะถูกใช้เขียนคำสั่งสร้างคลิปอัตโนมัติ' },
  3: { t: 'แหล่งสินค้า', d: 'จะหยิบสินค้าตัวไหนจากคลังมาทำคลิป' },
  4: { t: 'ขอบเขตการรัน', d: 'ลิมิตกันเปลืองเครดิต และกันโพสต์ถี่จนโดนแบน' },
  5: { t: 'พร้อมเริ่มทำงาน', d: 'นี่คือสิ่งที่ระบบจะทำเมื่อกด "เริ่มทำงาน"' },
};
let profile = null;
let curStep = 1;

// ── chips helpers (single/multi select) ──
function bindChips(el, multi, onChange) {
  el.addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    if (multi) c.classList.toggle('on');
    else el.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c));
    if (onChange) onChange();
  });
}
const chipVals = el => [...el.querySelectorAll('.chip.on')].map(c => c.dataset.v);
const setChips = (el, vals) => el.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', (vals || []).includes(c.dataset.v)));

// ── navigation ──
function showStep(n) {
  curStep = n;
  [1, 2, 3, 4].forEach(i => $('wzS' + i).classList.toggle('on', i === n));
  $('wzSum').classList.toggle('on', n === 5);
  $('wzDots').style.display = n === 5 ? 'none' : 'flex';
  document.querySelectorAll('.wz-dot').forEach((d, i) => d.classList.toggle('on', i < Math.min(n, 4)));
  $('wzStepLbl').textContent = n === 5 ? 'ตั้งค่าเครื่องยนต์ · สรุป' : `ตั้งค่าเครื่องยนต์ · ขั้นที่ ${n}/4`;
  $('wzTitle').textContent = WZ_META[n].t;
  $('wzDesc').textContent = WZ_META[n].d;
  $('wzBack').textContent = n === 1 ? 'ยกเลิก' : (n === 5 ? 'ปิด' : 'ย้อนกลับ');
  $('wzNext').textContent = n === 5 ? 'เริ่มทำงาน' : (n === 4 ? 'บันทึก' : 'ถัดไป');
  $('wizard').classList.add('on');
  $('wzBody').scrollTop = 0;
}
function closeWizard() { $('wizard').classList.remove('on'); }
function openWizard(n) { fillForm(); showStep(n); }
function openSummary() { renderSummary(); showStep(5); }

// ── form ↔ profile ──
function fillForm() {
  const p = profile;
  // โปรไฟล์รุ่นเก่าที่ยังไม่มี preset → จับเข้าการ์ดที่ความหมายตรงกัน
  if (!p.presenter.preset) p.presenter.preset = p.presenter.mode === 'self' ? 'self' : 'custom';
  setChips($('pGender'), [p.presenter.gender]); setChips($('pAge'), [p.presenter.age]);
  setChips($('pPersona'), [p.presenter.personality]); $('pPronoun').value = p.presenter.pronoun || '';
  $('pDesc').value = p.presenter.desc || '';
  renderCharGrid(); renderPhotos(); syncCharUI();
  setChips($('sAge'), [p.style.age_target]); setChips($('sBg'), [p.style.bg]); setChips($('sLook'), [p.style.look]);
  setChips($('sHooks'), p.style.hooks);
  $('sCta').value = p.style.cta || ''; $('sTags').value = p.style.hashtags || '';
  setChips($('sPmode'), [p.style.prompt_mode]);
  setChips($('srcMode'), [p.source.mode]); syncSourceMode();
  $('srcComm').value = p.source.min_comm ?? ''; $('srcSold').value = p.source.min_sold ?? '';
  $('srcPmin').value = p.source.price_min ?? ''; $('srcPmax').value = p.source.price_max ?? '';
  setChips($('srcSort'), [p.source.sort]); $('srcCart').checked = !!p.source.require_cart;
  $('rPerDay').value = p.run.per_day; $('rStart').value = p.run.time_start; $('rEnd').value = p.run.time_end;
  setChips($('rPlat'), p.run.platforms);
  $('rBudget').value = p.run.budget ?? ''; $('rReview').checked = !!p.run.review;
}
function collectAll() {
  const p = profile;
  const preset = p.presenter.preset || 'f-sunny';
  const ch = CHARACTERS.find(c => c.id === preset);
  p.presenter.mode = preset === 'self' ? 'self' : 'ai';
  if (ch && !ch.special) {
    // เลือกตัวละครสำเร็จรูป → preset กำหนดทุกอย่างให้
    p.presenter.gender = ch.gender; p.presenter.age = ch.age;
    p.presenter.personality = ch.personality; p.presenter.desc = ch.desc;
  } else if (preset === 'custom') {
    p.presenter.gender = chipVals($('pGender'))[0] || 'หญิง';
    p.presenter.age = chipVals($('pAge'))[0] || 'วัยทำงาน';
    p.presenter.personality = chipVals($('pPersona'))[0] || 'สดใสมีพลัง';
    p.presenter.desc = $('pDesc').value.trim();
  } else if (preset === 'auto') {
    p.presenter.desc = '';   // ให้ AI เลือกตามสินค้าตอน gen
  }
  p.presenter.pronoun = $('pPronoun').value.trim();
  p.style.age_target = chipVals($('sAge'))[0] || 'ทุกวัย';
  p.style.bg = chipVals($('sBg'))[0] || 'ไลฟ์สไตล์';
  p.style.look = chipVals($('sLook'))[0] || 'คอนเทนต์ไวรัล';
  p.style.hooks = chipVals($('sHooks'));
  p.style.cta = $('sCta').value.trim(); p.style.hashtags = $('sTags').value.trim();
  p.style.prompt_mode = chipVals($('sPmode'))[0] || 'ai';
  p.source.mode = chipVals($('srcMode'))[0] || 'manual';
  p.source.min_comm = $('srcComm').value; p.source.min_sold = $('srcSold').value;
  p.source.price_min = $('srcPmin').value; p.source.price_max = $('srcPmax').value;
  p.source.sort = chipVals($('srcSort'))[0] || 'comm';
  p.source.require_cart = $('srcCart').checked;
  p.run.per_day = +$('rPerDay').value || 10;
  p.run.time_start = $('rStart').value || '09:00'; p.run.time_end = $('rEnd').value || '22:00';
  p.run.platforms = chipVals($('rPlat'));
  p.run.budget = $('rBudget').value; p.run.review = $('rReview').checked;
}
async function saveProfile() {
  collectAll();
  profile.saved_at = Date.now();
  await chrome.storage.local.set({ engine_profile: profile });
}

// ── แกลเลอรีตัวละคร ──
function renderCharGrid() {
  const sel = profile.presenter.preset || 'f-sunny';
  const selfPhoto = (profile.presenter.photos || [])[0];
  $('charGrid').innerHTML = CHARACTERS.map(c => {
    let face;
    if (c.id === 'self' && selfPhoto) {
      face = `<div class="char-face" style="background-image:url(${selfPhoto})"></div>`;
    } else if (c.special) {
      face = `<div class="char-face special">${c.icon}</div>`;
    } else {
      face = `<div class="char-face" style="background:linear-gradient(140deg,${c.hue}59,${c.hue}14)"><img src="avatars/${c.id}.png" alt=""></div>`;
    }
    return `<div class="char-card ${c.id === sel ? 'on' : ''}" data-id="${c.id}">
      ${face}
      <div class="char-name">${c.name}</div>
      <div class="char-tag">${c.tag}</div>
      <span class="char-ck">${CK_SVG}</span>
    </div>`;
  }).join('');
}
$('charGrid').addEventListener('click', (e) => {
  const card = e.target.closest('.char-card');
  if (!card) return;
  profile.presenter.preset = card.dataset.id;
  renderCharGrid();
  syncCharUI();
});
function syncCharUI() {
  const id = profile.presenter.preset;
  $('pPhotosWrap').style.display = id === 'self' ? 'flex' : 'none';
  $('pCustomWrap').style.display = id === 'custom' ? 'flex' : 'none';
}
function syncSourceMode() {
  const mode = chipVals($('srcMode'))[0] || 'manual';
  $('srcManualHint').style.display = mode === 'manual' ? '' : 'none';
  $('srcAuto').style.display = mode === 'auto' ? 'flex' : 'none';
}

// ผูกคลิกให้ chip ทุกชุด (ก่อนหน้านี้ประกาศ bindChips ไว้แต่ไม่ได้เรียก — กดแล้วไม่ตอบสนอง)
bindChips($('pGender'), false);
bindChips($('pAge'), false);
bindChips($('pPersona'), false);
bindChips($('sLook'), false);
bindChips($('sAge'), false);
bindChips($('sBg'), false);
bindChips($('sHooks'), true);
bindChips($('sPmode'), false);
bindChips($('srcMode'), false, syncSourceMode);
bindChips($('srcSort'), false);
bindChips($('rPlat'), true);

// ── photo upload (ย่อรูปก่อนเก็บ — storage มีลิมิต) ──
let pendingSlot = 0;
function downscalePhoto(file) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const max = 512;
      const k = Math.min(1, max / Math.max(img.width, img.height));
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
function renderPhotos() {
  const photos = profile.presenter.photos || [];
  document.querySelectorAll('.photo-slot').forEach((s) => {
    const url = photos[+s.dataset.i];
    s.classList.toggle('has', !!url);
    s.style.backgroundImage = url ? `url(${url})` : '';
  });
}
document.querySelectorAll('.photo-slot').forEach(s => {
  s.addEventListener('click', (e) => {
    const i = +s.dataset.i;
    if (e.target.closest('.photo-x')) {
      profile.presenter.photos.splice(i, 1);
      renderPhotos(); renderCharGrid();
      return;
    }
    pendingSlot = i;
    $('pFile').click();
  });
});
$('pFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const url = await downscalePhoto(f);
  if (!url) return;
  const arr = profile.presenter.photos = profile.presenter.photos || [];
  arr[pendingSlot] = url;
  profile.presenter.photos = arr.filter(Boolean);   // บีบช่องว่างให้ชิดซ้าย
  renderPhotos(); renderCharGrid();                 // การ์ด "ใช้รูปตัวเอง" โชว์รูปแรกด้วย
});

// ── summary ──
// แปลงตัวเลือกทั้งหมดเป็น "ตัวอย่างคลิป" 1 ประโยค — ให้เห็นว่าที่ตั้งมาเอาไปทำอะไรจริง
function previewPrompt(p) {
  const preset = p.presenter.preset;
  const ch = CHARACTERS.find(c => c.id === preset);
  let who;
  if (preset === 'self') who = 'คุณ (หน้าจากรูปที่อัปโหลด)';
  else if (preset === 'auto') who = 'ผู้รีวิวที่ AI เลือกให้เข้ากับสินค้า';
  else if (preset === 'custom') who = p.presenter.desc || `ผู้รีวิว${p.presenter.gender} ${p.presenter.age} บุคลิก${p.presenter.personality}`;
  else who = `${ch.name} (${ch.desc})`;
  const hooks = p.style.hooks || [];
  return `วิดีโอแนวตั้ง 9:16 ยาว 8 วินาที สไตล์${p.style.look} — ${who} ถือ[สินค้าจากคลัง]รีวิวให้กลุ่ม${p.style.age_target} ฉาก${p.style.bg}`
    + (hooks.length ? ` เปิดคลิปแบบ "${hooks[0]}"${hooks.length > 1 ? ` (สุ่มจาก ${hooks.length} แบบ)` : ''}` : '')
    + (p.style.cta ? ` พูดปิดท้ายว่า "${p.style.cta}"` : '')
    + (p.presenter.pronoun ? ` ในนาม "${p.presenter.pronoun}"` : '')
    + ` → เสร็จแล้วโพสต์ลง ${(p.run.platforms || []).map(v => PLAT_LABEL[v] || v).join(', ') || '(ยังไม่เลือกแพลตฟอร์ม)'} อัตโนมัติ`;
}
function renderSummary() {
  const p = profile;
  const thumb = $('sumThumb');
  const ph = (p.presenter.photos || [])[0];
  const preset = p.presenter.preset || 'custom';
  const ch = CHARACTERS.find(c => c.id === preset);
  const showThumb = !!ph && preset === 'self';
  thumb.classList.toggle('on', showThumb);
  thumb.style.backgroundImage = ph ? `url(${ph})` : '';
  $('sumPIc').style.display = showThumb ? 'none' : 'flex';   // รูปจริงแทนไอคอนเมื่อมี
  let pTxt;
  if (preset === 'self') pTxt = `รูปตัวเอง ${(p.presenter.photos || []).length} รูป`;
  else if (preset === 'auto') pTxt = 'ให้ระบบเลือกตัวละครตามสินค้า';
  else if (preset === 'custom') pTxt = `กำหนดเอง · ${p.presenter.gender} ${p.presenter.age} · ${p.presenter.personality}`;
  else pTxt = `${ch.name} — ${ch.tag}`;
  $('sumP').textContent = pTxt + (p.presenter.pronoun ? ` · เรียกร้านว่า "${p.presenter.pronoun}"` : '');
  $('sumS').textContent = `${p.style.look} · ฉาก${p.style.bg} · Hook ${p.style.hooks.length} แบบ`
    + ` · prompt ${p.style.prompt_mode === 'ai' ? 'AI Gemini' : 'Template'}`
    + (p.style.cta ? ` · CTA "${p.style.cta}"` : '');
  $('sumSrc').textContent = p.source.mode === 'manual'
    ? 'เลือกเองจากคลัง (ตามที่ติ๊กใน Dashboard)'
    : `อัตโนมัติ · คอม ≥${p.source.min_comm || 0}%`
      + (p.source.min_sold ? ` · ขายแล้ว ≥${p.source.min_sold}` : '')
      + (p.source.price_min || p.source.price_max ? ` · ราคา ${p.source.price_min || 0}–${p.source.price_max || '∞'}฿` : '')
      + (p.source.require_cart ? ' · ต้องมีตะกร้า' : '');
  $('sumR').textContent = `${p.run.per_day} คลิป/วัน · ${p.run.time_start}–${p.run.time_end}`
    + ` · ${(p.run.platforms || []).map(v => PLAT_LABEL[v] || v).join(', ') || 'ยังไม่เลือกแพลตฟอร์ม'}`
    + (p.run.budget ? ` · งบ ${p.run.budget}฿/เดือน` : '')
    + (p.run.review ? ' · รีวิวก่อนโพสต์' : '');
  $('prevTxt').textContent = previewPrompt(p);
}
$('wzSum').addEventListener('click', (e) => {
  const b = e.target.closest('.sum-edit');
  if (b) openWizard(+b.dataset.step);
});

// ── footer ──
$('wzBack').addEventListener('click', () => {
  if (curStep === 1 || curStep === 5) closeWizard();
  else showStep(curStep - 1);
});
$('wzNext').addEventListener('click', async () => {
  if (curStep < 4) { showStep(curStep + 1); return; }
  if (curStep === 4) { await saveProfile(); openSummary(); return; }
  closeWizard();           // 5 = สรุป → เริ่มจริง
  await startEngineNow();
});
$('wzClose').addEventListener('click', closeWizard);
$('rTestOne').addEventListener('click', () => {
  const n = $('rTestNote');
  n.style.display = '';
  n.textContent = 'ฟีเจอร์นี้จะเชื่อมกับคิวจริงในขั้นถัดไป — ตอนนี้ใช้สวิตช์ "โหมดทดสอบ" แล้วสร้างจาก Dashboard ไปก่อน';
});

// ── start/stop จริง ──
async function startEngineNow() {
  $('engineBtn').disabled = true;
  try {
    await fetch(api('/api/pilot/start'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(4000) });
    await pollStatus();
  } catch { /* desktop offline */ }
  $('engineBtn').disabled = false;
}
$('engineBtn').addEventListener('click', async () => {
  if (pilotRunning) {
    $('engineBtn').disabled = true;
    try {
      await fetch(api('/api/pilot/stop'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: '{}', signal: AbortSignal.timeout(4000) });
      await pollStatus();
    } catch { /* desktop offline */ }
    $('engineBtn').disabled = false;
    return;
  }
  const d = await chrome.storage.local.get('engine_profile');
  if (d.engine_profile) { profile = d.engine_profile; openSummary(); }
  else { profile = structuredClone(DEFAULT_PROFILE); openWizard(1); }
});

// ════ NAVIGATION ════

$('openDash').addEventListener('click', () => {
  chrome.tabs.query({}, tabs => {
    const ex = tabs.find(t => (t.url || '').startsWith(DASH_URL));
    if (ex) { chrome.tabs.update(ex.id, { active: true }); chrome.windows.update(ex.windowId, { focused: true }); }
    else chrome.tabs.create({ url: DASH_URL });
  });
});
$('openAff').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'navigate_tab', url: 'https://affiliate.shopee.co.th/offer/product_offer' });
});
$('openLib').addEventListener('click', () => {
  chrome.tabs.query({}, tabs => {
    const ex = tabs.find(t => (t.url || '').startsWith(DASH_URL));
    const url = DASH_URL + '#library';
    if (ex) { chrome.tabs.update(ex.id, { active: true, url }); chrome.windows.update(ex.windowId, { focused: true }); }
    else chrome.tabs.create({ url });
  });
});

// ════ LIVE MESSAGES ════

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.action === 'flow_log' || msg.action === 'products_updated' || msg.action === 'flow_queue_done') pollStatus();
  if (msg.action === 'gemini_quota') $('spGeminiWarn')?.classList.add('on');
});
$('spGeminiWarnX')?.addEventListener('click', () => $('spGeminiWarn')?.classList.remove('on'));
