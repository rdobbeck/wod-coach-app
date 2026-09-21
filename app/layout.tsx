import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "WOD Coach - Workout Optimization Dashboard",
  description: "Optimize every rep. Elevate every client. The complete coaching platform with VBT tracking, client management, and program design.",
  appleWebApp: { capable: true, title: "WOD", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0284c7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the bottom tab bar respect the iPhone home indicator
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
