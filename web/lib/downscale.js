// ย่อรูปที่ผู้ใช้อัปเป็น dataURL (ด้านยาวสุดไม่เกิน max, JPEG) — เหมือน extension gmDownscale
// ใช้ทั้งรูปหน้าตัวละครและรูปฉากหลัง เพื่อไม่ให้ payload คิวงาน/เทมเพลตบวม
export function downscale(file, max = 512, q = 0.85) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width: w, height: h } = img
        if (w > h && w > max) { h = Math.round(h * max / w); w = max }
        else if (h > max) { w = Math.round(w * max / h); h = max }
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(c.toDataURL('image/jpeg', q))
      }
      img.onerror = reject
      img.src = fr.result
    }
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}
