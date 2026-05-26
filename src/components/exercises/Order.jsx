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

// items in exercise are in CORRECT order; we present shuffled and let user reorder.
export default function Order({ exercise, onSolved }) {
  const t = useT()
  // each entry: { text, correctIndex }
  const initial = useMemo(() => {
    const withIdx = exercise.items.map((text, correctIndex) => ({ text, correctIndex }))
    let s = shuffle(withIdx)
    // ensure it isn't already perfectly ordered
    if (s.every((it, i) => it.correctIndex === i) && s.length > 1) s = shuffle(withIdx)
    return s
  }, [exercise])

  const [list, setList] = useState(initial)
  const [dragIdx, setDragIdx] = useState(null)
  const [checked, setChecked] = useState(false)

  function move(from, to) {
    setList((prev) => {
      const next = prev.slice()
      const [it] = next.splice(from, 1)
      next.splice(to, 0, it)
      return next
    })
  }
  function nudge(i, dir) {
    const to = i + dir
    if (to < 0 || to >= list.length) return
    move(i, to)
  }

  function check() {
    setChecked(true)
    if (list.every((it, i) => it.correctIndex === i)) onSolved?.()
  }
  function reset() {
    setList(shuffle(initial))
    setChecked(false)
  }

  const allCorrect = checked && list.every((it, i) => it.correctIndex === i)

  return (
    <div>
      <p className="muted">{exercise.instructions}</p>
      {list.map((it, i) => {
        let style = {}
        if (checked) {
          style = it.correctIndex === i
            ? { borderColor: 'var(--green)', background: 'var(--green-soft)' }
            : { borderColor: 'var(--red)', background: 'var(--red-soft)' }
        }
        return (
          <div
            key={it.correctIndex}
            className={`order-item ${dragIdx === i ? 'dragging' : ''}`}
            style={style}
            draggable={!checked}
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => { e.preventDefault() }}
            onDrop={() => { if (dragIdx != null) { move(dragIdx, i); setDragIdx(null) } }}
            onDragEnd={() => setDragIdx(null)}
          >
            <span className="pos">{i + 1}</span>
            <span style={{ flex: 1 }}>{it.text}</span>
            {!checked && (
              <span className="row" style={{ gap: 4 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => nudge(i, -1)} disabled={i === 0}>↑</button>
                <button className="btn btn-sm btn-ghost" onClick={() => nudge(i, 1)} disabled={i === list.length - 1}>↓</button>
              </span>
            )}
          </div>
        )
      })}
      <div className="row" style={{ marginTop: 14 }}>
        {!checked ? (
          <button className="btn btn-primary" onClick={check}>{t('checkOrder')}</button>
        ) : (
          <>
            <span className={allCorrect ? 'pill green' : 'pill'}>
              {allCorrect ? t('correctOrder') : t('notYetOrder')}
            </span>
            <button className="btn btn-sm" onClick={reset}>{t('tryAgain')}</button>
          </>
        )}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>{t('dragHint')}</p>
    </div>
  )
}
