import { useState, useEffect, useRef } from 'react'
import SearchBar from '../components/SearchBar'
import FilterChips from '../components/FilterBar'
import DecisionCard from '../components/DecisionCard'
import SkeletonCard from '../components/SkeletonCard'
import { fetchDecisions, deleteDecision, type Decision } from '../lib/api'

interface Props {
  onNew: () => void
  onEdit: (id: string) => void
}

export default function LogView({ onNew, onEdit }: Props) {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const load = async (q?: string) => {
    setLoading(true)
    try {
      const params: any = {}
      if (q) params.q = q
      if (category !== 'All') params.category = category
      const data = await fetchDecisions(params)
      setDecisions(data)
    } catch (err) {
      console.error('Failed to load decisions:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      load(query)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, category])

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteSuccess, setDeleteSuccess] = useState(false)

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id)
    setDeleting(false)
    setDeleteSuccess(false)
  }

  const confirmDelete = async () => {
    if (!deleteConfirmId) return
    setDeleting(true)
    try {
      await deleteDecision(deleteConfirmId)
      setDeleteSuccess(true)
      setTimeout(() => {
        setDecisions(prev => prev.filter(d => d._id !== deleteConfirmId))
        setDeleteConfirmId(null)
        setDeleteSuccess(false)
      }, 800)
    } catch (err) {
      console.error('Failed to delete:', err)
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="header">
        <h1>Decision Log</h1>
        <button className="add-btn" onClick={onNew}>+</button>
      </div>

      <SearchBar value={query} onChange={setQuery} />
      <FilterChips
        category={category}
        onCategoryChange={setCategory}
      />

      {loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : decisions.length === 0 ? (
        <div className="empty-state">
          <p>No decisions logged yet</p>
          <button onClick={onNew}>Log your first decision</button>
        </div>
      ) : (
        decisions.map(d => (
          <DecisionCard
            key={d._id}
            decision={d}
            onEdit={onEdit}
            onDelete={handleDelete}
          />
        ))
      )}

      {deleteConfirmId && (
        <div className="confirm-overlay" onClick={() => !deleting && setDeleteConfirmId(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            {deleteSuccess ? (
              <div className="delete-success">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <p>Deleted</p>
              </div>
            ) : (
              <>
                <p>Delete this decision?</p>
                <div className="confirm-actions">
                  <button className="confirm-cancel" onClick={() => setDeleteConfirmId(null)} disabled={deleting}>Cancel</button>
                  <button className="confirm-delete" onClick={confirmDelete} disabled={deleting}>
                    {deleting ? <span className="spinner" /> : 'Delete'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
