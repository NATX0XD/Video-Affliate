// ── State ──
let products = [], queue = [], settings = {};
let statDone = 0, statErr = 0, pilotRunning = false;
let activeFilters = new Set(['extracomm']);
const togState = { random: true, sub: true, music: true, wm: false };

// ── Init ──
chrome.storage.local.get(['products','queue','settings','statDone','statErr'], d => {
  if (d.products) products = d.products;
  if (d.queue)    queue    = d.queue;
  if (d.settings) { settings = d.settings; applySettingsUI(); }
  if (d.statDone) statDone = d.statDone;
  if (d.statErr)  statErr  = d.statErr;
  renderAll();
  checkPageStatus();
});

// ── Navigation ──
function goPage(name) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === name));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + name));
  const titles = { home:'Dashboard', products:'สินค้า ExtraComm', settings:'ตั้งค่าวิดีโอ', pilot:'Auto Pilot', queue:'Queue' };
  document.getElementById('page-title').textContent = titles[name] || name;
  if (name === 'pilot') updatePilotSummary();
  if (name === 'products') renderGrid();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => goPage(item.dataset.page));
});

// Quick actions
document.getElementById('qa-scrape').addEventListener('click', () => doScrape());
document.getElementById('qa-products').addEventListener('click', () => goPage('products'));
document.getElementById('qa-pilot').addEventListener('click', () => goPage('pilot'));
document.getElementById('qa-settings').addEventListener('click', () => goPage('settings'));

// ── Page Status ──
function checkPageStatus() {
  chrome.runtime.sendMessage({ action: 'get_tab_url' }, res => {
    const url = res?.url || '';
    const dot = document.getElementById('sdot');
    const msg = document.getElementById('smsg');
    if (url.includes('affiliate.shopee.co.th')) {
      dot.className = 'dot green';
      msg.textContent = 'Affiliate Ready';
    } else {
      dot.className = 'dot yellow';
      msg.textContent = 'เปิดหน้า Affiliate ก่อน';
    }
  });
}
setInterval(checkPageStatus, 5000);

// ── Scrape ──
document.getElementById('btn-scrape-top').addEventListener('click', doScrape);

async function doScrape(keyword) {
  const btn = document.getElementById('btn-scrape-top');
  btn.disabled = true;
  btn.textContent = 'กำลังดึง...';

  if (keyword) {
    const url = `https://affiliate.shopee.co.th/offer/product_offer?keyword=${encodeURIComponent(keyword)}`;
    chrome.runtime.sendMessage({ action: 'navigate_tab', url }, () => {
      setTimeout(() => triggerScrape(btn, keyword), 2500);
    });
  } else {
    triggerScrape(btn, null);
  }
}

function triggerScrape(btn, keyword) {
  chrome.runtime.sendMessage({ action: 'scrape_tab', extracommOnly: activeFilters.has('extracomm') }, res => {
    btn.disabled = false;
    btn.textContent = 'ดึงจากหน้า Affiliate';

    if (!res?.success) {
      logPilot('เกิดข้อผิดพลาด: ' + (res?.error || 'ไม่ได้รับข้อมูล'), 'e');
      return;
    }
    const data = res.data;
    if (data?.error) { logPilot(data.error, 'e'); return; }

    const prods = data?.products || [];
    if (activeFilters.has('hot'))     prods.sort((a,b) => (b.basic_info?.sold_count||0) - (a.basic_info?.sold_count||0));
    if (activeFilters.has('highcomm')) prods.sort((a,b) => (b.commission?.rate||0) - (a.commission?.rate||0));

    products = [...products, ...prods];
    chrome.storage.local.set({ products });
    renderAll();

    const tag = keyword ? `[${keyword}]` : '[หน้านี้]';
    logPilot(`${tag} ดึงสำเร็จ +${prods.length} รายการ (รวม ${products.length})`, 'i');
  });
}

// Keyword search
document.getElementById('btn-kw').addEventListener('click', () => {
  const kw = document.getElementById('kw-inp').value.trim();
  if (kw) doScrape(kw);
});
document.getElementById('kw-inp').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-kw').click();
});

