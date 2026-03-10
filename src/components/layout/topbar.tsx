"use client";

import { useRouter } from "next/navigation";
import { Menu, LogOut, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/app/user-avatar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { useSidebar } from "@/components/layout/sidebar";

interface TopbarProps {
  className?: string;
}

function Topbar({ className }: TopbarProps) {
  const { user } = useUser();
  const { setMobileOpen } = useSidebar();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header
      className={cn(
        "flex h-14 items-center gap-4 border-b bg-background px-6",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="size-5" />
        <span className="sr-only">Open menu</span>
      </Button>

      <Breadcrumbs className="flex-1" />

      <Separator orientation="vertical" className="h-6" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2">
            <UserAvatar
              name={user?.full_name}
              avatarUrl={user?.avatar_url}
              size="sm"
            />
            <span className="hidden text-sm font-medium md:inline-block">
              {user?.full_name || user?.email || "User"}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">{user?.full_name || "User"}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => router.push("/settings/profile")}>
              <User />
              Profile
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

export { Topbar };
