/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  async headers() {
    // Only the Learn scene files carry a content hash in their name (knee.d5e4a951.glb), so only they
    // can be cached forever. Posters and LICENSE.md keep their names when they change: default caching.
    return [{ source: '/anatomy/:file([a-z0-9-]+\\.[0-9a-f]{8}\\.glb)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }]
  },
}

module.exports = nextConfig
