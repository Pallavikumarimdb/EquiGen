import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EquiGen - AI Equity Research Report Generator",
  description:
    "Generate institutional-grade, SEBI-compliant equity research reports with EquiGen's autonomous agentic analyst",
};

import { GlobalClientListeners } from "@/components/GlobalClientListeners";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <GlobalClientListeners />
        {children}
      </body>
    </html>
  );
}
