import type { Metadata } from "next";
import { JetBrains_Mono, Libre_Baskerville, Playfair_Display } from "next/font/google";

import "./globals.css";

const display = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display"
});

const body = Libre_Baskerville({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "700"]
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["300", "400", "500"]
});

export const metadata: Metadata = {
  title: "Verbum",
  description:
    "Everything is a conversation. Verbum turns models, terminals, humans, and tools into one observable message graph."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <main>{children}</main>
      </body>
    </html>
  );
}
