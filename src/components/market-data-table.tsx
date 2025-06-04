// src/components/market-data-table.tsx
"use client"

import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table" 

import { Button } from "@/components/ui/button"

// Assuming TData will have these properties, similar to MarketWithPlatform
interface FilterableTData {
  totalVolume?: number | null;
  liquidity?: number | null;
  endDate?: number | null; // Changed to number to match MarketWithPlatform (Unix timestamp in ms)
}

interface DataTableProps<TData extends FilterableTData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  externalGlobalFilter?: string 
  volumeRangeFilter?: [number, number];
  liquidityRangeFilter?: [number, number];
  endDateFilter?: Date; // Added for end date filtering
}

export function MarketDataTable<TData extends FilterableTData, TValue>({
  columns,
  data,
  externalGlobalFilter,
  volumeRangeFilter,
  liquidityRangeFilter,
  endDateFilter, // Added prop
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = React.useState("") 
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})

  React.useEffect(() => {
    if (externalGlobalFilter !== undefined) {
      setGlobalFilter(externalGlobalFilter);
    }
  }, [externalGlobalFilter]);

  const processedData = React.useMemo(() => {
    let filtered = data;

    if (volumeRangeFilter) {
      const [minVol, maxVol] = volumeRangeFilter;
      filtered = filtered.filter(item => {
        const volume = item.totalVolume ?? 0;
        return volume >= minVol && volume <= maxVol;
      });
    }

    if (liquidityRangeFilter) {
      const [minLiq, maxLiq] = liquidityRangeFilter;
      filtered = filtered.filter(item => {
        const liquidity = item.liquidity ?? 0;
        return liquidity >= minLiq && liquidity <= maxLiq;
      });
    }

    if (endDateFilter) {
      // Set the time of endDateFilter to the end of the day to include all markets ending on that day
      const filterDateEnd = new Date(endDateFilter);
      filterDateEnd.setHours(23, 59, 59, 999);

      filtered = filtered.filter(item => {
        if (item.endDate === undefined || item.endDate === null) return false; // Exclude if no end date
        try {
          // Assuming item.endDate is a Unix timestamp in milliseconds
          const itemEndDate = new Date(item.endDate);
          return itemEndDate <= filterDateEnd;
        } catch (e) {
          // This catch might be less relevant if item.endDate is strictly a number
          console.error("Error creating Date from item.endDate:", item.endDate, e);
          return false; // Exclude if date creation fails
        }
      });
    }

    return filtered;
  }, [data, volumeRangeFilter, liquidityRangeFilter, endDateFilter]); // Added endDateFilter to dependencies

  const table = useReactTable({
    data: processedData, // Use processedData here
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(), 
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(), 
    onGlobalFilterChange: setGlobalFilter, 
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      globalFilter, 
      columnVisibility,
      rowSelection,
    },
  })

  const tableContainerStyles = "bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000] rounded-lg p-1 dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]"
  const buttonStyles = "font-bold text-black bg-yellow-300 hover:bg-yellow-400 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000] active:shadow-[1px_1px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] dark:text-black dark:hover:bg-yellow-500"

  return (
    <div className={tableContainerStyles}>
      <div className="rounded-md border-2 border-black overflow-hidden dark:border-black"> 
        <Table>
          <TableHeader className="bg-gray-200 dark:bg-gray-700">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-b-2 border-black dark:border-black">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider dark:text-gray-300 border-r-2 border-black last:border-r-0 dark:border-black">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="border-b border-gray-300 dark:border-gray-700 hover:bg-yellow-100 dark:hover:bg-yellow-700/30"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-4 py-3 border-r border-gray-200 last:border-r-0 dark:border-gray-600">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center font-medium text-gray-500 dark:text-gray-400"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end space-x-2 py-4 px-2">
        <div className="flex-1 text-sm text-muted-foreground font-medium text-gray-600 dark:text-gray-400">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          className={buttonStyles}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          className={buttonStyles}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
