"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, House } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface BreadcrumbsProps {
  className?: string
}

function Breadcrumbs({ className }: BreadcrumbsProps) {
  const pathname = usePathname()
  const [dynamicLabels, setDynamicLabels] = React.useState<Record<string, string>>({})

  const segments = React.useMemo(
    () => pathname.split("/").filter(Boolean),
    [pathname],
  )

  React.useEffect(() => {
    const isCustomerDetailsRoute = segments[0] === "customers" && Boolean(segments[1]) && segments[1] !== "contacts"
    if (!isCustomerDetailsRoute) {
      setDynamicLabels((current) => (Object.keys(current).length === 0 ? current : {}))
      return
    }

    const customerId = segments[1]
    let cancelled = false

    async function loadCustomerName() {
      const supabase = createClient()
      const { data } = await supabase
        .from("customers")
        .select("name")
        .eq("id", customerId)
        .maybeSingle()

      if (cancelled) return
      const customerRow = data as { name: string | null } | null
      const customerName = customerRow?.name?.trim()
      if (!customerName) return

      setDynamicLabels((current) => ({
        ...current,
        [`/customers/${customerId}`]: customerName,
      }))
    }

    void loadCustomerName()

    return () => {
      cancelled = true
    }
  }, [pathname, segments])

  const breadcrumbs = [
    { label: "Home", href: "/" },
    ...segments.map((segment, index) => {
      const href = "/" + segments.slice(0, index + 1).join("/")
      const fallbackLabel = segment
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())

      return {
        label: dynamicLabels[href] ?? fallbackLabel,
        href,
      }
    }),
  ]

  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center", className)}>
      <ol className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1
          const isRoot = index === 0

          return (
            <li key={crumb.href} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
              )}
              {isLast ? (
                isRoot ? (
                  <span className="inline-flex items-center text-foreground" aria-label="Home">
                    <House className="size-4" aria-hidden="true" />
                  </span>
                ) : (
                  <span className="font-medium text-foreground">{crumb.label}</span>
                )
              ) : (
                <Link
                  href={crumb.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {isRoot ? <House className="size-4" aria-hidden="true" /> : crumb.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export { Breadcrumbs }
