import { Square } from 'lucide-react'

interface AgentWorkingIndicatorProps {
  agentName?: string
  onStop?: () => void
  size?: 'sm' | 'md'
}

export function AgentWorkingIndicator({ agentName, onStop, size = 'md' }: AgentWorkingIndicatorProps) {
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center" style={{ gap: '6px' }}>
        <div className="flex" style={{ gap: '4px' }}>
          <span className={`${dotSize} rounded-full bg-text-tertiary`} style={{ animation: 'pulse-dot 1.4s ease-in-out infinite', animationDelay: '0s' }} />
          <span className={`${dotSize} rounded-full bg-text-tertiary`} style={{ animation: 'pulse-dot 1.4s ease-in-out infinite', animationDelay: '0.2s' }} />
          <span className={`${dotSize} rounded-full bg-text-tertiary`} style={{ animation: 'pulse-dot 1.4s ease-in-out infinite', animationDelay: '0.4s' }} />
        </div>
        <span className="text-[12px] text-text-tertiary">
          {agentName ? `${agentName} is working...` : 'Working...'}
        </span>
      </div>
      {onStop && (
        <button
          onClick={onStop}
          className="flex items-center text-[11px] text-red-400 hover:text-red-300 transition-colors cursor-pointer"
          style={{ gap: '4px' }}
        >
          <Square className="w-3 h-3" />
          Stop
        </button>
      )}
    </div>
  )
}
