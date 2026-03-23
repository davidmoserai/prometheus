import { cn } from '@/lib/utils'

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
  disabled?: boolean
}

export function Switch({ checked, onCheckedChange, className, disabled }: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-[22px] w-10 shrink-0 cursor-pointer rounded-full transition-all duration-300 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame-500/30',
        'disabled:cursor-not-allowed disabled:opacity-40',
        checked
          ? 'bg-gradient-to-r from-flame-500 to-flame-600 shadow-[0_0_12px_-2px_rgba(249,115,22,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]'
          : 'bg-white/[0.08] hover:bg-white/[0.12]',
        className
      )}
      style={checked ? { animation: 'switch-flame 3s ease-in-out infinite' } : undefined}
    >
      <span
        className={cn(
          'pointer-events-none block rounded-full shadow-sm transition-all duration-300 ease-out',
          checked
            ? 'translate-x-[20px] bg-white shadow-[0_0_8px_rgba(249,115,22,0.3)]'
            : 'translate-x-[2px] bg-white/80'
        )}
        style={{ width: '18px', height: '18px', marginTop: '2px' }}
      />
    </button>
  )
}
