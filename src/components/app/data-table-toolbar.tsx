"use client"

import { type Table } from "@tanstack/react-table"

import { cn } from "@/lib/utils"
import { SearchInput } from "@/components/app/search-input"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  searchKey?: string
  searchPlaceholder?: string
  children?: React.ReactNode
}

function DataTableToolbar<TData>({
  table,
  searchKey,
  searchPlaceholder = "Search...",
  children,
}: DataTableToolbarProps<TData>) {
  const searchValue = searchKey
    ? (table.getColumn(searchKey)?.getFilterValue() as string) ?? ""
    : ""

  return (
    <div className={cn("flex items-center gap-2")}>
      {searchKey && (
        <SearchInput
          value={searchValue}
          onChange={(value) =>
            table.getColumn(searchKey)?.setFilterValue(value)
          }
          placeholder={searchPlaceholder}
          className="max-w-sm"
        />
      )}
      {children}
    </div>
  )
}

export { DataTableToolbar, type DataTableToolbarProps }
