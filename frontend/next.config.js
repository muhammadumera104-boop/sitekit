const BACKEND = process.env.BACKEND_URL || 'http://localhost:5000';

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Proxy API + uploads so the browser talks to one origin (first-party cookies, no CORS issues).
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND}/api/:path*` },
      { source: '/uploads/:path*', destination: `${BACKEND}/uploads/:path*` },
    ];
  },
};
