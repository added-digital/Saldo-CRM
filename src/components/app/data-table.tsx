"use client"

import * as React from "react"
import {
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type ColumnSizingState,
  type RowSelectionState,
  type Header,
  type Row,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { type LucideIcon, ChevronRight } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DataTableToolbar } from "@/components/app/data-table-toolbar"
import { EmptyState } from "@/components/app/empty-state"
import { LoadingState } from "@/components/app/loading-state"

const DEFAULT_MIN_COL_WIDTH = 80
const DEFAULT_COL_SIZE = 150
const SELECT_COL_SIZE = 40

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
  onRowNavigate?: (row: TData) => void
  selectable?: boolean
  onSelectionChange?: (rows: TData[]) => void
  clearSelectionRef?: React.RefObject<(() => void) | null>
}

function getColumnWidthPercent<TData, TValue>(
  header: Header<TData, TValue>,
  totalSize: number
) {
  return `${(header.getSize() / totalSize) * 100}%`
}

function makeSelectColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: "_select",
    size: SELECT_COL_SIZE,
    minSize: SELECT_COL_SIZE,
    maxSize: SELECT_COL_SIZE,
    enableResizing: false,
    enableSorting: false,
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
  }
}

function makeNavigateColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: "_navigate",
    size: SELECT_COL_SIZE,
    minSize: SELECT_COL_SIZE,
    maxSize: SELECT_COL_SIZE,
    enableResizing: false,
    enableSorting: false,
    header: () => null,
    cell: () => (
      <div className="flex items-center justify-center">
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>
    ),
  }
}

function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder,
  emptyState,
  loading = false,
  pageSize = 10,
  onRowNavigate,
  selectable = false,
  onSelectionChange,
  clearSelectionRef,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({})
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const lastSelectedIndex = React.useRef<number | null>(null)

  const allColumns = React.useMemo(() => {
    const cols: ColumnDef<TData, TValue>[] = selectable
      ? [makeSelectColumn<TData>() as ColumnDef<TData, TValue>, ...columns]
      : [...columns]
    if (onRowNavigate) {
      cols.push(makeNavigateColumn<TData>() as ColumnDef<TData, TValue>)
    }
    return cols
  }, [columns, selectable, onRowNavigate])

  const table = useReactTable({
    data,
    columns: allColumns,
    defaultColumn: {
      size: DEFAULT_COL_SIZE,
      minSize: DEFAULT_MIN_COL_WIDTH,
    },
    state: { sorting, columnFilters, columnSizing, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    onRowSelectionChange: setRowSelection,
    columnResizeMode: "onChange",
    enableRowSelection: selectable,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize },
    },
  })

  React.useEffect(() => {
    if (!selectable || !onSelectionChange) return
    const selectedRows = table
      .getFilteredSelectedRowModel()
      .rows.map((row: Row<TData>) => row.original)
    onSelectionChange(selectedRows)
  }, [rowSelection, selectable, onSelectionChange, table])

  const clearSelection = React.useCallback(() => {
    setRowSelection({})
  }, [])

  React.useEffect(() => {
    if (clearSelectionRef) {
      clearSelectionRef.current = clearSelection
    }
  }, [clearSelectionRef, clearSelection])

  if (loading) {
    return <LoadingState rows={pageSize} columns={allColumns.length} />
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
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isSelectCell = cell.column.id === "_select"
                    const isNavigateCell = cell.column.id === "_navigate"
                    const isControlCell = isSelectCell || isNavigateCell
                    return (
                      <TableCell
                        key={cell.id}
                        className={
                          isControlCell ? "p-0 cursor-pointer" : undefined
                        }
                        onClick={
                          isSelectCell
                            ? (e) => {
                                e.stopPropagation()
                                const rows = table.getRowModel().rows
                                const currentIndex = rows.indexOf(row)

                                if (
                                  e.shiftKey &&
                                  lastSelectedIndex.current !== null &&
                                  lastSelectedIndex.current !== currentIndex
                                ) {
                                  const start = Math.min(lastSelectedIndex.current, currentIndex)
                                  const end = Math.max(lastSelectedIndex.current, currentIndex)
                                  const next: RowSelectionState = { ...rowSelection }
                                  for (let i = start; i <= end; i++) {
                                    next[rows[i].id] = true
                                  }
                                  setRowSelection(next)
                                } else {
                                  row.toggleSelected(!row.getIsSelected())
                                }

                                lastSelectedIndex.current = currentIndex
                              }
                            : isNavigateCell
                              ? (e) => {
                                  e.stopPropagation()
                                  onRowNavigate?.(row.original)
                                }
                              : undefined
                        }
                      >
                        <div className="overflow-hidden text-ellipsis">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </div>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={allColumns.length}
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
          {selectable && Object.keys(rowSelection).length > 0
            ? `${Object.keys(rowSelection).length} of ${table.getFilteredRowModel().rows.length} row(s) selected`
            : `${table.getFilteredRowModel().rows.length} row(s)`}
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
