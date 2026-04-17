import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import Header from "@/components/header";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SIREN",
  description: "SIREN · Earthquake SAR coordination",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${plexSans.variable} ${plexMono.variable}`}>
      <body
        className={`${plexSans.className} min-h-screen bg-background font-sans text-foreground`}
        suppressHydrationWarning
      >
        <TooltipProvider>
          <div className="flex min-h-screen w-full flex-col">
            <Header />
            <main className="flex min-h-0 flex-1 flex-col">{children}</main>
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}
