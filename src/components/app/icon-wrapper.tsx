import { type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const sizeMap = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
} as const

const colorMap = {
  primary: "text-foreground",
  secondary: "text-muted-foreground",
  brand: "text-primary",
  success: "text-semantic-success",
  warning: "text-semantic-warning",
  error: "text-semantic-error",
} as const

interface IconWrapperProps {
  icon: LucideIcon
  size?: "sm" | "md" | "lg"
  color?: "primary" | "secondary" | "brand" | "success" | "warning" | "error"
  className?: string
}

function IconWrapper({
  icon: Icon,
  size = "md",
  color = "primary",
  className,
}: IconWrapperProps) {
  return (
    <Icon
      className={cn(sizeMap[size], colorMap[color], className)}
      aria-hidden="true"
    />
  )
}

export { IconWrapper, type IconWrapperProps }
