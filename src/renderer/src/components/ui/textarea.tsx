import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const baseStyle = { minHeight: '80px', padding: '14px 16px' }

const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, style, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex w-full rounded-xl border border-border-default bg-bg-tertiary text-sm text-text-primary placeholder:text-text-tertiary',
          'focus:outline-none focus:ring-2 focus:ring-flame-500/25 focus:border-flame-500/40 focus:bg-bg-elevated',
          'focus:shadow-[0_0_20px_-4px_rgba(249,115,22,0.15)]',
          'transition-all duration-300 ease-out resize-none leading-relaxed',
          className
        )}
        style={{ ...baseStyle, ...style }}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
