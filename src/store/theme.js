import { useEffect, useState } from 'react'

const KEY = 'caa-theme-v1'

function load() {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch (e) { /* ignore */ }
  return 'dark'
}

let theme = load()
const listeners = new Set()

function apply() {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme
  }
}
apply() // apply immediately on import so there's no flash

export function getTheme() { return theme }

export function setTheme(next) {
  theme = next === 'light' ? 'light' : 'dark'
  try { localStorage.setItem(KEY, theme) } catch (e) { /* ignore */ }
  apply()
  listeners.forEach((l) => l(theme))
}

export function toggleTheme() {
  setTheme(theme === 'dark' ? 'light' : 'dark')
}

export function useTheme() {
  const [t, setT] = useState(theme)
  useEffect(() => {
    const l = (next) => setT(next)
    listeners.add(l)
    return () => listeners.delete(l)
  }, [])
  return t
}
