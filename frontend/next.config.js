/** @type {import('next').NextConfig} */
const defaultBackendUrl = "https://mimaraibackend-p65ccvlk.b4a.run";
const rawBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || defaultBackendUrl;

let backendOrigin = "";
try {
  backendOrigin = new URL(rawBackendUrl).origin;
} catch {
  backendOrigin = defaultBackendUrl;
}

const nextConfig = {
  reactStrictMode: false,
  async headers() {
    const connectSources = [
      "'self'",
      "https://mimaraibackend-p65ccvlk.b4a.run",
      "https://tgyupsejfuvglbwjneob.supabase.co",
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
      "https://vercel.live",
    ];

    if (backendOrigin && !connectSources.includes(backendOrigin)) {
      connectSources.push(backendOrigin);
    }

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              `connect-src ${connectSources.join(" ")}`,
              "frame-src 'self' https://vercel.live",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
