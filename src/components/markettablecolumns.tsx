// src/components/markettablecolumns.tsx
"use client" // Required for TanStack Table components

import { ColumnDef } from "@tanstack/react-table"
import { Doc } from "../../convex/_generated/dataModel" // Adjust path if needed
import { ArrowUpDown, MoreHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button" // Assuming shadcn puts button here
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu" // Assuming shadcn puts dropdown here
import { Checkbox } from "@/components/ui/checkbox" // Assuming shadcn puts checkbox here

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.
export type Market = Doc<"markets">; // Using the Convex Doc type

// Extend Market type to include platformDisplayName, which is added in the getMarkets query
export type MarketWithPlatform = Market & { platformDisplayName?: string };

export const columns: ColumnDef<MarketWithPlatform>[] = [
  {
    id: "select",
    size: 60, // Set a specific size for the select column
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value: boolean) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="border-black shadow-[2px_2px_0px_0px_#000] mr-2" // Neobrutalist touch
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="border-black shadow-[2px_2px_0px_0px_#000] mr-2" // Neobrutalist touch
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "title",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="font-bold text-black dark:text-white hover:text-black dark:hover:text-black hover:bg-yellow-300 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000]"
        >
          Title
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="font-medium text-gray-900 dark:text-white">{row.getValue("title")}</div>,
  },
  {
    accessorKey: "platformDisplayName",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="font-bold text-black dark:text-white hover:text-black dark:hover:text-black hover:bg-yellow-300 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000]"
        >
          Platform
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="text-gray-700 dark:text-gray-300">{row.getValue("platformDisplayName") || "N/A"}</div>,
  },
  {
    accessorKey: "outcomes",
    header: ({ column }) => (
       <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="font-bold text-black dark:text-white hover:text-black dark:hover:text-black hover:bg-yellow-300 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000] text-right"
        >
          Price
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
    ),
    cell: ({ row }) => {
      const outcomes = row.original.outcomes;
      const displayParts: string[] = [];

      if (outcomes && outcomes.length > 0) {
        for (let i = 0; i < Math.min(outcomes.length, 2); i++) {
          const outcome = outcomes[i];
          if (outcome.name && outcome.price !== undefined) {
            const priceFormatted = new Intl.NumberFormat("en-US", {
              style: "decimal",
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(outcome.price);
            displayParts.push(`${outcome.name}: ${priceFormatted}`);
          }
        }
      }
      
      if (displayParts.length === 0) {
        return <div className="text-right font-medium text-gray-900 dark:text-white">N/A</div>;
      }

      return (
        <div className="text-right font-medium text-gray-900 dark:text-white">
          {displayParts.map((part, index) => (
            <div key={index}>{part}</div>
          ))}
        </div>
      );
    },
    sortingFn: (rowA, rowB, _columnId) => {
      const outcomesA = rowA.original.outcomes;
      const outcomesB = rowB.original.outcomes;
      const priceA = (outcomesA && outcomesA.length > 0 && outcomesA[0].price !== undefined) ? outcomesA[0].price : -1;
      const priceB = (outcomesB && outcomesB.length > 0 && outcomesB[0].price !== undefined) ? outcomesB[0].price : -1;
      return priceA - priceB;
    },
  },
  {
    accessorKey: "totalVolume",
    header: ({ column }) => (
       <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="font-bold text-black dark:text-white hover:text-black dark:hover:text-black hover:bg-yellow-300 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000] text-right"
        >
          Volume
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
    ),
    cell: ({ row }) => {
      const rawValue = row.getValue("totalVolume");
      const amount = rawValue ?? 0;
      let numericAmount: number;
      if (typeof amount === 'number') {
        numericAmount = amount;
      } else if (typeof amount === 'string') {
        numericAmount = parseFloat(amount);
      } else {
        // Fallback for unexpected types, though getValue should return primitive or undefined
        numericAmount = 0;
      }
      if (isNaN(numericAmount)) {
        numericAmount = 0; // Final fallback if parsing failed or was NaN initially
      }
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(numericAmount);
      return <div className="text-right font-medium text-gray-900 dark:text-white">{formatted}</div>;
    },
  },
  {
    accessorKey: "liquidity",
    header: ({ column }) => (
       <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="font-bold text-black dark:text-white hover:text-black dark:hover:text-black hover:bg-yellow-300 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000] text-right"
        >
          Liquidity
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
    ),
    cell: ({ row }) => {
      const rawValue = row.getValue("liquidity");
      const amount = rawValue ?? 0;
      let numericAmount: number;
      if (typeof amount === 'number') {
        numericAmount = amount;
      } else if (typeof amount === 'string') {
        numericAmount = parseFloat(amount);
      } else {
        // Fallback for unexpected types
        numericAmount = 0;
      }
      if (isNaN(numericAmount)) {
        numericAmount = 0; // Final fallback
      }
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(numericAmount);
      return <div className="text-right font-medium text-gray-900 dark:text-white">{formatted}</div>;
    },
  },
  {
    accessorKey: "endDate",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="font-bold text-black dark:text-white hover:text-black dark:hover:text-black hover:bg-yellow-300 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000]"
        >
          End Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const endDate = row.getValue("endDate") as MarketWithPlatform['endDate'];
      return endDate ? <div className="text-gray-700 dark:text-gray-300">{new Date(endDate).toLocaleDateString()}</div> : "N/A";
    }
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const market = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0 bg-yellow-300 hover:bg-yellow-400 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000]">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4 text-black dark:text-black" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000] dark:bg-gray-800 dark:border-black">
            <DropdownMenuLabel className="font-bold dark:text-white">Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => void navigator.clipboard.writeText(market.externalId)}
              className="hover:bg-yellow-300 dark:hover:bg-yellow-500 dark:text-white"
            >
              Copy Market ID
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-black dark:bg-gray-600"/>
            <DropdownMenuItem className="hover:bg-yellow-300 dark:hover:bg-yellow-500 dark:text-white" asChild>
              {/* This would ideally link to a detailed market view page */}
              <a href={market.url || "#"} target="_blank" rel="noopener noreferrer">View on Platform</a>
            </DropdownMenuItem>
            <DropdownMenuItem className="hover:bg-yellow-300 dark:hover:bg-yellow-500 dark:text-white">
                View Details (TBD)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
