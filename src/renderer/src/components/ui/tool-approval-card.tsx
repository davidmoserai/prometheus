import { useState } from 'react'
import { ShieldAlert, ChevronDown, Check, X as XIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export interface ToolApprovalCardProps {
  approvalId: string
  tool: string
  args: Record<string, unknown>
  summary: string
  status: 'pending' | 'approved' | 'rejected'
  onRespond: (approvalId: string, approved: boolean) => void
}

export function ToolApprovalCard({ approvalId, tool, args, summary, status, onRespond }: ToolApprovalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const argsStr = JSON.stringify(args, null, 2)

  return (
    <div
      className={`rounded-xl overflow-hidden border-l-2 ${
        status === 'pending'
          ? 'bg-amber-500/[0.06] border-amber-500/50'
          : status === 'approved'
            ? 'bg-emerald-500/[0.04] border-emerald-500/40'
            : 'bg-red-500/[0.04] border-red-500/40'
      }`}
    >
      <div className="flex items-center" style={{ gap: '8px', padding: '8px 12px' }}>
        <ShieldAlert className={`w-4 h-4 shrink-0 ${
          status === 'pending' ? 'text-amber-400' : status === 'approved' ? 'text-emerald-400' : 'text-red-400'
        }`} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-text-primary truncate">{summary}</p>
        </div>

        {/* Action buttons or status badge */}
        {status === 'pending' ? (
          <div className="flex items-center shrink-0" style={{ gap: '6px' }}>
            <button
              onClick={() => onRespond(approvalId, false)}
              className="flex items-center text-[11px] text-red-400 hover:text-red-300 transition-colors cursor-pointer rounded-lg hover:bg-red-500/10"
              style={{ gap: '4px', padding: '4px 10px' }}
            >
              <XIcon className="w-3 h-3" />
              Deny
            </button>
            <button
              onClick={() => onRespond(approvalId, true)}
              className="flex items-center text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20"
              style={{ gap: '4px', padding: '4px 10px' }}
            >
              <Check className="w-3 h-3" />
              Approve
            </button>
          </div>
        ) : (
          <Badge variant={status === 'approved' ? 'success' : 'destructive'}>
            {status === 'approved' ? 'Approved' : 'Denied'}
          </Badge>
        )}

        {/* Expand/collapse args toggle */}
        {argsStr.length > 4 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer shrink-0"
          >
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* Expanded args detail */}
      {expanded && argsStr.length > 4 && (
        <div className="border-t border-white/[0.06]" style={{ padding: '8px 12px' }}>
          <pre className="text-[11px] text-text-secondary whitespace-pre-wrap font-mono leading-relaxed">{argsStr}</pre>
        </div>
      )}
    </div>
  )
}
