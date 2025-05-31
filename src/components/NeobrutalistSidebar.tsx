import {
  BarChart3,
  TrendingUp,
  Settings,
  Home,
  Search,
  Bell,
  Users,
  ChevronUp,
  User2,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "./ui/sidebar"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useSidebar } from "./ui/sidebar"

// Menu items.
const items = [
  {
    title: "Dashboard",
    url: "#",
    icon: Home,
    view: "dashboard",
  },
  {
    title: "Markets",
    url: "#",
    icon: Search,
    view: "markets",
  },
  {
    title: "Arbitrage",
    url: "#",
    icon: TrendingUp,
    view: "arbitrage",
  },
  {
    title: "Market Groups",
    url: "#",
    icon: Users,
    view: "groups",
  },
  {
    title: "Alerts",
    url: "#",
    icon: Bell,
    view: "alerts",
  },
  {
    title: "Settings",
    url: "#",
    icon: Settings,
    view: "settings",
  },
]

interface NeobrutalistSidebarProps {
  activeView: string
  onViewChange: (view: string) => void
}

export function NeobrutalistSidebar({ activeView, onViewChange }: NeobrutalistSidebarProps) {
  const user = useQuery(api.auth.loggedInUser)
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <Sidebar 
      collapsible="icon" 
      className={`border-r-4 border-black transition-all duration-200 ${isCollapsed ? 'w-16' : 'w-64'}`}
    >
      <SidebarHeader className="h-16 border-b-4 border-black bg-yellow-300 dark:bg-gray-800 flex items-center px-4 -mt-[4px] -ml-[4px] w-[calc(100%+4px)]">
        <div className="flex items-center gap-2">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-black text-white dark:bg-gray-700 dark:text-gray-200">
            <BarChart3 className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-bold text-black dark:text-white">Market Finder</span>
            <span className="truncate text-xs text-black/70 dark:text-gray-400">Prediction Markets</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="bg-white dark:bg-gray-900">
        <SidebarGroup>
          {!isCollapsed && (
            <SidebarGroupLabel className="text-black font-bold dark:text-gray-300">
              Navigation
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild
                    isActive={activeView === item.view}
                    className="hover:bg-yellow-300 data-[active=true]:bg-yellow-300 data-[active=true]:border-2 data-[active=true]:border-black data-[active=true]:shadow-[2px_2px_0px_0px_#000] dark:text-gray-300 dark:hover:bg-gray-700 dark:data-[active=true]:bg-gray-600 dark:data-[active=true]:text-white dark:data-[active=true]:border-gray-500 dark:data-[active=true]:shadow-[2px_2px_0px_0px_#374151]"
                  >
                    <button 
                      onClick={() => onViewChange(item.view)}
                      className="flex items-center gap-3 w-full"
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!isCollapsed && <span className="font-medium truncate">{item.title}</span>}
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t-4 border-black bg-blue-300 dark:bg-gray-800">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              size="lg"
              className={`hover:bg-blue-400 border-2 border-black shadow-[2px_2px_0px_0px_#000] dark:text-gray-300 dark:hover:bg-gray-700 dark:border-gray-600 dark:shadow-[2px_2px_0px_0px_#374151] ${
                isCollapsed ? 'w-8 h-8 mx-auto' : ''
              } flex items-center justify-center`}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-black text-white dark:bg-gray-700 dark:text-gray-200 dark:border-gray-500 flex-shrink-0">
                <User2 className="size-4" />
              </div>
              {!isCollapsed && (
                <>
                  <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
                    <span className="truncate font-bold text-black dark:text-white">
                      {user?.name || "Anonymous"}
                    </span>
                    <span className="truncate text-xs text-black/70 dark:text-gray-400">
                      {user?.email || "Not signed in"}
                    </span>
                  </div>
                  <ChevronUp className="ml-auto size-4 dark:text-gray-300 flex-shrink-0" />
                </>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