// ── Filters ──
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const f = chip.dataset.f;
    if (activeFilters.has(f)) activeFilters.delete(f);
    else activeFilters.add(f);
    chip.classList.toggle('on', activeFilters.has(f));
  });
});

// ── Render All ──
function renderAll() {
  updateStats();
  renderRecent();
  renderGrid();
  renderQueue();
}

function updateStats() {
  const extracomm = products.filter(p => p.commission?.is_extracomm).length;
  document.getElementById('hs-total').textContent     = products.length;
  document.getElementById('hs-extracomm').textContent = extracomm;
  document.getElementById('hs-done').textContent      = statDone;
  document.getElementById('hs-queue').textContent     = queue.length;
  document.getElementById('nb-products').textContent  = products.length;
  document.getElementById('nb-queue').textContent     = queue.length;
  document.getElementById('tb-products').textContent  = products.length;
  document.getElementById('tb-done').textContent      = statDone;
  document.getElementById('sel-total').textContent    = products.length;
  document.getElementById('ps-total').textContent     = products.length;
  document.getElementById('ps-pend').textContent      = Math.max(0, products.length - statDone - statErr);
  document.getElementById('ps-done').textContent      = statDone;
  document.getElementById('ps-err').textContent       = statErr;
}

// ── Recent ──
function renderRecent() {
  const el = document.getElementById('recent-list');
  const recent = products.slice(-5).reverse();
  if (!recent.length) {
    el.innerHTML = '<div style="text-align:center;padding:30px 0;color:var(--muted);font-size:12px;">ยังไม่มีสินค้า</div>';
    return;
  }
  el.innerHTML = recent.map(p => {
    const img = p.images_b64?.[0] || p.images?.[0] || '';
    const q = queue.find(q => q.product_id === p.product_id);
    const status = q?.status || 'pending';
    const statusMap = { pending:'รอสร้าง', processing:'กำลังสร้าง', done:'สำเร็จ' };
    return `<div class="recent-item">
      ${img ? `<img class="recent-thumb" src="${img}" referrerpolicy="no-referrer" onerror="this.src='';this.style='width:44px;height:44px;border-radius:8px;background:var(--bg3);'" />`
            : `<div style="width:44px;height:44px;border-radius:8px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:18px;">📷</div>`}
      <div class="recent-info">
        <div class="recent-name">${p.basic_info?.name || 'ไม่มีชื่อ'}</div>
        <div class="recent-meta">฿${p.basic_info?.price || '-'} · ${p.commission?.rate || '?'}% คอม</div>
      </div>
      <div class="recent-status rs-${status}">${statusMap[status] || status}</div>
    </div>`;
  }).join('');
}

