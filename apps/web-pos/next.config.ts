import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript - let Next's own compiler handle them
  // rather than requiring each one to be pre-built.
  transpilePackages: ['@bata-pos/shared-types', '@bata-pos/api-clients'],
};

export default nextConfig;
