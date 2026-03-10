"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { IconWrapper } from "@/components/app/icon-wrapper"

interface NavLinkProps {
  href: string
  icon?: LucideIcon
  label: string
  active?: boolean
  collapsed?: boolean
  badge?: string
  className?: string
}

function NavLink({
  href,
  icon,
  label,
  active: activeProp,
  collapsed = false,
  badge,
  className,
}: NavLinkProps) {
  const pathname = usePathname()

  const isActive =
    activeProp ??
    (href === "/" ? pathname === "/" : pathname.startsWith(href))

  const linkContent = (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        collapsed && "justify-center px-2",
        className
      )}
    >
      {icon && <IconWrapper icon={icon} size="md" color={isActive ? "primary" : "secondary"} />}
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge && (
            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
              {badge}
            </Badge>
          )}
        </>
      )}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return linkContent
}

export { NavLink, type NavLinkProps }
