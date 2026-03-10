import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

interface LoadingStateProps {
  rows?: number
  columns?: number
  className?: string
}

function LoadingState({
  rows = 5,
  columns = 4,
  className,
}: LoadingStateProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`header-${i}`} className="h-8 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={`row-${rowIndex}`} className="flex gap-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={`cell-${rowIndex}-${colIndex}`} className="h-10 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export { LoadingState, type LoadingStateProps }
