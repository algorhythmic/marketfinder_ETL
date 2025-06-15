import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import React, { useState, useEffect, useMemo } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { MarketDataTable } from "./marketdatatable";
import { columns, MarketWithPlatform } from "./markettablecolumns";
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
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>([]); // New state for selected market IDs

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

  // Get the list of platforms from the database
  const platforms = useQuery(api.platforms.listPlatforms);
  
  // Get market stats for slider ranges 
  const marketStats = useQuery(api.markets.getMarketStats);
  
  // Default values as constants to avoid recreation
  const DEFAULT_VALUES = useMemo(() => ({
    minVolume: 0,
    maxVolume: 1000000,
    minLiquidity: 0,
    maxLiquidity: 1000000
  }), []);
  
  // Track if we've initialized the ranges to prevent multiple updates
  const [rangesInitialized, setRangesInitialized] = useState(false);
  
  // Initialize ranges with defaults or stats if available - only once
  useEffect(() => {
    // Only initialize once to prevent multiple updates
    if (!rangesInitialized) {
      if (marketStats) {
        // Use real data
        setVolumeRange([marketStats.minVolume, marketStats.maxVolume]);
        setLiquidityRange([marketStats.minLiquidity, marketStats.maxLiquidity]);
      } else {
        // Use defaults temporarily
        setVolumeRange([DEFAULT_VALUES.minVolume, DEFAULT_VALUES.maxVolume]);
        setLiquidityRange([DEFAULT_VALUES.minLiquidity, DEFAULT_VALUES.maxLiquidity]);
      }
      setRangesInitialized(true);
    } else if (marketStats && rangesInitialized) {
      // If stats loaded after initialization, only update if values are very different
      const volumeDifferent = 
        Math.abs(volumeRange[0] - marketStats.minVolume) > 1000 || 
        Math.abs(volumeRange[1] - marketStats.maxVolume) > 1000;
      const liquidityDifferent = 
        Math.abs(liquidityRange[0] - marketStats.minLiquidity) > 1000 || 
        Math.abs(liquidityRange[1] - marketStats.maxLiquidity) > 1000;
      
      if (volumeDifferent) {
        setVolumeRange([marketStats.minVolume, marketStats.maxVolume]);
      }
      if (liquidityDifferent) {
        setLiquidityRange([marketStats.minLiquidity, marketStats.maxLiquidity]);
      }
    }
  }, [marketStats, rangesInitialized, volumeRange, liquidityRange, DEFAULT_VALUES]);

  // Stabilized query args with server-side filtering and memoization to prevent unnecessary changes
  const queryArgs = useMemo(() => {
    // Use a stable reference for the query arguments
    const args: any = {
      count: 50, // Reduced from 200
    };

    // Only add filters if they're meaningful
    if (selectedPlatform) args.platformId = selectedPlatform;
    if (debouncedSearchTerm && debouncedSearchTerm.trim().length > 0) args.searchTerm = debouncedSearchTerm;
    
    // Only apply range filters if they differ from defaults
    const minVolumeDefault = marketStats?.minVolume ?? DEFAULT_VALUES.minVolume;
    const maxVolumeDefault = marketStats?.maxVolume ?? DEFAULT_VALUES.maxVolume;
    const minLiquidityDefault = marketStats?.minLiquidity ?? DEFAULT_VALUES.minLiquidity;
    const maxLiquidityDefault = marketStats?.maxLiquidity ?? DEFAULT_VALUES.maxLiquidity;
    
    // Add volume filters only if they're different from defaults
    if (Math.abs(debouncedVolumeRange[0] - minVolumeDefault) > 1) {
      args.minVolume = debouncedVolumeRange[0];
    }
    if (Math.abs(debouncedVolumeRange[1] - maxVolumeDefault) > 1) {
      args.maxVolume = debouncedVolumeRange[1];
    }
    
    // Add liquidity filters only if they're different from defaults
    if (Math.abs(debouncedLiquidityRange[0] - minLiquidityDefault) > 1) {
      args.minLiquidity = debouncedLiquidityRange[0];
    }
    if (Math.abs(debouncedLiquidityRange[1] - maxLiquidityDefault) > 1) {
      args.maxLiquidity = debouncedLiquidityRange[1];
    }
    
    // Only add date filter if it exists
    if (endDateFilter) {
      args.endDateBefore = endDateFilter.getTime();
    }

    return args;
  }, [
    debouncedSearchTerm,
    selectedPlatform,
    debouncedVolumeRange,
    debouncedLiquidityRange,
    endDateFilter,
    marketStats,
    DEFAULT_VALUES,
  ]);

  // Track loading state with useState to prevent flashing
  const [isLoading, setIsLoading] = useState(true);
  const [previousQueryArgs, setPreviousQueryArgs] = useState<any>(null);
  
  // Store query args when they change to detect real changes
  useEffect(() => {
    // Only update when query args change meaningfully
    if (!previousQueryArgs || JSON.stringify(previousQueryArgs) !== JSON.stringify(queryArgs)) {
      setPreviousQueryArgs(queryArgs);
    }
  }, [queryArgs, previousQueryArgs]);
  
  // Query markets data with the current filters - use stable reference
  const markets = useQuery(api.markets.getMarkets, previousQueryArgs || queryArgs);
  const marketData: MarketWithPlatform[] = markets || [];
  
  // Track if this is the first successful data load
  const [firstLoadComplete, setFirstLoadComplete] = useState(false);

  // Use an effect to manage loading state with stability
  useEffect(() => {
    // Initial loading state
    if (!firstLoadComplete) {
      setIsLoading(true);
    }
    
    // Only mark as not loading when we have both markets and stats
    if (markets !== undefined && marketStats !== undefined) {
      // For first load, use longer timeout to ensure everything is ready
      // This prevents the table from flashing or loading twice
      const delay = firstLoadComplete ? 50 : 500;
      
      const timer = setTimeout(() => {
        setIsLoading(false);
        if (!firstLoadComplete) {
          setFirstLoadComplete(true);
        }
      }, delay);
      
      return () => clearTimeout(timer);
    } else if (firstLoadComplete) {
      // Only show loading again after first complete load if data becomes unavailable
      setIsLoading(true);
    }
  }, [markets, marketStats, firstLoadComplete]);

  // Handler for when market selection changes in the data table
  const handleMarketSelection = (selectedMarkets: MarketWithPlatform[]) => {
    setSelectedMarketIds(selectedMarkets.map(market => market._id));
  };

  // State for UI feedback related to semantic analysis and arbitrage detection
  const [isAnalyzingSemantics, setIsAnalyzingSemantics] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [isFindingArbitrage, setIsFindingArbitrage] = useState(false);
  const [arbitrageMessage, setArbitrageMessage] = useState<string | null>(null);

  // Convex actions for semantic analysis and arbitrage detection
  const triggerAnalyzeSelectedMarkets = useAction(api.semanticAnalysis.analyzeSelectedMarkets);
  const triggerFindArbitrage = useAction(api.arbitrage.findArbitrageForSelectedMarkets);

  // Development mode mock handler for semantic analysis
  const handleAnalyzeSemantics = async () => {
    if (selectedMarketIds.length < 2 || isAnalyzingSemantics) return;
    setIsAnalyzingSemantics(true);
    setAnalysisMessage("Analyzing semantics...");
    
    try {
      // In development mode, use mock results
      if (process.env.NODE_ENV === 'development') {
        console.log('Mock: Analyzing semantics for markets:', selectedMarketIds);
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        setAnalysisMessage(
          `[Development Mode] Analysis complete: Found semantic relationships between ${selectedMarketIds.length} markets. ` +
          'Markets appear to be correlated based on subject matter.'  
        );
      } else {
        // In production, call the real API
        const result = await triggerAnalyzeSelectedMarkets({ marketIds: selectedMarketIds as Id<"markets">[] });
        setAnalysisMessage(result.message);
      }
    } catch (error) {
      console.error("Failed to analyze semantics:", error);
      setAnalysisMessage("Error during semantic analysis. Check console.");
    }
    
    setIsAnalyzingSemantics(false);
  };

  // Development mode mock handler for arbitrage detection
  const handleFindArbitrage = async () => {
    if (selectedMarketIds.length < 2 || isFindingArbitrage) return;
    setIsFindingArbitrage(true);
    setArbitrageMessage("Finding arbitrage opportunities...");
    
    try {
      // In development mode, use mock results
      if (process.env.NODE_ENV === 'development') {
        console.log('Mock: Finding arbitrage for markets:', selectedMarketIds);
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Generate mock arbitrage results
        const mockProfitPercent = (Math.random() * 5 + 2).toFixed(2);
        setArbitrageMessage(
          `[Development Mode] Arbitrage analysis complete. Found potential profit of ${mockProfitPercent}% ` +
          `between ${selectedMarketIds.length} selected markets. Strategies: Buy on market A, sell on market B.`
        );
      } else {
        // In production, call the real API
        const result = await triggerFindArbitrage({ marketIds: selectedMarketIds as Id<"markets">[] });
        setArbitrageMessage(result.message);
      }
    } catch (error) {
      console.error("Failed to find arbitrage:", error);
      setArbitrageMessage("Error during arbitrage analysis. Check console.");
    }
    
    setIsFindingArbitrage(false);
  };

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

      {/* Action Buttons for Selected Markets */}
      {selectedMarketIds.length > 0 && (
        <div className="my-4 p-4 bg-yellow-100 border-2 border-black shadow-[4px_4px_0px_0px_#000] rounded-lg dark:bg-gray-700 dark:border-black">
          <div className="flex items-center space-x-4">
            <p className="font-medium dark:text-white">{selectedMarketIds.length} market(s) selected.</p>
            <Button 
              onClick={() => { void handleAnalyzeSemantics(); }}
              className="font-bold text-black bg-blue-400 hover:bg-blue-500 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[3px_3px_0px_0px_#000] active:shadow-[1px_1px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] dark:text-white dark:hover:bg-blue-600"
            >
              Analyze Semantics
            </Button>
            <Button 
              onClick={() => { void handleFindArbitrage(); }}
              className="font-bold text-black bg-green-400 hover:bg-green-500 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[3px_3px_0px_0px_#000] active:shadow-[1px_1px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] dark:text-white dark:hover:bg-green-600"
            >
              Find Arbitrage
            </Button>
          </div>
          {analysisMessage && (
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 p-2 bg-white border border-gray-300 rounded-md shadow-sm">
              {analysisMessage}
            </p>
          )}
          {arbitrageMessage && (
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 p-2 bg-white border border-gray-300 rounded-md shadow-sm">
              {arbitrageMessage}
            </p>
          )}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
          <div className="text-center">
            <h3 className="text-lg font-semibold dark:text-white">Loading Markets...</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Please wait a moment while we load market data.</p>
          </div>
        </div>
      )}

      {/* Market Data Table - Show once loaded and we have data */}
      {!isLoading && markets !== undefined && (
        <MarketDataTable 
          columns={columns} 
          data={marketData}
          onSelectionChange={handleMarketSelection} 
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
