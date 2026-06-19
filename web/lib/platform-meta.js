import { SiShopee, SiTiktok, SiInstagram, SiYoutube, SiFacebook } from 'react-icons/si'

/** โลโก้แบรนด์ + สี ต่อแพลตฟอร์ม (สีปรับให้เห็นบนพื้นเข้ม) — ใช้ร่วมหลายหน้า */
export const PLAT_META = {
  shopee:    { label: 'Shopee',  Logo: SiShopee,    color: '#EE4D2D' },
  tiktok:    { label: 'TikTok',  Logo: SiTiktok,    color: '#f1f1f3' },
  reels:     { label: 'Reels',   Logo: SiFacebook,  color: '#1877F2' },
  instagram: { label: 'IG',      Logo: SiInstagram, color: '#E4405F' },
  youtube:   { label: 'YouTube', Logo: SiYoutube,   color: '#FF0000' },
}
