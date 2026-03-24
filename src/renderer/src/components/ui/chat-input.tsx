import React, { forwardRef, type TextareaHTMLAttributes } from 'react'
import { Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Styled textarea matching the chat input design
const ChatTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', style, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={1}
      className={`flex w-full rounded-2xl border border-border-default bg-bg-tertiary text-[14px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-flame-500/25 focus:border-flame-500/40 transition-all duration-300 resize-none leading-relaxed ${className}`}
      style={{ minHeight: '48px', maxHeight: '120px', padding: '14px 20px 14px 20px', ...style }}
      {...props}
    />
  )
)
ChatTextarea.displayName = 'ChatTextarea'

// Orange gradient send button with Send icon
interface SendButtonProps {
  onClick: () => void
  disabled?: boolean
}

function SendButton({ onClick, disabled }: SendButtonProps) {
  return (
    <Button
      size="icon"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 h-[48px] w-[48px] rounded-2xl"
    >
      <Send className="w-4 h-4" />
    </Button>
  )
}

// Flame-colored stop button with Square icon
interface StopButtonProps {
  onClick: () => void
}

function StopButton({ onClick }: StopButtonProps) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 h-[48px] w-[48px] rounded-2xl flex items-center justify-center bg-bg-elevated border border-border-default hover:border-flame-500/50 hover:bg-flame-500/10 transition-all cursor-pointer"
      title="Stop generating"
    >
      <Square className="w-4 h-4 text-flame-400 fill-flame-400" />
    </button>
  )
}

export { ChatTextarea, SendButton, StopButton }
