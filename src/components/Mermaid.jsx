import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { useTheme } from '../store/theme.js'

let lastTheme = null

function cssVar(name, fallback) {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function initMermaid(theme) {
  if (lastTheme === theme) return
  lastTheme = theme
  const c = {
    panel: cssVar('--panel', '#13161c'),
    card: cssVar('--bg-card', '#1b1f28'),
    elev: cssVar('--bg-elev', '#171a21'),
    border: cssVar('--border', '#2a2f3a'),
    text: cssVar('--text', '#e6e8ec'),
    dim: cssVar('--text-dim', '#9aa3b2'),
    accent: cssVar('--accent', '#d97757'),
  }
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    themeVariables: {
      darkMode: theme === 'dark',
      background: c.panel,
      primaryColor: c.card,
      primaryBorderColor: c.border,
      primaryTextColor: c.text,
      secondaryColor: c.elev,
      tertiaryColor: c.elev,
      lineColor: c.dim,
      textColor: c.text,
      fontSize: '14px',
      nodeBorder: c.border,
      clusterBkg: c.elev,
      clusterBorder: c.border,
      actorBkg: c.card,
      actorBorder: c.accent,
      actorTextColor: c.text,
      signalColor: c.dim,
      signalTextColor: c.text,
      labelBoxBkgColor: c.card,
      labelBoxBorderColor: c.border,
      labelTextColor: c.text,
      noteBkgColor: c.elev,
      noteBorderColor: c.accent,
      noteTextColor: c.text,
      mainBkg: c.card,
      edgeLabelBackground: c.panel,
    },
    // useMaxWidth:true → each diagram scales to fit the card width (never
    // overflows, never oversized). Clean, consistent, static presentation.
    flowchart: { curve: 'basis', htmlLabels: true, padding: 14, nodeSpacing: 44, rankSpacing: 50, useMaxWidth: true },
    sequence: { actorMargin: 64, noteMargin: 12, messageMargin: 36, mirrorActors: false, useMaxWidth: true, wrap: true },
  })
}

let counter = 0

export default function Mermaid({ code }) {
  const theme = useTheme()
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const idRef = useRef(`mmd-${++counter}`)

  useEffect(() => {
    let active = true
    lastTheme = null
    initMermaid(theme)
    mermaid
      .render(`${idRef.current}-${theme}`, code)
      .then(({ svg }) => { if (active) { setSvg(svg); setError('') } })
      .catch((e) => { if (active) setError(String(e?.message || e)) })
    return () => { active = false }
  }, [code, theme])

  if (error) {
    return <pre className="mermaid-fallback"><code>{code}</code></pre>
  }
  if (!svg) return <div className="mermaid-loading">rendering diagram…</div>
  return <figure className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
}
