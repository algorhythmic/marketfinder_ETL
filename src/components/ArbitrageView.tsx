import { useState } from "react";

export function ArbitrageView() {
  const [minProfitMargin, setMinProfitMargin] = useState(2);
  // const opportunities = useQuery(api.arbitrage.getArbitrageOpportunities, {
  //   minProfitMargin,
  //   limit: 100,
  // });

  const mockOpportunities = [
    {
      _id: "mock1",
      group: { name: "US Election 2024", category: "Politics" },
      buyMarket: { platform: { displayName: "Kalshi" }, title: "Candidate A to win US Presidency" },
      sellMarket: { platform: { displayName: "Polymarket" }, title: "Candidate A to win US Presidency" },
      profitMargin: 12.5,
      buyPrice: 0.40,
      sellPrice: 0.45,
      detectedAt: new Date('2025-05-30T10:00:00Z').getTime(),
    },
    {
      _id: "mock2",
      group: { name: "Stock Market Futures", category: "Finance" },
      buyMarket: { platform: { displayName: "PredictIt" }, title: "S&P 500 to close above 5500 by EOY" },
      sellMarket: { platform: { displayName: "Manifold" }, title: "S&P 500 > 5500 end of 2025" },
      profitMargin: 7.2,
      buyPrice: 0.65,
      sellPrice: 0.70,
      detectedAt: new Date('2025-05-31T08:30:00Z').getTime(),
    },
    {
      _id: "mock3",
      group: { name: "Premier League Winner", category: "Sports" },
      buyMarket: { platform: { displayName: "Insight Prediction" }, title: "Manchester City to win Premier League" },
      sellMarket: { platform: { displayName: "Futuur" }, title: "Manchester City wins Premier League 2024/25" },
      profitMargin: 3.1,
      buyPrice: 0.30,
      sellPrice: 0.31,
      detectedAt: new Date('2025-05-31T09:15:00Z').getTime(),
    },
    {
      _id: "mock4",
      group: { name: "Tech Innovations", category: "Technology" },
      buyMarket: { platform: { displayName: "Kalshi" }, title: "AGI by 2030" },
      sellMarket: { platform: { displayName: "Polymarket" }, title: "Artificial General Intelligence by 2030" },
      profitMargin: 15.0,
      buyPrice: 0.10,
      sellPrice: 0.115,
      detectedAt: new Date('2025-05-29T14:00:00Z').getTime(),
    }
  ];

  const opportunities = mockOpportunities.filter(opp => opp.profitMargin >= minProfitMargin);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000] p-6 rounded-lg dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Arbitrage Opportunities</h2>
            <p className="text-gray-600 mt-1 font-medium dark:text-gray-400">Real-time profit opportunities across platforms</p>
          </div>
          <div className="flex items-center space-x-4">
            <label className="text-sm font-bold text-gray-700 uppercase tracking-wider dark:text-gray-300">Min Profit:</label>
            <select
              value={minProfitMargin}
              onChange={(e) => setMinProfitMargin(Number(e.target.value))}
              className="border-2 border-black rounded-md px-3 py-2 text-sm font-bold shadow-[4px_4px_0px_0px_#000] focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-black dark:text-white dark:shadow-[4px_4px_0px_0px_#000] dark:focus:ring-blue-400"
            >
              <option value={1}>1%+</option>
              <option value={2}>2%+</option>
              <option value={5}>5%+</option>
              <option value={10}>10%+</option>
            </select>
          </div>
        </div>
      </div>

      {/* Opportunities Table */}
      <div className="bg-white rounded-lg border-4 border-black shadow-[8px_8px_0px_0px_#000] overflow-hidden dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-yellow-300 border-b-4 border-black dark:bg-gray-700 dark:border-black">
              <tr>
                <th className="px-2 py-2 md:px-4 md:py-3 text-left text-xs font-bold text-black uppercase tracking-wider dark:text-gray-300">
                  Market Group
                </th>
                <th className="px-2 py-2 md:px-4 md:py-3 text-left text-xs font-bold text-black uppercase tracking-wider dark:text-gray-300">
                  Buy Market
                </th>
                <th className="px-2 py-2 md:px-4 md:py-3 text-left text-xs font-bold text-black uppercase tracking-wider dark:text-gray-300">
                  Sell Market
                </th>
                <th className="px-2 py-2 md:px-4 md:py-3 text-left text-xs font-bold text-black uppercase tracking-wider dark:text-gray-300">
                  Profit Margin
                </th>
                <th className="px-2 py-2 md:px-4 md:py-3 text-left text-xs font-bold text-black uppercase tracking-wider dark:text-gray-300">
                  Prices
                </th>
                <th className="px-2 py-2 md:px-4 md:py-3 text-left text-xs font-bold text-black uppercase tracking-wider dark:text-gray-300">
                  Detected
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y-4 divide-black dark:bg-gray-800 dark:divide-gray-700">
              {opportunities?.filter((opp): opp is NonNullable<typeof opp> => opp !== null).map((opp) => (
                <tr key={opp._id} className="hover:bg-yellow-50 transition-colors dark:hover:bg-gray-700/50">
                  <td className="px-2 py-2 md:px-4 md:py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[100px] md:max-w-xs">{opp.group?.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[80px] md:max-w-xs">{opp.group?.category}</div>
                    </div>
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[80px] md:max-w-[150px]">{opp.buyMarket?.platform?.displayName}</div>
                      <div className="text-sm text-gray-500 max-w-[120px] md:max-w-sm truncate dark:text-gray-400">{opp.buyMarket?.title}</div>
                    </div>
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[80px] md:max-w-[150px]">{opp.sellMarket?.platform?.displayName}</div>
                      <div className="text-sm text-gray-500 max-w-[120px] md:max-w-sm truncate dark:text-gray-400">{opp.sellMarket?.title}</div>
                    </div>
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-bold rounded border-2 border-black shadow-[2px_2px_0px_0px_#000] ${
                      opp.profitMargin >= 10 ? 'bg-green-300 text-green-800 dark:bg-green-700 dark:text-green-200 dark:border-black' :
                      opp.profitMargin >= 5 ? 'bg-yellow-300 text-yellow-800 dark:bg-yellow-600 dark:text-yellow-100 dark:border-black' :
                      'bg-blue-300 text-blue-800 dark:bg-blue-700 dark:text-blue-200 dark:border-black'
                    }`}>
                      +{opp.profitMargin.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-4 text-sm text-gray-900 dark:text-gray-300">
                    <div>Buy: {opp.buyPrice.toFixed(3)}</div>
                    <div>Sell: {opp.sellPrice.toFixed(3)}</div>
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-4 text-sm text-gray-500 dark:text-gray-400 truncate max-w-[100px] md:max-w-xs">
                    {new Date(opp.detectedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!opportunities?.length && (
          <div className="text-center py-12 bg-white border-4 border-black rounded-lg shadow-[8px_8px_0px_0px_#000] dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
            <div className="text-gray-400 text-6xl mb-4 dark:text-gray-500">💰</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2 dark:text-white">No Arbitrage Opportunities</h3>
            <p className="text-gray-500 font-medium dark:text-gray-400">
              {minProfitMargin > 2 
                ? `Try lowering the minimum profit margin below ${minProfitMargin}%`
                : "Check back later for new opportunities"
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
