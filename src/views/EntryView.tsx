import { useState, useEffect } from 'react'
import { getToday } from '../lib/dateUtils'
import { createDecision, updateDecision, fetchDecision, structureText } from '../lib/api'

const DEFAULT_CATEGORIES = ['Strategic', 'Product', 'Hiring', 'Technical', 'Operating']

interface Props {
  editId?: string | null
  onBack: () => void
}

export default function EntryView({ editId, onBack }: Props) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(getToday())
  const [category, setCategory] = useState('')
  const [customCategories, setCustomCategories] = useState<string[]>([])
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customCatInput, setCustomCatInput] = useState('')
  const [decision, setDecision] = useState('')
  const [context, setContext] = useState('')
  const [rationale, setRationale] = useState('')
  const [alternatives, setAlternatives] = useState('')
  const [owner, setOwner] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [implications, setImplications] = useState('')
  const [saving, setSaving] = useState(false)
  const [structuring, setStructuring] = useState(false)

  // Handle share target params — auto-structure with Gemini
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sharedText = params.get('text') || params.get('url') || ''
    const sharedTitle = params.get('title') || ''

    if (!sharedText && !sharedTitle) return

    const rawText = [sharedTitle, sharedText].filter(Boolean).join('\n\n')
    setStructuring(true)

    structureText(rawText)
      .then(result => {
        if (result.title) setTitle(result.title)
        if (result.category) setCategory(result.category)
        if (result.decision) setDecision(result.decision)
        if (result.context) setContext(result.context)
        if (result.rationale) setRationale(result.rationale)
        if (result.alternatives) setAlternatives(result.alternatives)
        if (result.owner) setOwner(result.owner)
        if (result.tags) setTags(result.tags)
        if (result.implications) setImplications(result.implications)
      })
      .catch(() => {
        // Fallback: just put raw text in context
        if (sharedText) setContext(sharedText)
        if (sharedTitle) setTitle(sharedTitle)
      })
      .finally(() => setStructuring(false))
  }, [])

  // Load existing decision for editing
  useEffect(() => {
    if (!editId) return
    fetchDecision(editId).then(d => {
      setTitle(d.title)
      setDate(d.date)
      setCategory(d.category)
      setDecision(d.decision)
      setContext(d.context || '')
      setRationale(d.rationale || '')
      setAlternatives(d.alternatives || '')
      setOwner(d.owner || '')
      setTags(d.tags || [])
      setImplications(d.implications || '')
    })
  }, [editId])

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault()
      const newTag = tagInput.trim().replace(/,$/, '')
      if (newTag && !tags.includes(newTag)) {
        setTags([...tags, newTag])
      }
      setTagInput('')
    }
    if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1))
    }
  }

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag))
  }

  const canSave = title && date && category && decision

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const data = {
        title,
        date,
        category,
        decision,
        context: context || undefined,
        rationale: rationale || undefined,
        alternatives: alternatives || undefined,
        owner: owner || undefined,
        tags: tags.length > 0 ? tags : undefined,
        implications: implications || undefined
      }

      if (editId) {
        await updateDecision(editId, data)
      } else {
        await createDecision(data)
      }
      onBack()
    } catch (err) {
      console.error('Failed to save:', err)
      alert('Failed to save decision. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="entry-view">
      {structuring && (
        <div className="structuring-overlay">
          <div className="structuring-card">
            <span className="spinner" />
            <p>Structuring shared text...</p>
          </div>
        </div>
      )}
      <div className="entry-header">
        <button className="back-btn" onClick={onBack}>&larr;</button>
        <h2>{editId ? 'Edit Decision' : 'New Decision'}</h2>
      </div>

      <div className="form-group">
        <label className="form-label">Title *</label>
        <input
          className="form-input"
          type="text"
          placeholder="One-line summary"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Date *</label>
        <input
          className="form-input"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Category *</label>
        <div className="category-selector">
          {[...DEFAULT_CATEGORIES, ...customCategories].map(cat => (
            <button
              key={cat}
              type="button"
              className={`category-option ${category === cat ? 'selected' : ''}`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
          {showCustomInput ? (
            <input
              className="custom-cat-input"
              type="text"
              placeholder="Category name"
              value={customCatInput}
              autoFocus
              onChange={e => setCustomCatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && customCatInput.trim()) {
                  e.preventDefault()
                  const name = customCatInput.trim()
                  if (!DEFAULT_CATEGORIES.includes(name) && !customCategories.includes(name)) {
                    setCustomCategories([...customCategories, name])
                  }
                  setCategory(name)
                  setCustomCatInput('')
                  setShowCustomInput(false)
                }
                if (e.key === 'Escape') {
                  setCustomCatInput('')
                  setShowCustomInput(false)
                }
              }}
              onBlur={() => {
                if (!customCatInput.trim()) setShowCustomInput(false)
              }}
            />
          ) : (
            <button
              type="button"
              className="category-option add-category"
              onClick={() => setShowCustomInput(true)}
            >
              + Add
            </button>
          )}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Decision *</label>
        <textarea
          className="form-textarea"
          placeholder="What was decided?"
          value={decision}
          onChange={e => setDecision(e.target.value)}
          rows={3}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Context</label>
        <textarea
          className="form-textarea"
          placeholder="What prompted this?"
          value={context}
          onChange={e => setContext(e.target.value)}
          rows={3}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Rationale</label>
        <textarea
          className="form-textarea"
          placeholder="Why this over alternatives?"
          value={rationale}
          onChange={e => setRationale(e.target.value)}
          rows={3}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Alternatives Considered</label>
        <textarea
          className="form-textarea"
          placeholder="What else was considered?"
          value={alternatives}
          onChange={e => setAlternatives(e.target.value)}
          rows={2}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Owner</label>
        <input
          className="form-input"
          type="text"
          placeholder="Who made or owns this"
          value={owner}
          onChange={e => setOwner(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Tags</label>
        <div className="tag-input-wrap">
          {tags.map(t => (
            <span key={t} className="tag-chip">
              {t}
              <button onClick={() => removeTag(t)}>&times;</button>
            </span>
          ))}
          <input
            className="tag-input"
            type="text"
            placeholder={tags.length === 0 ? 'Add tags (comma-separated)' : ''}
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Implications</label>
        <textarea
          className="form-textarea"
          placeholder="What happens next?"
          value={implications}
          onChange={e => setImplications(e.target.value)}
          rows={2}
        />
      </div>

      <button
        className="save-btn"
        disabled={!canSave || saving}
        onClick={handleSave}
      >
        {saving ? <span className="spinner" /> : (editId ? 'Update Decision' : 'Save Decision')}
      </button>
    </div>
  )
}
