import { useState, useEffect } from 'react'
import LogView from './views/LogView'
import EntryView from './views/EntryView'

type View = 'log' | 'new' | 'edit'

export default function App() {
  const [view, setView] = useState<View>('log')
  const [editId, setEditId] = useState<string | null>(null)

  // Handle /new route for share target
  useEffect(() => {
    if (window.location.pathname === '/new') {
      setView('new')
    }
  }, [])

  const handleNew = () => {
    setEditId(null)
    setView('new')
  }

  const handleEdit = (id: string) => {
    setEditId(id)
    setView('edit')
  }

  const handleBack = () => {
    setEditId(null)
    setView('log')
    if (window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/')
    }
  }

  return (
    <div className="app">
      {view === 'log' ? (
        <LogView onNew={handleNew} onEdit={handleEdit} />
      ) : (
        <EntryView
          editId={view === 'edit' ? editId : null}
          onBack={handleBack}
        />
      )}
    </div>
  )
}
