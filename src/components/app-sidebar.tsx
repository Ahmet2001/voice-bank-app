"use client"

import * as React from "react"
import Link from "next/link"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  LayoutDashboardIcon,
  WalletIcon,
  ArrowLeftRightIcon,
  CreditCardIcon,
  ChartAreaIcon,
  TargetIcon,
  SettingsIcon,
  LifeBuoyIcon,
  LandmarkIcon,
  SendIcon,
  TrendingUpIcon,
  BitcoinIcon,
  BellIcon,
  LogInIcon,
  UserPlusIcon,
  Mic2Icon,
} from "lucide-react"

const data = {
  user: {
    name: "Demo Kullanici",
    email: "demo@voicebank.local",
    avatar: "/avatars/user.jpg",
  },
  navDaily: [
    { title: "Genel Bakis", url: "/dashboard", icon: <LayoutDashboardIcon /> },
    { title: "Hesaplar", url: "/accounts", icon: <WalletIcon /> },
    { title: "Islemler", url: "/transactions", icon: <ArrowLeftRightIcon /> },
    { title: "Kartlar", url: "/cards", icon: <CreditCardIcon /> },
  ],
  navAgent: [
    { title: "Direkt Islem", url: "/direct-action", icon: <Mic2Icon /> },
  ],
  navMoney: [
    { title: "Transferler", url: "/transfers", icon: <SendIcon /> },
    { title: "Yatirimlar", url: "/investments", icon: <TrendingUpIcon /> },
    { title: "Kripto", url: "/crypto", icon: <BitcoinIcon /> },
  ],
  navInsights: [
    { title: "Analitik", url: "/analytics", icon: <ChartAreaIcon /> },
    { title: "Butceler", url: "/budgets", icon: <TargetIcon /> },
  ],
  navAuth: [
    { title: "Sign In", url: "/sign-in", icon: <LogInIcon /> },
    { title: "Sign Up", url: "/sign-up", icon: <UserPlusIcon /> },
  ],
  navSecondary: [
    { title: "Bildirimler", url: "/notifications", icon: <BellIcon /> },
    { title: "Ayarlar", url: "/settings", icon: <SettingsIcon /> },
    { title: "Destek", url: "/support", icon: <LifeBuoyIcon /> },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <LandmarkIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">VoiceBank</span>
                <span className="truncate text-xs text-muted-foreground">
                  Sandbox Agent
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navAgent} label="Sesli Agent" />
        <NavMain items={data.navDaily} label="Gunluk" />
        <NavMain items={data.navMoney} label="Para" />
        <NavMain items={data.navInsights} label="Analiz" />
        <NavMain items={data.navAuth} label="Auth" />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
