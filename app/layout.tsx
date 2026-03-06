import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WOD Coach - Workout Optimization Dashboard",
  description: "Optimize every rep. Elevate every client. The complete coaching platform with VBT tracking, client management, and program design.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
