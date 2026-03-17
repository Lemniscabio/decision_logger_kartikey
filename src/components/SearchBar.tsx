import { useEffect, useRef } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
}

export default function SearchBar({ value, onChange }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    onChange(val)
  }

  return (
    <input
      className="search-bar"
      type="text"
      placeholder="Search decisions..."
      value={value}
      onChange={handleChange}
    />
  )
}
