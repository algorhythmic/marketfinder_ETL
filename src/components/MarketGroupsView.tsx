import React, { useState } from 'react';
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";

export function MarketGroupsView() {
  const [arbitrageResults, setArbitrageResults] = useState<Record<string, any[]>>({});
  const [loadingArbitrage, setLoadingArbitrage] = useState<Record<string, boolean>>({});
  const [arbitrageError, setArbitrageError] = useState<Record<string, string | null>>({});

  const findArbitrageAction = useAction(api.arbitrage.findArbitrageForSelectedMarkets);
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

            {/* Markets in Group & Arbitrage Section */}
            {group.markets && group.markets.length > 0 && (
              <>
                {/* Arbitrage Button & Results Display Section */}
                <div className="mt-4 mb-2">
                  <button
                    onClick={() => {
                      if (!group.markets) return;
                      const marketIds = group.markets.filter((m): m is NonNullable<typeof m> => m !== null).map(m => m._id as any); // Cast to any for Id<"markets">
                      if (marketIds.length < 2) {
                        setArbitrageError(prev => ({ ...prev, [group._id]: 'Need at least two markets in a group to find arbitrage.' }));
                        return;
                      }
                      setLoadingArbitrage(prev => ({ ...prev, [group._id]: true }));
                      setArbitrageError(prev => ({ ...prev, [group._id]: null }));
                      // IIFE to handle async logic within the onClick handler
                      void (async () => {
                        try {
                          const result = await findArbitrageAction({ marketIds });
                        setArbitrageResults(prev => ({ ...prev, [group._id]: result.opportunities }));
                        if (result.opportunities.length === 0) {
                           setArbitrageError(prev => ({ ...prev, [group._id]: 'No arbitrage opportunities found for this group.' }));
                        }
                      } catch (error) {
                        console.error('Failed to find arbitrage:', error);
                          setArbitrageError(prev => ({ ...prev, [group._id]: 'Error finding arbitrage. Check console.' }));
                        }
                        setLoadingArbitrage(prev => ({ ...prev, [group._id]: false }));
                      })();
                    }}
                    disabled={loadingArbitrage[group._id]}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md border-2 border-black shadow-[4px_4px_0px_0px_#000] hover:shadow-[2px_2px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600 dark:border-black dark:shadow-[4px_4px_0px_0px_#000] dark:hover:shadow-[2px_2px_0px_0px_#000]"
                  >
                    {loadingArbitrage[group._id] ? 'Finding Arbitrage...' : 'Find Arbitrage for this Group'}
                  </button>
                </div>

                {loadingArbitrage[group._id] && <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Loading arbitrage opportunities...</p>}
                {arbitrageError[group._id] && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{arbitrageError[group._id]}</p>}
                
                {arbitrageResults[group._id] && arbitrageResults[group._id].length > 0 && (
                  <div className="mt-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Arbitrage Opportunities:</h4>
                    {arbitrageResults[group._id].map((opp: any, index: number) => (
                      <div key={index} className="p-3 bg-indigo-50 rounded-lg border-2 border-indigo-300 shadow-sm dark:bg-indigo-900/50 dark:border-indigo-700">
                        <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Opportunity {index + 1} (Profit: {(opp.profitMargin * 100).toFixed(1)}%)</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 mb-2">{opp.description}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                          <div className="bg-white p-2 rounded border border-gray-300 dark:bg-gray-700 dark:border-gray-600">
                            <p className="font-semibold">Leg A: {opp.marketA_leg.platformName}</p>
                            <p>Market: {opp.marketA_leg.marketTitle}</p>
                            <p>Outcome: {opp.marketA_leg.outcomeName} @ {opp.marketA_leg.price.toFixed(2)}</p>
                          </div>
                          <div className="bg-white p-2 rounded border border-gray-300 dark:bg-gray-700 dark:border-gray-600">
                            <p className="font-semibold">Leg B: {opp.marketB_leg.platformName}</p>
                            <p>Market: {opp.marketB_leg.marketTitle}</p>
                            <p>Outcome: {opp.marketB_leg.outcomeName} @ {opp.marketB_leg.price.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Original Markets in Group Section */}
                <div className="space-y-3 mt-4">
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
              </>
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
