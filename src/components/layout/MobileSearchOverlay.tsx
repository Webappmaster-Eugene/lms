'use client'

import { useRef, useState } from 'react'
import { Search } from 'lucide-react'

import { SearchBar } from './SearchBar'
import { MobileSheet } from './MobileSheet'

export function MobileSearchOverlay({ trainerEnabled = true }: { trainerEnabled?: boolean } = {}) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      {/* Search icon trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:hidden"
        aria-label="Поиск"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Search aria-hidden="true" className="h-5 w-5" />
      </button>

      <MobileSheet title="Поиск" open={isOpen} onClose={() => setIsOpen(false)} returnFocusRef={triggerRef} initialFocusSelector='[role="combobox"]'>
        <div className="min-h-[55dvh] p-4"><SearchBar trainerEnabled={trainerEnabled} autoFocus onNavigate={() => setIsOpen(false)} /></div>
      </MobileSheet>
    </>
  )
}
