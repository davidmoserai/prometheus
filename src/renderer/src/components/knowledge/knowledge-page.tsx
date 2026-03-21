import { useState } from 'react'
import { Plus, Search, FileText, Tag, Pencil, Trash2, ArrowLeft, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAppStore, type KnowledgeDocument } from '@/stores/app-store'

export function KnowledgePage() {
  const { knowledge, createKnowledge, updateKnowledge, deleteKnowledge } = useAppStore()
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
      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-text-primary">Knowledge Base</h2>
            <p className="text-text-tertiary mt-1">Shared documents and context for your employees</p>
          </div>
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="w-4 h-4" />
            New Document
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <Input
            placeholder="Search documents or tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Documents Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            {filtered.map((doc) => (
              <Card
                key={doc.id}
                className="group hover:border-border-bright cursor-pointer transition-all animate-fade-in"
                onClick={() => setEditing(doc)}
              >
                <CardContent>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-sky-400" />
                      <h3 className="font-semibold text-text-primary">{doc.title}</h3>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditing(doc)
                        }}
                        className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-surface transition-all cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteKnowledge(doc.id)
                        }}
                        className="p-1.5 rounded-md text-text-tertiary hover:text-ember-400 hover:bg-ember-500/10 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-text-tertiary line-clamp-3 mb-3">
                    {doc.content.slice(0, 200)}{doc.content.length > 200 ? '...' : ''}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {doc.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        <Tag className="w-2.5 h-2.5 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-text-tertiary mt-3">
                    Updated {new Date(doc.updatedAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : knowledge.length === 0 ? (
          <Card className="border-dashed border-border-default">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 mb-4">
                <FileText className="w-8 h-8 text-sky-400" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-1">No knowledge yet</h3>
              <p className="text-sm text-text-tertiary mb-6 max-w-md">
                Create markdown documents with shared context, guidelines, or expertise.
                Assign them to employees so they can reference this knowledge.
              </p>
              <Button onClick={() => setIsCreating(true)}>
                <Plus className="w-4 h-4" />
                Create First Document
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="text-center py-12 text-text-tertiary">
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
  onSave: (data: { title: string; content: string; tags: string[] }) => Promise<void>
  onClose: () => void
}) {
  const [title, setTitle] = useState(document?.title || '')
  const [content, setContent] = useState(document?.content || '')
  const [tags, setTags] = useState<string[]>(document?.tags || [])
  const [tagInput, setTagInput] = useState('')

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
    }
    setTagInput('')
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onClose}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h2 className="text-xl font-bold text-text-primary">
              {document ? 'Edit Document' : 'New Document'}
            </h2>
          </div>
          <Button onClick={() => onSave({ title, content, tags })} disabled={!title.trim()}>
            <Save className="w-4 h-4" />
            Save
          </Button>
        </div>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Document</CardTitle>
            <CardDescription>Write in markdown format. This will be provided as context to assigned employees.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Title</label>
              <Input
                placeholder="e.g. Company Guidelines, Code Standards..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Content</label>
              <Textarea
                placeholder="# Your Document&#10;&#10;Write knowledge in markdown format..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={16}
                className="font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tags</CardTitle>
            <CardDescription>Add tags to organize and find documents easily</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-3">
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
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="pr-1">
                  {tag}
                  <button
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    className="ml-1 p-0.5 rounded hover:bg-bg-surface transition-all cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {tags.length === 0 && (
                <p className="text-xs text-text-tertiary">No tags yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
