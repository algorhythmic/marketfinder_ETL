import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import React, { useState, useEffect, useMemo } from "react";
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
// Calendar imports
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";

export function MarketsView() {
  const [selectedPlatform, setSelectedPlatform] = useState<Id<"platforms"> | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState("");
  const [volumeRange, setVolumeRange] = useState<[number, number]>([0, 1000000]);
  const [liquidityRange, setLiquidityRange] = useState<[number, number]>([0, 1000000]);
  const [endDateFilter, setEndDateFilter] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = React.useRef<HTMLDivElement>(null);

  // Handle click outside to close calendar
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setCalendarOpen(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Debounce search term and filters to reduce API calls
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const debouncedVolumeRange = useDebounce(volumeRange, 500);
  const debouncedLiquidityRange = useDebounce(liquidityRange, 500);

  const platforms = useQuery(api.platforms.listPlatforms);
  
  // Get market stats for slider ranges
  const marketStats = useQuery(api.markets.getMarketStats);

  // Update slider ranges when stats load
  useEffect(() => {
    if (marketStats) {
      setVolumeRange([marketStats.minVolume, marketStats.maxVolume]);
      setLiquidityRange([marketStats.minLiquidity, marketStats.maxLiquidity]);
    }
  }, [marketStats]);

  // Optimized query args with server-side filtering
  const queryArgs = useMemo(() => {
    const args: any = {
      count: 50, // Reduced from 200
    };

    if (selectedPlatform) args.platformId = selectedPlatform;
    if (debouncedSearchTerm) args.searchTerm = debouncedSearchTerm;
    if (debouncedVolumeRange[0] > (marketStats?.minVolume ?? 0)) {
      args.minVolume = debouncedVolumeRange[0];
    }
    if (debouncedVolumeRange[1] < (marketStats?.maxVolume ?? 1000000)) {
      args.maxVolume = debouncedVolumeRange[1];
    }
    if (debouncedLiquidityRange[0] > (marketStats?.minLiquidity ?? 0)) {
      args.minLiquidity = debouncedLiquidityRange[0];
    }
    if (debouncedLiquidityRange[1] < (marketStats?.maxLiquidity ?? 1000000)) {
      args.maxLiquidity = debouncedLiquidityRange[1];
    }
    if (endDateFilter) {
      args.endDateBefore = endDateFilter.getTime();
    }

    return args;
  }, [
    selectedPlatform,
    debouncedSearchTerm,
    debouncedVolumeRange,
    debouncedLiquidityRange,
    endDateFilter,
    marketStats,
  ]);

  const markets = useQuery(api.markets.getMarkets, queryArgs);
  const marketData: MarketWithPlatform[] = markets || [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000] p-6 rounded-lg dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
        <h1 className="text-2xl font-bold dark:text-white">Browse prediction markets across all platforms</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Search */}
        <div className="space-y-2">
          <Label className="dark:text-neutral-300">Search</Label>
          <Input
            placeholder="Search markets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full border-2 border-black rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium shadow-[4px_4px_0px_0px_#000] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder-neutral-400 dark:border-black dark:shadow-[4px_4px_0px_0px_#000]"
          />
        </div>

        {/* Platform */}
        <div className="space-y-2">
          <Label className="dark:text-neutral-300">Platform</Label>
          <Select
            value={selectedPlatform || "all-platforms"}
            onValueChange={(value) =>
              setSelectedPlatform(value === "all-platforms" ? undefined : value as Id<"platforms">)
            }
          >
            <SelectTrigger className="w-full border-2 border-black rounded-md px-3 py-2 text-sm shadow-[4px_4px_0px_0px_#000] focus:ring-2 focus:ring-offset-0 focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-800 dark:text-neutral-50 dark:border-black dark:shadow-[4px_4px_0px_0px_#000]">
              <SelectValue placeholder="Select a platform" />
            </SelectTrigger>
            <SelectContent className="dark:bg-neutral-900 dark:border-black dark:text-neutral-200">
              <SelectItem value="all-platforms">All Platforms</SelectItem>
              {platforms?.map((platform) => (
                <SelectItem key={platform._id} value={platform._id}>
                  {platform.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Volume Slider */}
        <div className="space-y-2">
          <Label className="dark:text-neutral-300">Volume</Label>
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              value={volumeRange[0]}
              onChange={(e) => {
                const newMin = Math.min(Number(e.target.value), volumeRange[1]);
                setVolumeRange([newMin, volumeRange[1]]);
              }}
              className="h-7 sm:h-8 text-xs sm:text-sm border-2 border-black rounded-md shadow-[2px_2px_0px_0px_#000] dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder-neutral-400 dark:border-black dark:shadow-[2px_2px_0px_0px_#000]"
              min={marketStats?.minVolume ?? 0}
              max={volumeRange[1]}
            />
            <Input
              type="number"
              value={volumeRange[1]}
              onChange={(e) => {
                const newMax = Math.max(Number(e.target.value), volumeRange[0]);
                setVolumeRange([volumeRange[0], newMax]);
              }}
              className="h-7 sm:h-8 text-xs sm:text-sm border-2 border-black rounded-md shadow-[2px_2px_0px_0px_#000] dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder-neutral-400 dark:border-black dark:shadow-[2px_2px_0px_0px_#000]"
              min={volumeRange[0]}
              max={marketStats?.maxVolume ?? 1000000}
            />
          </div>
          <Slider
            value={volumeRange}
            onValueChange={(value) => setVolumeRange([Math.round(value[0]), Math.round(value[1])] as [number, number])}
            min={marketStats?.minVolume ?? 0}
            max={marketStats?.maxVolume ?? 1000000}
            step={1000}
            className="w-full"
          />
        </div>

        {/* Liquidity Slider */}
        <div className="space-y-2">
          <Label className="dark:text-neutral-300">Liquidity</Label>
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              value={liquidityRange[0]}
              onChange={(e) => {
                const value = Math.round(Number(e.target.value));
                const newMin = Math.min(value, liquidityRange[1]);
                setLiquidityRange([newMin, liquidityRange[1]]);
              }}
              className="h-7 sm:h-8 text-xs sm:text-sm border-2 border-black rounded-md shadow-[2px_2px_0px_0px_#000] dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder-neutral-400 dark:border-black dark:shadow-[2px_2px_0px_0px_#000]"
              min={marketStats?.minLiquidity ?? 0}
              max={liquidityRange[1]}
            />
            <Input
              type="number"
              value={liquidityRange[1]}
              onChange={(e) => {
                const value = Math.round(Number(e.target.value));
                const newMax = Math.max(value, liquidityRange[0]);
                setLiquidityRange([liquidityRange[0], newMax]);
              }}
              className="h-7 sm:h-8 text-xs sm:text-sm border-2 border-black rounded-md shadow-[2px_2px_0px_0px_#000] dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder-neutral-400 dark:border-black dark:shadow-[2px_2px_0px_0px_#000]"
              min={liquidityRange[0]}
              max={marketStats?.maxLiquidity ?? 1000000}
            />
          </div>
          <Slider
            value={liquidityRange}
            onValueChange={(value) => setLiquidityRange([Math.round(value[0]), Math.round(value[1])] as [number, number])}
            min={marketStats?.minLiquidity ?? 0}
            max={marketStats?.maxLiquidity ?? 1000000}
            step={1000}
            className="w-full"
          />
        </div>
      </div>

      {/* End Date Filter */}
      <div className="space-y-2 relative">
        <Label className="dark:text-neutral-300">End Date Up To</Label>
        <div>
          <Button
            variant="ghost"
            onClick={() => setCalendarOpen(!calendarOpen)}
            className={cn(
              "w-full justify-start text-left font-medium border-2 border-black rounded-md px-3 py-2 text-sm shadow-[4px_4px_0px_0px_#000] focus:ring-2 focus:ring-offset-0 focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-800 dark:text-neutral-50 dark:border-black dark:shadow-[4px_4px_0px_0px_#000]",
              !endDateFilter && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {endDateFilter ? format(endDateFilter, "PPP") : "Pick an end date"}
          </Button>
          
          {calendarOpen && (
            <div 
              ref={calendarRef} 
              className="absolute z-50 mt-2"
            >
              <Calendar
                mode="single"
                selected={endDateFilter}
                onSelect={(date) => {
                  setEndDateFilter(date);
                  setCalendarOpen(false);
                }}
                initialFocus
                className="border-2 border-black rounded-md shadow-[4px_4px_0px_0px_#000] dark:border-black"
              />
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {markets === undefined && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <div className="text-center">
            <h3 className="text-lg font-semibold">Loading Markets...</h3>
            <p className="text-sm text-gray-600">Please wait a moment.</p>
          </div>
        </div>
      )}

      {/* Market Data Table */}
      {markets !== undefined && (
        <MarketDataTable 
          columns={columns} 
          data={marketData}
        />
      )}

      {/* No Results State */}
      {markets !== undefined && !marketData.length && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="text-center">
            <h3 className="text-lg font-semibold">No Markets Found</h3>
            <p className="text-sm text-gray-600">Try adjusting your search filters or check back later.</p>
          </div>
        </div>
      )}
    </div>
  );
}
