import type { Metadata } from "next";
import { Archivo_Narrow, Geist, Geist_Mono, Work_Sans } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const workSans = Work_Sans({
  variable: "--font-market-body",
  subsets: ["latin"],
});

const archivoNarrow = Archivo_Narrow({
  variable: "--font-market-label",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Openfront Grocery",
  description: "Fresh grocery storefront and operations platform for delivery, pickup, fulfillment, and subscriptions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link href="/favicon.svg" rel="icon" />
      </head>
      <body
        className={`${geistSans.variable} ${workSans.variable} ${archivoNarrow.variable} ${geistMono.variable} antialiased min-h-screen bg-background font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
