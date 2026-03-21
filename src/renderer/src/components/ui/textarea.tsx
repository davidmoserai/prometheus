import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-lg border border-border-subtle bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary',
          'focus:outline-none focus:ring-2 focus:ring-flame-500/30 focus:border-flame-500/50',
          'transition-all duration-200 resize-none',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
