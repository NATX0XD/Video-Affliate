// ── Side panel = ตัวช่วยบาง ๆ (ศูนย์ควบคุมหลักอยู่บนเว็บแอป localhost:3001) ──
// เดิมไฟล์นี้เป็น dashboard เต็ม (engine/คิว/คลังวิดีโอ) — ย้ายไปเว็บแอปแล้ว
// เหลือแค่: เช็คการเชื่อมต่อ + เปิดแอป + ทางลัดดูดสินค้า.
const $ = id => document.getElementById(id);

let settings = {};
const port = () => settings.port || '3001';
const appBase = () => `http://localhost:${port()}`;
const api = path => `${appBase()}${path}`;

// อ่านพอร์ตจาก settings (desktop เขียนไว้) — default 3001
chrome.storage.local.get('panel_settings', d => { settings = d.panel_settings || {}; foot(); });
chrome.storage.onChanged.addListener(ch => {
  if (ch.panel_settings) { settings = ch.panel_settings.newValue || {}; foot(); }
});

function foot() {
  const v = (chrome.runtime?.getManifest?.() || {}).version || '?';
  $('foot').textContent = `Shopee VDO Gen v${v} · พอร์ต ${port()}`;
}

// ── สถานะเชื่อมต่อ: ยิง /api/flow/status ที่เว็บแอป ──
async function pollStatus() {
  try {
    const r = await fetch(api('/api/flow/status'), { signal: AbortSignal.timeout(2500) });
    if (!r.ok) throw new Error('bad');
    $('dot').className = 'dot on';
    $('lbl').textContent = 'เชื่อมต่อแอปแล้ว';
    $('sub').textContent = `พร้อมใช้งานที่ ${appBase()}`;
  } catch {
    $('dot').className = 'dot warn';
    $('lbl').textContent = 'ยังไม่เชื่อมต่อแอป';
    $('sub').textContent = `เปิดแอป VDO Gen ที่ localhost:${port()} ก่อน`;
  }
}

// ── เปิดแอป VDO Gen (โฟกัสแท็บเดิมถ้ามี) ──
function openApp() {
  const url = `${appBase()}/dashboard/`;
  chrome.tabs.query({}, tabs => {
    const ex = tabs.find(t => (t.url || '').startsWith(`${appBase()}/`));
    if (ex) { chrome.tabs.update(ex.id, { active: true, url }); chrome.windows.update(ex.windowId, { focused: true }); }
    else chrome.tabs.create({ url });
  });
}

function openShopee() {
  const url = 'https://affiliate.shopee.co.th/offer/product_offer';
  chrome.tabs.query({ url: 'https://affiliate.shopee.co.th/*' }, tabs => {
    if (tabs.length) { chrome.tabs.update(tabs[0].id, { active: true }); chrome.windows.update(tabs[0].windowId, { focused: true }); }
    else chrome.tabs.create({ url });
  });
}

// ── ทางลัดดูดสินค้าจากแท็บ Affiliate ที่เปิดอยู่ ──
// scrape_tab คืน products แต่ไม่เก็บเอง → forward เข้า add_products (เก็บ storage + mirror desktop)
function scrapeNow() {
  const btn = $('scrapeNow');
  btn.disabled = true; const old = btn.textContent; btn.textContent = 'กำลังดูด…';
  const done = () => { btn.disabled = false; btn.textContent = old; };
  chrome.runtime.sendMessage({ action: 'scrape_tab' }, res => {
    if (chrome.runtime.lastError || !res || res.success === false) {
      done();
      $('hint').textContent = (res && res.error) || 'ดูดไม่สำเร็จ — เปิดหน้า Shopee Affiliate ก่อน';
      return;
    }
    const products = (res.data && res.data.products) || [];
    if (!products.length) { done(); $('hint').textContent = 'ไม่พบสินค้าในแท็บ Affiliate นี้'; return; }
    chrome.runtime.sendMessage({ action: 'add_products', products }, r => {
      done();
      if (chrome.runtime.lastError || !r) { $('hint').textContent = 'ดูดได้แต่ส่งเข้าคลังไม่สำเร็จ'; return; }
      $('hint').textContent = `ดูดแล้ว เพิ่มใหม่ ${r.added ?? 0} ชิ้น (คลังรวม ${r.total ?? '?'})`;
    });
  });
}

$('openApp').addEventListener('click', openApp);
$('openShopee').addEventListener('click', openShopee);
$('scrapeNow').addEventListener('click', scrapeNow);

// อัปเดต hint เมื่อ background แจ้งว่ามีสินค้าใหม่เข้าคลัง
chrome.runtime.onMessage.addListener(msg => {
  if (msg && msg.action === 'products_updated') {
    $('hint').textContent = `สินค้าเข้าคลังแล้ว รวม ${msg.total} ชิ้น — เปิดแอปเพื่อสร้างคลิป`;
  }
});

foot();
pollStatus();
setInterval(pollStatus, 5000);