// ── Product Grid ──
function renderGrid() {
  const grid = document.getElementById('prod-grid');
  document.getElementById('sel-total').textContent = products.length;

  if (!products.length) {
    grid.innerHTML = `<div class="empty">
      <div class="empty-icon">🔍</div>
      <div class="empty-text">ค้นหา keyword หรือกด "ดึงจากหน้า Affiliate"<br>เพื่อดึงสินค้า ExtraComm</div>
    </div>`;
    return;
  }

  grid.innerHTML = products.map((p, i) => {
    const name  = p.basic_info?.name || 'ไม่มีชื่อ';
    const price = p.basic_info?.price ? `฿${Number(p.basic_info.price).toLocaleString()}` : '-';
    const comm  = p.commission?.rate  ? `${p.commission.rate}%` : '';
    const sold  = p.basic_info?.sold_count || '';
    const b64   = p.images_b64?.[0] || '';
    const imgUrl = p.images?.[0] || '';

    const imgEl = b64
      ? `<img class="pcard-img" src="${b64}" />`
      : imgUrl
        ? `<img class="pcard-img" data-img="${imgUrl}" src="" />`
        : `<div class="pcard-ph">📷</div>`;

    return `<div class="pcard" data-i="${i}">
      <input type="checkbox" class="pcard-check" data-i="${i}" />
      ${p.commission?.is_extracomm ? '<div class="pcard-extracomm">EXTRACOMM</div>' : ''}
      <div class="pcard-img-wrap">${imgEl}</div>
      <div class="pcard-body">
        <div class="pcard-name">${name}</div>
        <div class="pcard-price-row">
          <div class="pcard-price">${price}</div>
          ${comm ? `<div class="pcard-comm">${comm}</div>` : ''}
        </div>
        ${sold ? `<div class="pcard-sold">ขาย ${sold}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  loadImages();
  bindCards();
}

function loadImages() {
  document.querySelectorAll('img[data-img]').forEach(img => {
    const url = img.dataset.img;
    if (!url) return;
    img.src = url;
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => {
      chrome.runtime.sendMessage({ action: 'fetch_image', url }, res => {
        if (res?.dataUrl) img.src = res.dataUrl;
        else img.closest('.pcard-img-wrap').innerHTML = '<div class="pcard-ph">📷</div>';
      });
    };
  });
}

function bindCards() {
  document.querySelectorAll('.pcard').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.classList.contains('pcard-check')) return;
      const cb = card.querySelector('.pcard-check');
      cb.checked = !cb.checked;
      card.classList.toggle('selected', cb.checked);
      countSel();
    });
  });
  document.querySelectorAll('.pcard-check').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('.pcard').classList.toggle('selected', cb.checked);
      countSel();
    });
  });
}

function countSel() {
  const n = document.querySelectorAll('.pcard-check:checked').length;
  document.getElementById('sel-n').textContent = n;
}

document.getElementById('chk-all').addEventListener('change', e => {
  document.querySelectorAll('.pcard-check').forEach(cb => {
    cb.checked = e.target.checked;
    cb.closest('.pcard')?.classList.toggle('selected', e.target.checked);
  });
  countSel();
});

document.getElementById('btn-export').addEventListener('click', () => {
  if (!products.length) return;
  const blob = new Blob([JSON.stringify(products, null, 2)], { type: 'application/json' });
  chrome.downloads.download({ url: URL.createObjectURL(blob), filename: `extracomm_${Date.now()}.json` });
});

document.getElementById('btn-clr').addEventListener('click', () => {
  if (!confirm('ล้างสินค้าทั้งหมด?')) return;
  products = [];
  chrome.storage.local.set({ products });
  renderAll();
});

document.getElementById('btn-add-queue').addEventListener('click', () => {
  const sel = [...document.querySelectorAll('.pcard-check:checked')].map(cb => products[parseInt(cb.dataset.i)]);
  const toAdd = sel.length ? sel : products;
  const newItems = toAdd.map((p, i) => ({ ...p, queue_id: Date.now() + i, status: 'pending', queued_at: new Date().toISOString() }));
  queue = [...queue, ...newItems];
  chrome.storage.local.set({ queue });
  renderQueue();
  updateStats();
  goPage('queue');
});

// ── Settings ──
['random','sub','music','wm'].forEach(k => {
  const el = document.getElementById('tog-' + k);
  if (!el) return;
  el.classList.toggle('on', togState[k]);
  el.addEventListener('click', () => {
    togState[k] = !togState[k];
    el.classList.toggle('on', togState[k]);
  });
});

function applySettingsUI() {
  ['age','personality','style','bg','dur'].forEach(k => {
    const el = document.getElementById('cfg-' + k);
    if (el && settings[k]) el.value = settings[k];
  });
  if (settings.claude) document.getElementById('cfg-claude').value = settings.claude;
  if (settings.google) document.getElementById('cfg-google').value = settings.google;
  if (settings.port)   document.getElementById('cfg-port').value   = settings.port;
  ['random','sub','music','wm'].forEach(k => {
    if (settings['tog_'+k] !== undefined) {
      togState[k] = settings['tog_'+k];
      document.getElementById('tog-'+k)?.classList.toggle('on', togState[k]);
    }
  });
  if (settings.claude) document.getElementById('claude-status').textContent = '✅ ตั้งค่าแล้ว';
  if (settings.google) document.getElementById('google-status').textContent = '✅ ตั้งค่าแล้ว';
}

