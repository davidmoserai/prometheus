import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center shrink-0 whitespace-nowrap rounded-lg text-[11px] font-medium tracking-wide transition-all duration-300',
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-r from-flame-500/15 to-flame-600/10 text-flame-400 shadow-[0_0_12px_-3px_rgba(249,115,22,0.15)]',
        secondary: 'bg-bg-tertiary text-text-secondary border border-border-default',
        success: 'bg-gradient-to-r from-emerald-500/12 to-emerald-600/8 text-emerald-400 shadow-[0_0_12px_-3px_rgba(16,185,129,0.1)]',
        warning: 'bg-gradient-to-r from-amber-500/12 to-amber-600/8 text-amber-400 shadow-[0_0_12px_-3px_rgba(245,158,11,0.1)]',
        destructive: 'bg-gradient-to-r from-ember-500/12 to-ember-600/8 text-ember-400 shadow-[0_0_12px_-3px_rgba(244,63,42,0.1)]'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, style, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} style={{ paddingLeft: '10px', paddingRight: '10px', paddingTop: '4px', paddingBottom: '4px', ...style }} {...props} />
}

export { Badge, badgeVariants }
