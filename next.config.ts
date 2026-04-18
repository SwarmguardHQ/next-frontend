import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // deck.gl 9 + luma.gl: ResizeObserver can run while WebGL device is torn down in dev
  // (React Strict Mode double mount), causing maxTextureDimension2D on undefined.
  // See visgl/luma.gl#2487, visgl/deck.gl#9857 — disable until upstream is fully patched.
  reactStrictMode: false,
  // For routing to FastAPI
  async rewrites() {
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
