import { cn } from "@/lib/utils"
import { getStatusColor } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

interface StatusBadgeProps {
  status: string
  className?: string
}

function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = getStatusColor(status)
  const label = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <Badge variant={variant} className={cn(className)}>
      {label}
    </Badge>
  )
}

export { StatusBadge, type StatusBadgeProps }
