import { cn } from "@/lib/utils"
import { getInitials } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface UserAvatarProps {
  name: string | null | undefined
  avatarUrl?: string | null
  size?: "default" | "sm" | "lg"
  className?: string
}

function UserAvatar({
  name,
  avatarUrl,
  size = "default",
  className,
}: UserAvatarProps) {
  return (
    <Avatar size={size} className={cn(className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name ?? "User"} />}
      <AvatarFallback>{getInitials(name)}</AvatarFallback>
    </Avatar>
  )
}

export { UserAvatar, type UserAvatarProps }
