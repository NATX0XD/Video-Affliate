// inject เข้า page world เพื่อดักจับ API response
(function() {
  if (window._shopeeInterceptorLoaded) return;
  window._shopeeInterceptorLoaded = true;

  window._shopeeProductCache = {};

  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const res = await origFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    // ดักจับ API ที่ return product data
    if (url.includes('/api/') && (url.includes('product') || url.includes('offer') || url.includes('item'))) {
      try {
        const clone = res.clone();
        clone.json().then(data => {
          extractProducts(data, url);
        }).catch(() => {});
      } catch (e) {}
    }
    return res;
  };

  const origXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new origXHR();
    const origOpen = xhr.open.bind(xhr);
    let _url = '';
    xhr.open = function(method, url, ...rest) {
      _url = url;
      return origOpen(method, url, ...rest);
    };
    xhr.addEventListener('load', function() {
      if (_url.includes('/api/') && (
        _url.includes('product') || _url.includes('offer') || _url.includes('item')
      )) {
        try {
          const data = JSON.parse(xhr.responseText);
          extractProducts(data, _url);
        } catch (e) {}
      }
    });
    return xhr;
  }
  PatchedXHR.prototype = origXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;

  function extractProducts(data, url) {
    // หา items/products ใน response
    const items = findItems(data);
    items.forEach(item => {
      const id = item.item_id || item.itemid || item.product_id || item.id;
      const img = getImageUrl(item);
      if (id && img) {
        window._shopeeProductCache[String(id)] = {
          id: String(id),
          image: img,
          name: item.name || item.item_name || '',
          price: item.price || item.min_price || 0,
          shop_id: item.shop_id || item.shopid || '',
        };
      }
    });
  }

  function findItems(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 6) return [];
    // ถ้าเป็น array ที่มี item มีรูป — น่าจะเป็น product list
    if (Array.isArray(obj)) {
      if (obj.length > 0 && (obj[0]?.item_id || obj[0]?.itemid || obj[0]?.image)) return obj;
      return obj.flatMap(i => findItems(i, depth + 1));
    }
    // หา key ที่น่าจะเป็น product list
    for (const key of ['items', 'products', 'data', 'list', 'result', 'offers']) {
      if (obj[key]) {
        const found = findItems(obj[key], depth + 1);
        if (found.length > 0) return found;
      }
    }
    return [];
  }

  function getImageUrl(item) {
    // หา image URL จาก field ต่างๆ
    const raw = item.image || item.images?.[0] || item.item_image ||
                item.cover || item.thumbnail || item.pic || '';
    if (!raw) return null;
    if (raw.startsWith('http')) return raw;
    // Shopee image hash format
    if (raw.length > 20 && !raw.includes('/')) {
      return `https://down-th.img.susercontent.com/file/${raw}`;
    }
    return raw;
  }
})();
