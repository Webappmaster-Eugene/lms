'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type SidebarContextValue = {
  expanded: boolean | undefined
  setExpanded: (expanded: boolean) => void
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  toggleMobile: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState<boolean>()
  const [mobileOpen, setMobileOpen] = useState(false)
  const toggleMobile = useCallback(() => setMobileOpen((prev) => !prev), [])

  return (
    <SidebarContext.Provider value={{ expanded, setExpanded, mobileOpen, setMobileOpen, toggleMobile }}>
      <div className="platform-shell flex min-h-dvh overflow-x-hidden" data-sidebar-expanded={expanded}>
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return ctx
}
