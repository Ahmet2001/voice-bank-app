import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { ThemeProvider } from "next-themes"

import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  metadataBase: new URL("https://voicebank-sandbox.local"),
  title: "VoiceBank Sandbox",
  description: "Sesli agent ile yonetilen sandbox bankacilik uygulamasi.",
  openGraph: {
    title: "VoiceBank Sandbox",
    description: "Sesli agent ile yonetilen sandbox bankacilik uygulamasi.",
    type: "website",
    url: "https://voicebank-sandbox.local",
    images: [{ url: "/screenshots/shadcn-fintech.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "VoiceBank Sandbox",
    description: "Sesli agent ile yonetilen sandbox bankacilik uygulamasi.",
    images: ["/screenshots/shadcn-fintech.png"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full font-sans antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
