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
} from "@/components/ui/table" // Path to the shadcn table component

import { Button } from "@/components/ui/button"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export function MarketDataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(), // For client-side pagination
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(), // For client-side filtering
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  })

  // Neobrutalist styles for table container
  const tableContainerStyles = "bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000] rounded-lg p-1 dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]"
  const buttonStyles = "font-bold text-black bg-yellow-300 hover:bg-yellow-400 border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000] active:shadow-[1px_1px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] dark:text-white dark:hover:bg-yellow-500"


  return (
    <div className={tableContainerStyles}>
      {/* Global filter and column visibility - We can add these if needed, for now focusing on existing filters */}
      {/* Example for global filter (if we want client-side text search on table data) */}
      {/* <div className="flex items-center py-4 px-2">
        <Input
          placeholder="Filter titles..."
          value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("title")?.setFilterValue(event.target.value)
          }
          className={`max-w-sm ${inputStyles}`}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className={`ml-auto ${buttonStyles}`}>
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000] dark:bg-gray-800 dark:border-black">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize hover:bg-yellow-300 dark:hover:bg-yellow-500"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div> */}
      
      {/* Table */}
      <div className="rounded-md border-2 border-black overflow-hidden dark:border-black"> {/* Inner border for table itself */}
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

      {/* Pagination - Basic Example */}
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
