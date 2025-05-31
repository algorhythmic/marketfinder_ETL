import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const arbitrageStats = useQuery(api.arbitrage.getArbitrageStats);
  const subscription = useQuery(api.users.getSubscriptionInfo);

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "arbitrage", label: "Arbitrage", icon: "💰", badge: arbitrageStats?.activeCount },
    { id: "markets", label: "Markets", icon: "📈" },
    { id: "groups", label: "Market Groups", icon: "🔗" },
    { id: "alerts", label: "Alerts", icon: "🔔" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col border-4 border-black shadow-[8px_8px_0px_0px_#000] dark:shadow-[8px_8px_0px_0px_#000]">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900">Market Finder</h2>
        <p className="text-sm text-gray-500 mt-1">Prediction Market Analytics</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left transition-colors ${
                  activeView === item.id
                    ? "bg-blue-50 text-blue-700 border-2 border-blue-200 shadow-[4px_4px_0px_0px_#000]"
                    : "text-gray-700 hover:bg-gray-50 border-2 border-transparent"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-lg">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </div>
                {item.badge && (
                  <span className="bg-red-100 text-red-800 text-xs font-medium px-2 py-1 rounded-full">
                    {item.badge}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Subscription Status */}
      <div className="p-4 border-t border-gray-200">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Plan</span>
            <span className={`text-xs font-bold px-2 py-1 rounded ${
              subscription?.tier === "enterprise" ? "bg-purple-100 text-purple-800" :
              subscription?.tier === "pro" ? "bg-blue-100 text-blue-800" :
              "bg-gray-100 text-gray-800"
            }`}>
              {subscription?.tier?.toUpperCase() || "FREE"}
            </span>
          </div>
          {subscription?.tier === "free" && (
            <button className="w-full bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded hover:bg-blue-700 transition-colors">
              Upgrade to Pro
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
