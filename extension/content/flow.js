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

  // Lexical รับข้อความจริง = (1) ข้อความอยู่ใน DOM และ (2) placeholder หายแล้ว
  // (ถ้า placeholder ยังโชว์ แปลว่า editorState ยังว่าง → ส่งจะ empty)
  function placeholderVisible() {
    return [...document.querySelectorAll('[class*="laceholder"],[data-placeholder]')]
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
    return [...document.querySelectorAll('button,[role="button"],a,[tabindex]')]
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
      ...document.querySelectorAll('[role="textbox"]'),
      ...document.querySelectorAll('[contenteditable="true"]'),
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
    return [...document.querySelectorAll('input[type="file"]')][0] || null;
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
  async function uploadImage(dataUrl) {
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
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(rand(1500, 2500));
    return { ok: true };
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
    };
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
  async function ensureChatPage(log) {
    // จำ URL ของ project ที่มีช่องแชต (background จะเปิดหน้านี้ตอนสร้างแท็บใหม่)
    if (hasChatBox()) { try { chrome.storage.local.set({ flow_project_url: location.href }); } catch {} }
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
      /get started|เริ่มต้นใช้งาน|เริ่มใช้งาน|โปรเจ.{0,4}ใหม่|สร้างวิดีโอใหม่|new project|create new project/i.test(txt(el));
    if (!hasChatBox()) {
      const found = await waitFor(() => {
        if (hasChatBox()) return "chat";
        return allClickable().find(isStart) || null;
      }, 9000, 600);
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
      } else {
        log("ไม่เจอช่องแชต/ปุ่มเริ่ม — อาจต้องเข้า project บน Flow เองสักครั้ง (flow.js จะจำหน้าไว้)");
      }
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
  async function runGenerate({ prompt, imageDataUrl, productId, _log, dry }) {
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
      const up = await uploadImage(imageDataUrl);
      log(up.ok ? "อัปรูปแล้ว" : `ข้ามรูป: ${up.error}`);
    }
    await human();

    // 🧪 โหมดทดสอบ — หยุดก่อนกดส่ง (ไม่เปลือง Flow credit / Gemini quota)
    if (dry) {
      log("🧪 โหมดทดสอบ: พิมพ์ prompt + อัปรูปครบ แต่ไม่กดส่ง — ไม่เปลืองเครดิต ✓");
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
    const beforeSrcs = new Set([...document.querySelectorAll("video")].map(srcOf).filter(Boolean));

    // Agent อาจขออนุมัติก่อนสร้าง → กด Approve (เลือก "do not ask again" ถ้ามี)
    const approve = await waitFor(() => {
      const dna = findByText(["do not ask again", "ไม่ต้องถามอีก", "อนุมัติและไม่ถามอีก"]);
      if (dna) return dna;
      return findByText(["approve", "อนุมัติ", "ยืนยัน", "ดำเนินการต่อ"]);
    }, 40000, 1500);
    if (approve) { log(`กด Approve: "${txt(approve)}"`); await trustedClickEl(approve, log); await human(); }
    else log("ไม่เจอปุ่ม Approve (อาจตั้ง 'ไม่ถามอีก' ไว้แล้ว) — รอวิดีโอต่อ");

    log("รอ Veo สร้างวิดีโอ…");
    const newSrcs = () => [...document.querySelectorAll("video")].map(srcOf).filter((s) => s && !beforeSrcs.has(s));
    // รอ src ใหม่ตัวแรกโผล่ (สูงสุด 6 นาที)
    const first = await waitFor(() => (newSrcs().length ? newSrcs() : null), 6 * 60 * 1000, 4000);
    if (!first) return { ok: false, error: "รอวิดีโอนานเกินไป (timeout)" };

    // settle: เก็บทุกคลิปที่ agent สร้าง (กี่ตัวก็ได้) — หยุดเมื่อ agent เสร็จจริง + ไม่มีคลิปใหม่
    const collected = new Set(first);
    let lastChange = Date.now();
    const settleStart = Date.now();
    while (true) {
      await sleep(4000);
      for (const s of newSrcs()) if (!collected.has(s)) { collected.add(s); lastChange = Date.now(); log(`เจอคลิปเพิ่ม (${collected.size})`); }
      const idle = Date.now() - lastChange;
      const busy = isGenerating();
      // ช็อตเดียว 8 วิ = 1 คลิป → หยุดเมื่อ agent ไม่สร้าง + ไม่มีคลิปใหม่ 25 วิ
      if (!busy && idle > 25000) break;
      // เผื่อ agent ยังสร้าง แต่เงียบนานมาก (3 นาที) ก็หยุด
      if (idle > 180000) { log("เงียบนานเกิน — หยุดเก็บ"); break; }
      if (Date.now() - settleStart > 10 * 60 * 1000) { log("settle timeout"); break; }
    }
    const srcs = [...collected];
    const uuid = (s) => (s.match(/name=([^&]+)/)?.[1] || s).slice(-12);
    log(`วิดีโอเสร็จ ✓ ${srcs.length} คลิป | uuid: ${srcs.map(uuid).join(", ")}`);

    // ดาวน์โหลดทุกคลิป (chrome.downloads แนบ cookie ให้เอง)
    const stamp = Date.now();
    const files = [];
    for (let i = 0; i < srcs.length; i++) {
      const fname = `flow/${productId || "test"}_${stamp}_${i + 1}.mp4`;
      const dl = await sendTrusted({ action: "flow_download", url: srcs[i], filename: fname });
      if (dl.ok) files.push(fname.split("/").pop());
      log(dl.ok ? `ดาวน์โหลดคลิป ${i + 1}/${srcs.length} ✓ (${uuid(srcs[i])})` : `คลิป ${i + 1} โหลดไม่ได้: ${dl.error}`);
    }
    if (!files.length) return { ok: false, error: "ดาวน์โหลดวิดีโอไม่สำเร็จ" };

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
  // อัปรูป Shopee → ความละเอียดเต็ม (ตัด suffix thumbnail ออก)
  function hiResImage(url) {
    if (!url) return "";
    return url.replace(/@resize_[^/?#]*/i, "").replace(/_tn(?=$|[?#.])/i, "");
  }

  // ขอ prompt จาก background (extension เขียนเอง: template ด้วย JS / AI เรียก Gemini)
  function buildPrompt(product) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ action: "build_prompt", product }, (res) => {
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
  async function runForProduct(product, prompt, log, dry) {
    const p = product || {};
    const bi = p.basic_info || {};
    const name = bi.name || p.product_id || "?";
    log(`สินค้า: ${String(name).slice(0, 40)}`);
    // เตรียมรูป hi-res
    let imageDataUrl = null;
    const url = hiResImage((p.images && p.images[0]) || "");
    if (url) { imageDataUrl = await fetchImageDataUrl(url); log(imageDataUrl ? "โหลดรูป hi-res แล้ว" : "โหลดรูปไม่ได้"); }
    if (!imageDataUrl && p.images_b64 && p.images_b64[0]) imageDataUrl = p.images_b64[0];

    // สั่ง prompt เดียว ระบุ 20 วิ → agent แบ่งเอง ~2 คลิป → เก็บทุกคลิปมาต่อ
    const res = await runGenerate({ prompt, imageDataUrl, productId: p.product_id || "flow", _log: log, dry });
    if (!res.ok) return res;
    if (res.dryRun) return { ok: true, dryRun: true };   // โหมดทดสอบ: ไม่แจ้ง desktop

    // แจ้ง desktop — ส่งทุกคลิปตามลำดับที่เกิด → desktop ต่อด้วย ffmpeg เป็นวิดีโอเดียว
    const link = (p.links || {}).affiliate_link || (p.links || {}).product_url || "";
    const note = await desktop("POST", "/api/flow/video", {
      product_id: p.product_id, name, price: bi.price, sold: bi.sold_count,
      commission: (p.commission || {}).rate, link, files: res.files,
    });
    log(note && note.ok ? `→ desktop ต่อ ${res.files.length} คลิป เข้าคิวโพสต์ ✓ (ตะกร้า: ${link ? "มี" : "ไม่มี!"})` : `แจ้ง desktop ไม่สำเร็จ: ${note && note.error}`);
    return { ok: true, files: res.files };
  }

  // คิวสินค้าอยู่ใน chrome.storage.local.flow_jobs (extension คุมเอง — desktop ไม่ยุ่ง)
  async function runQueue(log, max = 100, dry = false) {
    if (dry) log("🧪 โหมดทดสอบเปิดอยู่ — จะพิมพ์ prompt แต่ไม่กดส่ง (ไม่เปลืองเครดิต)");
    let jobs = ((await chrome.storage.local.get("flow_jobs")).flow_jobs || []).slice();
    const total = jobs.length;
    if (!total) { log("ไม่มีงานในคิว — เลือกสินค้าใน Dashboard แล้วกดสร้างก่อน"); return 0; }
    log(`คิว ${total} ชิ้น (extension คุมคิวเอง)`);
    let done = 0, n = 0;
    while (jobs.length && n < max) {
      n++;
      const product = jobs[0];
      log(`── งานที่ ${n}/${total} ──`);
      let prompt;
      try { prompt = await buildPrompt(product); }
      catch (e) {
        if (e.message === "__BUDGET__") { log("งบเดือนนี้เต็ม — หยุดสร้างชั่วคราว"); break; }
        log("สร้าง prompt ไม่ได้ ข้ามตัวนี้: " + e.message);
        jobs.shift(); if (!dry) await chrome.storage.local.set({ flow_jobs: jobs });
        continue;
      }
      try {
        const r = await runForProduct(product, prompt, log, dry);
        if (r && r.ok) done++; else log(`ข้ามตัวนี้: ${r && r.error}`);
      } catch (e) { log("ERROR: " + e.message); }
      jobs.shift();                                          // เอาออกจากคิว (resume ได้ถ้า reload)
      if (!dry) await chrome.storage.local.set({ flow_jobs: jobs });
      await sleep(2000);
    }
    log(`เสร็จ — ${dry ? "ทดสอบ" : "สร้าง"} ${done} ชิ้น`);
    return done;
  }

  // ── floating panel (CSP-safe, createElement only) ────────────────────
  function mkBtn(label, bg) {
    const b = document.createElement("button");
    b.textContent = label;
    Object.assign(b.style, {
      background: bg, color: "#fff", border: "0", borderRadius: "10px",
      padding: "10px 14px", fontSize: "13px", fontWeight: "600", cursor: "pointer",
      boxShadow: "0 6px 20px rgba(0,0,0,.35)",
    });
    return b;
  }
  function injectPanel() {
    if (document.getElementById("__flow_panel")) return;
    const wrap = document.createElement("div");
    wrap.id = "__flow_panel";
    Object.assign(wrap.style, {
      position: "fixed", bottom: "16px", right: "16px", zIndex: "2147483647",
      fontFamily: "system-ui,sans-serif", display: "flex", flexDirection: "column",
      gap: "8px", alignItems: "flex-end",
    });
    const row = document.createElement("div");
    row.style.display = "flex"; row.style.gap = "6px";
    const probeBtn = mkBtn("🔍 Probe", "#7c3aed");
    const testBtn = mkBtn("▶ ทดสอบ (ใช้เครดิต)", "#0ea5e9");
    const queueBtn = mkBtn("▶▶ คิว desktop", "#16a34a");
    row.append(probeBtn, testBtn, queueBtn);
    const out = document.createElement("textarea");
    out.readOnly = true;
    Object.assign(out.style, {
      display: "none", width: "360px", height: "220px", fontSize: "11px",
      fontFamily: "monospace", background: "#13131f", color: "#9cf",
      border: "1px solid #333", borderRadius: "8px", padding: "8px", resize: "both",
    });
    wrap.append(row, out);
    document.body.appendChild(wrap);

    const show = (s) => { out.style.display = "block"; out.value = s; };
    probeBtn.addEventListener("click", async () => {
      const json = JSON.stringify(probe(), null, 2);
      show(json); out.select();
      try { await navigator.clipboard.writeText(json); probeBtn.textContent = "✓ Copied!"; }
      catch { probeBtn.textContent = "↓ copy ด้านล่าง"; }
      setTimeout(() => (probeBtn.textContent = "🔍 Probe"), 4000);
    });
    testBtn.addEventListener("click", async () => {
      const lines = [];
      const log = (m) => { lines.push(`${new Date().toLocaleTimeString()}  ${m}`); show(lines.join("\n")); };
      testBtn.disabled = true; testBtn.textContent = "กำลังทดสอบ…";
      try {
        const r = await runGenerate({
          prompt: `วิดีโอแนวตั้ง 9:16 ช็อตเดียวต่อเนื่อง 8 วินาที ไม่มีการตัดสลับฉาก คุณภาพระดับโฆษณา สไตล์คอนเทนต์ไวรัล: ผู้หญิงไทยหน้าตาดีวัย 25 สดใสมีพลัง ชูหูฟังบลูทูธไร้สายสีขาวเข้ากล้องแบบ HOOK สะดุดตาในวินาทีแรก ยิ้มกว้างพูดไทยปังๆ ว่า "บอกเลยหูฟังตัวนี้เสียงปังมาก คุ้มสุดๆ แค่ 299 บาทเองนะคะ!" แสงสวยคมชัด สีจัดจ้าน กล้องซูมเข้ามีไดนามิก ฉากไลฟ์สไตล์ทันสมัย`,
          imageDataUrl: null, productId: "manual_test", _log: log,
        });
        log("ผลลัพธ์: " + JSON.stringify(r));
        log("— probe หลังกดส่ง —");
        log(JSON.stringify(probe(), null, 2));
      } catch (e) { log("ERROR: " + e.message); }
      testBtn.disabled = false; testBtn.textContent = "▶ ทดสอบ (ใช้เครดิต)";
    });
    queueBtn.addEventListener("click", async () => {
      const lines = [];
      const log = (m) => { lines.push(`${new Date().toLocaleTimeString()}  ${m}`); show(lines.join("\n")); };
      queueBtn.disabled = true; queueBtn.textContent = "กำลังรันคิว…";
      log("ดึงคิวจาก desktop…");
      try { const n = await runQueue(log); log(`เสร็จ — สร้าง ${n} คลิป`); }
      catch (e) { log("ERROR: " + e.message); }
      queueBtn.disabled = false; queueBtn.textContent = "▶▶ คิว desktop";
    });
  }
  setTimeout(injectPanel, 1500);
  setTimeout(injectPanel, 4000);

  // จำ URL หน้าที่มีช่องแชต agent อัตโนมัติ → รอบสร้างถัดไป background เปิดหน้านี้ตรงๆ
  // (พอผู้ใช้เข้าหน้า chat เองครั้งเดียวก็ถูกจำ ไม่ต้องรันงาน/ไม่เปลืองเครดิต)
  function rememberIfChat() {
    if (hasChatBox()) { try { chrome.storage.local.set({ flow_project_url: location.href }); } catch {} }
  }
  setTimeout(rememberIfChat, 3000);
  setInterval(rememberIfChat, 10000);

  // ── message router ───────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "flow_probe") { sendResponse({ ok: true, probe: probe() }); return true; }
    if (msg.action === "flow_generate") { runGenerate(msg).then(sendResponse); return true; }
    if (msg.action === "flow_run_queue") {
      runQueue((m) => { try { chrome.runtime.sendMessage({ action: "flow_log", msg: m }); } catch {} }, 100, !!msg.dry)
        .then((n) => sendResponse({ ok: true, done: n, dry: !!msg.dry }));
      return true;
    }
    if (msg.action === "flow_ping") { sendResponse({ ok: true, url: location.href }); return true; }
  });

  console.log("[Flow Automator] loaded on", location.href);
}
