if (window._shopeeScraperLoaded) {
  // already loaded
} else {
  window._shopeeScraperLoaded = true;

  // ── ส่งข้อความหา background อย่างปลอดภัย (กัน "Extension context invalidated" หลัง reload extension) ──
  function extAlive() { return !!(chrome.runtime && chrome.runtime.id); }
  function sendMsg(msg, cb) {
    if (!extAlive()) { console.warn('[scraper] ส่วนขยายถูกรีโหลด — โปรดรีเฟรชหน้านี้ (F5)'); return false; }
    try { chrome.runtime.sendMessage(msg, cb); return true; }
    catch (e) { console.warn('[scraper] sendMessage ล้มเหลว:', e.message); return false; }
  }

  function detectPage() {
    const url = window.location.href;
    if (url.includes('affiliate.shopee.co.th')) return 'affiliate';
    if (url.includes('shopee.co.th') && url.match(/i\.\d+\.\d+/)) return 'product';
    return 'shopee';
  }

  function findProductCards() {
    // หาปุ่ม "เอา ลิงก์" ทุกปุ่ม
    const linkButtons = [...document.querySelectorAll('button, a, div, span')].filter(el => {
      const t = (el.innerText || '').trim();
      return t === 'เอา ลิงก์' || t === 'Get Link' || t === 'รับลิงก์';
    });

    const cards = [];
    const seen = new Set();

    linkButtons.forEach(btn => {
      let parent = btn.parentElement;
      // ขึ้นไป 15 ระดับเพื่อหา card ที่มีรูปและราคา
      for (let i = 0; i < 15; i++) {
        if (!parent || parent === document.body) break;
        const hasImg   = !!parent.querySelector('img');
        const hasPrice = (parent.innerText || '').includes('฿');
        const hasName  = (parent.innerText || '').length > 30;

        if (hasImg && hasPrice && hasName) {
          // ใช้ outerHTML length เป็น key เพื่อกัน duplicate
          const key = parent.className + '_' + Math.round(parent.getBoundingClientRect().top);
          if (!seen.has(key)) {
            seen.add(key);
            cards.push(parent);
          }
          break;
        }
        parent = parent.parentElement;
      }
    });

    return cards;
  }

  // แปลง image URL → base64 data URL (ทำงานใน context ของ Shopee page)
  function fetchImageAsBase64(url) {
    return new Promise(resolve => {
      fetch(url, { mode: 'cors', credentials: 'omit' })
        .then(r => r.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        })
        .catch(() => {
          // ถ้า cors ไม่ได้ ลอง no-cors แบบ image element
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth || 200;
              canvas.height = img.naturalHeight || 200;
              canvas.getContext('2d').drawImage(img, 0, 0);
              resolve(canvas.toDataURL('image/jpeg', 0.8));
            } catch { resolve(null); }
          };
          img.onerror = () => resolve(null);
          img.src = url;
        });
    });
  }

  function scrapeAffiliatePage(extracommOnly) {
    const cards = findProductCards();
    const products = [];

    cards.forEach((card, idx) => {
      try {
        const cardText = card.innerText || '';
        if (cardText.length < 5) return;

        // หน้า product_offer ทุกสินค้าเป็น ExtraComm อยู่แล้ว
        // badge อาจเป็นรูปภาพ ไม่ใช่ text จึงตรวจ text ไม่เจอ
        const hasExtracomm = true;

        const product = {
          index: idx,
          product_id: null,
          scraped_at: new Date().toISOString(),
          basic_info: { name: null, price: null, sold_count: null },
          commission: { is_extracomm: true, rate: null },
          links: { product_url: null, affiliate_link: null },
          images: [],       // เก็บ URL ต้นฉบับ
          images_b64: [],   // เก็บ base64 สำหรับแสดงใน dashboard
          video_status: 'pending',
          posted_at: null
        };

        // ชื่อสินค้า
        const textEls = [...card.querySelectorAll('span, p, a, div')]
          .map(el => {
            if (el.querySelectorAll('*').length > 3) return '';
            return el.innerText?.trim() || '';
          })
          .filter(t => t.length > 10 && t.length < 250)
          .sort((a, b) => b.length - a.length);
        if (textEls.length) product.basic_info.name = textEls[0];

        // ราคา
        const priceMatch = cardText.match(/฿\s*([\d,]+(?:\.\d+)?)/);
        if (priceMatch) product.basic_info.price = parseFloat(priceMatch[1].replace(/,/g, ''));

        // % ค่าคอม
        const percents = [...cardText.matchAll(/([\d.]+)%/g)]
          .map(m => parseFloat(m[1])).filter(v => v > 0 && v <= 100);
        if (percents.length) product.commission.rate = percents[percents.length - 1];

        // จำนวนขาย
        const soldMatch = cardText.match(/([\d.]+[kKพล]?\+?)\s*(?:ชิ้น|sold)/i);
        if (soldMatch) product.basic_info.sold_count = soldMatch[1];

        // รูปภาพ — เก็บ URL จากทุก attribute ที่เป็นไปได้
        [...card.querySelectorAll('img')].forEach(img => {
          const src = img.src ||
                      img.dataset.src ||
                      img.dataset.original ||
                      img.dataset.lazySrc ||
                      img.getAttribute('data-src') ||
                      img.getAttribute('data-original') || '';
          if (src && !src.startsWith('data:') && src.length > 20 &&
              !src.includes('icon') && !src.includes('flag')) {
            product.images.push(src);
          }
        });

        // fallback: background-image
        if (!product.images.length) {
          card.querySelectorAll('[style*="background"]').forEach(el => {
            const m = (el.style.backgroundImage || '').match(/url\(["']?([^"')]+)["']?\)/);
            if (m?.[1] && !m[1].includes('data:')) product.images.push(m[1]);
          });
        }

        // ลิงก์ + ตะกร้า (พยายามหา itemid จาก href ทุกแบบในการ์ด)
        const links = [...card.querySelectorAll('a[href]')].map(a => a.href);
        let idMatch = null;
        for (const href of links) {
          const m = href.match(/i\.(\d+)\.(\d+)/) || href.match(/product\/(\d+)\/(\d+)/);
          if (m) { idMatch = m; product.links.product_url = href; break; }
        }
        if (!product.links.product_url && links.length) product.links.product_url = links[0];
        if (idMatch) {
          product.shop_id = idMatch[1];
          product.item_id = idMatch[2];
          product.product_id = idMatch[2];
          // canonical product URL = ตะกร้าที่ชี้สินค้าตรงตัว (เผื่อ href เป็นลิงก์ภายใน)
          product.links.product_url = `https://shopee.co.th/product/${idMatch[1]}/${idMatch[2]}`;
        }

        products.push(product);
      } catch (e) { /* skip */ }
    });

    return products;
  }

  // scroll + เก็บข้อมูลพร้อมกัน (แก้ปัญหา virtual scroll)
  // รูปสินค้า susercontent ทั้งหมดในหน้า (เรียงตาม DOM order)
  function getPageProductImages() {
    return [...document.querySelectorAll('img')]
      .map(img => img.src || img.dataset.src || '')
      .filter(src => src.includes('susercontent.com') || src.includes('down-bs'));
  }

  function scrollAndCollect(extracommOnly) {
    return new Promise(resolve => {
      const collected = new Map();
      const seen = new Set();
      let imgMap = {}; // name_key -> imgUrl

      function collectVisible() {
        // หา product images ในหน้าตอนนี้ เรียงตาม DOM
        const pageImgs = getPageProductImages();

        // หาจาก ItemCard__name class โดยตรง (reliable กว่า)
        const nameEls = document.querySelectorAll('[class*="ItemCard__name"], [class*="itemCard__name"], [class*="item-card__name"]');

        nameEls.forEach((nameEl, idx) => {
          const name = (nameEl.innerText || '').trim();
          if (!name || name.length < 5) return;

          const key = name.slice(0, 40);
          if (seen.has(key)) return;
          seen.add(key);

          // หา card container ที่มีราคา (parent ของ nameEl)
          let card = nameEl.parentElement;
          for (let i = 0; i < 10; i++) {
            if (!card || card === document.body) break;
            if ((card.innerText || '').includes('฿')) break;
            card = card.parentElement;
          }

          if (!card) return;

          const p = extractProduct(card, collected.size, name);
          if (!p) return;

          // กำหนดรูปจาก pageImgs ตาม index
          if (pageImgs[idx]) {
            p.images = [pageImgs[idx]];
          }

          collected.set(key, p);
        });
      }

      // scroll ลงแล้วเก็บข้อมูลทุก 300ms
      let scrolled = 0;
      collectVisible();

      const t = setInterval(() => {
        if (window._scrapeStop) { clearInterval(t); window.scrollTo(0, 0); resolve([...collected.values()]); return; }
        window.scrollBy(0, 400);
        scrolled += 400;
        collectVisible();
        if (window._onScrapeProgress) window._onScrapeProgress(collected.size);

        const total = document.body.scrollHeight;
        if (scrolled >= total + 400) {
          clearInterval(t);
          window.scrollTo(0, 0);
          setTimeout(() => {
            collectVisible();
            resolve([...collected.values()]);
          }, 500);
        }
      }, 300);

      setTimeout(() => {
        clearInterval(t);
        window.scrollTo(0, 0);
        resolve([...collected.values()]);
      }, 20000);
    });
  }

  function extractProduct(card, idx, nameOverride) {
    try {
      const cardText = card.innerText || '';
      const product = {
        index: idx,
        product_id: null,
        scraped_at: new Date().toISOString(),
        basic_info: { name: null, price: null, sold_count: null },
        commission: { is_extracomm: true, rate: null },
        links: { product_url: null, affiliate_link: null },
        images: [], images_b64: [],
        video_status: 'pending', posted_at: null
      };

      // ชื่อสินค้า
      if (nameOverride) {
        product.basic_info.name = nameOverride;
      } else {
        const nameEl = card.querySelector('[class*="name"], [class*="title"]');
        if (nameEl) {
          product.basic_info.name = (nameEl.innerText || '').trim();
        } else {
          const textEls = [...card.querySelectorAll('span, p, a, div')]
            .map(el => (el.querySelectorAll('*').length < 3 ? (el.innerText || '').trim() : ''))
            .filter(t => t.length > 15 && t.length < 250)
            .sort((a, b) => b.length - a.length);
          if (textEls.length) product.basic_info.name = textEls[0];
        }
      }

      // ราคา
      const priceMatch = cardText.match(/฿\s*([\d,]+(?:\.\d+)?)/);
      if (priceMatch) product.basic_info.price = parseFloat(priceMatch[1].replace(/,/g, ''));

      // % คอม
      const commMatch = cardText.match(/(?:คอมมิชชัน|commission)[^\d]*([\d.]+)%/i);
      if (commMatch) {
        product.commission.rate = parseFloat(commMatch[1]);
      } else {
        const percents = [...cardText.matchAll(/([\d.]+)%/g)].map(m => parseFloat(m[1])).filter(v => v > 0 && v <= 100);
        if (percents.length) product.commission.rate = percents[percents.length - 1];
      }

      // จำนวนขาย
      const soldMatch = cardText.match(/([\d.]+[kKพล万]?\+?)\s*(?:ชิ้น|sold)/i);
      if (soldMatch) product.basic_info.sold_count = soldMatch[1];

      // รูปภาพ — กรอง UI asset ออก เอาเฉพาะรูปสินค้า
      const BAD_DOMAINS = ['deo.shopeemobile.com', 'static/', '/icon', '/logo', '/flag', '/badge'];
      const allImgs = [...card.querySelectorAll('img')];

      // เรียงรูปตาม priority: susercontent.com > down-.img > อื่นๆ
      const imgUrls = allImgs
        .map(img => img.src || img.dataset.src || img.dataset.original || img.getAttribute('data-src') || '')
        .filter(src => {
          if (!src || src.startsWith('data:') || src.length < 15) return false;
          if (BAD_DOMAINS.some(bad => src.includes(bad))) return false;
          return true;
        })
        .sort((a, b) => {
          const scoreA = a.includes('susercontent') ? 2 : a.includes('down-') ? 1 : 0;
          const scoreB = b.includes('susercontent') ? 2 : b.includes('down-') ? 1 : 0;
          return scoreB - scoreA;
        });

      if (imgUrls.length > 0) {
        product.images.push(imgUrls[0]);
      }

      // background-image fallback
      if (!product.images.length) {
        for (const el of card.querySelectorAll('[style*="background-image"]')) {
          const m = el.style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
          if (m?.[1] && !m[1].startsWith('data:') && !BAD_DOMAINS.some(b => m[1].includes(b))) {
            product.images.push(m[1]);
            break;
          }
        }
      }

      // ลิงก์ + product ID
      // วิธี 1: หาจาก <a href> ทุกอัน รวมถึง parent ของ card
      const searchEl = card.parentElement || card;
      const allLinks = [...searchEl.querySelectorAll('a[href]')];
      for (const a of allLinks) {
        const href = a.href || '';
        const idMatch = href.match(/i\.(\d+)\.(\d+)/);
        if (idMatch) {
          product.product_id    = idMatch[2];
          product.links.shop_id  = idMatch[1];
          product.links.product_url = href;
          break;
        }
      }

      // วิธี 2: data attributes
      if (!product.product_id) {
        const dataEl = card.querySelector('[data-item-id],[data-product-id],[data-id],[data-itemid]');
        if (dataEl) {
          product.product_id = dataEl.dataset.itemId || dataEl.dataset.productId ||
                               dataEl.dataset.itemid || dataEl.dataset.id || null;
        }
      }

      // วิธี 3: หา ID จากทุก attribute ในหน้า card ที่มีตัวเลข 9-15 หลัก (Shopee item ID format)
      if (!product.product_id) {
        const html = card.innerHTML;
        const longNumMatch = html.match(/"(?:item_?id|product_?id|itemid)"\s*:\s*(\d{9,15})/i);
        if (longNumMatch) product.product_id = longNumMatch[1];
      }

      return product.basic_info.name ? product : null;
    } catch { return null; }
  }

  // ── affiliate link ตัวจริง: กดปุ่ม "เอา ลิงก์" → อ่านลิงก์สั้น s.shopee.co.th จาก modal ──
  const { sleep } = window.SAUtil; // จาก content/util.js
  function _closeModal() {
    const x = document.querySelector('.ant-modal-close, [aria-label="Close"], [aria-label="close"]');
    if (x) { x.click(); return; }
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  }
  // ปุ่ม "เอา ลิงก์" — class เฉพาะก่อน ถ้าไม่เจอ fallback หาด้วยข้อความ (เหมือน findProductCards)
  function _getlinkButtons() {
    let btns = [...document.querySelectorAll('.AffiliateItemCard__getlinkBtn')];
    if (btns.length) return btns;
    const set = new Set();
    [...document.querySelectorAll('button,[role="button"],a,div,span')].forEach((el) => {
      const t = (el.innerText || '').trim();
      if ((t === 'เอา ลิงก์' || t === 'Get Link' || t === 'รับลิงก์') && el.offsetParent !== null) {
        set.add(el.closest('button,[role="button"],a') || el);
      }
    });
    return [...set];
  }
  function _cardOf(btn) {
    let p = btn;
    for (let i = 0; i < 15 && p && p !== document.body; i++) {
      if (p.querySelector && p.querySelector('img') && (p.innerText || '').includes('฿')) return p;
      p = p.parentElement;
    }
    return btn.parentElement;
  }
  function _cardName(card) {
    if (!card) return '';
    const el = card.querySelector('[class*="ItemCard__name"],[class*="itemCard__name"],[class*="item-card__name"]');
    if (el) return (el.innerText || '').trim();
    const lines = (card.innerText || '').split('\n').map((s) => s.trim()).filter((s) => s.length > 8);
    lines.sort((a, b) => b.length - a.length);
    return lines[0] || '';
  }
  // อ่านลิงก์สั้น (ตะกร้า) จาก modal ที่เปิดอยู่ — ทนต่อการเปลี่ยน class:
  // หาใน input/textarea/anchor/ข้อความ ในขอบเขต modal (ถ้าไม่เจอ modal ใช้ทั้งหน้า)
  const SHORTLINK_RE = /https?:\/\/(?:s\.shopee\.co\.th|shp\.ee|shope?\.ee)\/[^\s"'<>]+/i;
  function _modalScope() {
    return document.querySelector('.ant-modal, [role="dialog"], [class*="modal" i], [class*="Modal"]') || document.body;
  }
  function _readModalLink() {
    const scope = _modalScope();
    for (const el of scope.querySelectorAll('input, textarea')) {
      const m = (el.value || '').match(SHORTLINK_RE);
      if (m) return m[0];
    }
    for (const a of scope.querySelectorAll('a[href]')) {
      const m = (a.href || '').match(SHORTLINK_RE);
      if (m) return m[0];
    }
    const m = (scope.innerText || '').match(SHORTLINK_RE);
    return m ? m[0] : '';
  }
  async function getAffiliateLinkFromBtn(btnIndex, dbg) {
    const btns = _getlinkButtons();           // query สดทุกครั้ง (เลี่ยง element หลุดหลัง re-render)
    const btn = btns[btnIndex];
    if (!btn) { if (dbg) dbg.note = 'no-btn'; return ''; }
    _closeModal(); await sleep(700);          // รอ modal เก่า + backdrop หาย
    btn.click();
    let link = '';
    for (let i = 0; i < 40; i++) {            // รอสูงสุด ~6s ให้ API สร้างลิงก์
      await sleep(150);
      link = _readModalLink();
      if (link) break;
    }
    if (!link && dbg) {                        // เก็บข้อมูลไว้ดีบั๊กว่า modal เห็นอะไร
      const sc = document.querySelector('.ant-modal, [role="dialog"]');
      dbg.modal = !!sc;
      dbg.inputs = sc ? [...sc.querySelectorAll('input,textarea')].map((e) => (e.value || '').slice(0, 50)).filter(Boolean) : [];
      dbg.text = sc ? (sc.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 180) : '(ไม่พบ modal)';
    }
    _closeModal(); await sleep(300);
    return link;
  }
  // ดึงลิงก์เฉพาะการ์ดที่ชื่อตรงกับ wantNames (ถ้าไม่ระบุ = ทุกการ์ด) — จับคู่ด้วยชื่อ
  async function enrichAffiliateLinks(products, wantNames, log) {
    const want = wantNames && wantNames.length
      ? wantNames.map((n) => (n || '').slice(0, 20)).filter(Boolean) : null;
    const btns = _getlinkButtons();
    const count = btns.length;
    const byClass = document.querySelectorAll('.AffiliateItemCard__getlinkBtn').length;
    if (log) log(`พบปุ่มเอาลิงก์ ${count} ปุ่ม (class=${byClass}${byClass ? '' : ', ใช้ fallback ข้อความ'})`);
    let got = 0;
    for (let i = 0; i < count; i++) {
      const cur = _getlinkButtons();
      const name = _cardName(_cardOf(cur[i]));
      // ถ้าระบุรายชื่อ และการ์ดนี้ไม่อยู่ในรายการ → ข้าม (ไม่เปลืองโควต้า)
      if (want && !want.some((k) => name.includes(k))) continue;
      const dbg = {};
      const link = await getAffiliateLinkFromBtn(i, dbg);
      if (log) {
        if (link) log(`[${i + 1}/${count}] ✓ ${name.slice(0, 22)} → ${link}`);
        else log(`[${i + 1}/${count}] ✗ ${name.slice(0, 22)} — modal=${dbg.modal} inputs=${JSON.stringify(dbg.inputs || [])} | ${dbg.text || dbg.note || ''}`);
      }
      if (link) {
        const key = name.slice(0, 20);
        const prod = key && products.find((p) => {
          const n = (p.basic_info && p.basic_info.name) || '';
          return n && (n.includes(key) || name.includes(n.slice(0, 20)));
        });
        if (prod) { prod.links.affiliate_link = link; got++; }
      }
      await sleep(900);                         // เว้นจังหวะ กัน rate-limit
    }
    return got;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'detect_page') {
      sendResponse({ pageType: detectPage(), url: window.location.href });
    }

    // ดึง affiliate link เฉพาะสินค้าที่จะโพสต์ (ส่ง names มา) — กัน rate-limit
    if (msg.action === 'get_links') {
      const carriers = (msg.names || []).map((name) => ({ basic_info: { name }, links: {} }));
      const debug = [];
      enrichAffiliateLinks(carriers, msg.names || [], (m) => debug.push(m)).then((got) => {
        const links = {};
        carriers.forEach((c) => { if (c.links.affiliate_link) links[c.basic_info.name] = c.links.affiliate_link; });
        sendResponse({ success: true, got, links, debug });
      }).catch((e) => sendResponse({ success: false, error: e.message, debug }));
      return true;
    }

    if (msg.action === 'scrape') {
      // scroll + เก็บพร้อมกัน แก้ปัญหา virtual scroll
      scrollAndCollect(msg.extracommOnly !== false).then(async products => {
        try {
          // ดึงรูปจาก Shopee API ด้วย product_id + shop_id
          for (const p of products) {
            if (p.product_id && p.links?.shop_id) {
              try {
                const apiUrl = `https://shopee.co.th/api/v4/item/get?itemid=${p.product_id}&shopid=${p.links.shop_id}`;
                const res = await fetch(apiUrl, { credentials: 'include' });
                const json = await res.json();
                const item = json?.data?.item;
                if (item?.images?.[0]) {
                  const imgHash = item.images[0];
                  const imgUrl = `https://down-th.img.susercontent.com/file/${imgHash}`;
                  p.images.push(imgUrl);
                  const b64 = await fetchImageAsBase64(imgUrl);
                  if (b64) p.images_b64.push(b64);
                }
              } catch (e) { /* skip */ }
            }
          }

          // ── ดึง affiliate link ตัวจริง (ตะกร้า) — opt-in เท่านั้น (ช้า+โดน rate-limit) ──
          // ปกติ scrape เร็วๆ ไม่ดึงลิงก์ — ค่อยดึงเฉพาะ batch ที่จะโพสต์ผ่าน action 'get_links'
          if (msg.getLinks === true) {
            try { await enrichAffiliateLinks(products); } catch (e) { /* skip */ }
          }

          // dump HTML ของการ์ดแรก + รูปทั้งหมดในหน้า
          const firstCard = (() => {
            const btns = [...document.querySelectorAll('button, a, div, span')]
              .filter(el => (el.innerText||'').trim() === 'เอา ลิงก์');
            if (!btns.length) return null;
            let p = btns[0].parentElement;
            for (let i = 0; i < 15; i++) {
              if (!p || p === document.body) break;
              if (p.querySelector('img') && (p.innerText||'').includes('฿')) return p;
              p = p.parentElement;
            }
            return null;
          })();

          const allPageImgs = [...document.querySelectorAll('img')].map(img => ({
            src: img.src?.slice(0, 80),
            dataSrc: (img.dataset.src||'').slice(0, 80),
            w: img.naturalWidth, h: img.naturalHeight,
          })).filter(i => i.src || i.dataSrc);

          const debug = {
            link_btns_exact: [...document.querySelectorAll('button, a, div, span')]
              .filter(el => (el.innerText||'').trim() === 'เอา ลิงก์').length,
            total_imgs: document.querySelectorAll('img').length,
            all_img_urls: allPageImgs.slice(0, 10),
            first_card_html: firstCard ? firstCard.innerHTML.slice(0, 800) : 'not found',
          };

          sendResponse({
            success: true,
            data: { page_type: 'affiliate', url: window.location.href, total: products.length, products, debug }
          });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      });
      return true;
    }

    return true;
  });

  // ════════════════════════════════════════════════════════════════
  //  Floating Panel — UI ลอยบนหน้า Shopee Affiliate (ดูดสด ส่งเข้า Control)
  // ════════════════════════════════════════════════════════════════
  const SVG = {
    cart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
    down: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    stop: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  };

  function injectPanel() {
    if (document.getElementById('__sc_panel') || !/affiliate\.shopee\.co\.th/.test(location.href)) return;

    const css = `
    #__sc_root,#__sc_root *,#__sc_card,#__sc_card *{box-sizing:border-box;font-family:'SF Pro Text',system-ui,-apple-system,sans-serif}
    #__sc_root{position:fixed;z-index:2147483600;bottom:24px;left:24px}
    #__sc_fab{width:56px;height:56px;border-radius:18px;border:0;cursor:pointer;color:#fff;
      background:linear-gradient(135deg,#8b5cf6,#6d28d9);box-shadow:0 10px 28px rgba(124,58,237,.5);
      display:grid;place-items:center;transition:transform .16s,box-shadow .16s}
    #__sc_fab:hover{transform:translateY(-3px) scale(1.03);box-shadow:0 14px 34px rgba(124,58,237,.6)}
    #__sc_card{position:fixed;z-index:2147483601;left:92px;top:84px;width:360px;
      background:#0b0b14;border:1px solid rgba(255,255,255,.08);border-radius:20px;
      box-shadow:0 32px 80px rgba(0,0,0,.66);overflow:hidden;display:none;color:#eef0f6;font-size:13px}
    #__sc_card.open{display:block;animation:__sc_in .18s ease}
    @keyframes __sc_in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    .__sc_hd{display:flex;align-items:center;gap:11px;padding:15px 16px;cursor:move;user-select:none;
      background:linear-gradient(160deg,rgba(139,92,246,.2),transparent 72%);border-bottom:1px solid rgba(255,255,255,.07)}
    .__sc_hd .lg{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;color:#fff;flex-shrink:0;
      background:linear-gradient(135deg,#8b5cf6,#6d28d9);box-shadow:0 5px 14px rgba(124,58,237,.4)}
    .__sc_hd h3{font-size:14.5px;font-weight:750;letter-spacing:-.2px}.__sc_hd p{font-size:10.5px;color:#8b8ba3;margin-top:2px}
    .__sc_hd .cl{background:none;border:0;color:#8b8ba3;cursor:pointer;padding:5px;border-radius:8px;transition:background .15s,color .15s}
    .__sc_hd .cl:hover{background:rgba(255,255,255,.07);color:#eef0f6}
    .__sc_bd{padding:14px 16px;display:flex;flex-direction:column;gap:12px;max-height:74vh;overflow-y:auto}
    .__sc_bd::-webkit-scrollbar{width:7px}.__sc_bd::-webkit-scrollbar-thumb{background:#2a2a3a;border-radius:4px}
    .__sc_row{display:flex;gap:8px}
    .__sc_in{flex:1;background:#16161f;border:1px solid rgba(255,255,255,.1);color:#eef0f6;padding:11px 13px;
      border-radius:11px;font-size:12.5px;outline:none;transition:border-color .15s}
    .__sc_in::placeholder{color:#5b5b72}
    .__sc_in:focus{border-color:rgba(139,92,246,.6)}
    .__sc_b{border:0;cursor:pointer;border-radius:11px;font-weight:650;color:#fff;display:inline-flex;
      align-items:center;justify-content:center;gap:7px;transition:filter .15s,opacity .15s}
    .__sc_b:not(:disabled):hover{filter:brightness(1.09)}
    .__sc_b:disabled{opacity:.5;cursor:default}
    .__sc_main{width:100%;padding:13px;font-size:13.5px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);
      box-shadow:0 6px 18px rgba(124,58,237,.34)}
    .__sc_sb{padding:0 15px;background:linear-gradient(135deg,#38bdf8,#0284c7);font-size:12.5px}
    .__sc_stop{padding:12px;width:100%;background:linear-gradient(135deg,#fb7185,#e11d48)}
    .__sc_dash{padding:12px;width:100%;background:linear-gradient(135deg,#8b5cf6,#6d28d9);font-size:13px}
    .__sc_opt{display:flex;align-items:flex-start;gap:10px;padding:10px 0;cursor:pointer;border-top:1px solid rgba(255,255,255,.06)}
    .__sc_opt:first-child{border-top:0}
    .__sc_sw{width:36px;height:21px;border-radius:11px;background:#2e2e3c;position:relative;flex-shrink:0;margin-top:1px;transition:background .18s}
    .__sc_sw::after{content:"";position:absolute;width:15px;height:15px;border-radius:50%;background:#fff;top:3px;left:3px;transition:transform .18s}
    .__sc_opt.on .__sc_sw{background:linear-gradient(135deg,#8b5cf6,#6d28d9)}
    .__sc_opt.on .__sc_sw::after{transform:translateX(15px)}
    .__sc_ot{font-size:12px;font-weight:650}.__sc_od{font-size:10px;color:#8b8ba3;margin-top:2px;line-height:1.45}
    .__sc_stats{display:flex;gap:9px}
    .__sc_stat{flex:1;background:#13131c;border:1px solid rgba(255,255,255,.07);border-radius:13px;padding:11px 13px}
    .__sc_sv{font-size:21px;font-weight:780;letter-spacing:-.5px}.__sc_sl{font-size:10px;color:#8b8ba3;margin-top:2px}
    .__sc_card-box{background:#13131c;border:1px solid rgba(255,255,255,.07);border-radius:14px}
    .__sc_chd{display:flex;align-items:center;gap:8px;padding:12px 14px 5px;font-size:12.5px;font-weight:680}
    .__sc_chd .ic{color:#a78bfa}
    .__sc_cd{font-size:10.5px;color:#8b8ba3;padding:0 14px 12px;line-height:1.55}
    .__sc_log{background:#06060d;border:1px solid rgba(255,255,255,.06);border-radius:12px;
      padding:10px 12px;font-family:ui-monospace,monospace;font-size:10.5px;line-height:1.75;color:#7dd3fc;
      max-height:120px;overflow-y:auto}
    .__sc_log .ok{color:#4ade80}.__sc_log .er{color:#fb7185}.__sc_log .dim{color:#6b6b80}`;

    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);

    const root = document.createElement('div'); root.id = '__sc_root';
    const fab = document.createElement('button'); fab.id = '__sc_fab'; fab.innerHTML = SVG.cart;
    const card = document.createElement('div'); card.id = '__sc_card';
    card.innerHTML = `
      <div class="__sc_hd">
        <div class="lg">${SVG.cart}</div>
        <div style="flex:1"><h3>Shopee Scraper</h3><p>ดูดสินค้า + ตะกร้า ส่งเข้าศูนย์ควบคุม</p></div>
        <button class="cl" id="__sc_close">${SVG.x}</button>
      </div>
      <div class="__sc_bd">
        <div class="__sc_card-box">
          <div class="__sc_chd"><span class="ic">${SVG.search}</span> ค้นหาด้วยคีย์เวิร์ด</div>
          <div class="__sc_cd">พิมพ์ชื่อสินค้า/หมวด ระบบจะเปิดหน้าค้นหาแล้วดูดให้</div>
          <div class="__sc_row" style="padding:0 13px 12px">
            <input class="__sc_in" id="__sc_kw" placeholder="เช่น หูฟังบลูทูธ, เคสมือถือ…">
            <button class="__sc_b __sc_sb" id="__sc_search">${SVG.search}</button>
          </div>
        </div>

        <button class="__sc_b __sc_main" id="__sc_scrape">${SVG.down} ดูดสินค้าจากหน้านี้</button>

        <div class="__sc_card-box" style="padding:4px 13px 8px">
          <div class="__sc_opt on" data-opt="extracomm"><div class="__sc_sw"></div><div><div class="__sc_ot">เฉพาะคอมพิเศษ (ExtraComm)</div><div class="__sc_od">เก็บเฉพาะสินค้าค่าคอมพิเศษ</div></div></div>
          <div class="__sc_opt" data-opt="hot"><div class="__sc_sw"></div><div><div class="__sc_ot">เรียงขายดีก่อน</div><div class="__sc_od">ยอดขายมาก → น้อย</div></div></div>
          <div class="__sc_opt" data-opt="highcomm"><div class="__sc_sw"></div><div><div class="__sc_ot">เรียงคอมสูงก่อน</div><div class="__sc_od">อัตราคอมมาก → น้อย</div></div></div>
          <div class="__sc_opt" data-opt="getlinks"><div class="__sc_sw"></div><div><div class="__sc_ot">เก็บลิงก์ตะกร้าเลย</div><div class="__sc_od">ดึงลิงก์ s.shopee.co.th ทุกชิ้นตอนดูด (ช้าลง · กันลิงก์ตกตอนสร้างคลิป)</div></div></div>
        </div>

        <div class="__sc_stats">
          <div class="__sc_stat"><div class="__sc_sv" id="__sc_found" style="color:#a78bfa">0</div><div class="__sc_sl">ดูดได้ (ชิ้น)</div></div>
          <div class="__sc_stat"><div class="__sc_sv" id="__sc_sent" style="color:#34d399">0</div><div class="__sc_sl">ส่งเข้าศูนย์</div></div>
        </div>

        <button class="__sc_b __sc_stop" id="__sc_stopbtn" style="display:none">${SVG.stop} หยุดดูด</button>
        <button class="__sc_b __sc_dash" id="__sc_dash">เปิด Dashboard ▸</button>
        <div class="__sc_log" id="__sc_logbox"><span class="dim">พร้อมดูดสินค้า…</span></div>
      </div>`;

    root.append(fab, card);
    document.body.appendChild(root);

    const opts = { extracomm: true, hot: false, highcomm: false, getlinks: false };
    const $ = id => card.querySelector(id);
    const logbox = $('#__sc_logbox');
    const slog = (m, cls = '') => { const d = document.createElement('div'); d.className = cls; d.textContent = m; logbox.appendChild(d); logbox.scrollTop = logbox.scrollHeight; };
    let running = false;

    fab.addEventListener('click', () => card.classList.toggle('open'));
    $('#__sc_close').addEventListener('click', () => card.classList.remove('open'));

    // ── ลากย้ายหน้าต่าง (drag ที่ header) ──
    (() => {
      const hd = card.querySelector('.__sc_hd');
      let dx = 0, dy = 0, dragging = false;
      hd.addEventListener('mousedown', (e) => {
        if (e.target.closest('.cl')) return; // ไม่ลากเมื่อกดปุ่มปิด
        dragging = true;
        const r = card.getBoundingClientRect();
        dx = e.clientX - r.left; dy = e.clientY - r.top;
        card.style.bottom = 'auto'; card.style.right = 'auto';
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        let x = e.clientX - dx, y = e.clientY - dy;
        x = Math.max(4, Math.min(x, innerWidth - 60));
        y = Math.max(4, Math.min(y, innerHeight - 40));
        card.style.left = x + 'px'; card.style.top = y + 'px';
      });
      window.addEventListener('mouseup', () => { dragging = false; });
    })();
    card.querySelectorAll('.__sc_opt').forEach(el => el.addEventListener('click', () => {
      const k = el.dataset.opt; opts[k] = !opts[k]; el.classList.toggle('on', opts[k]);
    }));
    $('#__sc_stopbtn').addEventListener('click', () => { window._scrapeStop = true; slog('กำลังหยุด…', 'dim'); });
    $('#__sc_dash').addEventListener('click', () => {
      if (!sendMsg({ action: 'open_dashboard' })) slog('ส่วนขยายถูกรีโหลด — รีเฟรชหน้านี้ (F5) ก่อน', 'er');
    });
    $('#__sc_scrape').addEventListener('click', () => runScrape());
    $('#__sc_search').addEventListener('click', async () => {
      const kw = $('#__sc_kw').value.trim();
      if (!kw) return runScrape();
      slog(`ค้นหา "${kw}" — เปิดหน้าค้นหา…`);
      location.href = `https://affiliate.shopee.co.th/offer/product_offer?keyword=${encodeURIComponent(kw)}`;
    });
    $('#__sc_kw').addEventListener('keydown', e => { if (e.key === 'Enter') $('#__sc_search').click(); });

    async function runScrape() {
      if (running) return;
      running = true; window._scrapeStop = false;
      $('#__sc_scrape').disabled = true; $('#__sc_stopbtn').style.display = 'flex';
      $('#__sc_found').textContent = '0'; $('#__sc_sent').textContent = '0';
      slog('เริ่มเลื่อนหน้าเก็บสินค้า…');
      window._onScrapeProgress = (n) => { $('#__sc_found').textContent = n; };
      try {
        let products = await scrollAndCollect(opts.extracomm);
        if (opts.hot) products.sort((a, b) => (b.basic_info?.sold_count || 0) - (a.basic_info?.sold_count || 0));
        if (opts.highcomm) products.sort((a, b) => (b.commission?.rate || 0) - (a.commission?.rate || 0));
        $('#__sc_found').textContent = products.length;
        // เก็บลิงก์ตะกร้าทุกชิ้นตอนดูด (ตัวเลือก) — ใช้ enrichAffiliateLinks เดิม
        if (opts.getlinks && products.length) {
          slog(`เก็บลิงก์ตะกร้า ${products.length} ชิ้น (อาจช้า กัน rate-limit)…`);
          try {
            const got = await enrichAffiliateLinks(products, null, (m) => slog(m, 'dim'));
            slog(`เก็บลิงก์ตะกร้าได้ ${got}/${products.length} ชิ้น`, got ? 'ok' : 'er');
          } catch (e) { slog('เก็บลิงก์ตะกร้าไม่สำเร็จ: ' + e.message, 'er'); }
        }
        slog(`ดูดได้ ${products.length} ชิ้น — กำลังส่งเข้าศูนย์ควบคุม…`);
        if (!products.length) { slog('ไม่พบสินค้าในหน้านี้', 'er'); }
        else {
          const sent = sendMsg({ action: 'add_products', products }, r => {
            if (chrome.runtime.lastError) slog('ส่งไม่ได้ — เปิด "Shopee VDO Gen" ก่อน', 'er');
            else { $('#__sc_sent').textContent = r?.total ?? products.length; slog(`ส่งเข้าศูนย์ควบคุมแล้ว · เพิ่มใหม่ ${r?.added ?? products.length} ชิ้น`, 'ok'); }
          });
          if (!sent) slog('ส่งไม่ได้ — ส่วนขยายถูกรีโหลด รีเฟรชหน้านี้ (F5) ก่อน', 'er');
        }
      } catch (e) { slog('ผิดพลาด: ' + e.message, 'er'); }
      running = false; window._onScrapeProgress = null;
      $('#__sc_scrape').disabled = false; $('#__sc_stopbtn').style.display = 'none';
    }
  }

  // inject เมื่อหน้าโหลด (affiliate เท่านั้น)
  setTimeout(injectPanel, 1200);
  setTimeout(injectPanel, 3500);
}
