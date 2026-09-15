import type { Metadata } from "next";
import "@fontsource/press-start-2p";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maria's Dino Run",
  description: "Ein persönliches Pixel-Dino-Spiel zum 20. Geburtstag.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="antialiased">{children}</body>
    </html>
  );
}
