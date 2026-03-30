"use client"

import * as React from "react"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useTranslation } from "@/hooks/use-translation"

interface SidebarContextValue {
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  mobileOpen: boolean
  setMobileOpen: (value: boolean) => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}

function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  React.useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed")
    if (stored !== null) {
      setCollapsedState(stored === "true")
    }
  }, [])

  const setCollapsed = React.useCallback((value: boolean) => {
    setCollapsedState(value)
    localStorage.setItem("sidebar-collapsed", String(value))
  }, [])

  return (
    <SidebarContext.Provider
      value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

function Sidebar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebar()
  const { t } = useTranslation()
  const isDesktop = useMediaQuery("(min-width: 768px)")

  if (!isDesktop) {
    return (
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[16rem] p-0" showCloseButton={false}>
          <div className="flex h-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-sidebar transition-[width] duration-200 ease-in-out",
        collapsed ? "w-[4.5rem]" : "w-[16rem]",
        className
      )}
      style={{ position: "sticky", top: 0 }}
    >
      <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {children}
      </div>
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <>
              <PanelLeftClose className="size-4" />
              <span className="ml-2">{t("common.collapse", "Collapse")}</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  )
}

export { SidebarProvider, Sidebar, useSidebar }
