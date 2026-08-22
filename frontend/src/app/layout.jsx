import './globals.css';

export const metadata = {
  title: 'MimarAi — Precision Architecture & Planning Layer for AI Coding Agents',
  description: 'MimarAi enforces precision architecture before AI coding agents write a single line of code.',
  icons: {
    icon: '/assets/mimarai-favicon.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" href="/assets/mimarai-favicon.png" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
