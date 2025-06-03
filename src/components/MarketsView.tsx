import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { Id } from "../../convex/_generated/dataModel"; // Added import for Id
import { MarketDataTable } from "./market-data-table"; // Added import
import { columns, Market } from "./market-table-columns"; // Added import

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // Shadcn select

export function MarketsView() {
  const [selectedPlatform, setSelectedPlatform] = useState<Id<"platforms"> | undefined>(undefined);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = searchTerm; // Assuming you have a debouncedSearchTerm variable, or replace with searchTerm directly if not

  const platforms = useQuery(api.platforms.listPlatforms);
  // Corrected args for api.markets.getMarkets
  const queryArgs: { platformId?: Id<"platforms">; category?: string; searchTerm?: string; count?: number } = {
    count: 100, // Fetch a larger number for client-side pagination/filtering
  };
  if (selectedPlatform) queryArgs.platformId = selectedPlatform;
  if (selectedCategory) queryArgs.category = selectedCategory;
  if (debouncedSearchTerm) queryArgs.searchTerm = debouncedSearchTerm; // Use searchTerm

  const markets = useQuery(api.markets.getMarkets, queryArgs);

  const categories = Array.from(new Set(markets?.map(m => m.category).filter(Boolean))) as string[];
  const marketData: Market[] = markets || []; // Ensure data is an array for the table

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
            <Select
              value={selectedPlatform ? (selectedPlatform as string) : "all-platforms"} 
              onValueChange={(value: string) => setSelectedPlatform(value === "all-platforms" ? undefined : value as Id<"platforms">)}
            >
              <SelectTrigger className="w-full border-2 border-black rounded-md px-3 py-2 text-sm font-medium shadow-[4px_4px_0px_0px_#000] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-black dark:text-white dark:shadow-[4px_4px_0px_0px_#1f2937] dark:focus:ring-blue-400 dark:focus:border-blue-400">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000]">
                <SelectItem value="all-platforms" className="font-medium hover:bg-yellow-300">All Platforms</SelectItem> 
                {platforms?.map((platform) => (
                  <SelectItem key={platform._id} value={platform._id as string} className="font-medium hover:bg-yellow-300">
                    {platform.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider dark:text-gray-300">Category</label>
            <Select
              value={selectedCategory}
              onValueChange={(value: string) => setSelectedCategory(value === "all-categories" ? "" : value)}
            >
              <SelectTrigger className="w-full border-2 border-black rounded-md px-3 py-2 text-sm font-medium shadow-[4px_4px_0px_0px_#000] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-black dark:text-white dark:shadow-[4px_4px_0px_0px_#1f2937] dark:focus:ring-blue-400 dark:focus:border-blue-400">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000]">
                <SelectItem value="all-categories" className="font-medium hover:bg-yellow-300">All Categories</SelectItem> 
                {categories.map((category) => (
                  <SelectItem key={category} value={category} className="font-medium hover:bg-yellow-300">
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Markets Data Table */}
      {markets === undefined && (
        <div className="text-center py-12 bg-white border-4 border-black rounded-lg shadow-[8px_8px_0px_0px_#000] dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
          <div className="text-gray-400 text-6xl mb-4 animate-pulse dark:text-gray-500">⏳</div>
          <h3 className="text-lg font-bold text-gray-900 mb-2 dark:text-white">Loading Markets...</h3>
          <p className="text-gray-500 font-medium dark:text-gray-400">Please wait a moment.</p>
        </div>
      )}
      {markets !== undefined && (
         <MarketDataTable columns={columns} data={marketData} />
      )}

      {markets !== undefined && !marketData.length && (
        <div className="text-center py-12 bg-white border-4 border-black rounded-lg shadow-[8px_8px_0px_0px_#000] dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
          <div className="text-gray-400 text-6xl mb-4 dark:text-gray-500">📉</div> {/* Changed icon for no results vs loading */}
          <h3 className="text-lg font-bold text-gray-900 mb-2 dark:text-white">No Markets Found</h3>
          <p className="text-gray-500 font-medium dark:text-gray-400">Try adjusting your search filters or check back later.</p>
        </div>
      )}
    </div>
  );
}
