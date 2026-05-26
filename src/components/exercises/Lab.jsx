import { useState } from 'react'
import Markdown from '../Markdown.jsx'
import { useT } from '../../i18n.js'

// Offline hands-on challenge: the learner drafts an answer, then reveals a
// review checklist (the lab's rubric) to self-assess. No API required.
export default function Lab({ exercise, onSolved }) {
  const t = useT()
  const [input, setInput] = useState('')
  const [revealed, setRevealed] = useState(false)

  function reveal() {
    setRevealed(true)
    onSolved?.()
  }

  return (
    <div>
      <span className="pill accent" style={{ marginBottom: 12 }}>{t('handsOnLab')}</span>
      <Markdown>{exercise.brief}</Markdown>

      <label className="field" style={{ marginTop: 8 }}>
        <span>{t('yourAttempt')}</span>
        <textarea
          className="mono"
          rows={10}
          value={input}
          placeholder={exercise.placeholder || ''}
          onChange={(e) => setInput(e.target.value)}
        />
      </label>

      {!revealed ? (
        <button className="btn btn-primary" onClick={reveal}>Reveal review checklist</button>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div className="callout tip">
            <div className="ico">✅</div>
            <div>
              <div className="callout-title">What a strong answer covers</div>
              <div>{exercise.rubric || exercise.system}</div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            Compare your draft against each point above. Revise until your answer addresses them all.
          </p>
        </div>
      )}
    </div>
  )
}
