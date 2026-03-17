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

  const catClass = decision.category.toLowerCase()

  return (
    <div className="decision-card" onClick={() => setExpanded(!expanded)}>
      <div className="card-top">
        <span className={`category-badge ${catClass}`}>{decision.category}</span>
        <span className="card-date">{formatDate(decision.date)}</span>
      </div>
      <div className="card-title">{decision.title}</div>
      {!expanded && (
        <div className="card-decision">{decision.decision}</div>
      )}
      {decision.tags?.length > 0 && (
        <div className="card-tags">
          {decision.tags.map(t => <span key={t} className="tag">{t}</span>)}
        </div>
      )}

      {expanded && (
        <div className="card-expanded">
          <div>
            <div className="card-field-label">Decision</div>
            <div className="card-field-value">{decision.decision}</div>
          </div>
          {decision.context && (
            <div>
              <div className="card-field-label">Context</div>
              <div className="card-field-value">{decision.context}</div>
            </div>
          )}
          {decision.rationale && (
            <div>
              <div className="card-field-label">Rationale</div>
              <div className="card-field-value">{decision.rationale}</div>
            </div>
          )}
          {decision.alternatives && (
            <div>
              <div className="card-field-label">Alternatives Considered</div>
              <div className="card-field-value">{decision.alternatives}</div>
            </div>
          )}
          {decision.owner && (
            <div>
              <div className="card-field-label">Owner</div>
              <div className="card-field-value">{decision.owner}</div>
            </div>
          )}
          {decision.implications && (
            <div>
              <div className="card-field-label">Implications</div>
              <div className="card-field-value">{decision.implications}</div>
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