document.getElementById('btn-save').addEventListener('click', () => {
  settings = {
    age: document.getElementById('cfg-age').value,
    personality: document.getElementById('cfg-personality').value,
    style: document.getElementById('cfg-style').value,
    bg: document.getElementById('cfg-bg').value,
    dur: document.getElementById('cfg-dur').value,
    claude: document.getElementById('cfg-claude').value,
    google: document.getElementById('cfg-google').value,
    port: document.getElementById('cfg-port').value || '3001',
    tog_random: togState.random, tog_sub: togState.sub,
    tog_music: togState.music,   tog_wm: togState.wm,
  };
  chrome.storage.local.set({ settings });
  const btn = document.getElementById('btn-save');
  btn.textContent = 'บันทึกแล้ว ✓';
  if (settings.claude) document.getElementById('claude-status').textContent = '✅ ตั้งค่าแล้ว';
  if (settings.google) document.getElementById('google-status').textContent = '✅ ตั้งค่าแล้ว';
  setTimeout(() => btn.textContent = 'บันทึกการตั้งค่า ✓', 2000);
});

document.getElementById('btn-check').addEventListener('click', async () => {
  const port = settings.port || '3001';
  try {
    const res = await fetch(`http://localhost:${port}/api/status`);
    document.getElementById('app-status').textContent = res.ok ? '✅ เชื่อมต่อแล้ว' : '❌ ไม่ตอบสนอง';
  } catch {
    document.getElementById('app-status').textContent = '❌ ไม่พบโปรแกรม';
  }
});

// ── Pilot ──
function updatePilotSummary() {
  const s = settings;
  const m = {
    age: { random:'🎲 Random', genz:'Gen Z', millennial:'Millennial', genx:'Gen X', all:'ทุกกลุ่ม' },
    personality: { random:'🎲 Random', friendly:'เป็นกันเอง', pro:'มืออาชีพ', excited:'ตื่นเต้น', calm:'สงบ', trendy:'เท่' },
    style: { random:'🎲 Random', review:'รีวิวจริง', demo:'สาธิต', story:'เล่าเรื่อง', compare:'เปรียบเทียบ', flash:'Flash Sale' },
    bg: { random:'🎲 Random', white:'พื้นขาว', lifestyle:'Lifestyle', outdoor:'กลางแจ้ง', minimal:'Minimal', colorful:'สีสัน' },
  };
  document.getElementById('pilot-summary').innerHTML = `
    <b>กลุ่มอายุ:</b> ${m.age[s.age]||s.age||'—'}<br>
    <b>บุคลิก:</b> ${m.personality[s.personality]||s.personality||'—'}<br>
    <b>สไตล์:</b> ${m.style[s.style]||s.style||'—'}<br>
    <b>ฉากหลัง:</b> ${m.bg[s.bg]||s.bg||'—'}<br>
    <b>ความยาว:</b> ${s.dur||60} วินาที &nbsp;|&nbsp; <b>Random:</b> ${togState.random?'✅':'❌'}<br>
    <b>Subtitle:</b> ${togState.sub?'✅':'❌'} &nbsp;|&nbsp; <b>ดนตรี:</b> ${togState.music?'✅':'❌'}
  `;
  const sel = [...document.querySelectorAll('.pcard-check:checked')].length || products.length;
  document.getElementById('pilot-sel-info').textContent = sel
    ? `เลือก ${sel} สินค้า จาก ${products.length} รายการ`
    : 'จะใช้สินค้าทั้งหมด ' + products.length + ' รายการ';
}

