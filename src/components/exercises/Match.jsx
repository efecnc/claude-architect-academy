import { useMemo, useState } from 'react'
import { useT } from '../../i18n.js'

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Match terms (left) to definitions (right).
export default function Match({ exercise, onSolved }) {
  const t = useT()
  const pairs = exercise.pairs
  const terms = useMemo(() => shuffle(pairs.map((p, i) => ({ ...p, i }))), [exercise])
  const defs = useMemo(() => shuffle(pairs.map((p, i) => ({ ...p, i }))), [exercise])

  const [activeTerm, setActiveTerm] = useState(null)
  // mapping: termIndex -> defIndex chosen
  const [links, setLinks] = useState({})
  const [checked, setChecked] = useState(false)

  function clickTerm(t) {
    if (checked) return
    setActiveTerm(t.i === activeTerm ? null : t.i)
  }
  function clickDef(d) {
    if (checked || activeTerm == null) return
    setLinks((prev) => {
      const next = { ...prev }
      // remove any existing link to this def
      for (const k of Object.keys(next)) if (next[k] === d.i) delete next[k]
      next[activeTerm] = d.i
      return next
    })
    setActiveTerm(null)
  }
  function check() {
    setChecked(true)
    const allCorrect = pairs.every((_, i) => links[i] === i)
    if (allCorrect) onSolved?.()
  }
  function reset() {
    setLinks({})
    setActiveTerm(null)
    setChecked(false)
  }

  const allLinked = Object.keys(links).length === pairs.length
  const allCorrect = checked && pairs.every((_, i) => links[i] === i)

  // For each def, which term points to it?
  const defToTerm = {}
  for (const [t, d] of Object.entries(links)) defToTerm[d] = Number(t)

  return (
    <div>
      <p className="muted">{exercise.instructions}</p>
      <div className="match-grid">
        <div className="match-col">
          <h4>{t('term')}</h4>
          {terms.map((t) => {
            const linkedDef = links[t.i]
            let cls = 'match-item term'
            if (activeTerm === t.i) cls += ' selected'
            if (linkedDef != null && !checked) cls += ' matched'
            return (
              <div key={t.i} className={cls} onClick={() => clickTerm(t)}>
                {t.term}
                {linkedDef != null && (
                  <span className="badge"> → {defs.findIndex((d) => d.i === linkedDef) + 1}</span>
                )}
              </div>
            )
          })}
        </div>
        <div className="match-col">
          <h4>{t('definition')}</h4>
          {defs.map((d, idx) => {
            const term = defToTerm[d.i]
            let cls = 'match-item target'
            if (checked && term != null) cls += term === d.i ? ' correct' : ' wrong'
            return (
              <div key={d.i} className={cls} onClick={() => clickDef(d)}>
                <span className="badge">{idx + 1}. </span>
                {d.def}
              </div>
            )
          })}
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        {!checked ? (
          <button className="btn btn-primary" onClick={check} disabled={!allLinked}>
            {t('checkMatches')}
          </button>
        ) : (
          <>
            <span className={allCorrect ? 'pill green' : 'pill'}>
              {allCorrect ? t('allCorrect') : t('someWrong')}
            </span>
            <button className="btn btn-sm" onClick={reset}>{t('tryAgain')}</button>
          </>
        )}
      </div>
      {activeTerm != null && !checked && (
        <p className="muted" style={{ fontSize: 13 }}>{t('clickMatching')}</p>
      )}
    </div>
  )
}
