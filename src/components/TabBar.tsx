import { Bookmark, House, Refrigerator, Sparkles, type LucideIcon } from 'lucide-react'
import type { Tab } from '@/lib/types'
import { cn } from '@/lib/utils'

interface TabBarProps {
  active: Tab
  onSelect: (tab: Tab) => void
  hidden?: boolean
}

const TABS: Array<{ key: Tab; label: string; icon: LucideIcon }> = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'me', label: 'About me', icon: Sparkles },
  { key: 'fridge', label: 'My Fridge', icon: Refrigerator },
  { key: 'saved', label: 'Saved', icon: Bookmark },
]

export function TabBar({ active, onSelect, hidden }: TabBarProps) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(env(safe-area-inset-bottom),14px)] transition-opacity duration-300',
        hidden && 'pointer-events-none opacity-0',
      )}
    >
      <div className="glass-strong pointer-events-auto flex max-w-[calc(100vw-32px)] items-center gap-0.5 overflow-x-auto no-scrollbar rounded-full p-1.5 shadow-[var(--shadow-glass)]">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = active === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onSelect(tab.key)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'pressable flex min-h-[46px] shrink-0 items-center justify-center gap-1 rounded-full px-2 text-[11px] font-medium whitespace-nowrap',
                isActive
                  ? 'bg-white/90 text-ink shadow-[0_2px_12px_rgba(0,0,0,0.1)]'
                  : 'text-ink-soft',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.2 : 1.8} />
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}