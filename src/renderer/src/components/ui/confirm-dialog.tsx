import { useEffect, useRef } from 'react'
import { Button } from './button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'destructive' | 'default'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onCancel() }}
    >
      <div
        className="bg-bg-elevated border border-border-default shadow-2xl"
        style={{
          borderRadius: '16px',
          padding: '28px',
          maxWidth: '400px',
          width: '90%',
          animation: 'scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) both'
        }}
      >
        <h3 className="text-[16px] font-semibold text-text-primary">{title}</h3>
        {description && (
          <p className="text-[13px] text-text-secondary" style={{ marginTop: '8px' }}>
            {description}
          </p>
        )}
        <div className="flex justify-end" style={{ gap: '8px', marginTop: '24px' }}>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
