import { useState } from 'react'
import { Plus, Search, FileText, Tag, Pencil, Trash2, ArrowLeft, Save, X, BookOpen, ShieldCheck, AlertTriangle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAppStore, type KnowledgeDocument } from '@/stores/app-store'

// Compute how many days ago a date was
function daysAgo(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

// Check if a document needs review
function needsReview(doc: KnowledgeDocument): boolean {
  if (!doc.reviewIntervalDays || !doc.lastVerifiedAt) return false
  return daysAgo(doc.lastVerifiedAt) >= doc.reviewIntervalDays
}

export function KnowledgePage() {
  const { knowledge, createKnowledge, updateKnowledge, deleteKnowledge, verifyKnowledge } = useAppStore()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<KnowledgeDocument | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const filtered = knowledge.filter(
    (d) =>
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  )

  if (isCreating || editing) {
    return (
      <KnowledgeEditor
        document={editing || undefined}
        onSave={async (data) => {
          if (editing) {
            await updateKnowledge(editing.id, data)
          } else {
            await createKnowledge(data)
          }
          setEditing(null)
          setIsCreating(false)
        }}
        onClose={() => {
          setEditing(null)
          setIsCreating(false)
        }}
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative max-w-[960px] mx-auto" style={{ padding: '48px' }}>
        {/* Ambient orbs */}
        <div className="ambient-orb ambient-orb-2" style={{ top: '-40px', right: '-80px' }} />
        <div className="ambient-orb ambient-orb-3" style={{ bottom: '50px', left: '-60px' }} />

        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: '48px' }}>
          <div>
            <h2 className="text-[28px] font-bold tracking-tight">
              <span className="gradient-text">Knowledge Base</span>
            </h2>
            <p className="text-text-tertiary text-[15px]" style={{ marginTop: '8px' }}>Documents assigned to employees are included with every message as context</p>
          </div>
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="w-4 h-4" />
            New Document
          </Button>
        </div>

        {/* Search */}
        <div className="relative" style={{ marginBottom: '40px' }}>
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" style={{ left: '16px' }} />
          <Input
            placeholder="Search documents or tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '44px' }}
          />
        </div>

        {/* Documents Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2" style={{ gap: '28px' }}>
            {filtered.map((doc, i) => {
              const isOverdue = needsReview(doc)
              const verifiedDays = doc.lastVerifiedAt ? daysAgo(doc.lastVerifiedAt) : null

              return (
                <button
                  key={doc.id}
                  className="group relative rounded-2xl bg-bg-elevated hover:bg-bg-surface border border-border-default hover:border-border-bright transition-all duration-500 cursor-pointer text-left card-hover-glow overflow-hidden"
                  style={{
                    padding: '28px',
                    animationDelay: `${i * 60}ms`,
                    animation: 'scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
                  }}
                  onClick={() => setEditing(doc)}
                >
                  <div className="relative flex items-start justify-between" style={{ marginBottom: '20px' }}>
                    <div className="flex items-center" style={{ gap: '12px' }}>
                      <FileText className="w-5 h-5 text-sky-400 shrink-0" />
                      <h3 className="font-semibold text-text-primary text-[16px]">{doc.title}</h3>
                    </div>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ gap: '4px' }}>
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditing(doc)
                        }}
                        className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-surface transition-all cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </span>
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteKnowledge(doc.id)
                        }}
                        className="p-2 rounded-lg text-text-tertiary hover:text-ember-400 hover:bg-ember-500/10 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </span>
                    </div>
                  </div>

                  {/* Doc type and review status badges */}
                  <div className="relative flex items-center flex-wrap" style={{ gap: '6px', marginBottom: '16px' }}>
                    <Badge variant="secondary">
                      {doc.docType === 'living' ? 'Living' : 'Reference'}
                    </Badge>
                    {isOverdue && (
                      <Badge variant="destructive" className="flex items-center" style={{ gap: '4px' }}>
                        <AlertTriangle className="w-3 h-3" />
                        Needs Review
                      </Badge>
                    )}
                  </div>

                  <p className="relative text-[13px] text-text-tertiary line-clamp-3 leading-relaxed" style={{ marginBottom: '16px' }}>
                    {doc.content.slice(0, 200)}{doc.content.length > 200 ? '...' : ''}
                  </p>
                  <div className="relative flex items-center flex-wrap" style={{ gap: '8px' }}>
                    {doc.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        <Tag className="w-2.5 h-2.5 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  {/* Verification status and verify button */}
                  <div className="relative flex items-center justify-between" style={{ marginTop: '20px' }}>
                    <p className="text-[12px] text-text-tertiary">
                      {verifiedDays !== null
                        ? `Verified ${verifiedDays === 0 ? 'today' : `${verifiedDays}d ago`}`
                        : 'Never verified'}
                    </p>
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        verifyKnowledge(doc.id)
                      }}
                      className="flex items-center text-[12px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                      style={{ gap: '4px' }}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Verify
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        ) : knowledge.length === 0 ? (
          <div className="relative flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-border-default bg-bg-secondary overflow-hidden" style={{ paddingTop: '80px', paddingBottom: '80px' }}>
            <div className="absolute inset-0 gradient-mesh opacity-60" />
            <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500/15 to-blue-500/10 shadow-[0_0_24px_-6px_rgba(56,189,248,0.2)]" style={{ marginBottom: '20px' }}>
              <BookOpen className="w-7 h-7 text-sky-400" />
            </div>
            <h3 className="relative text-[18px] font-bold gradient-text" style={{ marginBottom: '8px' }}>No knowledge yet</h3>
            <p className="relative text-[13px] text-text-tertiary max-w-md leading-relaxed" style={{ marginBottom: '24px' }}>
              Create markdown documents with shared context, guidelines, or expertise.
              Assign them to employees so they can reference this knowledge.
            </p>
            <Button className="relative" onClick={() => setIsCreating(true)}>
              <Plus className="w-4 h-4" />
              Create First Document
            </Button>
          </div>
        ) : (
          <div className="text-center text-text-tertiary" style={{ paddingTop: '64px', paddingBottom: '64px' }}>
            No documents match &quot;{search}&quot;
          </div>
        )}
      </div>
    </div>
  )
}

