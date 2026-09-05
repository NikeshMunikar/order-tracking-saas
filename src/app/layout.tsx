import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Order Tracking",
  description: "Order tracking for small businesses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
