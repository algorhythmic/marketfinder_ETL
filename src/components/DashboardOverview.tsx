import { useEffect } from "react"; // Added useEffect
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export function DashboardOverview() {
  const initializePlatforms = useMutation(api.platforms.initializePlatforms);
  const addSampleData = useMutation(api.sampleData.addSampleData);
  const createSampleAlerts = useMutation(api.sampleAlerts.createSampleAlerts);
  
  useEffect(() => {
    // Initialize platforms and sample data on first load
    const init = async () => {
      try {
        await initializePlatforms({});
        setTimeout(() => { void addSampleData({}); }, 1000);
        setTimeout(() => { void createSampleAlerts({}); }, 2000);
      } catch (error) {
        console.log("Initialization already done or failed:", error);
      }
    };
    void init();
  }, [initializePlatforms, addSampleData, createSampleAlerts]);
  
  // const arbitrageStats = useQuery(api.arbitrage.getArbitrageStats);
  // const trendingMarkets = useQuery(api.markets.getTrendingMarkets, { limit: 10 });
  // const marketsByCategory = useQuery(api.markets.getMarketsByCategory);
  // const platforms = useQuery(api.platforms.getPlatformStatus);

  const mockArbitrageStats = {
    activeCount: 15,
    averageProfit: 8.3,
    topOpportunities: [
      { groupId: "Crypto", buyPrice: 0.30, sellPrice: 0.35, profitMargin: 16.7 },
      { groupId: "Stocks", buyPrice: 0.50, sellPrice: 0.57, profitMargin: 14.0 },
      { groupId: "Sports", buyPrice: 0.70, sellPrice: 0.79, profitMargin: 12.9 },
    ],
  };

  const mockTrendingMarkets = [
    { _id: "trend1", title: "Global AI Chip Supremacy by 2026", category: "Technology", totalVolume: 2500000 },
    { _id: "trend2", title: "Next UK Prime Minister", category: "Politics", totalVolume: 1800000 },
    { _id: "trend3", title: "Commercial Moon Base by 2035", category: "Space", totalVolume: 1200000 },
    { _id: "trend4", title: "Global Average Temperature to Exceed 1.5C by 2028", category: "Climate", totalVolume: 950000 },
    { _id: "trend5", title: "World Cup 2026 Winner", category: "Sports", totalVolume: 3000000 },
  ];

  const mockMarketsByCategory = [
    { name: "Politics", count: 150, totalVolume: 12500000 },
    { name: "Technology", count: 120, totalVolume: 9800000 },
    { name: "Finance", count: 90, totalVolume: 15200000 },
    { name: "Sports", count: 200, totalVolume: 22000000 },
    { name: "Science", count: 70, totalVolume: 6500000 },
  ];

  const mockPlatforms = [
    { _id: "platform1", displayName: "Kalshi", syncStatus: "active", lastSync: new Date('2025-05-31T08:55:00Z').getTime() },
    { _id: "platform2", displayName: "Polymarket", syncStatus: "active", lastSync: new Date('2025-05-31T08:50:00Z').getTime() },
    { _id: "platform3", displayName: "PredictIt", syncStatus: "error", lastSync: new Date('2025-05-30T12:00:00Z').getTime() },
    { _id: "platform4", displayName: "Manifold", syncStatus: "syncing", lastSync: new Date('2025-05-31T08:58:00Z').getTime() },
    { _id: "platform5", displayName: "Futuur", syncStatus: "active", lastSync: new Date('2025-05-31T08:45:00Z').getTime() },
  ];

  const arbitrageStats = mockArbitrageStats;
  const trendingMarkets = mockTrendingMarkets;
  const marketsByCategory = mockMarketsByCategory;
  const platforms = mockPlatforms;

  const stats = [
    {
      title: "Active Arbitrage",
      value: arbitrageStats?.activeCount || 0,
      change: "+12%",
      positive: true,
      icon: "💰",
    },
    {
      title: "Avg Profit Margin",
      value: `${arbitrageStats?.averageProfit?.toFixed(1) || 0}%`,
      change: "+2.1%",
      positive: true,
      icon: "📈",
    },
    {
      title: "Markets Tracked",
      value: trendingMarkets?.length || 0,
      change: "+5%",
      positive: true,
      icon: "🎯",
    },
    {
      title: "Platforms",
      value: platforms?.filter(p => p.syncStatus === "active").length || 0,
      change: "0%",
      positive: true,
      icon: "🔗",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000] p-6 rounded-lg dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h2>
        <p className="text-gray-600 mt-1 dark:text-gray-400">Overview of prediction market opportunities</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-lg border-4 border-black p-6 shadow-[8px_8px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000] hover:translate-x-[4px] hover:translate-y-[4px] transition-all dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000] dark:hover:shadow-[4px_4px_0px_0px_#000]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-600 uppercase tracking-wider dark:text-gray-400">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1 dark:text-white">{stat.value}</p>
              </div>
              <div className="text-2xl">{stat.icon}</div>
            </div>
            <div className="mt-4 flex items-center">
              <span className={`text-sm font-bold px-2 py-1 rounded border-2 border-black ${
                stat.positive ? "bg-green-300 text-green-800" : "bg-red-300 text-red-800"
              }`}>
                {stat.change}
              </span>
              <span className="text-sm text-gray-500 ml-2 font-medium dark:text-gray-400">vs last week</span>
            </div>
          </div>
        ))}
      </div>

      {/* Top Arbitrage Opportunities */}
      <div className="bg-white rounded-lg border-4 border-black p-6 shadow-[8px_8px_0px_0px_#000] dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2 dark:text-white">
          🔥 <span>Top Arbitrage Opportunities</span>
        </h3>
        {arbitrageStats?.topOpportunities?.length ? (
          <div className="space-y-3">
            {arbitrageStats.topOpportunities.map((opp, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border-2 border-black shadow-[4px_4px_0px_0px_#000] dark:bg-gray-700 dark:border-black dark:shadow-[4px_4px_0px_0px_#000]">
                <div className="flex-1">
                  <p className="font-bold text-gray-900 dark:text-white">Market Group #{opp.groupId.slice(-6)}</p>
                  <p className="text-sm text-gray-600 font-medium dark:text-gray-400">
                    Buy at {opp.buyPrice.toFixed(3)} → Sell at {opp.sellPrice.toFixed(3)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-600 text-lg">+{opp.profitMargin.toFixed(1)}%</p>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wider dark:text-gray-400">profit</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">💤</div>
            <p className="text-gray-500 font-medium dark:text-gray-400">No arbitrage opportunities found</p>
          </div>
        )}
      </div>

      {/* Market Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border-4 border-black p-6 shadow-[8px_8px_0px_0px_#000] dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2 dark:text-white">
            📊 <span>Markets by Category</span>
          </h3>
          {marketsByCategory?.length ? (
            <div className="space-y-3">
              {marketsByCategory.slice(0, 5).map((category, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded border-2 border-black dark:bg-gray-700 dark:border-black">
                  <span className="font-bold text-gray-900 dark:text-white">{category.name}</span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-gray-600 dark:text-gray-300">{category.count} markets</span>
                    <p className="text-xs text-gray-500 font-medium dark:text-gray-400">
                      ${(category.totalVolume / 1000).toFixed(0)}k volume
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">📊</div>
              <p className="text-gray-500 font-medium dark:text-gray-400">Loading market data...</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border-4 border-black p-6 shadow-[8px_8px_0px_0px_#000] dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2 dark:text-white">
            🚀 <span>Trending Markets</span>
          </h3>
          {trendingMarkets?.length ? (
            <div className="space-y-3">
              {trendingMarkets.slice(0, 5).map((market, index) => (
                <div key={market._id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded border-2 border-black dark:bg-gray-700 dark:border-black">
                  <span className="text-sm font-bold text-gray-700 mt-1 bg-yellow-300 px-2 py-1 rounded border border-black dark:text-gray-900 dark:bg-yellow-400 dark:border-black">#{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate dark:text-white">{market.title}</p>
                    <p className="text-sm text-gray-600 font-medium dark:text-gray-400">{market.category || "Uncategorized"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      ${(market.totalVolume || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider dark:text-gray-400">volume</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">🚀</div>
              <p className="text-gray-500 font-medium dark:text-gray-400">Loading trending markets...</p>
            </div>
          )}
        </div>
      </div>

      {/* Platform Status */}
      <div className="bg-white rounded-lg border-4 border-black p-6 shadow-[8px_8px_0px_0px_#000] dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2 dark:text-white">
          🔗 <span>Platform Status</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {platforms?.map((platform) => (
            <div key={platform._id} className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_#000] dark:bg-gray-700 dark:border-black dark:shadow-[2px_2px_0px_0px_#000]">
              <div className={`w-4 h-4 rounded-full border-2 border-black ${
                platform.syncStatus === "active" ? "bg-green-400" :
                platform.syncStatus === "error" ? "bg-red-400" :
                "bg-yellow-400"
              }`} />
              <div className="flex-1">
                <p className="font-bold text-gray-900 dark:text-white">{platform.displayName}</p>
                <p className="text-xs text-gray-500 font-medium dark:text-gray-400">
                  {platform.lastSync ? 
                    `Last sync: ${new Date(platform.lastSync).toLocaleTimeString()}` :
                    "Never synced"
                  }
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
