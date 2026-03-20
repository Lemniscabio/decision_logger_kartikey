import { useState } from 'react'
import { formatDate } from '../lib/dateUtils'
import type { Decision } from '../lib/api'

interface Props {
  decision: Decision
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

export default function DecisionCard({ decision, onEdit, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false)

  const catClass = (decision.category || '').toLowerCase()
  const tags = Array.isArray(decision.tags) ? decision.tags : []

  // Gemini sometimes returns objects/arrays instead of strings — safely convert
  const toDisplayString = (val: unknown): string => {
    if (!val) return ''
    if (typeof val === 'string') return val
    if (Array.isArray(val)) {
      return val.map(item => {
        if (typeof item === 'string') return item
        if (typeof item === 'object' && item !== null) {
          return Object.values(item).join(' — ')
        }
        return String(item)
      }).join('\n')
    }
    if (typeof val === 'object') {
      return Object.values(val).join(' — ')
    }
    return String(val)
  }

  return (
    <div className="decision-card" onClick={() => setExpanded(!expanded)}>
      <div className="card-top">
        <span className={`category-badge ${catClass}`}>{decision.category || 'Uncategorized'}</span>
        <span className="card-date">{decision.date ? formatDate(decision.date) : ''}</span>
      </div>
      <div className="card-title">{decision.title}</div>
      {!expanded && (
        <div className="card-decision">{decision.decision}</div>
      )}
      {tags.length > 0 && (
        <div className="card-tags">
          {tags.map(t => <span key={t} className="tag">{t}</span>)}
        </div>
      )}

      {expanded && (
        <div className="card-expanded">
          <div>
            <div className="card-field-label">Decision</div>
            <div className="card-field-value">{toDisplayString(decision.decision)}</div>
          </div>
          {decision.context && (
            <div>
              <div className="card-field-label">Context</div>
              <div className="card-field-value">{toDisplayString(decision.context)}</div>
            </div>
          )}
          {decision.rationale && (
            <div>
              <div className="card-field-label">Rationale</div>
              <div className="card-field-value">{toDisplayString(decision.rationale)}</div>
            </div>
          )}
          {decision.alternatives && (
            <div>
              <div className="card-field-label">Alternatives Considered</div>
              <div className="card-field-value">{toDisplayString(decision.alternatives)}</div>
            </div>
          )}
          {decision.owner && (
            <div>
              <div className="card-field-label">Owner</div>
              <div className="card-field-value">{toDisplayString(decision.owner)}</div>
            </div>
          )}
          {decision.implications && (
            <div>
              <div className="card-field-label">Implications</div>
              <div className="card-field-value">{toDisplayString(decision.implications)}</div>
            </div>
          )}
          <div className="card-actions">
            <button
              className="card-action-btn"
              onClick={e => { e.stopPropagation(); onEdit(decision._id) }}
            >
              Edit
            </button>
            <button
              className="card-action-btn delete"
              onClick={e => { e.stopPropagation(); onDelete(decision._id) }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
