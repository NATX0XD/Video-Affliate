/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // ปิด double-mount ตอน dev (StrictMode) — กันอนิเมชั่นตอนเข้าเล่นซ้ำ 2 รอบ
  reactStrictMode: false,
};

export default nextConfig;
