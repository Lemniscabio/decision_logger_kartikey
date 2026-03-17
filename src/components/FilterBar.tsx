const CATEGORIES = ['All', 'Strategic', 'Product', 'Hiring', 'Technical', 'Operating']

interface Props {
  category: string
  onCategoryChange: (cat: string) => void
}

export default function FilterChips({ category, onCategoryChange }: Props) {
  return (
    <div className="filter-bar">
      {CATEGORIES.map(cat => (
        <button
          key={cat}
          className={`filter-chip ${category === cat ? 'active' : ''}`}
          onClick={() => onCategoryChange(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}
