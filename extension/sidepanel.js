// ── Side panel = รีโมตควบคุม (ศูนย์ควบคุม) — งานหนักทั้งหมดอยู่ที่ dashboard.html ──
let settings = {};
const $ = id => document.getElementById(id);
const port = () => settings.port || '3001';
const api = path => `http://localhost:${port()}${path}`;
const DASH_URL = chrome.runtime.getURL('dashboard.html');

// ── init: โหลด settings + สถิติ ──
chrome.storage.local.get(['panel_settings'], d => { settings = d.panel_settings || {}; refreshStats(); });

async function refreshStats() {
  const d = await chrome.storage.local.get(['products']);
  const products = d.products || [];
  $('sProd').textContent = products.length;
  $('sLink').textContent = products.filter(p => p.links && p.links.affiliate_link).length;
  try {
    const j = await fetch(api('/api/videos'), { signal: AbortSignal.timeout(2500) }).then(r => r.json());
    $('sDone').textContent = (j.videos || []).length;
  } catch {}
}
setInterval(refreshStats, 10000);

// ── desktop status ──
async function checkDesktop() {
  $('dTime').textContent = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  try {
    const r = await fetch(api('/api/flow/status'), { signal: AbortSignal.timeout(2500) });
    if (r.ok) { $('dDot').className = 'dot on'; $('dLbl').textContent = 'เชื่อมต่อ desktop แล้ว'; return; }
  } catch {}
  $('dDot').className = 'dot warn'; $('dLbl').textContent = 'desktop ไม่ตอบ — เปิดโปรแกรม desktop';
}
checkDesktop(); setInterval(checkDesktop, 8000);

// ── เปิด Dashboard (โฟกัสแท็บเดิมถ้ามี ไม่งั้นเปิดใหม่) ──
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

// ── log feed ──
function clog(m, cls = 'i') {
  const box = $('ctrlLog');
  if (box.children.length === 1 && box.textContent.includes('…')) box.innerHTML = '';
  const d = document.createElement('div'); d.className = cls;
  d.textContent = `[${new Date().toLocaleTimeString('th-TH')}] ${m}`;
  box.appendChild(d); box.scrollTop = box.scrollHeight;
  while (box.children.length > 300) box.removeChild(box.firstChild);  // กันยาวเกิน
}
$('clrLog').addEventListener('click', () => { $('ctrlLog').innerHTML = '<span class="i">— ล้างแล้ว —</span>'; });

// ── live status ──
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.action === 'flow_log') {
    $('nowMsg').textContent = msg.msg;
    const cls = /ผิดพลาด|ล้มเหลว|ไม่สำเร็จ|ไม่ตอบ|ERROR|ข้าม/.test(msg.msg) ? 'e'
      : /✓|เสร็จ|สำเร็จ|แล้ว/.test(msg.msg) ? 's' : 'i';
    clog(msg.msg, cls);
  }
  if (msg.action === 'products_updated') {
    $('nowMsg').textContent = `รับสินค้า +${msg.added} (รวม ${msg.total})`;
    clog(`รับสินค้า +${msg.added} (รวม ${msg.total})`, 's');
    refreshStats();
  }
});
