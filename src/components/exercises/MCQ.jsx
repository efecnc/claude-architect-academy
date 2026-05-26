import { useState } from 'react'
import { useT } from '../../i18n.js'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export default function MCQ({ exercise, onSolved }) {
  const t = useT()
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(false)

  function pick(i) {
    if (revealed) return
    setSelected(i)
  }
  function check() {
    if (selected == null) return
    setRevealed(true)
    if (selected === exercise.answer) onSolved?.()
  }
  function reset() {
    setSelected(null)
    setRevealed(false)
  }

  const correct = revealed && selected === exercise.answer

  return (
    <div>
      {exercise.scenario && (
        <div className="explain" style={{ marginTop: 0 }}>
          <strong>{t('scenario')}</strong> {exercise.scenario}
        </div>
      )}
      <p style={{ fontWeight: 600, fontSize: '15.5px' }}>{exercise.question}</p>
      {exercise.options.map((opt, i) => {
        let cls = 'choice'
        if (revealed) {
          if (i === exercise.answer) cls += ' correct'
          else if (i === selected) cls += ' wrong'
        } else if (i === selected) cls += ' selected'
        return (
          <button key={i} className={cls} onClick={() => pick(i)} disabled={revealed}>
            <span className="marker">{LETTERS[i]}</span>
            <span>{opt}</span>
          </button>
        )
      })}

      {revealed ? (
        <>
          <div className={`explain ${correct ? 'correct' : 'wrong'}`}>
            <strong>{correct ? `✓ ${t('correct')}` : `✗ ${t('notQuite')}`}</strong>{' '}
            {exercise.explanation}
          </div>
          <button className="btn btn-sm" onClick={reset}>{t('tryAgain')}</button>
        </>
      ) : (
        <button className="btn btn-primary" onClick={check} disabled={selected == null}>
          {t('checkAnswer')}
        </button>
      )}
    </div>
  )
}
