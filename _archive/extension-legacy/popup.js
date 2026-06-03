// ── State ──
let products = [];
let queue = [];
let settings = {};
let statDone = 0;

// ── Load ──
chrome.storage.local.get(['products', 'queue', 'settings', 'statDone'], d => {
  if (d.products) products = d.products;
  if (d.queue)    queue    = d.queue;
  if (d.settings) settings = d.settings;
  if (d.statDone) statDone = d.statDone;
  updateStorageUI();
  updateToolsUI();
});

// ── Open Dashboard ──
['btn-open-dash', 'btn-open-dash2', 'btn-open-dash3'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });
});

// ── Tabs ──
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ── Page Status ──
async function checkPage() {
  const affiliateTabs = await chrome.tabs.query({ url: 'https://affiliate.shopee.co.th/*' });
  const url = affiliateTabs[0]?.url || '';
  const dot = document.getElementById('sdot');
  const msg = document.getElementById('smsg');
  const info = document.getElementById('page-info');
  const btn = document.getElementById('btn-scrape');

  if (url.includes('affiliate.shopee.co.th')) {
    dot.className = 'dot green';
    msg.textContent = 'AFFILIATE READY';
    info.innerHTML = `<b>พบหน้า Shopee Affiliate</b><br>พร้อมดึงข้อมูลสินค้า ExtraComm<div class="url">${url}</div>`;
    btn.disabled = false;
  } else if (url.includes('shopee.co.th')) {
    dot.className = 'dot yellow';
    msg.textContent = 'ไม่ใช่หน้า Affiliate';
    info.innerHTML = `<b style="color:#ffd740">กรุณาไปที่หน้า Affiliate ก่อน</b><br><span style="font-size:11px;color:var(--muted)">affiliate.shopee.co.th/offer/product_offer</span>`;
    btn.disabled = true;
  } else {
    dot.className = 'dot red';
    msg.textContent = 'ไม่พบหน้า Shopee';
    info.innerHTML = `<b style="color:#ff1744">กรุณาเปิด Shopee Affiliate ก่อน</b>`;
    btn.disabled = true;
  }
}

checkPage();

