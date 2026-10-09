import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Instrument_Sans, Space_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#17162a",
};

export const metadata: Metadata = {
  title: "Waypoint — plan meetups that work for everyone",
  description:
    "Friends scattered across the city? Waypoint finds the fair meeting spot, with routes and travel times for everyone.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${instrument.variable} ${spaceMono.variable} h-full`}
    >
      <body className="min-h-dvh flex flex-col overflow-x-hidden">{children}</body>
    </html>
  );
}
