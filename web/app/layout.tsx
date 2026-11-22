import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ReEntry · Wildfire re-underwriting for California",
  description:
    "Helps California insurers find, price and write homes stuck on the FAIR Plan, using CAL FIRE damage inspections, FEMA hazard data and CDI market data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
        <footer className="border-t border-line text-xs text-muted">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap gap-x-6 gap-y-1">
            <span>Data: CAL FIRE damage inspections 2013–2025, CAL FIRE hazard zones and fire perimeters, FEMA National Risk Index, California Department of Insurance, Zillow, US Census.</span>
            <span>Prototype. Estimates, not a filed rate or a coverage decision.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