// ── Log ──
function addLog(msg, type = '') {
  const box = document.getElementById('log');
  const t = new Date().toLocaleTimeString('th-TH');
  const line = document.createElement('div');
  line.className = type;
  line.textContent = `[${t}] ${msg}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

// ── Scrape ──
document.getElementById('btn-scrape').addEventListener('click', async () => {
  const btn = document.getElementById('btn-scrape');
  btn.disabled = true;
  btn.textContent = 'กำลังดึง... (scroll หน้า)';

  // หาแท็บ Shopee Affiliate โดยตรง ไม่ใช่ active tab
  const affiliateTabs = await chrome.tabs.query({ url: 'https://affiliate.shopee.co.th/*' });
  if (!affiliateTabs.length) {
    addLog('ไม่พบแท็บ affiliate.shopee.co.th กรุณาเปิดหน้านั้นก่อน', 'e');
    btn.disabled = false;
    btn.textContent = 'เริ่มดึงข้อมูลจากหน้านี้';
    return;
  }

  const tab = affiliateTabs[0];
  addLog(`พบแท็บ: ${tab.url.slice(0, 50)}...`, 'i');

  document.getElementById('prog-target').textContent = '...';
  document.getElementById('prog-done').textContent = '0';
  document.getElementById('prog-bar').style.width = '0%';
  addLog('เริ่มดึงข้อมูล... กำลัง scroll หน้า');

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/scraper.js'] });
  } catch (e) { addLog('inject: ' + e.message, 'w'); }

  chrome.tabs.sendMessage(tab.id, {
    action: 'scrape',
    extracommOnly: document.getElementById('chk-extracomm').checked
  }, res => {
    btn.disabled = false;
    btn.textContent = 'เริ่มดึงข้อมูลจากหน้านี้';

    if (chrome.runtime.lastError || !res?.success) {
      addLog('เกิดข้อผิดพลาด: ' + (chrome.runtime.lastError?.message || res?.error || '?'), 'e');
      return;
    }

    const data = res.data;
    if (data?.error) { addLog(data.error, 'e'); return; }

    const prods = data?.products || [];

    // debug info
    if (data?.debug) {
      const d = data.debug;
      addLog(`[debug] links:${d.link_btns_exact} imgs:${d.total_imgs}`, 'w');
      if (d.all_img_urls?.length) {
        d.all_img_urls.forEach(img => addLog(`  img: ${img.src || img.dataSrc} (${img.w}x${img.h})`, 'i'));
      }
      if (d.first_card_html) addLog(`[card html] ${d.first_card_html.slice(0, 300)}`, 'w');
    }

    if (prods.length === 0) {
      addLog('ไม่พบสินค้า — ลองกด F5 รีเฟรชหน้า Affiliate แล้วดึงใหม่', 'w');
    }

    products = [...products, ...prods];
    chrome.storage.local.set({ products });

    document.getElementById('prog-target').textContent = prods.length;
    document.getElementById('prog-done').textContent = prods.length;
    document.getElementById('prog-bar').style.width = prods.length ? '100%' : '0%';

    updateStorageUI();
    addLog(`ดึงสำเร็จ! +${prods.length} รายการ (รวม ${products.length})`, 'i');
    prods.slice(0, 5).forEach(p => {
      addLog(`  • ${(p.basic_info?.name || '?').slice(0, 35)} ฿${p.basic_info?.price || '?'} | ${p.commission?.rate || '?'}%`);
      addLog(`    id:${p.product_id || 'null'} shop:${p.links?.shop_id || 'null'}`, 'w');
      if (p.images?.[0]) addLog(`    img: ${p.images[0].slice(0, 70)}`, 'i');
      else addLog(`    img: ไม่มี`, 'w');
    });
  });
});

// ── Storage UI ──
function updateStorageUI() {
  document.getElementById('storage-count').textContent    = products.length;
  document.getElementById('storage-extracomm').textContent = products.filter(p => p.commission?.is_extracomm).length;
  document.getElementById('storage-done').textContent     = statDone;

  const list = document.getElementById('recent-list');
  const recent = products.slice(-5).reverse();

  if (!recent.length) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px;">ยังไม่มีข้อมูล</div>';
    return;
  }

  list.innerHTML = recent.map(p => {
    const img = p.images_b64?.[0] || p.images?.[0] || '';
    return `<div class="recent-item">
      ${img
        ? `<img class="r-thumb" src="${img}" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`
        : `<div class="r-thumb" style="display:flex;align-items:center;justify-content:center;font-size:18px;">📷</div>`}
      <div class="r-info">
        <div class="r-name">${p.basic_info?.name || 'ไม่มีชื่อ'}</div>
        <div class="r-meta">฿${p.basic_info?.price || '-'} <span class="r-comm">${p.commission?.rate || '?'}% คอม</span></div>
      </div>
    </div>`;
  }).join('');
}

// ── Export ──
document.getElementById('btn-export').addEventListener('click', () => {
  if (!products.length) return;
  const blob = new Blob([JSON.stringify(products, null, 2)], { type: 'application/json' });
  chrome.downloads.download({ url: URL.createObjectURL(blob), filename: `extracomm_${Date.now()}.json` });
  addLog('Export JSON สำเร็จ');
});

// ── Import ──
document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      const imported = Array.isArray(data) ? data : [data];
      products = [...products, ...imported];
      chrome.storage.local.set({ products });
      updateStorageUI();
      addLog(`Import สำเร็จ: +${imported.length} รายการ`, 'i');
    } catch { addLog('Import ผิดพลาด', 'e'); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ── Clear ──
document.getElementById('btn-clear').addEventListener('click', () => {
  if (!confirm('ล้างข้อมูลทั้งหมด?')) return;
  products = [];
  chrome.storage.local.set({ products });
  updateStorageUI();
  addLog('ล้างข้อมูลแล้ว', 'w');
});

// ── Tools UI ──
async function updateToolsUI() {
  document.getElementById('queue-count').textContent = queue.length + ' รายการ';

  // ตรวจ API Keys
  if (settings?.claude) document.getElementById('claude-conn').textContent = '✅ ตั้งค่าแล้ว';
  if (settings?.google) document.getElementById('veo-conn').textContent   = '✅ ตั้งค่าแล้ว';

  // ตรวจ Desktop App
  const port = settings?.port || '3001';
  try {
    const res = await fetch(`http://localhost:${port}/api/status`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) document.getElementById('app-conn').textContent = '✅ เชื่อมต่อแล้ว';
    else document.getElementById('app-conn').textContent = '❌ ไม่ตอบสนอง';
  } catch {
    document.getElementById('app-conn').textContent = '❌ ไม่พบโปรแกรม';
  }
}

// ── Send to App ──
document.getElementById('btn-send-all').addEventListener('click', async () => {
  if (!products.length) return;
  const port = settings?.port || '3001';
  const tlog = document.getElementById('tools-log');
  try {
    const res = await fetch(`http://localhost:${port}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products, settings })
    });
    tlog.textContent = res.ok ? `✅ ส่ง ${products.length} รายการสำเร็จ` : `❌ Error ${res.status}`;
  } catch {
    tlog.textContent = '❌ Desktop App ไม่ตอบสนอง (เปิดโปรแกรมก่อน)';
  }
});

document.getElementById('btn-clear-q').addEventListener('click', () => {
  queue = []; chrome.storage.local.set({ queue });
  document.getElementById('queue-count').textContent = '0 รายการ';
  document.getElementById('tools-log').textContent = 'ล้าง Queue แล้ว';
});
