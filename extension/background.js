// คลิกไอคอน extension → เปิด Side Panel ติดขวา (ศูนย์ควบคุม)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// เปิด/โฟกัสแท็บ Flow ให้อัตโนมัติ แล้วรันคิว Flow บนแท็บนั้น
async function openFlowAndRun(dry = false) {
  // เปิดหน้า project ที่เคยมีช่องแชต (flow.js จำไว้) ไม่ใช่หน้า home ที่ไม่มีแชต
  const saved = await chrome.storage.local.get('flow_project_url');
  const FLOW_URL = saved.flow_project_url || 'https://labs.google/fx/th/tools/flow';
  // หาแท็บ Flow ที่เปิดอยู่ — เลือกหน้า project ก่อน
  const tabs = await chrome.tabs.query({ url: 'https://labs.google/fx/*' });
  let tab = tabs.find((t) => /\/project\//.test(t.url || '')) || tabs[0];
  if (!tab) {
    // ★ ต้องเปิดแบบ active:true — แท็บที่อยู่เบื้องหลัง SPA จะไม่เรนเดอร์เต็ม
    //   ทำให้ element มี offsetParent=null → flow.js หาช่องพิมพ์ไม่เจอ
    tab = await chrome.tabs.create({ url: FLOW_URL, active: true });
    // รอหน้าโหลด + content script พร้อม
    await new Promise((resolve) => {
      const onUpd = (id, info) => {
        if (id === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpd); setTimeout(resolve, 2500);
        }
      };
      chrome.tabs.onUpdated.addListener(onUpd);
      setTimeout(resolve, 15000); // กันค้าง
    });
  }
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // รับสินค้าจาก floating scraper panel (content script) — เก็บ storage + แจ้ง Side Panel
  if (msg.action === 'add_products') {
    chrome.storage.local.get('products', (d) => {
      const existing = d.products || [];
      const seen = new Set(existing.map(p => p.product_id || p.basic_info?.name));
      const fresh = (msg.products || []).filter(p => !seen.has(p.product_id || p.basic_info?.name));
      const merged = [...existing, ...fresh];
      chrome.storage.local.set({ products: merged }, () => {
        try { chrome.runtime.sendMessage({ action: 'products_updated', added: fresh.length, total: merged.length }); } catch {}
        sendResponse({ ok: true, added: fresh.length, total: merged.length });
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
            sendResponse(res);
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
  if (msg.action === 'flow_trusted_click' || msg.action === 'flow_trusted_key' || msg.action === 'flow_trusted_type') {
    const tabId = sender.tab && sender.tab.id;
    if (!tabId) { sendResponse({ ok: false, error: 'no tab' }); return true; }
    (async () => {
      try {
        await attachDebugger(tabId);
        if (msg.action === 'flow_trusted_click') {
          await trustedClick(tabId, msg.x, msg.y);
        } else if (msg.action === 'flow_trusted_type') {
          await trustedType(tabId, msg.text, !!msg.clear, !!msg.mac);
        } else {
          await trustedEnter(tabId, !!msg.ctrl);
        }
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
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
      if (tries >= MAX_TRIES) return done({ ok: false, error: `download ล้มเหลวหลังลอง ${tries} ครั้ง (${why}) — เน็ตอาจหลุดนานเกินไป` });
      const wait = 4000 * tries;            // 4s, 8s, 12s, …
      console.log(`[flow_download] ${why} → retry #${tries + 1} ใน ${wait}ms`);
      setTimeout(attempt, wait);
    };

    const watch = (id, onInterrupt) => {
      const onChange = (delta) => {
        if (delta.id !== id) return;
        if (delta.state && delta.state.current === 'complete') {
          chrome.downloads.onChanged.removeListener(onChange);
          done({ ok: true, downloadId: id, filename });
        } else if (delta.state && delta.state.current === 'interrupted') {
          chrome.downloads.onChanged.removeListener(onChange);
          onInterrupt(id);
        }
      };
      chrome.downloads.onChanged.addListener(onChange);
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

  // ── คุยกับ desktop (FastAPI :3001) — เลี่ยง mixed-content ผ่าน service worker ──
  if (msg.action === 'flow_desktop') {
    const base = 'http://localhost:3001';
    const opt = { method: msg.method || 'GET' };
    if (msg.body) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(msg.body); }
    fetch(base + msg.path, opt)
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(e => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  // จาก Side Panel: ส่งสินค้าเข้าคิว Flow ที่ desktop → เปิดแท็บ Flow → รันสร้างคลิป
  if (msg.action === 'flow_start') {
    (async () => {
      const port = msg.port || '3001';
      if (msg.products && msg.products.length) {
        try {
          await fetch(`http://localhost:${port}/api/flow/enqueue`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ products: msg.products }),
          });
        } catch (e) { sendResponse({ ok: false, error: 'desktop ไม่ตอบ (เปิดโปรแกรมก่อน)' }); return; }
      }
      const r = await openFlowAndRun(!!msg.dry);
      sendResponse(r);
    })();
    return true;
  }

  if (msg.action === 'flow_detach') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId) chrome.debugger.detach({ tabId }).catch(() => {});
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
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resolve(res);
    });
  });
}
async function trustedClick(tabId, x, y) {
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
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
