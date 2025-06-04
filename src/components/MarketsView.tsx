import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { MarketDataTable } from "./market-data-table";
import { columns, MarketWithPlatform } from "./market-table-columns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const INITIAL_MAX_VALUE = 1000000; // Default max for sliders before data loads

export function MarketsView() {
  const [selectedPlatform, setSelectedPlatform] = useState<Id<"platforms"> | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState("");

  // State for sliders
  const [minMaxVolume, setMinMaxVolume] = useState<[number, number]>([0, Math.round(INITIAL_MAX_VALUE)]);
  const [volumeRange, setVolumeRange] = useState<[number, number]>([0, Math.round(INITIAL_MAX_VALUE)]);
  const [minMaxLiquidity, setMinMaxLiquidity] = useState<[number, number]>([0, Math.round(INITIAL_MAX_VALUE)]);
  const [liquidityRange, setLiquidityRange] = useState<[number, number]>([0, Math.round(INITIAL_MAX_VALUE)]);
  const [endDateFilter, setEndDateFilter] = useState<Date | undefined>(undefined);

  const platforms = useQuery(api.platforms.listPlatforms);
  const queryArgs: { platformId?: Id<"platforms">; searchTerm?: string; count?: number } = {
    count: 200, // Fetch more for client-side filtering
  };
  if (selectedPlatform) queryArgs.platformId = selectedPlatform;
  // searchTerm is handled by client-side filtering in MarketDataTable

  const markets = useQuery(api.markets.getMarkets, queryArgs);
  const marketData: MarketWithPlatform[] = markets || [];

  useEffect(() => {
    if (markets && markets.length > 0) {
      let dataMinVol = Infinity, dataMaxVol = 0;
      let dataMinLiq = Infinity, dataMaxLiq = 0;

      markets.forEach(market => {
        // Round all values to whole numbers
        const vol = Math.round(market.totalVolume ?? 0);
        const liq = Math.round(market.liquidity ?? 0);
        dataMinVol = Math.min(dataMinVol, vol);
        dataMaxVol = Math.max(dataMaxVol, vol);
        dataMinLiq = Math.min(dataMinLiq, liq);
        dataMaxLiq = Math.max(dataMaxLiq, liq);
      });

      // Determine the slider's operational min/max
      // Thumbs will be set to [dataMinVol, dataMaxVol]
      // Slider track will go from sliderMinVol to sliderMaxVol

      const sliderMinVol = 0;
      const sliderMaxVol = Math.max(Math.round(dataMaxVol), 1000); // Ensure slider has a decent upper range
      setMinMaxVolume([sliderMinVol, sliderMaxVol]);
      setVolumeRange([Math.round(dataMinVol), Math.round(dataMaxVol)]);

      const sliderMinLiq = 0;
      const sliderMaxLiq = Math.max(Math.round(dataMaxLiq), 1000);
      setMinMaxLiquidity([sliderMinLiq, sliderMaxLiq]);
      setLiquidityRange([Math.round(dataMinLiq), Math.round(dataMaxLiq)]);

    } else {
      // Default ranges if no markets or data still loading
      const roundedMax = Math.round(INITIAL_MAX_VALUE);
      setMinMaxVolume([0, roundedMax]);
      setVolumeRange([0, roundedMax]);
      setMinMaxLiquidity([0, roundedMax]);
      setLiquidityRange([0, roundedMax]);
    }
  }, [markets]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000] p-6 rounded-lg dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
        <p className="text-gray-600 mt-1 font-medium dark:text-white">Browse prediction markets across all platforms</p>
      </div>

      <div className="bg-white rounded-lg border-4 border-black p-6 shadow-[8px_8px_0px_0px_#000] dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000] mb-6">
        <div className="grid grid-cols-1 gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="search-markets" className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider dark:text-gray-300">Search</Label>
            <input
              id="search-markets"
              type="text"
              placeholder="Search markets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border-2 border-black rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium shadow-[4px_4px_0px_0px_#000] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-black dark:text-white dark:placeholder-gray-400 dark:shadow-[4px_4px_0px_0px_#000] dark:focus:ring-blue-400 dark:focus:border-blue-400"
            />
          </div>
          <div>
            <Label htmlFor="platform-select" className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider dark:text-gray-300">Platform</Label>
            <Select
              value={selectedPlatform ? (selectedPlatform as string) : "all-platforms"} 
              onValueChange={(value: string) => setSelectedPlatform(value === "all-platforms" ? undefined : value as Id<"platforms">)}
            >
              <SelectTrigger id="platform-select" className="w-full border-2 border-black rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium shadow-[4px_4px_0px_0px_#000] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-black dark:text-white dark:shadow-[4px_4px_0px_0px_#1f2937] dark:focus:ring-blue-400 dark:focus:border-blue-400">
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
          
          </div>

          {/* Volume Slider */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700 max-w-sm mx-auto w-full">
            <div className="grid w-full gap-3">
              <div className="flex items-center justify-between gap-2 sm:gap-4">
                <Label htmlFor="volume-slider" className="block text-xs sm:text-sm font-bold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                  Volume
                </Label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">$</span>
                    <div className="relative">
                      <Input
                        type="number"
                        value={volumeRange[0]}
                        onChange={(e) => {
                          const newMin = Math.min(Number(e.target.value), volumeRange[1]);
                          setVolumeRange([newMin, volumeRange[1]]);
                        }}
                        className="h-7 sm:h-8 text-xs sm:text-sm border-2 border-black rounded-md shadow-[2px_2px_0px_0px_#000] dark:bg-gray-700 dark:border-black dark:text-white min-w-[40px] w-full"
                        min={minMaxVolume[0]}
                        max={volumeRange[1]}
                        style={{
                          width: `${Math.max(40, String(volumeRange[0]).length * 9 + 20)}px`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-gray-500">-</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">$</span>
                    <div className="relative">
                      <Input
                        type="number"
                        value={volumeRange[1]}
                        onChange={(e) => {
                          const newMax = Math.max(Number(e.target.value), volumeRange[0]);
                          setVolumeRange([volumeRange[0], newMax]);
                        }}
                        className="h-7 sm:h-8 text-xs sm:text-sm border-2 border-black rounded-md shadow-[2px_2px_0px_0px_#000] dark:bg-gray-700 dark:border-black dark:text-white min-w-[40px] w-full"
                        min={volumeRange[0]}
                        max={minMaxVolume[1]}
                        style={{
                          width: `${Math.max(40, String(volumeRange[1]).length * 9 + 20)}px`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <Slider
                id="volume-slider"
                min={minMaxVolume[0]}
                max={minMaxVolume[1]}
                step={Math.max(1, Math.floor((minMaxVolume[1] - minMaxVolume[0]) / 100))}
                value={volumeRange}
                onValueChange={(value: number[]) => setVolumeRange([Math.round(value[0]), Math.round(value[1])] as [number, number])}
                className="w-full"
              />
            </div>
          </div>
          
          {/* Liquidity Slider */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700 max-w-sm mx-auto w-full">
            <div className="grid w-full gap-3">
              <div className="flex items-center justify-between gap-2 sm:gap-4">
                <Label htmlFor="liquidity-slider" className="block text-xs sm:text-sm font-bold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                  Liquidity
                </Label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">$</span>
                    <div className="relative">
                      <Input
                        type="number"
                        value={liquidityRange[0]}
                        onChange={(e) => {
                          const value = Math.round(Number(e.target.value));
                          const newMin = Math.min(value, liquidityRange[1]);
                          setLiquidityRange([newMin, liquidityRange[1]]);
                        }}
                        className="h-7 sm:h-8 text-xs sm:text-sm border-2 border-black rounded-md shadow-[2px_2px_0px_0px_#000] dark:bg-gray-700 dark:border-black dark:text-white min-w-[40px] w-full"
                        min={minMaxLiquidity[0]}
                        max={liquidityRange[1]}
                        style={{
                          width: `${Math.max(40, String(liquidityRange[0]).length * 9 + 20)}px`
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-gray-500">-</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">$</span>
                    <div className="relative">
                      <Input
                        type="number"
                        value={liquidityRange[1]}
                        onChange={(e) => {
                          const value = Math.round(Number(e.target.value));
                          const newMax = Math.max(value, liquidityRange[0]);
                          setLiquidityRange([liquidityRange[0], newMax]);
                        }}
                        className="h-7 sm:h-8 text-xs sm:text-sm border-2 border-black rounded-md shadow-[2px_2px_0px_0px_#000] dark:bg-gray-700 dark:border-black dark:text-white min-w-[40px] w-full"
                        min={liquidityRange[0]}
                        max={minMaxLiquidity[1]}
                        style={{
                          width: `${Math.max(40, String(liquidityRange[1]).length * 9 + 20)}px`
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <Slider
                id="liquidity-slider"
                min={minMaxLiquidity[0]}
                max={minMaxLiquidity[1]}
                step={Math.max(1, Math.floor((minMaxLiquidity[1] - minMaxLiquidity[0]) / 100))}
                value={liquidityRange}
                onValueChange={(value: number[]) => setLiquidityRange([Math.round(value[0]), Math.round(value[1])] as [number, number])}
                className="w-full"
              />
            </div>
          </div>

          {/* End Date Filter */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700 max-w-sm mx-auto w-full">
            <div className="grid w-full gap-3">
            <Label htmlFor="end-date-picker" className="block text-xs sm:text-sm font-bold text-gray-700 mb-1 sm:mb-2 uppercase tracking-wider dark:text-gray-300">End Date Up To</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="end-date-picker"
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left text-xs sm:text-sm font-medium border-2 border-black rounded-md px-2 sm:px-3 py-1.5 sm:py-2 shadow-[4px_4px_0px_0px_#000] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-black dark:text-white dark:shadow-[4px_4px_0px_0px_#1f2937] dark:focus:ring-blue-400 dark:focus:border-blue-400",
                    !endDateFilter && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDateFilter ? format(endDateFilter, "PPP") : <span>Pick an end date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000] dark:bg-gray-800 dark:border-black" align="start">
                <Calendar
                  mode="single"
                  selected={endDateFilter}
                  onSelect={setEndDateFilter}
                  initialFocus
                  className="dark:[&_*]:text-white"
                />
              </PopoverContent>
            </Popover>
            </div>
          </div>
        </div>
      </div>

      {markets === undefined && (
        <div className="text-center py-12 bg-white border-4 border-black rounded-lg shadow-[8px_8px_0px_0px_#000] dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
          <div className="text-gray-400 text-6xl mb-4 animate-pulse dark:text-gray-500">⏳</div>
          <h3 className="text-lg font-bold text-gray-900 mb-2 dark:text-white">Loading Markets...</h3>
          <p className="text-gray-500 font-medium dark:text-gray-400">Please wait a moment.</p>
        </div>
      )}
      {markets !== undefined && (
         <MarketDataTable 
            columns={columns} 
            data={marketData} 
            externalGlobalFilter={searchTerm} 
            volumeRangeFilter={volumeRange}
            liquidityRangeFilter={liquidityRange}
            endDateFilter={endDateFilter}
          />
      )}

      {markets !== undefined && !marketData.length && (
        <div className="text-center py-12 bg-white border-4 border-black rounded-lg shadow-[8px_8px_0px_0px_#000] dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
          <div className="text-gray-400 text-6xl mb-4 dark:text-gray-500">📉</div>
          <h3 className="text-lg font-bold text-gray-900 mb-2 dark:text-white">No Markets Found</h3>
          <p className="text-gray-500 font-medium dark:text-gray-400">Try adjusting your search filters or check back later.</p>
        </div>
      )}
    </div>
  );
}
