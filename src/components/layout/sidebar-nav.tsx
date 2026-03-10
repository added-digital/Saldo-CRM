"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";
import { system } from "@/config/system";
import { navigation, type NavItem } from "@/config/navigation";
import { useUser } from "@/hooks/use-user";
import { useUserScopes } from "@/hooks/use-scope";
import { useSidebar } from "@/components/layout/sidebar";
import { NavLink } from "@/components/app/nav-link";

interface SidebarNavProps {
  className?: string;
}

function isItemVisible(
  item: NavItem,
  userRole: string | undefined,
  scopes: string[],
): boolean {
  if (item.minRole) {
    const roleLevel: Record<string, number> = {
      user: 1,
      team_lead: 2,
      admin: 3,
    };
    const userLevel = roleLevel[userRole ?? "user"] ?? 1;
    const requiredLevel = roleLevel[item.minRole] ?? 1;
    if (userLevel < requiredLevel) return false;
  }

  if (item.scope) {
    if (userRole === "admin") return true;
    if (!scopes.includes(item.scope)) return false;
  }

  return true;
}

function SidebarNav({ className }: SidebarNavProps) {
  const { user } = useUser();
  const { scopes } = useUserScopes();
  const { collapsed } = useSidebar();

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <div
        className={cn(
          "flex items-center border-b px-4 py-4 h-14",
          collapsed && "justify-center px-2",
        )}
      >
        <Image
          src={collapsed ? system.logoMark : system.logo}
          alt={system.name}
          width={collapsed ? 28 : 120}
          height={28}
          className="h-7 w-auto"
          priority
        />
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navigation.map((section, sectionIndex) => {
          const visibleItems = section.items.filter((item) =>
            isItemVisible(item, user?.role, scopes),
          );

          if (visibleItems.length === 0) return null;

          return (
            <div key={sectionIndex} className="space-y-1">
              {section.title && !collapsed && (
                <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </p>
              )}
              {collapsed && section.title && sectionIndex > 0 && (
                <div className="mx-2 my-2 h-px bg-border" />
              )}
              {visibleItems.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  collapsed={collapsed}
                  badge={item.badge}
                />
              ))}
            </div>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">{system.shortName}</p>
        </div>
      )}
    </div>
  );
}

export { SidebarNav };
