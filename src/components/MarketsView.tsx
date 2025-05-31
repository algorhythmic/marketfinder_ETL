import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";

export function MarketsView() {
  const [selectedPlatform, setSelectedPlatform] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  const platforms = useQuery(api.platforms.listPlatforms);
  const markets = useQuery(api.markets.getMarkets, {
    platformId: selectedPlatform ? selectedPlatform as any : undefined,
    category: selectedCategory || undefined,
    search: searchTerm || undefined,
    limit: 50,
  });

  const categories = Array.from(new Set(markets?.map(m => m.category).filter(Boolean))) as string[];

  return (
    <div className="space-y-6">
      {/* Header Description (Title moved to main app header) */}
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000] p-6 rounded-lg dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
        <p className="text-gray-600 mt-1 font-medium dark:text-white">Browse prediction markets across all platforms</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border-4 border-black p-6 shadow-[8px_8px_0px_0px_#000] dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider dark:text-gray-300">Search</label>
            <input
              type="text"
              placeholder="Search markets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border-2 border-black rounded-md px-3 py-2 text-sm font-medium shadow-[4px_4px_0px_0px_#000] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-black dark:text-white dark:placeholder-gray-400 dark:shadow-[4px_4px_0px_0px_#000] dark:focus:ring-blue-400 dark:focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider dark:text-gray-300">Platform</label>
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="w-full border-2 border-black rounded-md px-3 py-2 text-sm font-medium shadow-[4px_4px_0px_0px_#000] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-black dark:text-white dark:shadow-[4px_4px_0px_0px_#1f2937] dark:focus:ring-blue-400 dark:focus:border-blue-400"
            >
              <option value="">All Platforms</option>
              {platforms?.map((platform) => (
                <option key={platform._id} value={platform._id}>
                  {platform.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider dark:text-gray-300">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full border-2 border-black rounded-md px-3 py-2 text-sm font-medium shadow-[4px_4px_0px_0px_#000] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-black dark:text-white dark:shadow-[4px_4px_0px_0px_#1f2937] dark:focus:ring-blue-400 dark:focus:border-blue-400"
            >
              <option value="">All Categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Markets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {markets?.map((market) => (
          <div key={market._id} className="bg-white rounded-lg border-4 border-black p-6 shadow-[8px_8px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000] hover:translate-x-[4px] hover:translate-y-[4px] transition-all dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000] dark:hover:shadow-[4px_4px_0px_0px_#000]">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-2 dark:text-white">{market.title}</h3>
                <p className="text-sm text-gray-600 mb-2 font-medium dark:text-gray-400">{market.description}</p>
                <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                  <span className="bg-blue-300 text-blue-800 px-2 py-1 rounded border-2 border-black text-xs font-bold uppercase tracking-wider dark:bg-blue-700 dark:text-blue-200 dark:border-black">
                    {market.category || "Uncategorized"}
                  </span>
                  <span className={`px-2 py-1 rounded border-2 border-black text-xs font-bold uppercase tracking-wider ${
                    market.status === "active" ? "bg-green-300 text-green-800 dark:bg-green-700 dark:text-green-200 dark:border-black" :
                    market.status === "closed" ? "bg-yellow-300 text-yellow-800 dark:bg-yellow-600 dark:text-yellow-100 dark:border-black" :
                    "bg-gray-300 text-gray-800 dark:bg-gray-600 dark:text-gray-200 dark:border-black"
                  }`}>
                    {market.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Outcomes */}
            <div className="space-y-2 mb-4">
              {market.outcomes.map((outcome) => (
                <div key={outcome.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border-2 border-black dark:bg-gray-700 dark:border-black">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{outcome.name}</span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-gray-900 bg-yellow-300 px-2 py-1 rounded border border-black dark:text-gray-900 dark:bg-yellow-400 dark:border-black">
                      {(outcome.price * 100).toFixed(1)}¢
                    </span>
                    {outcome.volume && (
                      <div className="text-xs text-gray-500 font-medium mt-1 dark:text-gray-400">
                        ${outcome.volume.toLocaleString()} vol
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Market Info */}
            <div className="flex justify-between items-center text-sm text-gray-500 border-t-2 border-black pt-4 dark:text-gray-400 dark:border-black">
              <span className="font-bold dark:text-gray-300">
                {market.totalVolume ? `$${market.totalVolume.toLocaleString()} total volume` : "No volume data"}
              </span>
              <span className="font-medium dark:text-gray-400">Updated {new Date(market.lastUpdated).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>

      {!markets?.length && (
        <div className="text-center py-12 bg-white border-4 border-black rounded-lg shadow-[8px_8px_0px_0px_#000] dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
          <div className="text-gray-400 text-6xl mb-4 dark:text-gray-500">📈</div>
          <h3 className="text-lg font-bold text-gray-900 mb-2 dark:text-white">No Markets Found</h3>
          <p className="text-gray-500 font-medium dark:text-gray-400">Try adjusting your search filters</p>
        </div>
      )}
    </div>
  );
}
