/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  async headers() {
    // Learn scene files carry a content hash in their name, so they can be cached forever.
    return [{ source: '/anatomy/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }]
  },
}

module.exports = nextConfig
