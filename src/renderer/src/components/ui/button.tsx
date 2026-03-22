import React, { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary disabled:pointer-events-none disabled:opacity-40 cursor-pointer',
  {
    variants: {
      variant: {
        default: [
          'bg-gradient-to-b from-flame-500 to-flame-600 text-white',
          'shadow-[0_1px_2px_rgba(0,0,0,0.3),0_4px_16px_-2px_rgba(249,115,22,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]',
          'hover:from-flame-400 hover:to-flame-500',
          'hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_8px_24px_-4px_rgba(249,115,22,0.35),inset_0_1px_0_rgba(255,255,255,0.15)]',
          'active:from-flame-600 active:to-flame-700 active:shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_1px_3px_rgba(0,0,0,0.2)]',
        ].join(' '),
        secondary: 'bg-bg-tertiary text-text-primary hover:bg-bg-elevated border border-border-default hover:border-border-bright',
        ghost: 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary',
        destructive: 'bg-gradient-to-b from-ember-500 to-ember-600 text-white shadow-[0_1px_2px_rgba(0,0,0,0.3),0_4px_16px_-2px_rgba(244,63,42,0.2)] hover:from-ember-400 hover:to-ember-500',
        outline: 'border border-border-default text-text-secondary hover:text-text-primary hover:border-flame-500/40 hover:bg-flame-500/5 hover:shadow-[0_0_20px_-4px_rgba(249,115,22,0.15)]'
      },
      size: {
        default: '',
        sm: 'text-[13px]',
        lg: 'text-base',
        icon: ''
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const sizeStyles: Record<string, React.CSSProperties> = {
  default: { height: '44px', paddingLeft: '24px', paddingRight: '24px', paddingTop: '10px', paddingBottom: '10px', gap: '8px' },
  sm: { height: '36px', paddingLeft: '16px', paddingRight: '16px', gap: '8px' },
  lg: { height: '52px', paddingLeft: '32px', paddingRight: '32px', gap: '8px' },
  icon: { height: '40px', width: '40px' }
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, style, ...props }, ref) => {
    const sizeKey = (size as string) || 'default'
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        style={{ ...sizeStyles[sizeKey], ...style }}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
