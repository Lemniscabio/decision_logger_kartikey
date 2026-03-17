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
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

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

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this decision?')) return
    await deleteDecision(id)
    setDecisions(prev => prev.filter(d => d._id !== id))
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
    </div>
  )
}
