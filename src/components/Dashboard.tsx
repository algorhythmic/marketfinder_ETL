import { useState } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "./ui/sidebar"
import { NeobrutalistSidebar } from "./NeobrutalistSidebar"
import { DashboardOverview } from "./DashboardOverview"
import { MarketsView } from "./MarketsView"
import { ArbitrageView } from "./ArbitrageView"
import { MarketGroupsView } from "./MarketGroupsView"
import { AlertsView } from "./AlertsView"
import { SettingsView } from "./SettingsView"
import { ThemeToggle } from "./ThemeToggle"
import { SignOutButton } from "../SignOutButton"

export function Dashboard() {
  const [activeView, setActiveView] = useState("dashboard")

  const renderView = () => {
    switch (activeView) {
      case "dashboard":
        return <DashboardOverview />
      case "markets":
        return <MarketsView />
      case "arbitrage":
        return <ArbitrageView />
      case "groups":
        return <MarketGroupsView />
      case "alerts":
        return <AlertsView />
      case "settings":
        return <SettingsView />
      default:
        return <DashboardOverview />
    }
  }

  return (
    <SidebarProvider>
      <NeobrutalistSidebar activeView={activeView} onViewChange={setActiveView} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b-4 border-black bg-white px-4 dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <div className="h-6 w-px bg-black dark:bg-gray-500" />
            <h1 className="text-lg font-bold text-black dark:text-white">Market Finder</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 bg-gray-50 dark:bg-gray-900 min-h-screen">
          {renderView()}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
