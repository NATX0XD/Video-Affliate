// ── shared helpers สำหรับ content scripts (scraper.js + flow.js) ──────────
// inject ก่อน content script หลักเสมอ (ดูลำดับใน manifest.content_scripts.js)
// content scripts ของ extension เดียวกันใช้ isolated world ร่วมกันต่อหน้า →
// expose เป็น window.SAUtil ให้ทั้งสองไฟล์เรียกใช้ก้อนเดียว
(() => {
  if (window.SAUtil) return; // กัน re-inject ตอน SPA นำทาง

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand  = (a, b) => Math.floor(a + Math.random() * (b - a));
  const human = () => sleep(rand(600, 1500)); // หน่วงแบบมนุษย์ กัน ToS

  // trusted-input bridge → background.js (chrome.debugger). คืน { ok, error }
  const sendTrusted = (payload) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (res) => {
          if (chrome.runtime.lastError)
            return resolve({ ok: false, error: chrome.runtime.lastError.message });
          resolve(res || { ok: false, error: "no response" });
        });
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });

  window.SAUtil = { sleep, rand, human, sendTrusted };
})();
