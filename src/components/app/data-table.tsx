"use client"

import * as React from "react"
import {
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type ColumnSizingState,
  type Header,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { type LucideIcon } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { DataTableToolbar } from "@/components/app/data-table-toolbar"
import { EmptyState } from "@/components/app/empty-state"
import { LoadingState } from "@/components/app/loading-state"

const DEFAULT_MIN_COL_WIDTH = 80
const DEFAULT_COL_SIZE = 150

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string
  searchPlaceholder?: string
  emptyState?: {
    icon: LucideIcon
    title: string
    description: string
    action?: { label: string; onClick: () => void }
  }
  loading?: boolean
  pageSize?: number
  onRowClick?: (row: TData) => void
}

function getColumnWidthPercent<TData, TValue>(
  header: Header<TData, TValue>,
  totalSize: number
) {
  return `${(header.getSize() / totalSize) * 100}%`
}

function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder,
  emptyState,
  loading = false,
  pageSize = 10,
  onRowClick,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({})

  const table = useReactTable({
    data,
    columns,
    defaultColumn: {
      size: DEFAULT_COL_SIZE,
      minSize: DEFAULT_MIN_COL_WIDTH,
    },
    state: { sorting, columnFilters, columnSizing },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize },
    },
  })

  if (loading) {
    return <LoadingState rows={pageSize} columns={columns.length} />
  }

  const totalSize = table.getCenterTotalSize()

  return (
    <div className="space-y-4">
      {searchKey && (
        <DataTableToolbar
          table={table}
          searchKey={searchKey}
          searchPlaceholder={searchPlaceholder}
        />
      )}

      <div className="rounded-md border">
        <Table style={{ width: "100%", tableLayout: "fixed" }}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: getColumnWidthPercent(header, totalSize) }}
                    className="relative"
                  >
                    <div className="overflow-hidden text-ellipsis">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </div>
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                        className={`absolute right-0 top-0 h-full w-3 -translate-x-1/2 cursor-col-resize select-none touch-none ${
                          header.column.getIsResizing()
                            ? "bg-primary"
                            : "bg-transparent hover:bg-border"
                        }`}
                        style={{ zIndex: 1 }}
                      />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={onRowClick ? "cursor-pointer" : undefined}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <div className="overflow-hidden text-ellipsis">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {emptyState ? (
                    <EmptyState {...emptyState} />
                  ) : (
                    "No results."
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-2">
        <p className="text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} row(s)
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}

export { DataTable, type DataTableProps }
