// ─────────────────────────────────────────────────────────────────────────
// gauth.js — ตัวช่วยฝั่ง accounts.google.com (ทำงานในกรอบย่อย all_frames ด้วย)
// Flow ผูกบัญชีของตัวเอง ไม่สน ?authuser → สลับต้อง logout แล้ว login เลือกบัญชีใหม่
// ไฟล์นี้ทำ 2 หน้าที่:
//   (1) กรอบบัญชี Google ที่ "ฝังอยู่ในหน้า Flow" (เมนูรูปโปรไฟล์) → อ่านอีเมล+เครดิต
//       ที่ login อยู่ ส่งออกมาให้ dashboard โชว์ (flow_active_email / flow_credits_by_email)
//   (2) หน้า "เลือกบัญชี" จริงตอนสลับ → คลิกแถวที่อีเมลตรงเป้าหมายให้อัตโนมัติ
// ─────────────────────────────────────────────────────────────────────────
(() => {
  // กลืน error "Extension context invalidated" ทิ้งก่อน Chrome log (เกิดตอนรีโหลด ext ขณะหน้าเปิดค้าง) — ดักเฉพาะตัวนี้
  const _ctxDead = (m) => /extension context invalidated|context invalidated|message port closed|receiving end does not exist/i.test(String(m || ""));
  window.addEventListener("unhandledrejection", (e) => { if (_ctxDead(e && e.reason && (e.reason.message || e.reason))) e.preventDefault(); });
  window.addEventListener("error", (e) => { if (_ctxDead(e && (e.message || (e.error && e.error.message)))) { e.preventDefault(); return true; } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const FRESH_MS = 3 * 60 * 1000; // flow_switch เก่าเกิน 3 นาที = ยกเลิก (กันค้างคลิกมั่ว)
  const bodyText = () => (document.body && document.body.innerText) || "";
  const emailsIn = (t) => [...new Set((t.match(/[\w.+-]+@[\w.-]+\.\w+/g) || []).map((s) => s.toLowerCase()))];
  const flog = (m) => { try { chrome.runtime.sendMessage({ action: "flow_log", msg: "[สลับ] " + m }); } catch {} };
  let _diagLogged = false; // log สิ่งที่เห็นในกรอบครั้งเดียวต่อการโหลดกรอบ

  // อยู่ในกรอบที่ฝังในหน้า Flow ไหม (กรอบเมนูบัญชี) — ใช้ ancestorOrigins
  function inFlowFrame() {
    try {
      if (window.top === window.self) return false; // top-frame ไม่ใช่กรอบฝัง
      const ao = window.location.ancestorOrigins;
      if (ao) for (let i = 0; i < ao.length; i++) if (/labs\.google/i.test(ao[i])) return true;
    } catch {}
    return false;
  }

  function clickReal(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const opt = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", opt));
    el.dispatchEvent(new MouseEvent("mousedown", opt));
    el.dispatchEvent(new PointerEvent("pointerup", opt));
    el.dispatchEvent(new MouseEvent("mouseup", opt));
    el.dispatchEvent(new MouseEvent("click", opt));
    try { if (typeof el.click === "function") el.click(); } catch {}
  }

  // ── (1) อ่านบัญชีที่ login อยู่ จากกรอบเมนูบัญชีที่ฝังในหน้า Flow ──
  async function reportActiveFromWidget() {
    const ems = emailsIn(bodyText());
    if (ems.length !== 1) return false; // ต้องมีอีเมลเดียว = การ์ดบัญชีที่ login อยู่ (ไม่ใช่ list)
    const email = ems[0];
    const rec = { flow_active_email: { email, at: Date.now() } };
    // อ่านเครดิตจากการ์ด ("50 เครดิต Google Flow") ถ้ามี
    const t = bodyText();
    const m = t.match(/([\d.,]+)\s*(?:เครดิต|credits?)/i) || /(?:เครดิต|credits?)\D{0,12}([\d.,]+)/i.exec(t);
    if (m) {
      const v = parseFloat(String(m[1]).replace(/[, ]/g, ""));
      if (Number.isFinite(v)) {
        try {
          const d = await chrome.storage.local.get("flow_credits_by_email");
          const map = (d.flow_credits_by_email && typeof d.flow_credits_by_email === "object") ? d.flow_credits_by_email : {};
          map[email] = { value: v, at: Date.now(), src: "widget" };
          rec.flow_credits_by_email = map;
        } catch {}
      }
    }
    try { await chrome.storage.local.set(rec); } catch {}
    return true;
  }

  // ── (1b) ถ้ามีคำสั่งสลับค้างอยู่ และเปิดเมนูบัญชีนี้ → จัดการในกรอบนี้เลย ──
  //   ตรงบัญชีแล้ว = เคลียร์ flag · คนละบัญชี = กด "ออกจากระบบ" (ปุ่มนี้อยู่ในกรอบ iframe นี้)
  async function handleSwitchInWidget() {
    let st;
    try { st = await chrome.storage.local.get("flow_switch"); } catch { return false; }
    const sw = st.flow_switch;
    if (!sw || !sw.email) return false;
    if (sw.at && Date.now() - sw.at > FRESH_MS) return false;
    const target = norm(sw.email);
    const ems = emailsIn(bodyText());
    const cur = ems.includes(target) ? target : (ems[0] || null);   // เป้าหมายอยู่ในอีเมลที่เห็น = ถือว่าตรงแล้ว (กัน sign-out ผิดเมื่อการ์ดโชว์หลายอีเมล)
    const out = [...document.querySelectorAll('a,button,[role="button"],[role="menuitem"],[role="link"]')].find((el) =>
      /ออกจากระบบ|sign out|log\s?out/i.test((el.innerText || "") + " " + (el.getAttribute("aria-label") || ""))
    );
    if (!_diagLogged) { _diagLogged = true; flog(`กรอบบัญชี: อีเมลที่เห็น [${ems.join(", ") || "-"}] · ปุ่มออกจากระบบ ${out ? "เจอ" : "ไม่เจอ"}`); }
    if (cur && norm(cur) === target) {
      try { await chrome.storage.local.set({ flow_switch: null, flow_active_email: { email: cur, at: Date.now() } }); } catch {}
      flog(`สำเร็จ — ตอนนี้อยู่บัญชี ${cur}`);
      return true;
    }
    if (out) {
      // ★ cap กันลูป logout/login รัว ๆ = โดน Google จับบอท
      const logouts = (sw.logouts || 0) + 1;
      if (logouts > 2) {
        flog("สลับไม่สำเร็จเกิน 2 รอบ — หยุดกันโดนจับบอท สลับบัญชีเอง");
        try { await chrome.storage.local.set({ flow_switch: null }); } catch {}
        return true;
      }
      try { await chrome.storage.local.set({ flow_switch: { ...sw, logouts } }); } catch {}
      flog(`ออกจากระบบบัญชีเดิม (${cur || "?"}) รอบ ${logouts}/2 → จะเข้าใหม่เป็น ${sw.email}`);
      clickReal(out.closest('a,button,[role="button"],[role="menuitem"],[role="link"]') || out);
      return true;
    }
    return false; // ยังไม่เจอปุ่มออกจากระบบ ลองรอบถัดไป
  }

  // ── (2) หน้า "เลือกบัญชี" จริง → คลิกแถวที่อีเมลตรงเป้าหมาย ──
  function pickAccount(email) {
    const target = norm(email);
    if (!target) return false;
    const tagged = [...document.querySelectorAll("[data-identifier],[data-email]")].find((el) => {
      const id = norm(el.getAttribute("data-identifier") || el.getAttribute("data-email"));
      return id === target;
    });
    if (tagged) {
      clickReal(tagged.closest('li,div[role="link"],div[role="button"],a,button') || tagged);
      return true;
    }
    // ต้องมีอีเมล "ตรงเป๊ะ" ในกล่อง (ไม่ใช่ substring) — กันคลิกผิดแถวเมื่ออีเมลซ้อนกัน (john@gmail vs john@googlemail) หรือเจอในซับไตเติล "ใช้ล่าสุด"
    let hits = [...document.querySelectorAll("li,div,a,button,span")].filter((el) => emailsIn(el.innerText || "").includes(target));
    if (!hits.length) return false;
    hits.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);
    const hit = hits[0];
    clickReal(hit.closest('li,div[role="link"],div[role="button"],a,button') || hit);
    return true;
  }
  function clickContinue() {
    const b = [...document.querySelectorAll('button,[role="button"]')].find((el) =>
      /ดำเนินการต่อ|ต่อไป|ยืนยัน|อนุญาต|continue|allow|confirm|next/i.test(el.innerText || "")
    );
    if (b) { clickReal(b); return true; }
    return false;
  }
  async function runSwitchPicker() {
    let st;
    try { st = await chrome.storage.local.get("flow_switch"); } catch { return; }
    const sw = st.flow_switch;
    if (!sw || !sw.email) return;
    if (sw.at && Date.now() - sw.at > FRESH_MS) return;
    flog(`หน้าเลือกบัญชี (${location.host}) — กำลังหา ${sw.email}`);
    for (let i = 0; i < 30; i++) {
      if (pickAccount(sw.email)) { flog(`คลิกเลือกบัญชี ${sw.email} แล้ว`); return; } // → Google redirect กลับ Flow เอง
      clickContinue();
      await sleep(500);
    }
    flog(`หา ${sw.email} ในหน้าเลือกบัญชีไม่เจอ — เห็นอีเมล: [${emailsIn(bodyText()).join(", ") || "-"}]`);
  }

  // ── เลือกหน้าที่ตามบริบท ──
  (async () => {
    if (inFlowFrame()) {
      // กรอบเมนูบัญชีที่ฝังในหน้า Flow → อ่านอีเมล/เครดิต + จัดการ logout ถ้ามีคำสั่งสลับค้าง
      for (let i = 0; i < 8; i++) {
        await reportActiveFromWidget();
        if (await handleSwitchInWidget()) break; // ออกจากระบบ/ยืนยันบัญชีแล้ว → จบ
        await sleep(700);
      }
      return;
    }
    // หน้า/กรอบบน accounts.google.com ปกติ → ทำหน้าที่เลือกบัญชีตอนสลับ
    runSwitchPicker();
  })();
})();
