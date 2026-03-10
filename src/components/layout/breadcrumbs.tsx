"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { system } from "@/config/system"

interface BreadcrumbsProps {
  className?: string
}

function Breadcrumbs({ className }: BreadcrumbsProps) {
  const pathname = usePathname()

  const segments = pathname
    .split("/")
    .filter(Boolean)

  const breadcrumbs = [
    { label: system.shortName, href: "/" },
    ...segments.map((segment, index) => ({
      label: segment
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      href: "/" + segments.slice(0, index + 1).join("/"),
    })),
  ]

  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center", className)}>
      <ol className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1

          return (
            <li key={crumb.href} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
              )}
              {isLast ? (
                <span className="font-medium text-foreground">{crumb.label}</span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {crumb.label}
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
