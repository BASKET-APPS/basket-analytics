import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: 'export',
  basePath: process.env.NODE_ENV === 'production' ? '/basket-analytics' : '',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
