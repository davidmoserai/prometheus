import React, { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const baseStyle: React.CSSProperties = { height: '44px', paddingLeft: '16px', paddingRight: '16px', paddingTop: '10px', paddingBottom: '10px', borderRadius: '12px' }

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, style, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex w-full rounded-xl border border-border-default bg-bg-tertiary text-[14px] text-text-primary placeholder:text-text-tertiary',
          'focus:outline-none focus:ring-2 focus:ring-flame-500/25 focus:border-flame-500/40 focus:bg-bg-elevated',
          'focus:shadow-[0_0_20px_-4px_rgba(249,115,22,0.15)]',
          'transition-all duration-300 ease-out',
          className
        )}
        style={{ ...baseStyle, ...style }}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
