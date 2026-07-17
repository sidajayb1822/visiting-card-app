import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Card Scanner",
  description: "Scan a business card and save it to a Google Sheet.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    // Makes an iOS home-screen launch open without Safari's chrome.
    capable: true,
    title: "Card Scanner",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  // Stops iOS zooming the page when a form field takes focus.
  maximumScale: 1,
  // Lets the camera view reach under the notch and home indicator.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
