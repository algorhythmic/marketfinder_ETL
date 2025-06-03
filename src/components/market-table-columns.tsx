// src/components/market-table-columns.tsx
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

export const columns: ColumnDef<Market>[] = [
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
          className="font-bold text-black dark:text-white hover:bg-yellow-300 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000]"
        >
          Title
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="font-medium text-gray-900 dark:text-white">{row.getValue("title")}</div>,
  },
  {
    accessorKey: "category",
    header: ({ column }) => (
       <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="font-bold text-black dark:text-white hover:bg-yellow-300 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000]"
        >
          Category
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
    ),
    cell: ({ row }) => <div className="text-gray-700 dark:text-gray-300">{row.getValue("category")}</div>,
  },
  {
    accessorKey: "status",
     header: ({ column }) => (
       <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="font-bold text-black dark:text-white hover:bg-yellow-300 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000]"
        >
          Status
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      let bgColor = "bg-gray-300";
      let textColor = "text-gray-800";
      if (status === "active") { bgColor = "bg-green-300"; textColor = "text-green-800"; }
      else if (status === "closed") { bgColor = "bg-yellow-300"; textColor = "text-yellow-800"; }
      else if (status === "resolved") { bgColor = "bg-blue-300"; textColor = "text-blue-800"; }
      
      return <span className={`px-2 py-1 rounded border-2 border-black text-xs font-bold uppercase tracking-wider ${bgColor} ${textColor} dark:border-black`}>{status}</span>
    }
  },
  {
    accessorKey: "totalVolume",
    header: ({ column }) => (
       <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="font-bold text-black dark:text-white hover:bg-yellow-300 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000] text-right"
        >
          Volume
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
    ),
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("totalVolume") || "0")
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(amount)

      return <div className="text-right font-medium text-gray-900 dark:text-white">{formatted}</div>
    },
  },
  {
    accessorKey: "endDate",
    header: "End Date",
    cell: ({ row }) => {
      const endDate = row.getValue("endDate") as number | undefined;
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
            <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-yellow-300 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000] dark:text-white">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000] dark:bg-gray-800 dark:border-black">
            <DropdownMenuLabel className="font-bold dark:text-white">Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(market.externalId)}
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