function logPilot(msg, type='') {
  const box = document.getElementById('pilot-log');
  const t = new Date().toLocaleTimeString('th-TH');
  const line = document.createElement('div');
  line.className = type;
  line.textContent = `[${t}] ${msg}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

document.getElementById('btn-pilot').addEventListener('click', async () => {
  if (pilotRunning) {
    pilotRunning = false;
    document.getElementById('btn-pilot').textContent = '🚀 เริ่ม Auto Pilot';
    document.getElementById('btn-pilot').classList.remove('running');
    logPilot('⏹ หยุด Auto Pilot', 'w');
    return;
  }

  const selected = [...document.querySelectorAll('.pcard-check:checked')].map(cb => products[parseInt(cb.dataset.i)]);
  const toRun = selected.length ? selected : products;
  if (!toRun.length) { alert('ไม่มีสินค้า กรุณาดึงข้อมูลก่อน'); return; }

  const port = settings.port || '3001';
  pilotRunning = true;
  document.getElementById('btn-pilot').textContent = '⏹ หยุด';
  document.getElementById('btn-pilot').classList.add('running');
  logPilot(`▶ เริ่ม Auto Pilot — ${toRun.length} รายการ`, 'i');

  for (const p of toRun) {
    if (!pilotRunning) break;
    logPilot(`⚙ สร้าง: ${(p.basic_info?.name||'?').slice(0,40)}`, 'i');

    try {
      const res = await fetch(`http://localhost:${port}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: p, settings }),
        signal: AbortSignal.timeout(300000)
      });
      if (res.ok) { statDone++; logPilot(`✅ สำเร็จ: ${(p.basic_info?.name||'?').slice(0,40)}`); }
      else { statErr++; logPilot(`❌ Error ${res.status}`, 'e'); }
    } catch(e) {
      statErr++;
      logPilot(`❌ Desktop App ไม่ตอบสนอง`, 'e');
      if (e.name !== 'TimeoutError') break;
    }

    updateStats();
    chrome.storage.local.set({ statDone, statErr });
    if (pilotRunning) await new Promise(r => setTimeout(r, 1500));
  }

  pilotRunning = false;
  document.getElementById('btn-pilot').textContent = '🚀 เริ่ม Auto Pilot';
  document.getElementById('btn-pilot').classList.remove('running');
  logPilot('✅ Auto Pilot เสร็จสิ้น');
});

// ── Queue ──
function renderQueue() {
  const tbody = document.getElementById('queue-tbody');
  const empty = document.getElementById('queue-empty');

  if (!queue.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  const labels = { pending:'รอสร้าง', processing:'กำลังสร้าง...', done:'สำเร็จ', error:'ผิดพลาด' };
  tbody.innerHTML = queue.map(item => {
    const img = item.images_b64?.[0] || item.images?.[0] || '';
    const t = item.queued_at ? new Date(item.queued_at).toLocaleTimeString('th-TH') : '-';
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          ${img ? `<img class="q-thumb" src="${img}" referrerpolicy="no-referrer" onerror="this.style.display='none'" />` : `<div class="q-thumb" style="display:flex;align-items:center;justify-content:center;font-size:18px;">📷</div>`}
          <div>
            <div class="q-name">${item.basic_info?.name||'ไม่มีชื่อ'}</div>
          </div>
        </div>
      </td>
      <td style="color:var(--accent);font-weight:700;">฿${item.basic_info?.price||'-'}</td>
      <td style="color:var(--gold);">${item.commission?.rate||'?'}%</td>
      <td><span class="qbadge ${item.status}">${labels[item.status]||item.status}</span></td>
      <td style="color:var(--muted);font-size:11px;">${t}</td>
    </tr>`;
  }).join('');
}

document.getElementById('btn-clr-q').addEventListener('click', () => {
  queue = []; statDone = 0; statErr = 0;
  chrome.storage.local.set({ queue, statDone, statErr });
  renderQueue(); updateStats();
});

document.getElementById('btn-exp-q').addEventListener('click', () => {
  if (!queue.length) return;
  const blob = new Blob([JSON.stringify(queue, null, 2)], { type: 'application/json' });
  chrome.downloads.download({ url: URL.createObjectURL(blob), filename: `queue_${Date.now()}.json` });
});
