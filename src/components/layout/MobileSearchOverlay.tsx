'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import { SearchBar } from './SearchBar'

export function MobileSearchOverlay() {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const overlay = isOpen ? (
    <div className="fixed inset-0 z-50 bg-background lg:hidden">
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <button
          onClick={() => setIsOpen(false)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Закрыть поиск"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <SearchBar autoFocus onNavigate={() => setIsOpen(false)} />
        </div>
      </div>
    </div>
  ) : null

  return (
    <>
      {/* Search icon trigger */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
        aria-label="Поиск"
      >
        <Search className="h-5 w-5" />
      </button>

      {/* Portal to body to escape header stacking context */}
      {mounted && overlay && createPortal(overlay, document.body)}
    </>
  )
}
