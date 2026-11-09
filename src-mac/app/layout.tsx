import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "YawaChat",
  description:
    "Чат всех ваших стримов в одном окне — Twitch, YouTube Live, VK Видео Live, Kick, TikTok, Rutube и Boosty.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <body className={`${inter.variable} bg-black font-sans text-white antialiased`}>{children}</body>
    </html>
  );
}
