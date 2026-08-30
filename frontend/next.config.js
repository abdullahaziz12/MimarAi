/** @type {import('next').NextConfig} */
const backendOrigin = process.env.NEXT_PUBLIC_BACKEND_URL
  ? new URL(process.env.NEXT_PUBLIC_BACKEND_URL).origin
  : "";

const nextConfig = {
  reactStrictMode: false,
  async headers() {
    const connectSources = [
      "'self'",
      "https://tgyupsejfuvglbwjneob.supabase.co",
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
    ];

    if (backendOrigin) {
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              `connect-src ${connectSources.join(" ")}`,
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