function KnowledgeEditor({
  document,
  onSave,
  onClose
}: {
  document?: KnowledgeDocument
  onSave: (data: { title: string; content: string; tags: string[]; docType: 'living' | 'reference'; reviewIntervalDays: number | null; lastVerifiedAt: string | null }) => Promise<void>
  onClose: () => void
}) {
  const { verifyKnowledge } = useAppStore()
  const [title, setTitle] = useState(document?.title || '')
  const [content, setContent] = useState(document?.content || '')
  const [tags, setTags] = useState<string[]>(document?.tags || [])
  const [tagInput, setTagInput] = useState('')
  const [docType, setDocType] = useState<'living' | 'reference'>(document?.docType || 'reference')
  const [reviewIntervalDays, setReviewIntervalDays] = useState<number | null>(document?.reviewIntervalDays ?? null)

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
    }
    setTagInput('')
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative max-w-[720px] mx-auto" style={{ padding: '40px' }}>
        <div className="ambient-orb ambient-orb-1" style={{ top: '-80px', right: '-120px' }} />

        <div className="flex items-center justify-between" style={{ marginBottom: '32px' }}>
          <div className="flex items-center" style={{ gap: '12px' }}>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h2 className="text-xl font-bold tracking-tight">
              <span className="gradient-text">{document ? 'Edit Document' : 'New Document'}</span>
            </h2>
          </div>
          <Button onClick={() => onSave({ title, content, tags, docType, reviewIntervalDays, lastVerifiedAt: document?.lastVerifiedAt ?? null })} disabled={!title.trim()}>
            <Save className="w-4 h-4" />
            Save
          </Button>
        </div>

        <Card style={{ marginBottom: '16px' }}>
          <CardHeader>
            <CardTitle>Document</CardTitle>
            <CardDescription>Write in markdown format. This will be provided as context to assigned employees.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col" style={{ gap: '16px' }}>
            <div>
              <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Title</label>
              <Input
                placeholder="e.g. Company Guidelines, Code Standards..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Content</label>
              <Textarea
                placeholder="# Your Document&#10;&#10;Write knowledge in markdown format..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={16}
                className="font-mono text-[13px]"
              />
            </div>
            </div>
          </CardContent>
        </Card>

        {/* Context Management */}
        <Card style={{ marginBottom: '16px' }}>
          <CardHeader>
            <CardTitle className="flex items-center" style={{ gap: '8px' }}>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Context Management
            </CardTitle>
            <CardDescription>Control how this document stays current as your business evolves</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col" style={{ gap: '20px' }}>
              {/* Doc Type Toggle */}
              <div>
                <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Document Type</label>
                <div className="flex rounded-xl bg-bg-tertiary border border-border-default overflow-hidden" style={{ padding: '4px' }}>
                  <button
                    onClick={() => setDocType('living')}
                    className={`flex-1 rounded-lg text-[13px] font-medium transition-all duration-300 cursor-pointer ${
                      docType === 'living'
                        ? 'bg-white/[0.07] text-text-primary shadow-[0_0_16px_-4px_rgba(249,115,22,0.1)]'
                        : 'text-text-tertiary hover:text-text-secondary'
                    }`}
                    style={{ padding: '8px 16px' }}
                  >
                    Living
                  </button>
                  <button
                    onClick={() => setDocType('reference')}
                    className={`flex-1 rounded-lg text-[13px] font-medium transition-all duration-300 cursor-pointer ${
                      docType === 'reference'
                        ? 'bg-white/[0.07] text-text-primary shadow-[0_0_16px_-4px_rgba(249,115,22,0.1)]'
                        : 'text-text-tertiary hover:text-text-secondary'
                    }`}
                    style={{ padding: '8px 16px' }}
                  >
                    Reference
                  </button>
                </div>
                <p className="text-[12px] text-text-tertiary" style={{ marginTop: '6px' }}>
                  {docType === 'living'
                    ? 'Frequently changing content that needs regular review'
                    : 'Stable content that rarely changes'}
                </p>
              </div>

              {/* Review Interval */}
              <div>
                <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Review Interval</label>
                <select
                  value={reviewIntervalDays ?? ''}
                  onChange={(e) => setReviewIntervalDays(e.target.value ? Number(e.target.value) : null)}
                  className="flex w-full rounded-xl border border-border-default bg-bg-tertiary text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-flame-500/25 cursor-pointer transition-all duration-300"
                  style={{ height: '44px', padding: '10px 16px', borderRadius: '12px' }}
                >
                  <option value="">Never</option>
                  <option value="7">Every 7 days</option>
                  <option value="14">Every 14 days</option>
                  <option value="30">Every 30 days</option>
                </select>
              </div>

              {/* Mark as Verified button (only when editing) */}
              {document && (
                <div className="flex items-center justify-between rounded-xl bg-emerald-500/[0.04] border border-emerald-500/10" style={{ padding: '14px' }}>
                  <div>
                    <p className="text-[13px] font-medium text-text-primary">Verification Status</p>
                    <p className="text-[12px] text-text-tertiary" style={{ marginTop: '2px' }}>
                      {document.lastVerifiedAt
                        ? `Last verified ${daysAgo(document.lastVerifiedAt) === 0 ? 'today' : `${daysAgo(document.lastVerifiedAt)} days ago`}`
                        : 'Never verified'}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => verifyKnowledge(document.id)}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Mark as Verified
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tags</CardTitle>
            <CardDescription>Add tags to organize and find documents easily</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex" style={{ gap: '8px', marginBottom: '16px' }}>
              <Input
                placeholder="Add a tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddTag()
                  }
                }}
              />
              <Button variant="secondary" onClick={handleAddTag}>Add</Button>
            </div>
            <div className="flex flex-wrap" style={{ gap: '6px' }}>
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="pr-1">
                  {tag}
                  <button
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    className="ml-1.5 p-0.5 rounded-md hover:bg-white/[0.08] transition-all cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {tags.length === 0 && (
                <p className="text-[12px] text-text-tertiary">No tags yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
