import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function MarketGroupsView() {
  const groups = useQuery(api.semanticAnalysis.getMarketGroups);

  return (
    <div className="space-y-6">
      {/* Header Description (Title moved to main app header) */}
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000] p-6 rounded-lg dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
        <p className="text-gray-600 mt-1 font-medium dark:text-white">Semantically similar markets grouped together</p>
      </div>

      {/* Groups Grid */}
      <div className="space-y-6">
        {groups?.map((group) => (
          <div key={group._id} className="bg-white rounded-lg border-4 border-black p-6 shadow-[8px_8px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000] hover:translate-x-[4px] hover:translate-y-[4px] transition-all dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000] dark:hover:shadow-[4px_4px_0px_0px_#000]">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{group.name}</h3>
                  <span className={`px-2 py-1 rounded border-2 border-black text-xs font-bold uppercase tracking-wider ${
                    group.isVerified ? "bg-green-300 text-green-800 dark:bg-green-700 dark:text-green-200 dark:border-black" : "bg-yellow-300 text-yellow-800 dark:bg-yellow-600 dark:text-yellow-100 dark:border-black"
                  }`}>
                    {group.isVerified ? "Verified" : "AI Generated"}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {(group.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2 dark:text-gray-400">{group.description}</p>
                <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                  <span className="bg-blue-300 text-blue-800 px-2 py-1 rounded border-2 border-black text-xs font-bold uppercase tracking-wider dark:bg-blue-700 dark:text-blue-200 dark:border-black">
                    {group.category}
                  </span>
                  <span>
                    {group.markets?.length || 0} markets
                  </span>
                  <span>
                    Last analyzed: {new Date(group.lastAnalyzed).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Markets in Group */}
            {group.markets && group.markets.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Markets in this group:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {group.markets.filter((market): market is NonNullable<typeof market> => market !== null).map((market) => (
                    <div key={market._id} className="p-3 bg-gray-50 rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_#000] dark:bg-gray-700 dark:border-black dark:shadow-[2px_2px_0px_0px_#000]">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-medium text-gray-900 flex-1 pr-2 dark:text-white">
                          {market.title}
                        </span>
                        <span className="text-xs text-gray-500 whitespace-nowrap dark:text-gray-400">
                          {market.platform?.displayName}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className={`text-xs px-2 py-1 rounded border border-black font-bold uppercase tracking-wider ${
                          market.status === "active" ? "bg-green-300 text-green-800 dark:bg-green-700 dark:text-green-200 dark:border-black" :
                          market.status === "closed" ? "bg-yellow-300 text-yellow-800 dark:bg-yellow-600 dark:text-yellow-100 dark:border-black" :
                          "bg-gray-300 text-gray-800 dark:bg-gray-600 dark:text-gray-200 dark:border-black"
                        }`}>
                          {market.status}
                        </span>
                        {market.totalVolume && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ${market.totalVolume.toLocaleString()} vol
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!groups?.length && (
        <div className="text-center py-12 bg-white border-4 border-black rounded-lg shadow-[8px_8px_0px_0px_#000] dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
          <div className="text-gray-400 text-6xl mb-4 dark:text-gray-500">🔗</div>
          <h3 className="text-lg font-bold text-gray-900 mb-2 dark:text-white">No Market Groups</h3>
          <p className="text-gray-500 font-medium dark:text-gray-400">Market groups will appear here as markets are analyzed</p>
        </div>
      )}
    </div>
  );
}
