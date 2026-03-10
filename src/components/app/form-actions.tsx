import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface FormActionsProps {
  submitLabel?: string
  cancelLabel?: string
  onCancel?: () => void
  loading?: boolean
  disabled?: boolean
  className?: string
}

function FormActions({
  submitLabel = "Save changes",
  cancelLabel = "Cancel",
  onCancel,
  loading = false,
  disabled = false,
  className,
}: FormActionsProps) {
  return (
    <div className={cn("flex items-center justify-end gap-3", className)}>
      {onCancel && (
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          {cancelLabel}
        </Button>
      )}
      <Button type="submit" disabled={loading || disabled}>
        {loading && <Loader2 className="size-4 animate-spin" />}
        {loading ? "Saving..." : submitLabel}
      </Button>
    </div>
  )
}

export { FormActions, type FormActionsProps }
