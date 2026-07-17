// ── Google Flow automation content script ──────────────────────────────
// Drives labs.google/fx Flow to generate a video from a product prompt + image.
//
// Flow = React SPA + Lexical editor (role=textbox) + agent chat. We locate
// elements by ROLE/TEXT (resilient to class changes).
//
// IMPORTANT: do NOT type/submit via execCommand — it desyncs Lexical's
// editorState from the DOM and crashes the page on submit. Instead we drive
// TRUSTED input (mouse/keyboard/insertText) through chrome.debugger in
// background.js, which Flow's `isTrusted` guard accepts. See SAUtil.sendTrusted.
//
// Be gentle: human-like delays, one job at a time. Automating Google's UI is
// against ToS — keep volume low.

if (window._flowAutomatorLoaded) {
  // already injected
} else {
  window._flowAutomatorLoaded = true;

  const { sleep, rand, human, sendTrusted } = window.SAUtil; // จาก content/util.js

  const norm = (s) => (s || "").trim().toLowerCase();
  const txt = (el) =>
    norm(el?.innerText || el?.textContent || el?.getAttribute?.("aria-label") || el?.placeholder);
  const boxText = (el) => (el?.value ?? el?.innerText ?? el?.textContent ?? "").trim();
  const match = (a, b) =>
    a.replace(/\s+/g, " ").includes(b.slice(0, 15).replace(/\s+/g, " "));

  // context ยังไม่ตายไหม — พอ extension ถูกรีโหลด chrome.runtime.id จะกลายเป็น undefined
  // (content script ตัวเก่ายังวิ่ง poll ค้างชั่วครู่ ถ้ายิง chrome.* ใส่ context ที่ตาย = เด้ง "Extension context invalidated")
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch { return false; } };
  // ตั้ง loop ที่หยุดตัวเองเมื่อ context ตาย (กัน error สะสมตอนรีโหลด ext แล้วหน้ายังเปิดค้าง)
  const loop = (fn, ms) => {
    const id = setInterval(() => {
      if (!alive()) { clearInterval(id); return; }
      try { Promise.resolve(fn()).catch(() => {}); } catch {}
    }, ms);
    return id;
  };
  const delay = (fn, ms) => setTimeout(() => { if (alive()) { try { Promise.resolve(fn()).catch(() => {}); } catch {} } }, ms);

  // ── กลืน error "Extension context invalidated" ทิ้งก่อน Chrome จะ log ──
  // เกิดเฉพาะวินาทีที่รีโหลด extension ขณะแท็บเปิดค้าง (script เก่ากำลังตาย ยิง chrome.* ไม่ทัน)
  // ดักเฉพาะ error ตัวนี้เท่านั้น — error จริงอื่นยังเด้งตามปกติ
  const isCtxDead = (m) => /extension context invalidated|context invalidated|message port closed|receiving end does not exist/i.test(String(m || ""));
  window.addEventListener("unhandledrejection", (e) => {
    if (isCtxDead(e && e.reason && (e.reason.message || e.reason))) e.preventDefault();
  });
  window.addEventListener("error", (e) => {
    if (isCtxDead(e && (e.message || (e.error && e.error.message)))) { e.preventDefault(); return true; }
  });

  // ── Flow adapter: ชั้น override selector/behavior (additive, behavior-preserving) ──────────
  // getSelector(key, fallback): มี override ใน adapter → ใช้ override, ไม่มี → คืน fallback (ค่า hardcode เดิมเป๊ะ).
  // adapter default = selectors ว่าง → getSelector คืน fallback เสมอ = พฤติกรรมเหมือนเดิม 100%.
  // แหล่ง adapter (เรียงจากทับทีหลัง = ชนะ): hardcode → bundled flow-adapter.json → cache storage → desktop /api/flow/adapter.
  const _adapterDefault = { version: "flow-hardcoded", selectors: {}, timings: {}, output_verify: {} };
  let _adapter = _adapterDefault;
  function _mergeAdapter(base, extra) {
    if (!extra || typeof extra !== "object") return base;
    return {
      version: extra.version || base.version,
      selectors:     { ...(base.selectors || {}),     ...(extra.selectors || {}) },
      timings:       { ...(base.timings || {}),       ...(extra.timings || {}) },
      output_verify: { ...(base.output_verify || {}), ...(extra.output_verify || {}) },
    };
  }
  // key มี override ที่เป็น string ไม่ว่าง → ใช้; ไม่งั้น fallback (ค่าเดิม)
  function getSelector(key, fallback) {
    const v = _adapter && _adapter.selectors && _adapter.selectors[key];
    return (typeof v === "string" && v.trim()) ? v : fallback;
  }
  async function loadAdapter() {
    let a = _adapterDefault;
    // 1) bundled default ที่ shipped มากับ extension (web_accessible_resources)
    try {
      const j = await fetch(chrome.runtime.getURL("flow-adapter.json")).then((r) => r.json()).catch(() => null);
      if (j && typeof j === "object") a = _mergeAdapter(a, j);
    } catch {}
    // 2) cache ล่าสุด (instant — ใช้ระหว่างรอ desktop ตอบ)
    try {
      const c = await chrome.storage.local.get("flow_adapter_cache");
      if (c.flow_adapter_cache && typeof c.flow_adapter_cache === "object") a = _mergeAdapter(a, c.flow_adapter_cache);
    } catch {}
    _adapter = a;
    // 3) desktop = แหล่งจริง (อาจ remote-updated) → ทับแล้ว cache ไว้ (desktop ปิด/เก่า = คงค่าเดิม ไม่พัง)
    try {
      const r = await desktop("GET", "/api/flow/adapter");
      if (r && r.ok && r.adapter && typeof r.adapter === "object") {
        _adapter = _mergeAdapter(a, r.adapter);
        try { await chrome.storage.local.set({ flow_adapter_cache: r.adapter }); } catch {}
      }
    } catch {}
  }

  // ── output verification (defensive) — ไฟล์ที่โหลดมาต้องเป็น "วิดีโอจริง" ก่อน handoff ไป desktop ──
  // ไม่ auto-retry (กันเสียเครดิตซ้ำ) — ถ้าไม่ใช่วิดีโอ แค่คืน {ok:false} ให้ caller หยุด + แจ้ง error.
  // results = รายการ response จาก flow_download ({mime, fileSize}). ค่าเกณฑ์ override ได้ผ่าน adapter.output_verify.
  function verifyOutputs(results) {
    const ov = (_adapter && _adapter.output_verify) || {};
    const minBytes = Number.isFinite(ov.min_bytes) ? ov.min_bytes : 51200;   // < ~50KB = ไฟล์ว่าง/พัง
    const rejectImage = ov.reject_image_mime !== false;                      // default = true (กันได้ภาพนิ่ง)
    const requireVideo = ov.require_video_mime === true;                     // default = false (คงพฤติกรรมเดิม)
    for (const r of (results || [])) {
      const mime = String((r && r.mime) || "").toLowerCase();
      const size = Number((r && (r.fileSize != null ? r.fileSize : r.totalBytes)) || 0);
      const isVideo = mime.startsWith("video/");
      if (rejectImage && mime.startsWith("image/")) return { ok: false, reason: `mime=${mime}` };
      if (size > 0 && size < minBytes) return { ok: false, reason: `size=${size}B` };
      if (requireVideo && mime && !isVideo) return { ok: false, reason: `mime=${mime || "unknown"}` };
    }
    return { ok: true };
  }

  // Lexical รับข้อความจริง = (1) ข้อความอยู่ใน DOM และ (2) placeholder หายแล้ว
  // (ถ้า placeholder ยังโชว์ แปลว่า editorState ยังว่าง → ส่งจะ empty)
  function placeholderVisible() {
    return [...document.querySelectorAll(getSelector("placeholder", '[class*="laceholder"],[data-placeholder]'))]
      .some((p) => isVisible(p) && /คุณต้องการสร้างอะไร/.test(p.textContent || p.getAttribute("data-placeholder") || ""));
  }
  function lexicalAccepted(el, text) {
    return match(boxText(el), text) && !placeholderVisible();
  }

  // ── finders ──────────────────────────────────────────────────────────
  // มองเห็นจริงไหม — ใช้ getBoundingClientRect แทน offsetParent
  // (offsetParent = null สำหรับ element ใน position:fixed เช่นแถบแชตล่างจอ → กรองผิด)
  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
  }
  function allClickable() {
    return [...document.querySelectorAll(getSelector("clickable", 'button,[role="button"],a,[tabindex]'))]
      .filter(isVisible);
  }
  function findByText(words, scope = allClickable()) {
    const w = words.map(norm);
    return scope.find((el) => {
      const t = txt(el);
      return t && w.some((x) => t.includes(x));
    }) || null;
  }
  function editableCands() {
    return [
      ...document.querySelectorAll(getSelector("textbox", '[role="textbox"]')),
      ...document.querySelectorAll(getSelector("contenteditable", '[contenteditable="true"]')),
      ...document.querySelectorAll("textarea"),
      ...document.querySelectorAll('input[type="text"]'),
    ].filter((el) => isVisible(el) && el.id !== "__flow_panel" && el.closest("#__flow_panel") === null);
  }
  function findEditable() {
    const cands = editableCands();
    // 1) ช่องที่บอกใบ้ว่าเป็น agent prompt
    const hint = cands.find((el) =>
      /สร้างอะไร|ต้องการสร้าง|พิมพ์ไอเดีย|ask|prompt|message/i.test(
        (el.getAttribute("placeholder") || "") + (el.getAttribute("aria-label") || "") + (el.textContent || "")
      )
    );
    if (hint) return hint;
    // 2) ช่องที่อยู่ "ล่างสุด" ของจอ (chat input อยู่ล่าง) — กันไปโดน field กลางหน้า
    const sorted = cands.slice().sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
    return sorted[0] || null;
  }
  function findFileInput() {
    return [...document.querySelectorAll(getSelector("fileInput", 'input[type="file"]'))][0] || null;
  }
  async function waitFor(fn, timeout = 20000, step = 500) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const r = fn();
      if (r) return r;
      await sleep(step);
    }
    return null;
  }

  // ── React/Lexical-safe typing ────────────────────────────────────────
  function setNativeValue(el, value) {
    const proto =
      el.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter ? setter.call(el, value) : (el.value = value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function realEditable(el) {
    if (el.isContentEditable) return el;
    const inner = el.querySelector('[contenteditable="true"],[contenteditable=""]');
    return inner || el;
  }
  function selectAll(el) {
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function focusByClick(el) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2,
      y = r.top + r.height / 2;
    for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, view: window }));
    }
    el.focus();
  }
  // คลิกแบบ pointer จริง (React บางตัวไม่รับ .click() เปล่าๆ)
  function clickReal(el) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const opt = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", opt));
    el.dispatchEvent(new MouseEvent("mousedown", opt));
    el.dispatchEvent(new PointerEvent("pointerup", opt));
    el.dispatchEvent(new MouseEvent("mouseup", opt));
    el.dispatchEvent(new MouseEvent("click", opt));
  }
  function pressEnter(el) {
    el.focus();
    const opt = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true, isComposing: false };
    el.dispatchEvent(new KeyboardEvent("keydown", opt));
    el.dispatchEvent(new KeyboardEvent("keypress", opt));
    el.dispatchEvent(new KeyboardEvent("keyup", opt));
  }
  function caretToEnd(el) {
    el.focus();
    try {
      const sel = window.getSelection();
      sel.selectAllChildren(el);
      sel.collapseToEnd();
    } catch {}
  }
  // ── trusted input ผ่าน background (chrome.debugger) ──
  // sendTrusted มาจาก SAUtil (content/util.js) — bridge ดิบไป background
  async function trustedClickEl(el, log) {
    // ซ่อน panel ชั่วขณะ — กันคลิกจริงโดน panel ที่ลอยทับช่อง/ปุ่มของ Flow
    const panel = document.getElementById("__flow_panel");
    const prev = panel ? panel.style.display : null;
    if (panel) panel.style.display = "none";
    await sleep(40);
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const res = await sendTrusted({ action: "flow_trusted_click", x, y });
    if (panel) panel.style.display = prev || "";
    if (log && !res.ok) log(`คลิกจริงล้มเหลว: ${res.error}`);
    return res;
  }
  // ขยับเมาส์จริงไปวางค้างกลาง element (ผ่าน chrome.debugger) → trigger CSS :hover
  // ใช้กับปุ่มที่ซ่อนจนกว่าจะ hover (เช่น ⋮ บน tile รูปใน library) — synthetic mouseover ไม่ทำให้ :hover ติด
  async function trustedHoverEl(el, atTop = false) {
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(atTop ? r.top + Math.min(20, r.height / 4) : r.top + r.height / 2);
    return sendTrusted({ action: "flow_trusted_hover", x, y });
  }
  function clearBox(el) {
    const sel = window.getSelection();
    sel.selectAllChildren(el);
    document.execCommand("delete");
  }
  async function typeInto(elRaw, text) {
    if (!(elRaw.isContentEditable || elRaw.getAttribute("role") === "textbox")) {
      elRaw.focus();
      setNativeValue(elRaw, text);
      await human();
      return { ok: match(boxText(elRaw), text), got: boxText(elRaw), how: "native" };
    }
    const el = realEditable(elRaw);

    // strategy 1: PASTE — Lexical จัดการ insertFromPaste แล้วอัปเดต editorState จริง
    //   (execCommand ใส่ลง DOM ได้แต่ Lexical state ไม่ขยับ → ส่ง empty)
    focusByClick(el); await sleep(250); clearBox(el); await sleep(120);
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      await sleep(550);
      if (lexicalAccepted(el, text)) return { ok: true, got: boxText(el), how: "paste" };
    } catch {}

    // strategy 2: beforeinput insertFromPaste (Lexical handler, ไม่มี clipboard)
    focusByClick(el); clearBox(el); await sleep(100);
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      el.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertFromPaste", dataTransfer: dt, bubbles: true, cancelable: true }));
      await sleep(450);
      if (lexicalAccepted(el, text)) return { ok: true, got: boxText(el), how: "beforeinput-paste" };
    } catch {}

    // strategy 3: execCommand insertText (เผื่อ editor ธรรมดาที่ไม่ใช่ Lexical)
    focusByClick(el); clearBox(el);
    document.execCommand("insertText", false, text);
    await sleep(450);
    if (match(boxText(el), text)) return { ok: true, got: boxText(el), how: "execCommand" };

    return { ok: false, got: boxText(el), how: "failed" };
  }

  // ── image upload ─────────────────────────────────────────────────────
  // เพิ่ม "รูปล่าสุดที่อัป" เข้าไปยัง prompt — กดเมนู ⋮ บน tile รูป แล้วเลือก "เพิ่มไปยังพรอมต์"
  // (อัปเฉยๆ รูปจะลอยอยู่ใน library ไม่ผูกกับ prompt → ต้องกดเพิ่มเองรูปถึงเป็นภาพอ้างอิงตอน generate)
  //   ⋮ ซ่อนจน hover → ใช้ trustedHoverEl (เมาส์จริง) ให้มันโผล่ ก่อนคลิก
  // รูปจริงใน library (ตัดไอคอน/avatar เล็กออก) — ใช้นับก่อน/หลังอัป
  const tileImgs = () => [...document.querySelectorAll("img,video")]
    .filter((im) => { const r = im.getBoundingClientRect(); return isVisible(im) && r.width >= 64 && r.height >= 64; });

  async function addImageToPrompt(log, beforeSet) {
    const L = (m) => { try { log && log(m); } catch {} };
    const normT = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
    // 1) รอ "รูปใหม่ที่เพิ่งโผล่" จริง — หา img ที่ไม่อยู่ในชุดก่อนอัป (กันนับรูปขยะในหน้า/คว้าตัวเก่าผิด)
    //    รูป hi-res อัปช้าได้ → รอสูงสุด 20 วิ
    const fresh = () => tileImgs().filter((im) => !beforeSet.has(im));
    const newOnes = await waitFor(() => { const f = fresh(); return f.length ? f : null; }, 20000, 600);
    if (!newOnes) { L("เพิ่มเข้าพรอมต์: รูปใหม่ยังไม่ขึ้น library (รอเกินเวลา)"); return false; }
    const lastImg = newOnes[newOnes.length - 1];
    const tile = lastImg.closest('[role="button"],figure,li,article') || lastImg.closest("div") || lastImg;

    // 2) hover จริงให้ปุ่ม ⋮ โผล่ แล้วหาปุ่มเมนู (มักอยู่มุมขวาบนของ tile)
    const isMenuBtn = (b) => {
      const s = ((b.getAttribute("aria-label") || "") + " " + (b.innerText || "") + " " + (b.getAttribute("title") || "")).toLowerCase();
      return /more_vert|more options|ตัวเลือกเพิ่มเติม|ตัวเลือก|เพิ่มเติม|\bmore\b/.test(s);
    };
    const findMenuBtn = () => {
      const within = [...tile.querySelectorAll('button,[role="button"]')]
        .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
        .filter(isMenuBtn);
      if (within.length) return within[within.length - 1];
      const tr = tile.getBoundingClientRect();
      return [...document.querySelectorAll('button,[role="button"]')]
        .filter(isMenuBtn)
        // ⋮ ต้องอยู่ "บน tile นี้" (center ในกรอบ tile เผื่อขอบ 20px) — กันคว้า ⋮ ของรูปอื่น แต่ไม่เข้มจนพลาด
        // แล้ว sort เอาตัวที่ใกล้มุมขวาบนของ tile สุด (ถ้าเผลอติดเพื่อนบ้าน ตัวที่ถูกก็ยังชนะ)
        .filter((b) => { const r = b.getBoundingClientRect(); if (r.width < 1) return false; const cx = r.left + r.width / 2, cy = r.top + r.height / 2; return cx >= tr.left - 20 && cx <= tr.right + 20 && cy >= tr.top - 20 && cy <= tr.bottom + 20; })
        .sort((a, b) => {
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          return Math.hypot(ra.left - tr.right, ra.top - tr.top) - Math.hypot(rb.left - tr.right, rb.top - tr.top);
        })[0] || null;
    };
    let menuBtn = null;
    for (let i = 0; i < 6 && !menuBtn; i++) {   // อดทนขึ้น (6 รอบ) เผื่อเครื่อง/เน็ตช้า ⋮ โผล่ช้า
      await trustedHoverEl(tile, true);   // วางเมาส์ค้างมุมบนของ tile → CSS :hover ติด ปุ่ม ⋮ โผล่
      await sleep(650);
      menuBtn = findMenuBtn();
    }
    if (!menuBtn) { L("เพิ่มเข้าพรอมต์: hover แล้วยังไม่เจอปุ่มเมนู (⋮) บนรูป"); return false; }

    // 3) เปิดเมนู → คลิก "เพิ่มไปยังพรอมต์" (retry 3 รอบ กันเมนูเปิดไม่ทัน/คว้าผิด · ถ้ารูปอยู่ในพรอมต์แล้วก็ผ่าน)
    const want = ["เพิ่มไปยังพรอมต์", "add to prompt"].map(normT);
    const already = ["ลบออกจากพรอมต์", "remove from prompt"].map(normT);
    const findItem = (words) => [...document.querySelectorAll('[role="menuitem"],button,[role="button"],li,a,span,div')]
      .filter(isVisible)
      .filter((el) => { const t = normT(el.innerText); return t && words.some((w) => t.includes(w)); })
      .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)[0] || null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await trustedClickEl(menuBtn, log);
      await sleep(700);
      const item = findItem(want);
      if (item) { await trustedClickEl(item, log); await sleep(650); L("เพิ่มรูปเข้าพรอมต์แล้ว ✓"); return true; }
      if (findItem(already)) { try { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch {} L("รูปอยู่ในพรอมต์อยู่แล้ว ✓"); return true; }
      try { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch {}   // เมนูผิด/ยังไม่เปิด → ปิดแล้วลองใหม่
      await sleep(300);
      await trustedHoverEl(tile, true); await sleep(450);
      menuBtn = findMenuBtn() || menuBtn;
    }
    L("เพิ่มเข้าพรอมต์: ลอง 3 รอบแล้วยังไม่เจอ 'เพิ่มไปยังพรอมต์'");
    return false;
  }

  async function uploadImage(dataUrl, log, opts = {}) {
    let input = findFileInput();
    if (!input) {
      const addBtn = findByText(["เพิ่มสื่อ", "add media", "เพิ่มรูป", "upload"]);
      if (addBtn) { addBtn.click(); await human(); }
      input = (await waitFor(findFileInput, 5000)) || findFileInput();
    }
    if (!input) return { ok: false, error: 'ไม่พบ file input — กด "เพิ่มสื่อ" เองก่อน' };
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], "product.jpg", { type: blob.type || "image/jpeg" });
    const dt = new DataTransfer();
    dt.items.add(file);
    const before = new Set(tileImgs());   // จำ element รูปเดิมไว้ → หา "รูปใหม่" ที่เพิ่งโผล่ (กันคว้าผิดตัว)
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(rand(1500, 2500));
    // โหมดรูปภาพ (nano banana): อัปไฟล์แล้วมันแนบเป็น reference เอง → ข้ามเมนู ⋮ (ไม่งั้นกดมั่ว/พัง)
    if (opts.addToPrompt === false) { try { log && log("แนบ reference (auto) ✓"); } catch {} return { ok: true, addedToPrompt: "auto" }; }
    // โหมด video (ingredient): อัปขึ้น library แล้ว → กดเพิ่มเข้า prompt ให้เป็นภาพอ้างอิงจริง
    const added = await addImageToPrompt(log, before);
    return { ok: true, addedToPrompt: added };
  }

  // ── probe (rich snapshot) ────────────────────────────────────────────
  function probe() {
    const vis = (el) => {
      if (!isVisible(el)) return false;
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    };
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    };
    const clip = (s, n = 50) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
    const label = (el) =>
      clip(el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.innerText || el.textContent || el.value);
    const interactive = [
      ...document.querySelectorAll(
        'button,[role="button"],a,[role="textbox"],textarea,input,[contenteditable="true"],[role="menuitem"],[role="tab"]'
      ),
    ]
      .filter(vis)
      .map((el) => ({
        t: el.tagName.toLowerCase(),
        role: el.getAttribute("role") || "",
        type: el.getAttribute("type") || "",
        txt: label(el),
        pos: rect(el),
        ce: el.isContentEditable || undefined,
      }))
      .filter((o) => o.txt || o.type === "file" || o.ce);
    const texts = [...document.querySelectorAll("h1,h2,h3,h4,p,span,div,label")]
      .filter((el) => vis(el) && el.children.length === 0)
      .map((el) => clip(el.innerText, 60))
      .filter((t) => t.length > 1);
    return {
      url: location.href,
      title: document.title,
      viewport: [innerWidth, innerHeight],
      interactive: interactive.slice(0, 80),
      texts: [...new Set(texts)].slice(0, 60),
      counts: {
        fileInputs: document.querySelectorAll('input[type="file"]').length,
        videos: document.querySelectorAll("video").length,
        images: document.querySelectorAll("img").length,
      },
      // มุมขวาบน (x>70% , y<120) — รวมทุก element เผื่อ avatar เป็น img/div ที่ไม่ใช่ปุ่ม
      topRight: [...document.querySelectorAll("img,svg,button,a,div,span,[role]")]
        .filter((el) => {
          if (!isVisible(el)) return false;
          const r = el.getBoundingClientRect();
          return r.top < 120 && r.right > innerWidth * 0.78 && r.width >= 12 && r.width <= 90 && r.height >= 12 && r.height <= 90;
        })
        .map((el) => ({
          t: el.tagName.toLowerCase(),
          cls: clip(el.getAttribute("class") || "", 30),
          alt: clip(el.getAttribute("alt") || el.getAttribute("aria-label") || el.getAttribute("title") || "", 40),
          src: clip(el.getAttribute("src") || "", 50),
          pos: rect(el),
        }))
        .slice(0, 25),
      // ตรวจ iframe — ถ้า UI ของ tool อยู่ใน iframe (โดยเฉพาะ cross-origin) เราจะ automate ข้างในไม่ได้
      iframes: [...document.querySelectorAll("iframe")].map((f) => {
        const r = f.getBoundingClientRect();
        let crossOrigin;
        try { crossOrigin = !f.contentDocument; } catch { crossOrigin = true; }
        return { src: (f.src || "(no src)").slice(0, 80), w: Math.round(r.width), h: Math.round(r.height), crossOrigin };
      }),
    };
  }

  // จำหน้าโปรเจ็กต์ "แยกตามอีเมล" — กันสลับบัญชีแล้วเปิดโปรเจกต์ของบัญชีอื่น (authuser ใช้ไม่ได้แล้ว)
  let _projNavAt = 0; // กันเด้งหน้าโปรเจ็กต์ที่จำไว้ซ้ำรัวๆ (กัน reload loop ถ้า URL เก่าใช้ไม่ได้)
  let _errReloadAt = 0; // กันรีโหลดหน้า error วนรัวๆ
  async function rememberProjectForEmail() {
    try {
      const em = await currentActiveEmail();
      if (!em) return;
      const d = await chrome.storage.local.get("flow_project_url_by_email");
      const m = (d.flow_project_url_by_email && typeof d.flow_project_url_by_email === "object") ? d.flow_project_url_by_email : {};
      m[em] = location.href;
      await chrome.storage.local.set({ flow_project_url_by_email: m });
    } catch {}
  }
  async function savedProjectForEmail() {
    try {
      const em = await currentActiveEmail();
      if (!em) return null;
      const d = await chrome.storage.local.get("flow_project_url_by_email");
      const m = d.flow_project_url_by_email || {};
      return { email: em, url: m[em] || null };
    } catch { return { email: null, url: null }; }
  }

  // ถ้าอยู่หน้า scene editor (ปลายทาง) → กด ← ย้อนกลับมาหน้าแชต agent ก่อน
  // เจอช่องแชต agent จริงไหม (placeholder "คุณต้องการสร้างอะไร")
  function hasChatBox() {
    return editableCands().some((el) =>
      /สร้างอะไร|ต้องการสร้าง/.test(
        (el.getAttribute("placeholder") || "") + (el.getAttribute("aria-label") || "") + (el.textContent || "")
      )
    );
  }
  // หน้า Flow ขึ้น error ("เกิดข้อผิดพลาด"/"something went wrong") — มักหน้าสั้น ไม่มีช่องแชต
  function isFlowErrorPage() {
    if (hasChatBox()) return false;
    const t = document.body ? (document.body.innerText || "") : "";
    return t.length < 4000 &&
      /เกิดข้อผิดพลาด|ขออภัย[\s\S]{0,25}ผิดพลาด|something went wrong|an error occurred|went wrong/i.test(t);
  }
  async function ensureChatPage(log) {
    // มีช่องแชตอยู่แล้ว → จำหน้านี้ไว้ (ทั้งแบบ global + แยกตามอีเมล) แล้วจบเลย
    if (hasChatBox()) {
      try { chrome.storage.local.set({ flow_project_url: location.href }); } catch {}
      await rememberProjectForEmail();
      return true;
    }
    // 0) หน้า Flow ขึ้น error → กู้บน "หน้าเดิม" ก่อน (กดลองอีกครั้ง/รีโหลด)
    //    ★ ต้องกู้ก่อน fallback ไปโปรเจ็คที่จำไว้ ไม่งั้นจะเด้งไปทำคลิปต่อใน "โปรเจ็คคลิปก่อน" = สร้างซ้ำ
    if (isFlowErrorPage() && Date.now() - _errReloadAt > 25000) {
      _errReloadAt = Date.now();
      const retry = allClickable().find((el) => /ลองอีกครั้ง|ลองใหม่|try again|retry|reload|รีโหลด|refresh/i.test(txt(el)));
      if (retry) {
        log("หน้า Flow ขึ้น error → กด 'ลองอีกครั้ง'");
        await trustedClickEl(retry, log);
        await waitFor(() => (hasChatBox() || !isFlowErrorPage()) ? true : null, 12000, 700);
        await sleep(1500);
      } else {
        log("หน้า Flow ขึ้น error → รีโหลดหน้าเดิม (กันเด้งไปโปรเจ็คเก่า = สร้างซ้ำ)");
        location.reload();
        await sleep(4000);
        return true;   // หน้า reload → maybeResumeQueue รันคิวต่อบนโปรเจ็คเดิม
      }
    }
    // 1) อยู่หน้า scene editor → กดย้อนกลับ
    if (/\/scene\//.test(location.href)) {
      log("อยู่หน้า scene editor → ย้อนกลับ…");
      const back = allClickable().find((el) => txt(el).includes("arrow_back"));
      if (back) { await trustedClickEl(back, log); await sleep(1300); }
    }
    // 2) หน้า landing (.../tools/flow ที่ยังไม่เข้า project) → กดปุ่มเริ่ม/สร้างโปรเจกต์
    //    รอแบบ poll เพราะ SPA อาจเรนเดอร์ปุ่มช้า (เช็คครั้งเดียวจะพลาด)
    // หมายเหตุ: ปุ่มจริงสะกด "โปรเจ็กต์ใหม่" (มี ็) — ใช้ โปรเจ.{0,4}ใหม่ ครอบทุกการสะกด
    const isStart = (el) =>
      /get started|เริ่มต้นใช้งาน|เริ่มใช้งาน|โปรเจ.{0,4}ใหม่|สร้างวิดีโอใหม่|new project|create new project|create with google flow/i.test(txt(el));
    if (!hasChatBox()) {
      // เผื่อหน้าเพิ่งโหลดหลัง login (SPA เรนเดอร์ช้า) → รอนานขึ้น
      const found = await waitFor(() => {
        if (hasChatBox()) return "chat";
        return allClickable().find(isStart) || null;
      }, 14000, 600);
      if (found && found !== "chat") {
        log(`หน้า landing → กด "${txt(found).slice(0, 26)}"…`);
        await trustedClickEl(found, log);
        await waitFor(() => (hasChatBox() ? true : null), 12000);
        await sleep(1200);
      }
    }
    // 3) ไม่เจอช่องแชต agent (เช่นค้างที่ scene/แก้คลิป) → เริ่มเซสชันใหม่ ได้ช่องสะอาด
    if (!hasChatBox()) {
      const fresh = allClickable().find((el) => txt(el).includes("เซสชันใหม่") || txt(el).includes("edit_square"));
      if (fresh) {
        log("ไม่เจอช่องแชต → เริ่มเซสชันใหม่…");
        await trustedClickEl(fresh, log);
        await waitFor(() => (hasChatBox() ? true : null), 8000);
        await sleep(1000);
      }
    }
    // ยังไม่เจอช่องแชต → เปิดหน้าโปรเจ็กต์ที่จำไว้ของบัญชีนี้ (ถ้าเคยเปิด) แล้วให้ resume คิวต่อ
    if (!hasChatBox()) {
      const sp = await savedProjectForEmail();
      if (sp.url && sp.url !== location.href && Date.now() - _projNavAt > 20000) {
        _projNavAt = Date.now();
        log(`ไม่เจอปุ่มเริ่ม → เปิดโปรเจ็กต์ที่จำไว้ของ ${sp.email}…`);
        location.href = sp.url; // หน้า reload → maybeResumeQueue รันคิวต่อบนหน้าโปรเจ็กต์
        await sleep(1500);
        return true;
      }
      log("ไม่เจอช่องแชต/ปุ่มเริ่ม — เปิด project ใน Flow ของบัญชีนี้เองสักครั้ง (ระบบจะจำไว้ให้)");
    }
    return true;
  }

  // agent กำลังสร้างอยู่ไหม (best-effort: spinner/progress ที่มองเห็น)
  function isGenerating() {
    try {
      const els = document.querySelectorAll('[role="progressbar"],[aria-busy="true"],progress,[class*="oading"],[class*="enerating"],[class*="pinner"]');
      for (const el of els) if (el.offsetParent !== null) return true;
    } catch {}
    return false;
  }

  // ── generate flow ────────────────────────────────────────────────────
  async function runGenerate({ prompt, imageDataUrl, charImageDataUrl, productId, _log, dry }) {
    // ถ้ามี _log (จาก runQueue/panel) ใช้ตัวนั้นพอ ไม่ส่ง flow_log ซ้ำ
    const log = _log ? _log : (m) => { try { chrome.runtime.sendMessage({ action: "flow_log", productId, msg: m }); } catch {} };

    await ensureChatPage(log);
    log("หา prompt box…");
    // diagnostic: list ช่องทั้งหมด
    const allEd = editableCands().map((el) => {
      const r = el.getBoundingClientRect();
      return `${el.tagName.toLowerCase()}${el.getAttribute("role") ? "[" + el.getAttribute("role") + "]" : ""}@${Math.round(r.left)},${Math.round(r.top)}`;
    });
    log(`ช่อง editable ทั้งหมด: ${allEd.join(" | ") || "ไม่มี"}`);
    const box = await waitFor(findEditable, 15000);
    if (!box) return { ok: false, error: "ไม่พบช่องพิมพ์ prompt" };
    log(`เลือกช่อง: <${box.tagName.toLowerCase()} role=${box.getAttribute("role")}> @${JSON.stringify([Math.round(box.getBoundingClientRect().left), Math.round(box.getBoundingClientRect().top)])}`);
    // พิมพ์ด้วย trusted Input.insertText (Lexical state ตรงกับ DOM → submit ไม่ crash)
    // ไม่ใช้ execCommand เด็ดขาด เพราะทำ state เพี้ยน → หน้า crash ตอน submit
    const mac = /Mac/i.test(navigator.platform);
    const typedOk = () => match(boxText(box), prompt) && !placeholderVisible();
    let got = "";
    for (let attempt = 1; attempt <= 2 && !typedOk(); attempt++) {
      await trustedClickEl(box, log); // โฟกัสช่องด้วยเมาส์จริง (ซ่อน panel กันคลิกโดน panel)
      await sleep(350);
      const had = boxText(box) && !placeholderVisible();
      const tt = await sendTrusted({ action: "flow_trusted_type", text: prompt, clear: had, mac });
      await sleep(700);
      got = boxText(box);
      log(`พิมพ์ครั้งที่ ${attempt}: ok=${tt.ok} err=${tt.error || "-"} | ในช่อง: "${got.slice(0, 38)}" | placeholder=${placeholderVisible()}`);
    }
    if (!typedOk()) {
      return { ok: false, error: `พิมพ์ trusted ไม่สำเร็จ — ในช่อง "${got.slice(0, 30)}" (ช่องอาจถูก panel บัง หรือ debugger ไม่ติด)` };
    }
    log("พิมพ์ prompt ลงช่องแล้ว ✓ (trusted-insertText, Lexical state ตรง)");

    if (imageDataUrl) {
      const up = await uploadImage(imageDataUrl, log);
      log(up.ok ? `อัปรูปสินค้าแล้ว${up.addedToPrompt ? " + เข้าพรอมต์" : " (แต่ไม่ได้เข้าพรอมต์!)"}` : `ข้ามรูปสินค้า: ${up.error}`);
    }
    // รูปตัวละคร (จาก modal ตั้งค่าก่อนสร้าง) → อัปเป็นภาพอ้างอิงตัวที่สอง
    // prompt มีคำสั่ง "คงหน้าตามรูปอ้างอิง" คู่กันจาก background แล้ว
    if (charImageDataUrl) {
      const up2 = await uploadImage(charImageDataUrl, log);
      log(up2.ok ? `อัปรูปตัวละครแล้ว${up2.addedToPrompt ? " + เข้าพรอมต์" : " (แต่ไม่ได้เข้าพรอมต์!)"}` : `ข้ามรูปตัวละคร: ${up2.error}`);
    }
    await human();

    // 🧪 โหมดทดสอบ — หยุดก่อนกดส่ง (ไม่เปลือง Flow credit / Gemini quota)
    if (dry) {
      log("[ทดสอบ] พิมพ์ prompt + อัปรูปครบ แต่ไม่กดส่ง — ไม่เปลืองเครดิต ✓");
      return { ok: true, dryRun: true, files: [] };
    }

    // SEND = ปุ่ม "สร้าง" ที่อยู่ขวาสุดของแถบ prompt (arrow_forward สร้าง)
    // ไม่ใช่ add_2 (เพิ่มสื่อ) และไม่ใช่ "แสดงวิธีคิด arrow_forward_ios"
    const cands = allClickable().filter((el) => {
      const t = txt(el);
      return t.includes("สร้าง") && !t.includes("add_2") && !t.includes("เพิ่มสื่อ") &&
             !t.includes("moodboard") && !t.includes("โลโก้") && !t.includes("ระดมความคิด") &&
             !t.includes("แสดงวิธีคิด");
    });
    cands.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
    const btn = cands[0];
    if (btn) log(`ปุ่มส่ง: "${txt(btn).replace(/\s+/g, " ").trim()}" disabled=${btn.disabled} aria-disabled=${btn.getAttribute("aria-disabled")}`);

    await sleep(700); // ให้ React รับรู้ค่าในช่องก่อน
    const editor = realEditable(box);
    const before = boxText(box);
    const sent = () => boxText(box) !== before; // ช่องเปลี่ยน = ส่งแล้ว (เคลียร์)

    // ── ส่งด้วย "trusted event" ผ่าน chrome.debugger (Flow guard isTrusted) ──
    // วิธี 1: คลิกช่องจริงเพื่อโฟกัส+ปิดเมนู → Enter จริง
    await trustedClickEl(editor, log);  // โฟกัสช่องด้วยเมาส์จริง
    await sleep(300);
    log(`focus อยู่ที่: <${(document.activeElement?.tagName || "?").toLowerCase()} role=${document.activeElement?.getAttribute?.("role")}>`);
    const k1 = await sendTrusted({ action: "flow_trusted_key" });
    log(`Enter จริง: ${k1.ok ? "ส่งคำสั่งแล้ว" : "ล้มเหลว " + k1.error}`);
    await sleep(1500);

    // วิธี 2: คลิกปุ่มส่งด้วยเมาส์จริง
    if (!sent() && btn) {
      log("Enter จริงไม่ส่ง → คลิกปุ่มส่งด้วยเมาส์จริง");
      await trustedClickEl(btn, log);
      await sleep(1500);
    }

    // วิธี 3 (สำรอง): event สังเคราะห์ เผื่อ debugger ใช้ไม่ได้
    if (!sent()) {
      log("ลอง fallback (synthetic)");
      caretToEnd(editor); pressEnter(editor); await sleep(800);
      if (!sent() && btn) { try { btn.click(); } catch {} clickReal(btn); await sleep(1200); }
    }

    if (!sent()) {
      return { ok: false, error: `ส่งไม่สำเร็จ — ข้อความยังค้างในช่อง "${before.slice(0, 25)}" (debugger อาจไม่ทำงาน)` };
    }
    log("ส่งแล้ว — รอ agent เสนอ action…");

    // จำ src วิดีโอทั้งหมด "ก่อน" สร้าง → หลังสร้างจะหยิบเฉพาะตัวใหม่ (กันได้ไฟล์เดิมซ้ำ)
    const srcOf = (v) => v.src || v.querySelector("source")?.src || "";
    const beforeSrcs = new Set([...document.querySelectorAll(getSelector("video", "video"))].map(srcOf).filter(Boolean));

    // Agent อาจขออนุมัติก่อนสร้าง → กด Approve
    // ★ ปุ่ม Approve ของ Flow เป็น <div> ไม่มี role → allClickable หาไม่เจอ
    //   ต้องกวาดทุก element แล้วจับตัวที่ข้อความ "ตรงเป๊ะ" (เลี่ยงไปโดน paragraph ยาวๆ)
    const findApprove = () => {
      const WORDS = ["approve", "อนุมัติ", "ยืนยัน", "ดำเนินการต่อ", "do not ask again", "ไม่ต้องถามอีก", "อนุมัติและไม่ถามอีก"];
      const hits = [...document.querySelectorAll('button,[role="button"],a,[tabindex],div,span')].filter((el) => {
        if (!isVisible(el)) return false;
        if (el.closest("#__flow_panel")) return false;
        const t = norm(el.innerText || el.textContent);
        return t && t.length < 30 && WORDS.some((w) => t === norm(w) || t.includes(norm(w)));
      });
      if (!hits.length) return null;
      // เลือกตัว "ในสุด" (ปุ่มจริง ไม่ใช่กล่องที่ห่อข้อความอื่นด้วย) + ให้ "ไม่ถามอีก" มาก่อน
      const dna = hits.find((el) => /ไม่.*ถาม|do not ask/i.test(el.innerText || ""));
      const pool = dna ? [dna] : hits;
      return pool.find((el) => !pool.some((o) => o !== el && el.contains(o))) || pool[0];
    };
    const approve = await waitFor(findApprove, 60000, 1200);
    if (approve) { log(`กด Approve: "${txt(approve).slice(0, 20)}"`); await trustedClickEl(approve, log); await human(); }
    else log("ไม่เจอปุ่ม Approve (อาจตั้ง 'ไม่ถามอีก' ไว้แล้ว) — รอวิดีโอต่อ");

    log("รอ Veo สร้างวิดีโอ…");
    startRenderTicker(productId);   // เข้าสู่เฟสเรนเดอร์ → เริ่มจับเวลา ส่ง % ให้หน้าเว็บ
    const newSrcs = () => [...document.querySelectorAll(getSelector("video", "video"))].map(srcOf).filter((s) => s && !beforeSrcs.has(s));
    // รอ src ใหม่ตัวแรกโผล่ (สูงสุด 6 นาที)
    const first = await waitFor(() => (newSrcs().length ? newSrcs() : null), 6 * 60 * 1000, 4000);
    if (!first) { stopRenderTicker(); return { ok: false, error: "รอวิดีโอนานเกินไป (timeout)" }; }

    // settle: เก็บทุกคลิปที่ agent สร้าง (กี่ตัวก็ได้) — หยุดเมื่อ agent เสร็จจริง + ไม่มีคลิปใหม่
    const collected = new Set(first);
    let lastChange = Date.now();
    const settleStart = Date.now();
    while (true) {
      await sleep(4000);
      for (const s of newSrcs()) if (!collected.has(s)) { collected.add(s); lastChange = Date.now(); log(`เจอคลิปเพิ่ม (${collected.size})`); }
      const idle = Date.now() - lastChange;
      const busy = isGenerating();
      // ช็อตเดียว 10 วิ = 1 คลิป → หยุดเมื่อ agent ไม่สร้าง + ไม่มีคลิปใหม่
      // 35 วิ: เผื่อช่องว่างก่อนคลิปถัดมา (โหมดต่อหลายคลิป) — isGenerating เป็น best-effort เชื่อเดี่ยวไม่ได้ จึงเผื่อ idle ยาวขึ้น
      if (!busy && idle > 35000) break;
      // เผื่อ agent ยังสร้าง แต่เงียบนานมาก (3 นาที) ก็หยุด
      if (idle > 180000) { log("เงียบนานเกิน — หยุดเก็บ"); break; }
      if (Date.now() - settleStart > 10 * 60 * 1000) { log("settle timeout"); break; }
    }
    const srcs = [...collected];
    const uuid = (s) => (s.match(/name=([^&]+)/)?.[1] || s).slice(-12);
    log(`วิดีโอเสร็จ ✓ ${srcs.length} คลิป | uuid: ${srcs.map(uuid).join(", ")}`);
    reportProgress("downloading", `${srcs.length} คลิป`, productId);

    // ดาวน์โหลดทุกคลิป (chrome.downloads แนบ cookie ให้เอง)
    const stamp = Date.now();
    const files = [];
    const dlResults = [];
    for (let i = 0; i < srcs.length; i++) {
      const fname = `flow/${productId || "test"}_${stamp}_${i + 1}.mp4`;
      const dl = await sendTrusted({ action: "flow_download", url: srcs[i], filename: fname });
      if (dl.ok) { files.push(fname.split("/").pop()); dlResults.push(dl); }
      log(dl.ok ? `ดาวน์โหลดคลิป ${i + 1}/${srcs.length} ✓ (${uuid(srcs[i])})` : `คลิป ${i + 1} โหลดไม่ได้: ${dl.error}`);
    }
    if (!files.length) return { ok: false, error: "ดาวน์โหลดวิดีโอไม่สำเร็จ" };

    // defensive: ไฟล์ผลลัพธ์ต้องเป็นวิดีโอจริง ไม่ใช่ภาพนิ่ง → ถ้าไม่ใช่ หยุด ไม่ส่งไป desktop, ไม่ retry (กันเสียเครดิตซ้ำ)
    const vfy = verifyOutputs(dlResults);
    if (!vfy.ok) {
      const emsg = "ได้ภาพนิ่งแทนวิดีโอ — ลองสร้างใหม่";
      log(`${emsg} (${vfy.reason})`);
      reportProgress("error", emsg, productId);
      return { ok: false, error: emsg, stillImage: true };
    }

    return { ok: true, videoSrcs: srcs, files };
  }

  // ── desktop bridge + per-product orchestration ───────────────────────
  function desktop(method, path, body) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: "flow_desktop", method, path, body }, (res) => {
          if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
          resolve(res && res.ok ? res.data : { ok: false, error: (res && res.error) || "no response" });
        });
      } catch (e) { resolve({ ok: false, error: String(e) }); }
    });
  }
  function fetchImageDataUrl(url) {
    return new Promise((resolve) => {
      try { chrome.runtime.sendMessage({ action: "fetch_image", url }, (res) => resolve((res && res.dataUrl) || null)); }
      catch { resolve(null); }
    });
  }

  // ── รายงานความคืบหน้าการสร้างคลิป (stage มาตรฐาน) กลับ desktop ────────────
  // desktop broadcast ต่อเป็น WS {type:"gen_progress"} → หน้าเว็บโชว์เป็น step checklist
  // เดินคู่กับ flow_log เดิม (ไม่ลบ log) — แค่เพิ่มสัญญาณ stage ให้ UI อ่านง่าย
  // stage: prompt | submit | rendering | downloading | done | error
  let _renderTicker = null;
  function stopRenderTicker() { if (_renderTicker) { clearInterval(_renderTicker); _renderTicker = null; } }
  function reportProgress(stage, detail, productId, pct) {
    if (stage !== "rendering") stopRenderTicker();   // ออกจากช่วงเรนเดอร์ = หยุดจับเวลา
    try {
      desktop("POST", "/api/flow/progress", {
        jobId:  productId == null ? null : String(productId),
        stage,
        detail: detail == null ? "" : String(detail),
        pct:    pct == null ? null : pct,
      });
    } catch {}
  }
  // ระหว่าง Veo เรนเดอร์ (นานได้ถึง ~6 นาที) — ส่งวินาทีที่ผ่านไปเป็นระยะ ให้แถบ % ขยับ
  function startRenderTicker(productId) {
    stopRenderTicker();
    const t0 = Date.now();
    reportProgress("rendering", 0, productId);
    _renderTicker = setInterval(() => {
      if (!alive()) return stopRenderTicker();
      reportProgress("rendering", Math.round((Date.now() - t0) / 1000), productId);
    }, 5000);
  }

  // อัปรูป Shopee → ความละเอียดเต็ม (ตัด suffix thumbnail ออก)
  function hiResImage(url) {
    if (!url) return "";
    return url.replace(/@resize_[^/?#]*/i, "").replace(/_tn(?=$|[?#.])/i, "");
  }

  // ขอ prompt จาก background (extension เขียนเอง: template ด้วย JS / AI เรียก Gemini)
  function buildPrompt(product, dry = false, i2v = false) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ action: "build_prompt", product, dry, i2v }, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!res || !res.ok) {
            if (res && res.budgetExceeded) return reject(new Error("__BUDGET__"));
            return reject(new Error((res && res.error) || "สร้าง prompt ไม่ได้"));
          }
          resolve(res.prompt);
        });
      } catch (e) { reject(e); }
    });
  }

  // product = รูปแบบดิบจาก scraper (basic_info/commission/links/images)
  async function runForProduct(product, prompt, log, dry, engine) {
    const p = product || {};
    const bi = p.basic_info || {};
    const name = bi.name || p.product_id || "?";
    log(`สินค้า: ${String(name).slice(0, 40)}`);
    // เตรียมรูป hi-res
    let imageDataUrl = null;
    const url = hiResImage((p.images && p.images[0]) || "");
    if (url) { imageDataUrl = await fetchImageDataUrl(url); log(imageDataUrl ? "โหลดรูป hi-res แล้ว" : "โหลดรูปไม่ได้"); }
    if (!imageDataUrl && p.images_b64 && p.images_b64[0]) imageDataUrl = p.images_b64[0];

    // รูปตัวละครจาก modal (background เก็บเป็น dataURL ไว้ใน storage)
    let charImageDataUrl = null;
    try {
      const g = await chrome.storage.local.get(["flow_char_img", "flow_gen"]);
      charImageDataUrl = g.flow_char_img || null;
      if (g.flow_gen && g.flow_gen.charName) log(`ผู้รีวิว: ${g.flow_gen.charName} · สไตล์: ${g.flow_gen.style || "-"}`);
    } catch {}

    if (!dry) reportProgress("submit", name, p.product_id);   // เริ่มส่งให้ Veo (ครอบทั้ง agent + i2v)
    // เลือกเครื่องยนต์: i2v (nano banana → frames-to-video, หน้าเป๊ะ) หรือ agent (runGenerate เดิม)
    let res;
    if (engine === "i2v") {
      if (!imageDataUrl) { log("ไม่มีรูปสินค้า hi-res → ข้ามตัวนี้ (i2v ต้องมีรูปสินค้าจริง กัน compose ผิดตัว)"); return { ok: false, error: "ไม่มีรูปสินค้า" }; }
      res = await makeClip({ faceUrl: charImageDataUrl, productUrl: imageDataUrl, name, productId: p.product_id || "flow", dry, motionPrompt: prompt, _log: log });
      if (!res.ok) return res;
      if (res.dry) return { ok: true, dryRun: true };
    } else {
      // agent: prompt เดียว ระบุ 20 วิ → agent แบ่งเอง ~2 คลิป → เก็บทุกคลิปมาต่อ
      res = await runGenerate({ prompt, imageDataUrl, charImageDataUrl, productId: p.product_id || "flow", _log: log, dry });
      if (!res.ok) return res;
      if (res.dryRun) return { ok: true, dryRun: true };   // โหมดทดสอบ: ไม่แจ้ง desktop
    }

    // แจ้ง desktop — ส่งทุกคลิปตามลำดับที่เกิด → desktop ต่อด้วย ffmpeg เป็นวิดีโอเดียว
    const link = (p.links || {}).affiliate_link || (p.links || {}).product_url || "";
    const note = await desktop("POST", "/api/flow/video", {
      product_id: p.product_id, name, price: bi.price, sold: bi.sold_count,
      commission: (p.commission || {}).rate, link, files: res.files,
    });
    log(note && note.ok ? `→ desktop ต่อ ${res.files.length} คลิป เข้าคิวโพสต์ ✓ (ตะกร้า: ${link ? "มี" : "ไม่มี!"})` : `แจ้ง desktop ไม่สำเร็จ: ${note && note.error}`);
    if (!dry) reportProgress(note && note.ok ? "done" : "error",
                             note && note.ok ? name : ((note && note.error) || "แจ้ง desktop ไม่สำเร็จ"),
                             p.product_id);
    return { ok: true, files: res.files };
  }

  // คิวสินค้าอยู่ใน chrome.storage.local.flow_jobs (extension คุมเอง — desktop ไม่ยุ่ง)
  // ── auto-rotation: หมุนบัญชีเมื่อเครดิตใกล้หมดระหว่างรันคิว ───────────────
  const CREDIT_PER_CLIP = 15;  // ค่าเริ่มต้น/คลิป ตั้งทับได้ด้วย flow_credit_threshold
  let _queueRunning = false;   // กัน runQueue ซ้อน (ปุ่ม + auto-resume)
  async function clipCost() {
    try {
      const d = await chrome.storage.local.get("flow_credit_threshold");
      const v = Number(d.flow_credit_threshold);
      return Number.isFinite(v) && v > 0 ? v : CREDIT_PER_CLIP;
    } catch { return CREDIT_PER_CLIP; }
  }
  async function currentCreditValue(email) {
    // 1) ค่าสดที่อ่านจากหน้าปัจจุบัน (แม่นสุดถ้าหน้าโชว์เครดิต)
    try { const d = await chrome.storage.local.get("flow_credits"); if (d.flow_credits && d.flow_credits.value != null) return d.flow_credits.value; }
    catch {}
    // 2) สำรอง: ค่าเครดิตที่เก็บไว้ต่ออีเมล (ตัวเดียวกับที่แท็บเมลโชว์) — กันหน้าสร้างคลิปอ่านไม่ออก
    try {
      if (email) {
        const d = await chrome.storage.local.get("flow_credits_by_email");
        const m = (d.flow_credits_by_email && typeof d.flow_credits_by_email === "object") ? d.flow_credits_by_email : {};
        const r = m[email.toLowerCase()];
        if (r && r.value != null) return r.value;
      }
    } catch {}
    return null;
  }
  async function currentActiveEmail() {
    try { const d = await chrome.storage.local.get("flow_active_email"); return d.flow_active_email && d.flow_active_email.email ? d.flow_active_email.email.toLowerCase() : null; }
    catch { return null; }
  }
  // เลือกบัญชีถัดไปที่ยังมีเครดิตพอ (ไม่ paused, ไม่ใช่บัญชีปัจจุบัน)
  async function pickNextEmail(curEmail, need) {
    let accts = [], credits = {};
    try {
      const d = await chrome.storage.local.get(["flow_accounts", "flow_credits_by_email"]);
      accts = Array.isArray(d.flow_accounts) ? d.flow_accounts : [];
      credits = (d.flow_credits_by_email && typeof d.flow_credits_by_email === "object") ? d.flow_credits_by_email : {};
    } catch {}
    const cur = (curEmail || "").toLowerCase();
    const credOf = (e) => { const r = credits[(e || "").toLowerCase()]; return r && r.value; };
    const cands = accts.filter((a) => a && a.email && !a.paused && a.email.toLowerCase() !== cur);
    // 1) บัญชีที่รู้เครดิตและพอ → มากสุดก่อน
    const known = cands
      .map((a) => ({ email: a.email, c: credOf(a.email) }))
      .filter((x) => Number.isFinite(x.c) && x.c >= need)
      .sort((a, b) => b.c - a.c);
    if (known.length) return known[0].email;
    // 2) บัญชีที่ยังไม่เคยอ่านเครดิต → ลองสลับไปอ่าน (อาจมีเครดิต)
    const unknown = cands.find((a) => !Number.isFinite(credOf(a.email)));
    return unknown ? unknown.email : null;
  }

  async function runQueue(log, max = 100, dry = false) {
    if (_queueRunning) { log("คิวกำลังรันอยู่แล้ว — ข้าม"); return 0; }
    if (dry) log("[ทดสอบ] โหมดทดสอบเปิดอยู่ — จะพิมพ์ prompt แต่ไม่กดส่ง (ไม่เปลืองเครดิต)");
    let jobs = ((await chrome.storage.local.get("flow_jobs")).flow_jobs || []).slice();
    const total = jobs.length;
    if (!total) { log("ไม่มีงานในคิว — เลือกสินค้าใน Dashboard แล้วกดสร้างก่อน"); return 0; }
    _queueRunning = true;
    log(`คิว ${total} ชิ้น (extension คุมคิวเอง)`);
    const engine = ((await chrome.storage.local.get("flow_gen")).flow_gen || {}).engine || "agent";
    if (engine === "i2v") log("เครื่องยนต์: image-to-video (nano banana → frames-to-video)");
    let done = 0, n = 0;
    // สถานะคิวลง storage → Dashboard อ่านได้แม้ service worker restart / แท็บ reload
    const qstate = (running, current) => {
      try {
        chrome.storage.local.set({
          flow_queue_state: { running, total, done, left: jobs.length, current: current || null, dry, at: Date.now() },
        });
      } catch {}
    };
    while (jobs.length && n < max) {
      n++;
      const product = jobs[0];
      const curName = (product?.basic_info?.name || product?.product_id || "?").slice(0, 40);
      qstate(true, curName);
      log(`── งานที่ ${n}/${total} ──`);
      // เช็กเครดิตก่อนสร้าง → ไม่พอก็สลับบัญชี (ไม่เช็กตอน dry — ไม่เปลืองเครดิต)
      if (!dry) {
        await pollFlowCredits({ forceMenu: true }).catch(() => {}); // เปิดเมนูอ่านเครดิตสดก่อนสร้างแต่ละคลิป
        const need = await clipCost();
        const me = await currentActiveEmail();
        const cur = await currentCreditValue(me);
        // (0) อ่านเครดิตไม่ได้ทั้งหน้าสดและค่าเก็บ → ไม่เสี่ยงสร้าง (กันเปลืองเครดิตแบบที่เคยพลาด)
        if (cur == null) {
          log("อ่านเครดิตไม่ได้ — หยุดคิวไว้ก่อน กันเปลืองเครดิต (เปิดแท็บเมล/หน้า Flow ให้เห็นเลขเครดิตก่อน แล้วรันใหม่)");
          qstate(false, null);
          _queueRunning = false;
          return done;
        }
        // (1) เครดิตไม่พอ → สลับบัญชี
        if (cur < need) {
          const next = await pickNextEmail(me, need);
          if (!next) {
            log(`ทุกบัญชีเครดิตไม่พอ (เหลือ ${cur}, ใช้ ${need}/คลิป) — หยุดคิวไว้ก่อน เติม/รอเครดิตแล้วกดรันคิวใหม่`);
            qstate(false, null);
            _queueRunning = false;
            return done;
          }
          log(`เครดิตเหลือ ${cur} ไม่พอ (${need}/คลิป) → สลับไป ${next} แล้วรันคิวต่อเอง`);
          qstate(true, curName); // คงสถานะ running ให้ auto-resume รับช่วงหลังสลับเสร็จ
          try { await chrome.storage.local.set({ flow_switch: { email: next, at: Date.now() } }); } catch {}
          runSwitchIfPending().catch(() => {});
          _queueRunning = false;
          return done; // ปล่อยให้หน้า navigate ระหว่างสลับ → maybeResumeQueue รันคิวต่อ
        }
        // (2) เครดิตพอ → สร้างต่อได้เลย
      }
      if (!dry) reportProgress("prompt", curName, product.product_id);   // AI เริ่มเขียนสคริปต์
      let prompt = null;
      try { prompt = await buildPrompt(product, dry, engine === "i2v"); }   // JSON จาก Gemini — i2v ได้ schema motion-only (ตัดบรรยายภาพ)
      catch (e) {
        if (e.message === "__BUDGET__") { log("งบเดือนนี้เต็ม — หยุดสร้างชั่วคราว"); break; }
        log("สร้าง prompt ไม่ได้ ข้ามตัวนี้: " + e.message);
        if (!dry) reportProgress("error", "เขียนสคริปต์ไม่สำเร็จ: " + e.message, product.product_id);
        jobs.shift(); if (!dry) await chrome.storage.local.set({ flow_jobs: jobs });
        continue;
      }
      let jobOk = false;
      try {
        const r = await runForProduct(product, prompt, log, dry, engine);
        jobOk = !!(r && r.ok);
        if (jobOk) done++;
        else { log(`ข้ามตัวนี้: ${r && r.error}`); if (!dry) reportProgress("error", (r && r.error) || "สร้างไม่สำเร็จ", product.product_id); }
      } catch (e) { log("ERROR: " + e.message); if (!dry) reportProgress("error", e.message, product.product_id); }
      jobs.shift();                                          // เอาออกจากคิว (resume ได้ถ้า reload)
      if (!dry) await chrome.storage.local.set({ flow_jobs: jobs });
      // ★ i2v + สำเร็จ → เปิดโปรเจ็คใหม่ "หลัง shift แล้ว" → ต่อให้ navigate ทำ context ตาย ก็ไม่สร้าง job เดิมซ้ำ
      if (engine === "i2v" && !dry && jobOk) { try { await newProject(log); } catch {} }
      // พักระหว่างคลิป "แบบสุ่มเหมือนคน" (กัน cadence สม่ำเสมอ = ลายเซ็นบอท) — dry ไม่ต้องพักนาน
      if (jobs.length && !dry) { const w = rand(12000, 28000); log(`พักเหมือนคน ~${Math.round(w / 1000)} วิ ก่อนคลิปถัดไป`); await sleep(w); }
      else await sleep(rand(1500, 3000));
    }
    qstate(false, null);
    _queueRunning = false;
    log(`เสร็จ — ${dry ? "ทดสอบ" : "สร้าง"} ${done} ชิ้น`);
    // broadcast ตรงถึง Dashboard/side panel — ไม่พึ่ง sendResponse ของ background
    // (ถ้า service worker โดน restart ระหว่างรอ คิวยาวๆ response เดิมจะหายไป)
    try { chrome.runtime.sendMessage({ action: "flow_queue_done", done, total, dry }); } catch {}
    return done;
  }

  // กล่องปุ่มลอยบนหน้า Flow (Probe / ทดสอบ / รันคิว) ถูกถอดออกแล้ว — สั่งงานจาก Dashboard/side panel แทน

  // authuser ของบัญชี Flow ที่ "แท็บนี้" ผูกอยู่ — จับจาก URL ตอนสคริปต์โหลด (ตอนนั้น ?authuser
  // ยังอยู่ ก่อน SPA ถอดออก) แล้วล็อกไว้กับแท็บนี้ → เปิดหลายแท็บคนละบัญชีพร้อมกันได้ ไม่ปนเครดิต
  const MY_AUTHUSER = (() => {
    const m = (location.href || "").match(/[?&]authuser=(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  })();
  // ใช้ค่าของแท็บก่อนเสมอ; เปิดหน้า base เองไม่มี ?authuser ค่อย fallback ค่าที่ background ตั้งไว้
  // (กรณีนั้นมีแท็บ Flow ตัวเดียว ค่า global จึงไม่ปน)
  async function activeAuthuser() {
    if (MY_AUTHUSER != null) return MY_AUTHUSER;
    try {
      const st = await chrome.storage.local.get("flow_active_authuser");
      if (st.flow_active_authuser != null) return st.flow_active_authuser;
    } catch {}
    return null;
  }

  // จำ URL หน้าที่มีช่องแชต agent อัตโนมัติ → รอบสร้างถัดไป background เปิดหน้านี้ตรงๆ
  // (พอผู้ใช้เข้าหน้า chat เองครั้งเดียวก็ถูกจำ ไม่ต้องรันงาน/ไม่เปลืองเครดิต)
  function rememberIfChat() {
    if (!hasChatBox()) return;
    try { chrome.storage.local.set({ flow_project_url: location.href }); } catch {}
    rememberProjectForEmail().catch(() => {}); // จำโปรเจกต์แยกตามอีเมลที่ login อยู่
    // จำโปรเจกต์ "แยกตามบัญชี (authuser)" ด้วย — กันสลับบัญชีแล้วเปิดโปรเจกต์ของคนอื่น
    activeAuthuser().then((au) => {
      if (au == null) return;
      chrome.storage.local.get("flow_project_urls").then((d) => {
        const map = (d.flow_project_urls && typeof d.flow_project_urls === "object") ? d.flow_project_urls : {};
        map[au] = location.href;
        chrome.storage.local.set({ flow_project_urls: map });
      }).catch(() => {});
    }).catch(() => {});
  }
  delay(rememberIfChat, 3000);
  loop(rememberIfChat, 10000);

  // โหลด adapter override (selector/output_verify) ตอนเริ่ม — ล้มเหลว = คงค่า default (พฤติกรรมเดิม)
  try { loadAdapter().catch(() => {}); } catch {}
  // รีเฟรช adapter เป็นระยะ (เผื่อ desktop อัปเดต remote adapter ระหว่างเปิดหน้าค้างไว้)
  loop(() => loadAdapter(), 5 * 60 * 1000);

  // ── อ่านเครดิต Flow จากหน้าเว็บ (ตอนเปิดหน้าอยู่) → เก็บลง storage ให้ dashboard อ่าน ──
  // Flow ไม่มี API บอกเครดิต จึงใช้ heuristic อ่าน DOM (อาจต้องปรับเมื่อ Google เปลี่ยน UI)
  // ตั้ง selector เองได้แม่นสุด: chrome.storage.local.set({ flow_credit_selector: "css ที่ชี้ตัวเลขเครดิต" })
  const creditNum = (s) => {
    const m = (s || "").replace(/[, ]/g, "").match(/\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  };
  const CREDIT_KW = /\bcredits?\b|เครดิต/i;
  async function readFlowCredits() {
    // 1) selector ที่ผู้ใช้ตั้งเอง (ตรงสุด)
    try {
      const { flow_credit_selector } = await chrome.storage.local.get("flow_credit_selector");
      if (flow_credit_selector) {
        const el = document.querySelector(flow_credit_selector);
        if (el && isVisible(el)) {
          const t = boxText(el);
          const v = creditNum(t);
          if (v != null) return { value: v, text: t.slice(0, 48), src: "selector" };
        }
      }
    } catch {}
    // 2) heuristic: หา element ที่พูดถึง credit/เครดิต (รวม aria-label/title) แล้วดึงตัวเลขที่ใกล้สุด
    // จำกัดที่ปุ่ม/ลิงก์/element ที่มี aria-label/title เท่านั้น (เบา ไม่กวาด span/div ทั้งหน้า)
    // เคสที่เครดิตเป็น text เปล่าใน div → ใช้ flow_credit_selector ตั้งเองแทน
    let best = null; // เลือกอันที่ข้อความสั้นสุด = เฉพาะเจาะจงสุด
    const nodes = document.querySelectorAll('[aria-label],[title],button,[role="button"],a');
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const label = (el.getAttribute("aria-label") || el.getAttribute("title") || "");
      const inner = (el.innerText || el.textContent || "");
      const hay = label + " " + inner;
      if (!CREDIT_KW.test(hay)) continue;
      // ดึงเลขจาก label ก่อน (มักเป็น "1,000 credits"), ไม่เจอค่อยใช้ inner/พ่อ
      const v = creditNum(label) ?? creditNum(inner) ??
                (el.parentElement ? creditNum(el.parentElement.innerText) : null);
      if (v == null) continue;
      const score = hay.replace(/\s+/g, " ").trim().length;
      if (!best || score < best.score) best = { value: v, text: (label || inner).replace(/\s+/g, " ").trim().slice(0, 48), src: "heuristic", score };
    }
    return best ? { value: best.value, text: best.text, src: best.src } : null;
  }
  // Flow ซ่อนเลขเครดิตไว้ใน "เมนูบัญชี" (iframe ของ Google) — หน้าปกติไม่โชว์
  // จึงต้องแอบเปิดเมนูบัญชีให้ gauth.js (ในกรอบ iframe) อ่านเครดิต/อีเมลเขียนลง storage
  let _creditMenuAt = 0;                       // cooldown เปิดเมนูอ่านเครดิต (กันเด้งรัวๆ)
  const CREDIT_REFRESH_MS = 4 * 60 * 1000;     // เครดิตเก่ากว่านี้ → เปิดเมนูอ่านใหม่
  const CREDIT_MENU_COOLDOWN = 60 * 1000;      // เว้นระหว่างเปิดเมนูอย่างน้อยเท่านี้
  // เครดิตของอีเมลที่ login อยู่ (จาก flow_credits_by_email) → {email, value, at}
  async function activeEmailCredit() {
    try {
      const em = await currentActiveEmail();
      if (!em) return { email: null, value: null, at: 0 };
      const d = await chrome.storage.local.get("flow_credits_by_email");
      const m = (d.flow_credits_by_email && typeof d.flow_credits_by_email === "object") ? d.flow_credits_by_email : {};
      const r = m[em.toLowerCase()];
      return { email: em, value: r && r.value != null ? r.value : null, at: (r && r.at) || 0 };
    } catch { return { email: null, value: null, at: 0 }; }
  }
  // แอบเปิดเมนูบัญชีอ่านเครดิต → คุมจังหวะเอง: เปิด → รอจนอ่านเลขได้จริง (สูงสุด ~7 วิ) → ปิด
  // รองรับ 2 แบบ: (ก) เมนูเป็น DOM ในหน้า → flow.js อ่านเลขเอง  (ข) เมนูเป็น iframe → gauth.js อ่านให้
  // ไม่เปิดตอนกำลังสลับบัญชี / กำลังสร้างคลิป (กันรบกวน)
  async function refreshCreditViaMenu(force = false) {
    if (_switchBusy || isGenerating()) return false;
    if (await readSwitchTarget()) return false;  // มีคำสั่งสลับค้าง → ห้ามเปิดเมนู (gauth จะ logout ทันที)
    if (!force && Date.now() - _creditMenuAt < CREDIT_MENU_COOLDOWN) return false;
    const acct = findAccountButton();
    if (!acct) return false;                    // ยังไม่ login / หาปุ่มโปรไฟล์ไม่เจอ
    _creditMenuAt = Date.now();
    const before = await activeEmailCredit();
    try { await trustedClickEl(acct); } catch {}  // เปิดเมนูบัญชี (trusted)
    let ok = false;
    for (let i = 0; i < 12; i++) {              // รอสูงสุด ~7 วิ ให้เมนู/iframe โหลด+อ่านเสร็จ
      await sleep(600);
      // (ก) เมนูเป็น DOM ในหน้า → flow.js อ่านเลขได้เอง
      let dom = null; try { dom = await readFlowCredits(); } catch {}
      if (dom && dom.value != null) {
        // ผูกเครดิต↔อีเมลได้ "เฉพาะเมื่อเห็นอีเมลเดียว" ในเมนู (กันคว้าอีเมลบัญชีอื่นที่ค้างในหน้า → ผูกผิด)
        const ems = pageEmails();
        if (ems.length === 1) {
          // ครอบทั้งก้อน: ถ้า extension เพิ่งรีโหลด context จะตาย (chrome.storage เด้ง) → กลืนเงียบ ไม่ให้ uncaught
          try {
            const em = ems[0], now = Date.now();
            const d = await chrome.storage.local.get("flow_credits_by_email");
            const m = (d.flow_credits_by_email && typeof d.flow_credits_by_email === "object") ? d.flow_credits_by_email : {};
            m[em] = { value: dom.value, at: now, src: "menu" };
            await chrome.storage.local.set({ flow_credits_by_email: m, flow_active_email: { email: em, at: now } });
          } catch {}
        }
        ok = true; break;
      }
      // (ข) เมนูเป็น iframe accounts.google → gauth.js เขียน flow_credits_by_email ให้ → อ่านกลับ
      const cur = await activeEmailCredit();
      if (cur.value != null && (before.value == null || cur.at > before.at)) { ok = true; break; }
    }
    try { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })); } catch {}
    return ok;
  }
  async function pollFlowCredits({ forceMenu = false } = {}) {
    let r = null;
    try { r = await readFlowCredits(); } catch {}
    try { await readActiveEmail(); } catch {}   // อัปอีเมลจาก label (ไม่เปิดเมนู)
    // หน้าไม่โชว์เครดิต → แอบเปิดเมนูให้ gauth อ่าน เมื่อค่าเก่า/ไม่มี (หรือถูกบังคับตอนรันคิว)
    if (!r || r.value == null) {
      const cur = await activeEmailCredit();
      const stale = cur.value == null || Date.now() - cur.at > CREDIT_REFRESH_MS;
      if (forceMenu || stale) {
        await refreshCreditViaMenu(forceMenu);
        const after = await activeEmailCredit();  // gauth เขียนแล้ว → อ่านกลับเป็นค่าสด
        if (after.value != null) r = { value: after.value, text: `${after.value} เครดิต`, src: "menu" };
      }
    }
    const now = Date.now();
    try {
      // เก็บค่าสดของ "บัญชีที่ active ตอนนี้" ลง flow_credits (ใช้โชว์การ์ดเดียวในภาพรวม) — ไม่ทับด้วย null
      // ★ ไม่ผูก flow_credits_by_email ที่นี่: ต้องผูกอีเมล↔เครดิต "พร้อมกันจากแหล่งเดียว" เท่านั้น
      //   (gauth.js อ่านจากการ์ดบัญชีเดียวกันแบบ atomic / refreshCreditViaMenu เคส DOM) — กันผูกผิดบัญชี
      if (r && r.value != null) {
        await chrome.storage.local.set({
          flow_credits: { value: r.value, text: r.text || null, src: r.src || null, found: true, url: location.href, at: now },
        });
      }
    } catch {}
    return r;
  }
  delay(() => pollFlowCredits(), 4500);
  loop(() => pollFlowCredits(), 20000);

  // ── สลับบัญชี Flow ด้วย "อีเมล" (logout → เลือกบัญชีใหม่) ─────────────────
  // Flow ผูกบัญชีของตัวเอง ไม่สน ?authuser → สลับต้อง logout ออกแล้ว login เลือกบัญชีใหม่
  // ขับด้วย state flag `flow_switch={email,at}` ใน storage ให้รอดข้ามการรีโหลดหน้า:
  //   (ก) logged out → กด "เข้าสู่ระบบ" → เด้งหน้าเลือกบัญชี (gauth.js เลือกอีเมลให้)
  //   (ข) logged in คนละบัญชี → เปิดเมนูบัญชี → กด "ออกจากระบบ" (หน้าจะกลับไป (ก))
  //   (ค) logged in ตรงบัญชีเป้าหมายแล้ว → เคลียร์ flag = เสร็จ
  const SWITCH_FRESH_MS = 3 * 60 * 1000;
  let _switchBusy = false;
  let _signInAt = 0; // กันกดปุ่ม "เข้าสู่ระบบ" ซ้ำรัวๆ (เปิดป๊อปอัป chooser ซ้ำ)
  let _navAt = 0;    // กันเด้งหน้า /tools/flow ซ้ำรัวๆ (reload loop)
  async function readSwitchTarget() {
    try {
      const s = await chrome.storage.local.get("flow_switch");
      const sw = s.flow_switch;
      if (!sw || !sw.email) return null;
      if (sw.at && Date.now() - sw.at > SWITCH_FRESH_MS) return null;
      return sw.email;
    } catch { return null; }
  }
  function findSignInBtn() {
    const KW = /sign\s?in with google|ลงชื่อเข้าใช้ด้วย google|sign\s?in|ลงชื่อเข้าใช้|เข้าสู่ระบบ/i;
    const BAD = /about|เกี่ยวกับ|ข้อมูล|learn more|privacy|นโยบาย|terms/i; // ลิงก์ "เกี่ยวกับ..." ไม่ใช่ปุ่มจริง
    const cands = [...document.querySelectorAll('button,[role="button"],a,[tabindex]')]
      .filter(isVisible)
      .filter((el) => { const t = (txt(el) || "").trim(); return KW.test(t) && t.length < 40 && !BAD.test(t); });
    if (!cands.length) return null;
    cands.sort((a, b) => (txt(a) || "").length - (txt(b) || "").length); // ข้อความสั้นสุด = เจาะจงสุด
    return cands[0];
  }
  // หน้า /tools/flow ตอน logged out ไม่มี modal "Sign in" — ทางเข้าคือปุ่มใหญ่ "Create with Google Flow"
  function findCreateFlowBtn() {
    return [...document.querySelectorAll('button,[role="button"],a')]
      .filter(isVisible)
      .find((el) => /create with google flow|create with|เริ่ม(สร้าง)?.*flow|สร้าง.*google flow/i.test((txt(el) || "").trim())) || null;
  }
  // ปุ่มบัญชีมุมขวาบน — ตัวชี้ชัดสุด: img รูปโปรไฟล์ Google (alt "โปรไฟล์" / src googleusercontent)
  function findAccountButton() {
    // 1) รูปโปรไฟล์ Google โดยตรง — คลิกปุ่มที่ห่อมันอยู่ (trusted click ใช้พิกัดได้ทุก element)
    const avatar = [...document.querySelectorAll("img")].find((el) => {
      if (!isVisible(el)) return false;
      const alt = el.getAttribute("alt") || "";
      const src = el.getAttribute("src") || "";
      return /โปรไฟล์|profile|avatar|บัญชี/i.test(alt) || /googleusercontent\.com|\/a\//i.test(src);
    });
    if (avatar) return avatar.closest('button,[role="button"],a,[tabindex]') || avatar;
    // 2) aria-label/title บอกว่าเป็นบัญชี/อีเมล
    const cands = allClickable();
    const byLabel = cands.find((el) => {
      const a = (el.getAttribute("aria-label") || el.getAttribute("title") || "");
      return /บัญชี\s*google|google account|จัดการบัญชี|manage your google|@/i.test(a);
    });
    if (byLabel) return byLabel;
    // 3) ปุ่ม/clickable มุมขวาบนสุด ขนาดราว avatar (เผื่อไม่มี img)
    //    กันจับผิด: ลิงก์โซเชียล (<a>) และปุ่มไอคอน material เช่น "more_vert"/"menu" (จุดสามจุด)
    const topRight = cands.filter((el) => {
      if (el.tagName === "A") return false;
      const tx = norm(txt(el));
      if (/^[a-z_]+$/.test(tx) && tx.length <= 20) return false; // ชื่อไอคอน material (more_vert, menu, …)
      const r = el.getBoundingClientRect();
      return r.top < 90 && r.right > innerWidth - 110 && r.width >= 28 && r.width <= 64;
    }).sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
    return topRight[0] || null;
  }
  function findSignOut() {
    const KW = /ออกจากระบบ|sign\s?out|log\s?out/i;
    const EXACT = /^(ออกจากระบบ|sign\s?out|log\s?out)$/i;
    const cands = [...document.querySelectorAll('button,[role="button"],[role="menuitem"],a,[tabindex],div,span,li')]
      .filter(isVisible)
      .filter((el) => KW.test(txt(el)));
    if (!cands.length) return null;
    // ตัวที่ข้อความ "ตรงเป๊ะ" = ปุ่มออกจากระบบจริง (ไม่ใช่ก้อนครอบที่มีชื่อ/อีเมลปน)
    const exact = cands.filter((el) => EXACT.test(norm(txt(el))));
    if (exact.length) {
      // เลือก leaf (ลูกน้อยสุด = ตัวข้อความจริง) แล้วคลิกตรงตัวอักษรเลย — event จะ bubble ขึ้น handler เอง
      exact.sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length);
      return exact[0];
    }
    // ไม่เจอตรงเป๊ะ → เอาตัวที่ข้อความสั้นสุด (เจาะจงกว่าก้อนครอบ) ที่ขนาดพอเป็นปุ่ม
    cands.sort((a, b) => (txt(a) || "").length - (txt(b) || "").length);
    const small = cands.find((el) => {
      const r = el.getBoundingClientRect();
      return (txt(el) || "").length < 40 && r.height < 80 && r.width < 360;
    });
    return small || null; // ไม่เอาก้อนใหญ่ (กันคลิกโดนชื่อ/อีเมล)
  }
  function pageEmails() {
    const t = (document.body && document.body.innerText) || "";
    return (t.match(/[\w.+-]+@[\w.-]+\.\w+/g) || []).map((s) => s.toLowerCase());
  }
  // อ่านอีเมลที่ login อยู่จาก aria-label/title ของปุ่มบัญชี (ไม่ต้องเปิดเมนู)
  function emailFromLabels() {
    for (const el of document.querySelectorAll("[aria-label],[title]")) {
      if (!isVisible(el)) continue;
      const a = (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "");
      const m = a.match(/[\w.+-]+@[\w.-]+\.\w+/);
      if (m) return m[0].toLowerCase();
    }
    return null;
  }
  // ผลตรวจล่าสุด (ให้ handler read_active_email ส่งกลับ dashboard โชว์ว่าติดตรงไหน)
  let _lastEmailDiag = null;
  // อ่านอีเมลปัจจุบัน — ลองจาก label ก่อน ไม่เจอค่อยเปิดเมนูบัญชีอ่าน (openMenu=true)
  async function readActiveEmail({ openMenu = false } = {}) {
    const diag = { fromLabel: false, foundBtn: null, clicked: false, openedMenu: false, emailsSeen: [] };
    let email = emailFromLabels();
    if (email) diag.fromLabel = true;
    if (!email && openMenu) {
      const acct = findAccountButton();
      diag.foundBtn = acct ? `${acct.tagName.toLowerCase()}.${String(acct.className || "").trim().split(/\s+/)[0] || "?"}` : null;
      if (acct) {
        // เปิดเมนูบัญชี → กรอบบัญชี Google (iframe) จะโหลด แล้ว gauth.js ในกรอบนั้นอ่านอีเมลเอง
        // เปิดค้างไว้ ~2.8 วิ ให้กรอบโหลด+อ่านทัน (ค่าจะถูกเขียนลง flow_active_email โดย gauth.js)
        const res = await trustedClickEl(acct);
        diag.clicked = !!(res && res.ok !== false);
        await sleep(2800);
        // เช็คว่าเมนูเปิดจริงไหม (มีปุ่มออกจากระบบโผล่)
        diag.openedMenu = !!findSignOut();
        const ems = pageEmails(); // เผื่อกรณีเป็น DOM จริง (ไม่ใช่ iframe) จะอ่านได้ที่นี่
        diag.emailsSeen = ems;
        if (ems.length) email = ems[0];
        // ค่าจริงอาจถูก gauth.js (ในกรอบ iframe) เขียนลง storage แทน → ลองอ่านกลับ
        if (!email) {
          try {
            const d = await chrome.storage.local.get("flow_active_email");
            if (d.flow_active_email && d.flow_active_email.email && Date.now() - (d.flow_active_email.at || 0) < 8000) {
              email = d.flow_active_email.email;
            }
          } catch {}
        }
        try { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })); } catch {}
      }
    }
    diag.email = email || null;
    _lastEmailDiag = diag;
    if (email) {
      try { await chrome.storage.local.set({ flow_active_email: { email, at: Date.now() } }); } catch {}
    }
    return email;
  }
  async function runSwitchIfPending(log) {
    if (_switchBusy) return;
    const target = await readSwitchTarget();
    if (!target) return;
    _switchBusy = true;
    const L = log || ((m) => { try { chrome.runtime.sendMessage({ action: "flow_log", msg: "[สลับ] " + m }); } catch {} });
    try {
      const acct = findAccountButton(); // null = logged out (ไม่มี avatar จริง)
      // (ก) logged out → กด "เข้าสู่ระบบ" / "Create with Google Flow" → เด้งหน้าเลือกบัญชี (gauth.js คลิกอีเมลให้)
      let signIn = findSignInBtn();
      if (!signIn && !acct) signIn = findCreateFlowBtn();
      if (signIn) {
        // กดครั้งเดียวพอ แล้วรอ gauth เลือกบัญชีในหน้า/ป๊อปอัป chooser (กันกดซ้ำเปิดป๊อปอัปรัวๆ)
        if (Date.now() - _signInAt < 12000) return;
        _signInAt = Date.now();
        L(`กดเข้าสู่ระบบ: ${signIn.tagName.toLowerCase()} "${(txt(signIn) || "").slice(0, 30)}" → gauth จะเลือก ${target}`);
        await trustedClickEl(signIn, L);
        await sleep(1500);
        return;
      }
      // (ข) logged in. ทำ state machine แบบ "ไม่ toggle":
      //     - เมนูยังปิด → กดรูปโปรไฟล์เปิด (จบรอบ ไม่กดอย่างอื่น กันเมนูหุบ)
      //     - เมนูเปิดแล้ว → ตรงเป้าหมาย=เคลียร์ flag · คนละบัญชี=กด "ออกจากระบบ" แล้วตรวจผล
      const out = findSignOut();              // เจอ = เมนูเปิดอยู่ (same-origin)
      if (out) {
        if (pageEmails().includes(target.toLowerCase())) {
          L(`บัญชีตรงเป้าหมายแล้ว (${target}) — เสร็จ`);
          try { await chrome.storage.local.set({ flow_switch: null, flow_active_email: { email: target.toLowerCase(), at: Date.now() } }); } catch {}
          try { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })); } catch {}
          return;
        }
        // ★ cap กันลูป logout/login รัว ๆ = โดน Google จับบอท (ตัวการที่ทำให้บัญชีโดนแบน)
        const sw = (await chrome.storage.local.get("flow_switch")).flow_switch || {};
        const logouts = (sw.logouts || 0) + 1;
        if (logouts > 2) {
          L("สลับบัญชีไม่สำเร็จเกิน 2 รอบ — หยุดกันโดนจับบอท · สลับบัญชีเองแล้วกดสร้างใหม่");
          try { await chrome.storage.local.set({ flow_switch: null }); } catch {}
          try { const qs = (await chrome.storage.local.get("flow_queue_state")).flow_queue_state || {}; await chrome.storage.local.set({ flow_queue_state: { ...qs, running: false, at: Date.now() } }); } catch {}
          return;
        }
        try { await chrome.storage.local.set({ flow_switch: { ...sw, logouts } }); } catch {}
        L(`กดออกจากระบบ (รอบ ${logouts}/2): ${out.tagName.toLowerCase()} "${(txt(out) || "").slice(0, 24)}"`);
        await trustedClickEl(out, L);
        await sleep(2600);
        if (findSignInBtn()) L("ออกจากระบบสำเร็จ — กำลังจะเข้าบัญชีใหม่");
        else if (findSignOut()) L("กดแล้วแต่ยังไม่ออก (เมนูยังเปิด) — ปุ่มอาจไม่ตรง/มีหน้ายืนยัน");
        else L("เมนูปิดแล้ว เดี๋ยวเปิดเช็กใหม่รอบถัดไป");
        return;
      }
      // เมนูยังไม่เปิด → เปิดเมนู (รอบนี้แค่เปิด ไม่กดต่อ กัน toggle)
      if (!acct) {
        // หลัง logout Flow มักเด้งไปหน้า landing เปล่าที่ /fx (ไม่มีทั้ง avatar และปุ่ม Sign in)
        // → บังคับเด้งไปหน้าเครื่องมือ /tools/flow เพื่อให้ modal "Sign in" โผล่มาให้กด
        const onTools = /\/tools\/flow/.test(location.pathname);
        if (!onTools && Date.now() - _navAt > 15000) {
          _navAt = Date.now();
          L("หน้าเปล่า/landing — เด้งไปหน้าเครื่องมือ Flow เพื่อเรียกหน้าเข้าสู่ระบบ");
          location.href = "https://labs.google/fx/th/tools/flow";
          return;
        }
        L("ยังหาปุ่มโปรไฟล์ไม่เจอ รอรอบถัดไป");
        return;
      }
      L("เปิดเมนูบัญชี…");
      await trustedClickEl(acct, L);
      await sleep(1500);
      if (!findSignOut()) L("เปิดเมนูแล้วแต่ยังไม่เห็นปุ่มออกจากระบบใน DOM — รอรอบถัดไป");
    } finally {
      _switchBusy = false;
    }
  }
  delay(runSwitchIfPending, 2500);
  loop(runSwitchIfPending, 5000);

  // ── รันคิวต่อเองหลังสลับบัญชีเสร็จ (หน้า reload ระหว่างสลับ ทำให้ loop เดิมตาย) ──
  async function maybeResumeQueue() {
    if (_queueRunning) return;
    let d;
    try { d = await chrome.storage.local.get(["flow_queue_state", "flow_switch", "flow_jobs"]); } catch { return; }
    const qs = d.flow_queue_state;
    if (!qs || !qs.running) return;                                  // ไม่ได้สั่งให้คิวรันอยู่
    if (!qs.at || Date.now() - qs.at > 5 * 60 * 1000) return;        // สถานะเก่าค้าง > 5 นาที = ไม่ resume (กันรันเองโดยไม่ตั้งใจ)
    if (d.flow_switch) return;                                       // ยังสลับบัญชีไม่เสร็จ
    if (!(Array.isArray(d.flow_jobs) && d.flow_jobs.length)) return; // ไม่มีงานเหลือ
    if (!findAccountButton()) return;                                // ยังไม่ login (หน้า logged out) — รอก่อน
    const L = (m) => { try { chrome.runtime.sendMessage({ action: "flow_log", msg: m }); } catch {} };
    L("สลับบัญชีเสร็จ — รันคิวต่อ");
    runQueue(L).catch(() => {});
  }
  delay(maybeResumeQueue, 6000);
  loop(maybeResumeQueue, 12000);

  // ── Part A: compose ภาพนิ่ง "คนถือสินค้า" ด้วย Nano Banana (โหมดรูปภาพ · 0 เครดิต) ──
  // reuse ช่อง prompt + uploadImage + ปุ่มส่งชุดเดียวกับ video — ต่างแค่สลับโหมดเป็น "รูปภาพ"
  // ผลลัพธ์ = รูปที่ Flow สร้าง (alt="รูปภาพที่สร้างขึ้น") → ใช้เป็น first frame ของ frames-to-video ต่อ
  // ท่าทางในเฟรมเริ่ม "ตามสไตล์" — demo = กำลังใช้งานสินค้าจริง (ไม่ใช่ยืนถือ) จึงจะสาธิตได้ใน i2v
  const STYLE_POSE = {
    demo: (name) => `กำลัง "ใช้งาน" ${name || "สินค้า"} อยู่จริงในจังหวะกลางการใช้ (mid-action) — มือกำลังใช้/ทา/กด/เปิด/สวมใส่/สาธิตสินค้าตามวิธีใช้ที่ถูกต้องของมัน เห็นการใช้งานชัดเจน สินค้า+มือเป็นจุดเด่นกลางเฟรม ไม่ใช่แค่ยืนถือโชว์ ใบหน้ายังเห็นชัด`,
    hardsell: (name) => `ชู ${name || "สินค้า"} ขึ้นใกล้กล้องด้วยพลัง ครึ่งตัว หันหน้าเข้ากล้อง สีหน้ามั่นใจกระตือรือร้นเต็มที่`,
    shock: (name) => `ยก ${name || "สินค้า"} ขึ้นมอง ครึ่งตัว หันหน้าเข้ากล้อง พร้อมสีหน้าตกใจอึ้งเกินจริง (double-take) แบบไม่อยากเชื่อ`,
    selfie: (name) => `ถือ ${name || "สินค้า"} โชว์ใกล้กล้องมุมเซลฟี่ ครึ่งตัว หันหน้าเข้ากล้อง ยิ้มเป็นกันเองเหมือนกำลังรีวิวให้เพื่อนฟัง`,
  };
  const startPoseFor = (style, name) => (STYLE_POSE[style] ? STYLE_POSE[style](name)
    : `ครึ่งตัว หันหน้าเข้ากล้องตรง ๆ ยิ้มเป็นธรรมชาติ ถือ${name || "สินค้า"}ระดับอก`);

  const defaultComposePrompt = (name, bg, pose) =>
    `รวมภาพ: ใช้ "ใบหน้าและบุคคล" จากรูปแรกเป็นหลัก (สำคัญสุด — คงใบหน้า ทรงผม สีผิว ให้เหมือนรูปแรกเป๊ะทุกจุด ห้ามเปลี่ยน) ` +
    `นำ${name || "สินค้า"}จากรูปที่สองมาด้วย — ใช้เฉพาะ "ตัวสินค้า" เท่านั้น ห้ามเอาพื้นหลัง/ตัวอักษร/ป้ายราคา/ลายน้ำ/กรอบ ในรูปที่สองมาด้วย ` +
    `ท่าทาง: ${pose || startPoseFor("", name)} มือจับธรรมชาติ นิ้วครบ ` +
    `★★ พื้นหลัง/ฉากของทั้งภาพต้องเป็น "${bg && bg.trim() ? bg : "ฉากเรียบสะอาดสีพื้น"}" เท่านั้น — สร้างฉากนี้ขึ้นใหม่ ลบ/แทนพื้นหลังเดิมของรูปคนทิ้งทั้งหมด ห้ามคงพื้นหลังเดิม · ภาพแนวตั้ง 9:16 แสงนุ่มสว่าง คมชัด สมจริงเหมือนรูปถ่าย`;

  // ปุ่มโหมด (มุมขวาแถบ prompt) — ข้อความมี "crop_9_16" ทั้งโหมด video และ image
  function findModeBtn() {
    return allClickable().find((el) => /crop_9_16|nano banana|วิดีโอ ·/i.test(el.innerText || "")) || null;
  }
  // หาตัวเลือกในป๊อปอัปโหมด (รูปภาพ/วิดีโอ/เฟรม/ส่วนผสม/1x…) — รองรับทั้ง button และ div, เลือกตัวเล็กสุด (ไม่ใช่ container ครอบ)
  function findModeOption(label) {
    const want = norm(label);
    const cands = [...document.querySelectorAll('button,[role="button"],[role="radio"],[role="tab"],[role="menuitem"],div,span')]
      .filter(isVisible)
      .filter((el) => {
        const t = norm(el.innerText || el.textContent);
        if (/crop_9_16|·|nano banana/i.test(t)) return false;   // ตัด "ปุ่มโหมด" เอง (ไม่ใช่ตัวเลือกในป๊อปอัป)
        return t === want || t.split(/\s+/).includes(want) || (t.includes(want) && t.length <= want.length + 16);   // แยกคำ → เผื่อไอคอนนำหน้ายาว
      })
      // ตัด sidebar ซ้าย (x<110 เช่น "image ดูรูปภาพ") ออก — ป๊อปอัปโหมดอยู่กลาง/ขวาจอเสมอ
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.width <= 340 && r.height > 4 && r.height <= 130 && r.left > 110; });
    cands.sort((a, b) => (a.innerText || a.textContent || "").length - (b.innerText || b.textContent || "").length);
    return cands[0] || null;
  }
  async function clickModeOption(label, log) {
    const el = findModeOption(label);
    if (!el) return false;
    await trustedClickEl(el, log);
    return true;
  }
  // ปุ่มโหมดบอกโหมดปัจจุบันเสมอ: รูปภาพ→มี "nano banana/🍌" · วิดีโอ→มี "วิดีโอ/Ns"
  const modeBtnText = () => { const b = findModeBtn(); return (b && b.innerText) || ""; };
  const isImageMode = () => /nano banana|🍌/i.test(modeBtnText());
  const isVideoMode = () => /วิดีโอ|\bvideo\b|\d+\s*s\b/i.test(modeBtnText());
  // สลับโหมดสร้าง + ★ยืนยันจากปุ่มโหมดจริง★ retry 3 รอบ (กัน setMode หลุด → สร้างผิดโหมด/เสียเครดิต)
  // typeLabel = รูปภาพ/วิดีโอ · subLabel = เฟรม/ส่วนผสม · countLabel = 1x/x2… (ออปชั่น)
  // ช่องเฟรม "เริ่ม"/"สิ้นสุด" เป็น <div> เล็ก ~50x50 ข้อความตรงเป๊ะ (ไม่ใช่ปุ่ม → allClickable หาไม่เจอ)
  function findFrameSlot(label) {
    const want = norm(label);
    return [...document.querySelectorAll('div,span,button,[role="button"]')]
      .filter(isVisible)
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 8 && r.width <= 130 && r.height > 8 && r.height <= 130; })
      .find((el) => norm(el.innerText || el.textContent) === want) || null;
  }
  // โหมด "เฟรม" พร้อม = มีช่องสลอต "เริ่ม" โผล่ที่แถบ prompt
  const framesSubReady = () => !!findFrameSlot("เริ่ม");
  async function setMode(typeLabel, subLabel, countLabel, log) {
    const L = (m) => { try { log && log(m); } catch {} };
    const onTarget = () => {
      if (/รูปภาพ/.test(typeLabel)) return isImageMode();
      if (/วิดีโอ/.test(typeLabel)) return isVideoMode() && (/เฟรม/.test(subLabel || "") ? framesSubReady() : true);  // เฟรม = ต้องมีปุ่มเริ่ม/สิ้นสุด
      return true;
    };
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (onTarget()) { L(`สลับโหมด → ${typeLabel}${subLabel ? " / " + subLabel : ""} ✓ (อยู่โหมดถูกแล้ว)`); return true; }
      const btn = findModeBtn();
      if (!btn) { L("สลับโหมด: ไม่เจอปุ่มโหมด (crop_9_16)"); await sleep(800); continue; }
      // เปิดป๊อปอัปให้ชัวร์ — คลิกปุ่มโหมดจน "เห็นตัวเลือกเป้าหมาย" จริง (สูงสุด 3 ครั้ง) เผื่อคลิกแรกไม่เปิด
      let opt = null;
      for (let k = 0; k < 3 && !opt; k++) { await trustedClickEl(btn, log); await sleep(950); opt = findModeOption(typeLabel); }
      if (!opt) { L(`เปิดป๊อปอัปโหมดไม่สำเร็จ ลองรอบ ${attempt}/4`); await sleep(800); continue; }
      await clickModeOption(typeLabel, log); await sleep(700);
      if (subLabel) { await clickModeOption(subLabel, log); await sleep(650); }
      if (countLabel) { await clickModeOption(countLabel, log); await sleep(550); }   // 1x/x2/x3/x4
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); // ปิดป๊อปอัป
      await sleep(600);
      if (onTarget()) { L(`สลับโหมด → ${typeLabel}${subLabel ? " / " + subLabel : ""} ✓ (ยืนยันจากปุ่มโหมด)`); return true; }
      L(`สลับโหมด → ${typeLabel} ยังไม่ยืนยัน (ปุ่มโหมด: "${modeBtnText().replace(/\s+/g, " ").slice(0, 30)}") ลองรอบ ${attempt}/4`);
      await sleep(800);
    }
    return false;
  }

  // รูปที่ Flow "สร้างขึ้น" ปัจจุบัน (ตัด avatar/ไอคอน) — ใช้หา "รูปใหม่" หลัง generate
  const genImgSrcs = () => [...document.querySelectorAll("img")]
    .filter((im) => /รูปภาพที่สร้างขึ้น|generated/i.test(im.alt || ""))
    .map((im) => im.currentSrc || im.src).filter(Boolean);

  // ตรวจ nano banana ชนขีดจำกัดรายวัน — ข้อความจริง: "ล้มเหลว ... ถึงขีดจำกัดการใช้งานต่อวันแล้ว ลองใช้โมเดลอื่น"
  const nanoLimitHit = () => {
    const t = (document.body && document.body.innerText) || "";
    // ข้อความเฉพาะตอน nano banana ชนลิมิตรายวัน — เจาะจงพอ เลี่ยง false-positive จาก help/tooltip
    return /ถึงขีดจำกัดการใช้งาน|ลองใช้โมเดลอื่น/i.test(t);
  };
  // สลับรุ่น nano banana (เช่น "Nano Banana 2") — ใช้ตอน Pro ชนลิมิตรายวัน
  // dropdown รุ่นอยู่ในป๊อปอัปโหมด: ปุ่ม "🍌 Nano Banana Pro arrow_drop_down" → menuitem รุ่นต่าง ๆ
  async function switchImageModel(targetName, log) {
    const L = (m) => { try { log && log(m); } catch {} };
    const btn = findModeBtn();
    if (!btn) { L("สลับรุ่น: ไม่เจอปุ่มโหมด"); return false; }
    await trustedClickEl(btn, log); await sleep(850);                       // เปิดป๊อปอัปโหมด
    const dd = [...document.querySelectorAll('button,[role="button"]')].filter(isVisible)
      .find((el) => /nano banana/i.test(el.innerText || "") && /arrow_drop_down/i.test(el.innerText || ""));
    if (dd) { await trustedClickEl(dd, log); await sleep(750); }            // เปิด dropdown รุ่น
    const want = norm(targetName);
    const opt = [...document.querySelectorAll('[role="menuitem"],button,[role="button"]')].filter(isVisible)
      .find((el) => { const t = norm(el.innerText || el.textContent); return t.includes(want) && !t.includes("arrow_drop_down") && !t.includes("crop_9_16"); });
    if (!opt) {
      const seen = [...document.querySelectorAll('[role="menuitem"],button')].filter(isVisible).map((el) => norm(el.innerText || el.textContent).slice(0, 22)).filter((t) => /nano|banana/.test(t));
      L(`สลับรุ่น: ไม่เจอรุ่น "${targetName}" — เห็นรุ่น: ${JSON.stringify(seen)}`);
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return false;
    }
    await trustedClickEl(opt, log); await sleep(750);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await sleep(600);
    L(`สลับรุ่น → ${targetName} ${norm(modeBtnText()).includes(want) ? "✓" : "(ลองสร้างดู)"}`);
    return true;
  }

  // เฟรมจบ (CTA) — สร้าง "จากเฟรมเริ่ม" เปลี่ยนแค่ท่าชี้ตะกร้า → คน/หน้า/ของ/ฉากเหมือนเป๊ะ Veo เดินทางสั้น นิ่งสุด
  // กฎกายวิภาคมือ (กัน "มือที่ 3"/นิ้วเกิน ที่ nano banana ชอบงอกตอนสั่งสองมือทำคนละอย่าง)
  const HANDS_RULE = `กายวิภาคถูกต้อง 100%: ร่างกายมี "แค่ 2 แขน 2 มือเท่านั้น" นิ้วครบ 5 ต่อมือ ห้ามมีมือที่สาม ห้ามแขน/มือ/นิ้วเกิน ห้ามมือผิดรูปหรือซ้อนกัน`;
  const endComposePrompt = () =>
    `แก้ภาพอ้างอิงนี้ คงบุคคล ใบหน้า ทรงผม เสื้อผ้า สินค้า ฉาก แสง พื้นหลัง ให้เหมือนเดิมเป๊ะทุกอย่าง ห้ามเปลี่ยนหน้า/เปลี่ยนสินค้า — ` +
    `เปลี่ยนเฉพาะท่า: "มือซ้าย" ถือสินค้าไว้ระดับอก, "มือขวา" ยกขึ้นชี้นิ้วลงล่างชัดเจน (ชี้ปุ่มตะกร้าใต้จอ) สีหน้ามั่นใจ ยิ้มมองกล้อง — ` +
    `${HANDS_RULE} — ครึ่งตัว แนวตั้ง 9:16 เว้นที่ว่างครึ่งล่างของเฟรมไว้สำหรับปุ่มตะกร้า`;

  // ── รวม 2 รูปเป็นภาพเดียว (ซ้าย=หน้า | ขวา=สินค้า) → แนบ reference ครั้งเดียว ──
  // แนบรูปเดียวเชื่อถือได้กว่าแนบ 2 รอบ (เลี่ยงเมนู ⋮ portal ที่ไล่จับยากเมื่อมีหลาย tile)
  async function combineRefs(url1, url2) {
    const load = async (u) => {
      const blob = await (await fetch(u)).blob();
      return await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error("โหลดรูปไม่ได้"));
        img.src = URL.createObjectURL(blob);
      });
    };
    const [a, b] = await Promise.all([load(url1), load(url2)]);
    const H = 768;                                              // สูงเท่ากัน ปรับกว้างตามสัดส่วน
    const w1 = Math.max(1, Math.round(a.width * H / a.height));
    const w2 = Math.max(1, Math.round(b.width * H / b.height));
    const gap = 24;
    const cv = document.createElement("canvas");
    cv.width = w1 + gap + w2; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(a, 0, 0, w1, H);
    ctx.drawImage(b, w1 + gap, 0, w2, H);
    return cv.toDataURL("image/jpeg", 0.92);
  }
  // re-encode รูป (ผ่าน canvas) → bytes เปลี่ยน เพื่อให้ Flow ไม่ dedupe ตอน re-upload รูปที่เคยมีใน library
  // ใช้กับ "เอาเฟรมเริ่ม (Flow สร้าง) มาเป็น ref เฟรมจบ" — labs.google same-origin จึงไม่ taint canvas
  async function reencode(url) {
    const blob = await (await fetch(url)).blob();
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("โหลดรูปไม่ได้"));
      i.src = URL.createObjectURL(blob);
    });
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth || img.width; cv.height = img.naturalHeight || img.height;
    cv.getContext("2d").drawImage(img, 0, 0);
    return cv.toDataURL("image/jpeg", 0.95);
  }

  // prompt เฟรมเริ่มแบบ collage (อ้างอิงครึ่งซ้าย/ขวาของรูปรวม)
  const collageStartPrompt = (name, bg, pose) =>
    `ภาพอ้างอิงนี้วาง 2 รูปคู่กัน: "ครึ่งซ้าย = ใบหน้า/ตัวบุคคล" และ "ครึ่งขวา = ${name || "สินค้า"}" — ` +
    `สร้างภาพใหม่ 1 ภาพ ให้บุคคลจากครึ่งซ้าย (ใช้${name || "สินค้า"}จากครึ่งขวา) ${pose || startPoseFor("", name)} · ` +
    `คงใบหน้า ทรงผม สีผิว ให้เหมือนครึ่งซ้ายเป๊ะทุกจุด ห้ามเปลี่ยนหน้า · คงรูปทรง สี ฉลาก สินค้าให้เหมือนครึ่งขวาเป๊ะ · ` +
    `★★ พื้นหลัง/ฉากของทั้งภาพต้องเป็น "${bg && bg.trim() ? bg : "ฉากเรียบสะอาดสีพื้น"}" เท่านั้น — สร้างฉากนี้ขึ้นใหม่ทั้งหมดรอบตัวบุคคล · ลบ/แทนที่พื้นหลังเดิมของรูปอ้างอิง(ครึ่งซ้าย รูปคน)ทิ้งทั้งหมด ห้ามคงพื้นหลังเดิมจากรูปอ้างอิงเด็ดขาด · ` +
    `มือจับธรรมชาตินิ้วครบ แนวตั้ง 9:16 แสงนุ่มสว่าง สมจริงเหมือนรูปถ่าย`;
  // prompt เฟรมจบแบบ collage — คน/สินค้าเดิม แต่ท่าชี้ตะกร้า (ใช้ collage เดียวกับเฟรมเริ่ม → แนบชัวร์ หน้าเป๊ะเท่ากัน)
  const endCollagePrompt = (name) =>
    `ภาพอ้างอิงนี้วาง 2 รูปคู่กัน: "ครึ่งซ้าย = ใบหน้า/ตัวบุคคล" และ "ครึ่งขวา = ${name || "สินค้า"}" — ` +
    `สร้างภาพใหม่ 1 ภาพ: บุคคลจากครึ่งซ้าย "มือซ้าย" ถือ${name || "สินค้า"}จากครึ่งขวาระดับอก "มือขวา" ชี้นิ้วลงล่างชัดเจน (ชี้ปุ่มตะกร้าใต้จอ) สีหน้ามั่นใจ ยิ้มมองกล้อง · ` +
    `${HANDS_RULE} · คงใบหน้า ทรงผม สีผิว ให้เหมือนครึ่งซ้ายเป๊ะ ห้ามเปลี่ยนหน้า · คงสินค้าเหมือนครึ่งขวาเป๊ะ ห้ามเอาพื้นหลัง/ตัวอักษรในรูปมาด้วย · ` +
    `ครึ่งตัว แนวตั้ง 9:16 เว้นที่ว่างครึ่งล่างของเฟรมให้ปุ่มตะกร้า พื้นหลังเรียบสะอาดสีพื้น แสงนุ่มสว่าง สมจริงเหมือนรูปถ่าย`;

  // เตรียม ref + prompt สำหรับ "เฟรมเริ่ม" — รวมรูปถ้าได้ (แนบเดียว) ไม่ได้ค่อย fallback แนบ 2 รูป
  async function startRefsAndPrompt(faceUrl, productUrl, name, optPrompt, log, bg, pose) {
    try {
      const combined = await combineRefs(faceUrl, productUrl);
      log("รวมหน้า+สินค้าเป็นรูปเดียว ✓ (แนบครั้งเดียว)");
      return { refs: [combined], prompt: optPrompt || collageStartPrompt(name, bg, pose) };
    } catch (e) {
      log(`รวมรูปไม่สำเร็จ (${e && e.message || e}) → แนบ 2 รูปแยกแทน`);
      return { refs: [faceUrl, productUrl], prompt: optPrompt || defaultComposePrompt(name, bg, pose) };
    }
  }

  // ── core: สร้างรูป 1 ใบ จาก refs[] (dataURL/URL) + prompt ในโหมดรูปภาพ nano banana (ฟรี) ──
  async function genImage({ refs, prompt, count, log }) {
    await ensureChatPage(log);
    // รอแถบ prompt (ปุ่มโหมด crop_9_16) โผล่ก่อน — เผื่อเพิ่งเปิดโปรเจ็คใหม่/หน้ายังโหลด (กัน setMode พังเพราะปุ่มโหมดยังว่าง)
    if (!findModeBtn()) { log("รอแถบ prompt โหลด…"); await waitFor(findModeBtn, 25000, 800); }
    const modeOk = await setMode("รูปภาพ", null, count || null, log);   // โหมดรูปภาพ (nano banana · 0 เครดิต)
    // ★ guard #1: ยืนยันโหมดรูปภาพไม่ได้ → ยกเลิกก่อนแนบ/สร้าง (กันเผลอสร้างในโหมดวิดีโอเสีย 15 เครดิต/รูป)
    if (!modeOk || !isImageMode()) return { ok: false, error: `ยกเลิกกันเสียเครดิต — ยืนยันโหมดรูปภาพ (0 เครดิต) ไม่ได้ (ปุ่มโหมด: "${modeBtnText().slice(0, 30)}")`, uploads: [] };
    await sleep(1500);                                          // ให้ UI นิ่งก่อนแนบ (กันรูปแรกแนบไม่ติด)
    const uploads = [];
    for (let i = 0; i < refs.length; i++) {
      log(`แนบรูปอ้างอิงที่ ${i + 1}…`);
      const u = await uploadImage(refs[i], log);   // ใช้วิธีแนบจริง (เมนู ⋮ "เพิ่มไปยังพรอมต์")

      log(u.ok ? `รูป ${i + 1}: อัปแล้ว ${u.addedToPrompt ? "+ เข้าพรอมต์ ✓" : "แต่ยังไม่เข้าพรอมต์ ✗"}` : `รูป ${i + 1} อัปไม่สำเร็จ: ${u.error}`);
      uploads.push(u);
      await sleep(1200);                                        // เว้นจังหวะก่อนรูปถัดไป
    }
    const box = await waitFor(findEditable, 15000);
    if (!box) return { ok: false, error: "ไม่พบช่องพิมพ์ prompt", uploads };
    const mac = /Mac/i.test(navigator.platform);
    const typedOk = () => match(boxText(box), prompt) && !placeholderVisible();
    for (let attempt = 1; attempt <= 2 && !typedOk(); attempt++) {
      await trustedClickEl(box, log); await sleep(350);
      const had = boxText(box) && !placeholderVisible();
      await sendTrusted({ action: "flow_trusted_type", text: prompt, clear: had, mac });
      await sleep(700);
    }
    if (!typedOk()) return { ok: false, error: `พิมพ์ prompt ไม่สำเร็จ — ในช่อง "${boxText(box).slice(0, 30)}"`, uploads };
    log("พิมพ์ prompt แล้ว ✓");
    // ★ guard #2: ยืนยันโหมดรูปภาพอีกรอบก่อน "กดส่ง" (เผื่อหลุดโหมดระหว่างแนบรูป) — กันเสีย 15 เครดิต
    if (!isImageMode()) return { ok: false, error: `ยกเลิกก่อนกดส่ง — หลุดจากโหมดรูปภาพ (ปุ่มโหมด: "${modeBtnText().slice(0, 30)}")`, uploads };
    const editor = realEditable(box);
    const mac2 = /Mac/i.test(navigator.platform);
    // ── ส่ง + รอผล · ชนลิมิตรุ่น Pro → สลับ "Nano Banana 2" แล้วพิมพ์+ส่งใหม่ (ครั้งเดียว กัน loop) ──
    let switched = false;
    for (let pass = 0; pass < 2; pass++) {
      if (pass > 0) {   // รอบสลับรุ่น: ช่องถูกเคลียร์ตอนส่งแล้ว → พิมพ์ prompt ใหม่
        for (let a = 1; a <= 2 && !typedOk(); a++) { await trustedClickEl(box, log); await sleep(350); const had = boxText(box) && !placeholderVisible(); await sendTrusted({ action: "flow_trusted_type", text: prompt, clear: had, mac: mac2 }); await sleep(700); }
        if (!typedOk()) return { ok: false, error: "พิมพ์ prompt ใหม่ไม่สำเร็จหลังสลับรุ่น", uploads };
      }
      const beforeImgs = new Set(genImgSrcs());                 // จำรูปก่อนส่งรอบนี้
      await sleep(rand(900, 2500));                             // หยุดเหมือนคนทบทวนก่อนกดส่ง
      const before2 = boxText(box);
      await trustedClickEl(editor, log); await sleep(300);
      await sendTrusted({ action: "flow_trusted_key" }); await sleep(1500);
      if (boxText(box) === before2) {
        const sendBtn = allClickable().filter((el) => { const t = txt(el); return t.includes("สร้าง") && !t.includes("add_2") && !t.includes("เพิ่มสื่อ"); }).sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0];
        if (sendBtn) { await trustedClickEl(sendBtn, log); await sleep(1500); }
      }
      log("รอ Nano Banana สร้างรูป…");
      // เช็กลิมิตเฉพาะรอบแรก — รอบสลับรุ่นรอแค่ "รูปใหม่" (กัน false-positive จากข้อความ error เก่าที่ค้างใน DOM)
      const res = await waitFor(() => {
        if (pass === 0 && nanoLimitHit()) return { limit: true };
        const n = genImgSrcs().filter((s) => !beforeImgs.has(s));
        return n.length ? { images: n } : null;
      }, 2 * 60 * 1000, 3000);
      if (!res) return { ok: false, error: "รอรูปผลลัพธ์นานเกินไป (timeout)", uploads };
      if (res.limit) {
        if (!switched) {
          log("Nano Banana Pro ชนลิมิตรายวัน → สลับเป็น Nano Banana 2 แล้วสร้างใหม่");
          if (await switchImageModel("Nano Banana 2", log)) { switched = true; continue; }   // วนไปส่งใหม่ด้วยรุ่นใหม่
          log("สลับรุ่นไม่สำเร็จ");
        }
        try { chrome.runtime.sendMessage({ action: "nano_quota", message: "Nano Banana ถึงขีดจำกัดการใช้งานต่อวันแล้ว (ทั้ง Pro และ Nano Banana 2) — สลับบัญชี (เมลอื่น) หรือรอวันถัดไป" }); } catch {}
        return { ok: false, error: "nano_limit", nanoLimit: true, uploads };
      }
      // ★ รอจน "สร้างเสร็จจริง" — Nano อาจโชว์ src รูปตอนยังเรนเดอร์ไม่จบ ถ้ารีบไปเลือกเฟรมจะคลิกไม่ติด
      log("รอให้สร้างรูปเสร็จสมบูรณ์…");
      await waitFor(() => !isGenerating() ? true : null, 90000, 1500);     // จนไม่มี spinner/progress
      let prevCount = -1, stable = 0;
      await waitFor(() => {                                                 // จำนวนรูปใหม่ "นิ่ง" 2 รอบติด = เจนจบ ไม่ทยอยออกแล้ว
        const c = genImgSrcs().filter((s) => !beforeImgs.has(s)).length;
        if (c > 0 && c === prevCount) stable++; else { stable = 0; prevCount = c; }
        return stable >= 2 ? true : null;
      }, 30000, 1500);
      await sleep(2500);                                                   // settle ให้รูปพร้อมในคลัง/picker ก่อนไปเลือกเฟรม
      const finalImgs = genImgSrcs().filter((s) => !beforeImgs.has(s));
      const imgs = finalImgs.length ? finalImgs : res.images;
      log(`สร้างรูปเสร็จสมบูรณ์ ✓ ${imgs.length} รูป`);
      return { ok: true, images: imgs, uploads };
    }
  }

  // เติม face/product/ชื่อสินค้า จาก storage ถ้าไม่ได้ส่งมา (flow_char_img + products[0])
  async function resolveComposeInputs(opts) {
    let { faceUrl, productUrl, name, bg, style } = opts;
    try {
      const d = await chrome.storage.local.get(["flow_char_img", "products", "flow_gen"]);
      faceUrl = faceUrl || d.flow_char_img;
      const p = (d.products || [])[0];
      if (!productUrl) productUrl = (p && ((p.images_b64 || [])[0] || (p.images || [])[0])) || null;
      if (!name) name = p && p.basic_info && p.basic_info.name;
      const g = d.flow_gen || {};
      if (!bg) bg = (g.bgPrompt || g.bgName || "").trim();   // ฉากที่เลือกใน modal → ใส่ลงเฟรม
      if (!style) style = g.style || "";                      // สไตล์ → คุมท่าทางในเฟรมเริ่ม (demo = ใช้งานจริง)
    } catch {}
    return { faceUrl, productUrl, name, bg, style };
  }
  const mkLog = (opts) => {
    const steps = [];
    const base = opts._log || ((m) => { try { chrome.runtime.sendMessage({ action: "flow_log", msg: "[compose] " + m }); } catch {} });
    return { steps, log: (m) => { steps.push(m); try { base(m); } catch {} } };
  };

  // เฟรมเริ่มอย่างเดียว (เทส) — ภาพ "คนถือสินค้า"
  async function composeStill(opts = {}) {
    const { steps, log } = mkLog(opts);
    const { faceUrl, productUrl, name, bg, style } = await resolveComposeInputs(opts);
    if (!faceUrl) return { ok: false, error: "ไม่มีรูปหน้า (flow_char_img) — ตั้งค่าตัวละครก่อน", steps };
    if (!productUrl) return { ok: false, error: "ไม่มีรูปสินค้า — สแครปสินค้าก่อน", steps };
    if (bg) log(`ฉากหลังตามที่เลือก: ${bg.slice(0, 40)}`);
    const pose = startPoseFor(style, name);
    if (style === "demo") log("สไตล์ demo → เฟรมเริ่มเป็น 'กำลังใช้งานสินค้า' (สาธิตจริง)");
    const { refs, prompt } = await startRefsAndPrompt(faceUrl, productUrl, name, opts.prompt, log, bg, pose);
    const r = await genImage({ refs, prompt, count: opts.count || "1x", log });
    return { ...r, steps };
  }
  window._flowCompose = composeStill;   // เทส: _flowCompose()

  // เฟรมเริ่ม + เฟรมจบ (CTA) — เฟรมจบสร้าง "จากเฟรมเริ่ม" ให้คน/ของ/ฉากเหมือนกัน → Veo interpolate นิ่ง
  async function composePair(opts = {}) {
    const { steps, log } = mkLog(opts);
    const { faceUrl, productUrl, name, bg, style } = await resolveComposeInputs(opts);
    if (!faceUrl) return { ok: false, error: "ไม่มีรูปหน้า (flow_char_img)", steps };
    if (!productUrl) return { ok: false, error: "ไม่มีรูปสินค้า", steps };
    const pose = startPoseFor(style, name);
    log(style === "demo" ? "=== [1/2] สร้างเฟรมเริ่ม: กำลังใช้งานสินค้า (สาธิตจริง) ===" : "=== [1/2] สร้างเฟรมเริ่ม: คนถือสินค้า ===");
    const sp = await startRefsAndPrompt(faceUrl, productUrl, name, opts.prompt, log, bg, pose);
    const start = await genImage({ refs: sp.refs, prompt: sp.prompt, count: opts.count || "1x", log });
    if (!start.ok) return { ok: false, stage: "start", error: start.error, steps };
    const startUrl = start.images[start.images.length - 1];
    log("=== [2/2] สร้างเฟรมจบ: ชี้ตะกร้า CTA (จากเฟรมเริ่ม เพื่อความต่อเนื่อง) ===");
    let end;
    const reenc = await reencode(startUrl).catch((e) => { log(`re-encode เฟรมเริ่มไม่ได้ (${(e && e.message) || e}) → ใช้ collage แทน`); return null; });
    if (reenc) {
      log("เอาเฟรมเริ่ม re-encode → ใช้เป็น ref เฟรมจบ (คน/ฉาก/แสงต่อเนื่องสุด)");
      end = await genImage({ refs: [reenc], prompt: opts.endPrompt || endComposePrompt(), count: "1x", log });
    } else {
      end = await genImage({ refs: sp.refs, prompt: opts.endPrompt || endCollagePrompt(name), count: "1x", log });
    }
    if (!end.ok) return { ok: false, stage: "end", error: end.error, startImage: startUrl, steps };
    const endUrl = end.images[end.images.length - 1];
    log("เสร็จ ✓ ได้เฟรมเริ่ม + เฟรมจบ");
    return { ok: true, startImage: startUrl, endImage: endUrl, steps };
  }
  window._flowComposePair = composePair;   // เทส: _flowComposePair()

  // ── Part B: frames-to-video — เอาเฟรมเริ่ม/จบ (จาก composePair) ไปสร้างคลิป (15 เครดิต) ──
  const mediaUuid = (u) => (String(u).match(/name=([0-9a-f-]+)/i) || [])[1] || null;
  const defaultMotionPrompt = (name) =>
    `แอนิเมชันนุ่มนวลต่อเนื่องจากเฟรมเริ่ม ~8-10 วิ: บุคคลพูดแนะนำ${name || "สินค้า"}อย่างมั่นใจ ยิ้มแย้ม ` +
    `ขยับเล็กน้อยเป็นธรรมชาติ (กระพริบตา ขยับมือถือสินค้าเบา ๆ) แล้วปิดท้ายด้วยการชี้นิ้วลงล่างชวนกดปุ่มตะกร้า — ` +
    `กล้องนิ่ง หน้าตรงเข้ากล้องตลอด ตัวละครอยู่กลางเฟรมไม่ออกนอกจอ ใบหน้าคงเดิมเป๊ะทุกวินาที แนวตั้ง 9:16 ไม่มีซับไตเติล ไม่มีตัวหนังสือ`;

  // กดปุ่ม เริ่ม/สิ้นสุด → เปิด picker → คลิก option ที่ตรง uuid ของรูปเรา
  async function pickFrame(btnLabel, imageUrl, log) {
    const uuid = mediaUuid(imageUrl);
    const pickerOpen = () => document.querySelectorAll('[role="option"]').length > 0;
    const isSet = () => !pickerOpen() || !findFrameSlot(btnLabel);   // สำเร็จ = picker ปิดหลังคลิก (เหมือนกรณีที่ติด) หรือช่องไม่เหลือ label
    for (let attempt = 1; attempt <= 3; attempt++) {
      const slot = findFrameSlot(btnLabel);
      if (!slot) { log(`ช่อง "${btnLabel}" ตั้งรูปไว้แล้ว ✓`); return true; }
      await trustedClickEl(slot, log); await sleep(1200);
      const tab = [...document.querySelectorAll('[role="tab"]')].find((t) => /รูปภาพ|image/i.test(t.innerText || ""));
      if (tab) { await trustedClickEl(tab, log); await sleep(800); }   // แท็บ "รูปภาพ" (รูปที่ Flow สร้าง)
      await waitFor(() => (document.querySelectorAll('[role="option"]').length ? true : null), 8000, 400);
      const list = [...document.querySelectorAll('[role="option"]')];
      log(`picker "${btnLabel}" รอบ${attempt}: ${list.length} ตัวเลือก หา uuid ${uuid ? uuid.slice(0, 8) : "?"}`);
      const target = uuid ? list.find((o) => { const im = o.querySelector("img"); return (((im && (im.currentSrc || im.src)) || "")).includes(uuid); }) : null;
      if (!target) {
        const srcs = list.slice(0, 5).map((o) => { const im = o.querySelector("img"); return ((im && (im.currentSrc || im.src)) || "(no img)").slice(-34); });
        log(`ไม่เจอ uuid ตรง — img srcs ตัวอย่าง: ${JSON.stringify(srcs)}`);
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await sleep(400);
        return false;
      }
      // ลองหลายวิธีคลิก — UI Flow บางเวอร์ชันต้องคลิก "การ์ด option" ไม่ใช่รูปย่อ หรือมีปุ่มยืนยัน
      try { target.scrollIntoView({ block: "center" }); } catch {}
      const clickEls = [target, target.querySelector("img")].filter(Boolean);
      let picked = false;
      for (const el of clickEls) {
        await trustedClickEl(el, log); await sleep(1600);
        if (isSet()) { picked = true; break; }
        // ป๊อปอัปอาจมีปุ่มยืนยัน (ใช้/เลือก/เพิ่ม/ตกลง/use/select/done)
        const conf = allClickable().find((c) => {
          const t = (c.innerText || "").trim();
          return t.length < 18 && /^(ใช้|เลือก|เพิ่ม|เสร็จ|ตกลง)$|ใช้รูปนี้|เลือกรูปนี้|^use$|use this|^select$|^done$|^add$/i.test(t);
        });
        if (conf) { await trustedClickEl(conf, log); await sleep(1500); if (isSet()) { picked = true; break; } }
      }
      if (picked) { log(`เลือกเฟรม "${btnLabel}" ✓`); return true; }
      log(`ช่อง "${btnLabel}" ยังว่างหลังเลือก (picker เปิด=${pickerOpen()} · slot=${!!findFrameSlot(btnLabel)}) — ลองรอบ ${attempt}/3`);
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await sleep(500);
    }
    return false;
  }

  async function framesToVideo(opts = {}) {
    const { steps, log } = mkLog(opts);
    const { startUrl } = opts;
    const dry = opts.dry !== false;   // ★ default = dry (ไม่กดส่ง) กันเผลอเสีย 15 เครดิต
    if (!startUrl) return { ok: false, error: "ต้องมี startUrl", steps };
    let name = opts.name; try { const d = await chrome.storage.local.get("products"); name = name || ((d.products || [])[0]?.basic_info?.name); } catch {}
    await ensureChatPage(log);
    const fmOk = await setMode("วิดีโอ", "เฟรม", null, log);
    if (!fmOk) return { ok: false, error: "เข้าโหมดเฟรม (frames-to-video) ไม่สำเร็จ — ปุ่มเริ่ม/สิ้นสุดไม่ขึ้น", steps };
    await sleep(900);
    log("เลือกเฟรมเริ่ม… (โมเดลรับเฉพาะเฟรมเริ่ม ไม่ใส่เฟรมจบ)");
    const okS = await pickFrame("เริ่ม", startUrl, log);
    if (!okS) return { ok: false, error: "เลือกเฟรมเริ่มไม่สำเร็จ", steps };
    const motion = opts.prompt || defaultMotionPrompt(name);
    const box = await waitFor(findEditable, 15000);
    if (!box) return { ok: false, error: "ไม่พบช่องพิมพ์ prompt", steps };
    const mac = /Mac/i.test(navigator.platform);
    const typedOk = () => match(boxText(box), motion) && !placeholderVisible();
    for (let attempt = 1; attempt <= 2 && !typedOk(); attempt++) {
      await trustedClickEl(box, log); await sleep(350);
      const had = boxText(box) && !placeholderVisible();
      await sendTrusted({ action: "flow_trusted_type", text: motion, clear: had, mac });
      await sleep(700);
    }
    if (!typedOk()) return { ok: false, error: "พิมพ์ prompt ไม่สำเร็จ", steps };
    log("ตั้งเฟรมเริ่ม + พิมพ์ prompt ครบ ✓");
    if (dry) { log("[dry] ไม่กดส่ง — ไม่เสีย 15 เครดิต · ตรวจหน้าจอว่าเฟรมเริ่มถูกไหม"); return { ok: true, dry: true, steps }; }
    // guard: ยืนยันยังอยู่โหมดวิดีโอก่อนกดส่ง 15 เครดิต (สมมาตรกับ genImage)
    if (!isVideoMode()) return { ok: false, error: `ยกเลิกก่อนส่ง — ไม่ได้อยู่โหมดวิดีโอ (ปุ่มโหมด: "${modeBtnText().replace(/\s+/g, " ").slice(0, 30)}")`, steps };
    // ── ส่งจริง (15 เครดิต) ── จำคลิปเดิม "ก่อน" ส่ง เพื่อหยิบเฉพาะคลิปใหม่
    const srcOf = (v) => v.src || v.querySelector("source")?.src || "";
    const beforeSrcs = new Set([...document.querySelectorAll(getSelector("video", "video"))].map(srcOf).filter(Boolean));
    await sleep(rand(2000, 5000));   // หยุดเหมือนคนก่อนกดสร้างจริง (15 เครดิต) — ลดจังหวะหุ่นยนต์
    const before2 = boxText(box);
    await trustedClickEl(realEditable(box), log); await sleep(300);
    await sendTrusted({ action: "flow_trusted_key" }); await sleep(1500);
    if (boxText(box) === before2) {
      const sendBtn = allClickable().filter((el) => { const t = txt(el); return t.includes("สร้าง") && !t.includes("add_2") && !t.includes("เพิ่มสื่อ"); }).sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0];
      if (sendBtn) { await trustedClickEl(sendBtn, log); await sleep(1500); }
    }
    log("ส่งสร้างคลิปแล้ว (15 เครดิต) — รอ Veo สร้างวิดีโอ…");
    // ── รอ Veo + ดาวน์โหลด (reuse logic จาก runGenerate) ──
    const newSrcs = () => [...document.querySelectorAll(getSelector("video", "video"))].map(srcOf).filter((s) => s && !beforeSrcs.has(s));
    const first = await waitFor(() => (newSrcs().length ? newSrcs() : null), 6 * 60 * 1000, 4000);
    if (!first) return { ok: false, error: "รอวิดีโอนานเกินไป (timeout)", steps };
    const collected = new Set(first);
    let lastChange = Date.now(); const settleStart = Date.now();
    while (true) {
      await sleep(4000);
      for (const s of newSrcs()) if (!collected.has(s)) { collected.add(s); lastChange = Date.now(); log(`เจอคลิปเพิ่ม (${collected.size})`); }
      const idle = Date.now() - lastChange;
      if (!isGenerating() && idle > 35000) break;
      if (idle > 180000) { log("เงียบนานเกิน — หยุดเก็บ"); break; }
      if (Date.now() - settleStart > 10 * 60 * 1000) { log("settle timeout"); break; }
    }
    const srcs = [...collected];
    const shortId = (s) => (s.match(/name=([^&]+)/)?.[1] || s).slice(-12);
    log(`วิดีโอเสร็จ ✓ ${srcs.length} คลิป`);
    const stamp = Date.now(); const files = []; const dlResults = [];
    for (let i = 0; i < srcs.length; i++) {
      const fname = `flow/${opts.productId || "clip"}_${stamp}_${i + 1}.mp4`;
      const dl = await sendTrusted({ action: "flow_download", url: srcs[i], filename: fname });
      if (dl.ok) { files.push(fname.split("/").pop()); dlResults.push(dl); }
      log(dl.ok ? `ดาวน์โหลดคลิป ${i + 1}/${srcs.length} ✓ (${shortId(srcs[i])})` : `คลิป ${i + 1} โหลดไม่ได้: ${dl.error}`);
    }
    if (!files.length) return { ok: false, error: "ดาวน์โหลดวิดีโอไม่สำเร็จ", steps };
    // defensive: ไฟล์ผลลัพธ์ต้องเป็นวิดีโอจริง ไม่ใช่ภาพนิ่ง → ถ้าไม่ใช่ หยุด ไม่ส่งไป desktop, ไม่ retry (กันเสียเครดิตซ้ำ)
    const vfy = verifyOutputs(dlResults);
    if (!vfy.ok) {
      const emsg = "ได้ภาพนิ่งแทนวิดีโอ — ลองสร้างใหม่";
      log(`${emsg} (${vfy.reason})`);
      reportProgress("error", emsg, opts.productId);
      return { ok: false, error: emsg, stillImage: true, steps };
    }
    return { ok: true, sent: true, videoSrcs: srcs, files, steps };
  }
  window._flowFramesToVideo = framesToVideo;

  // ── สร้างโปรเจ็คใหม่ (workspace สะอาดต่อคลิป) — คลิปเสร็จ → back → home → "โปรเจ็กต์ใหม่" ──
  async function newProject(log) {
    const L = (m) => { try { log && log(m); } catch {} };
    const findNewBtn = () => allClickable().find((el) => { const t = norm(el.innerText || el.textContent); return /โปรเจ.{0,6}ใหม่|new project/.test(t) || (t.includes("ใหม่") && t.includes("add_2")); });
    // กดย้อนกลับ → รอจน "ออกจากหน้า project" จริง (ถึงหน้ารวมโปรเจ็ค) ก่อนค่อยหาปุ่ม
    // ไปหน้า home: คลิกลิงก์ "Google Flow" (href .../tools/flow) — SPA ไม่ reload เชื่อถือกว่าปุ่ม back · ไม่มีค่อยกด back
    const homeLink = [...document.querySelectorAll('a[href]')].filter(isVisible).find((a) => /\/tools\/flow\/?$/.test((a.getAttribute("href") || "").split("?")[0]));
    if (homeLink) { L("ไปหน้า Flow home (ลิงก์โลโก้)"); await trustedClickEl(homeLink, log); }
    else { const back = allClickable().find((el) => /arrow_back|ย้อนกลับ/i.test((el.innerText || "") + " " + (el.getAttribute("aria-label") || ""))); if (back) { L("กดย้อนกลับ → หน้ารวมโปรเจ็ค"); await trustedClickEl(back, log); } else L("ไม่เจอทางกลับ home"); }
    await waitFor(() => (!/\/project\//.test(location.href) || findNewBtn()) ? true : null, 10000, 500);
    await sleep(1500);
    const newBtn = await waitFor(findNewBtn, 20000, 700);   // อดทนขึ้น เผื่อหน้า home โหลดช้า
    if (!newBtn) { L(`สร้างโปรเจ็คใหม่: ไม่เจอปุ่ม 'โปรเจ็กต์ใหม่' (url: ${location.pathname})`); return false; }
    const beforeUrl = location.href;
    await trustedClickEl(newBtn, log);
    const ok = await waitFor(() => (/\/project\//.test(location.href) && location.href !== beforeUrl) ? true : null, 15000, 500);
    await sleep(1800);
    L(ok ? `สร้างโปรเจ็คใหม่ ✓ (${location.href.slice(-12)})` : "สร้างโปรเจ็คใหม่: ยังไม่เห็น URL โปรเจ็คใหม่");
    return !!ok;
  }
  window._flowNewProject = () => newProject((m) => { try { chrome.runtime.sendMessage({ action: "flow_log", msg: "[compose] " + m }); } catch {} });

  // ครบวงจร: compose เฟรมเริ่ม+จบ (ฟรี) → frames-to-video — default dry กันเสียเครดิต
  async function makeClip(opts = {}) {
    // โมเดลรับเฉพาะเฟรมเริ่ม → compose แค่เฟรมเดียว (ท่าชี้ตะกร้าไปอยู่ใน prompt การเคลื่อนไหวแทน)
    const start = await composeStill(opts);
    if (!start.ok) return { ...start, phase: "compose" };
    const startUrl = start.images[start.images.length - 1];
    const v = await framesToVideo({ startUrl, dry: opts.dry !== false, prompt: opts.motionPrompt, productId: opts.productId, name: opts.name, _log: opts._log });
    // ★ เปิดโปรเจ็คใหม่ทำที่ runQueue "หลังเอา job ออกจากคิว" (กันสร้างซ้ำ ถ้า navigate ทำ context ตายก่อน shift)
    // ปกคลิป = เฟรมแรกของวิดีโอ → desktop ดึงด้วย ffmpeg ตอนรับคลิป (ไม่ gen)
    return { ok: v.ok, dry: v.dry, startImage: startUrl, files: v.files, error: v.error, steps: [...(start.steps || []), ...(v.steps || [])] };
  }
  window._flowMakeClip = makeClip;

  // ── message router ───────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "flow_probe") { sendResponse({ ok: true, probe: probe() }); return true; }
    if (msg.action === "flow_generate") { runGenerate(msg).then(sendResponse); return true; }
    if (msg.action === "flow_compose") { composeStill(msg).then(sendResponse); return true; }
    if (msg.action === "flow_compose_pair") { composePair(msg).then(sendResponse); return true; }
    if (msg.action === "flow_frames_to_video") { framesToVideo(msg).then(sendResponse); return true; }
    if (msg.action === "flow_make_clip") { makeClip(msg).then(sendResponse); return true; }
    if (msg.action === "flow_new_project") { newProject((m) => { try { chrome.runtime.sendMessage({ action: "flow_log", msg: "[compose] " + m }); } catch {} }).then((ok) => sendResponse({ ok })); return true; }
    if (msg.action === "flow_run_queue") {
      runQueue((m) => { try { chrome.runtime.sendMessage({ action: "flow_log", msg: m }); } catch {} }, 100, !!msg.dry)
        .then((n) => sendResponse({ ok: true, done: n, dry: !!msg.dry }));
      return true;
    }
    if (msg.action === "flow_ping") { sendResponse({ ok: true, url: location.href }); return true; }
    if (msg.action === "read_flow_credits") {
      pollFlowCredits().then((r) => sendResponse({ ok: !!(r && r.value != null), credits: r }));
      return true;
    }
    if (msg.action === "read_active_email") {
      readActiveEmail({ openMenu: !!msg.openMenu })
        .then((email) => sendResponse({ ok: !!email, email: email || null, diag: _lastEmailDiag }));
      return true;
    }
    if (msg.action === "flow_switch_account") {
      (async () => {
        try { await chrome.storage.local.set({ flow_switch: { email: msg.email, at: Date.now() } }); } catch {}
        runSwitchIfPending().catch(() => {});
        sendResponse({ ok: true });
      })();
      return true;
    }
  });

  console.log("[Flow Automator] loaded on", location.href);
}
