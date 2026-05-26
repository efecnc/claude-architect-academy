import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getModule, getModules } from '../data/index.js'
import { recordQuiz, useProgress } from '../store/progress.js'
import { useT } from '../i18n.js'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function QuizView() {
  const { moduleId } = useParams()
  const t = useT()
  const mod = getModule(moduleId)
  const progress = useProgress()

  // Shuffle question order AND the options within each question (remapping the
  // correct index), so the correct answer's position is never predictable.
  const questions = useMemo(() => {
    if (!mod) return []
    return shuffle(mod.quiz).map((q) => {
      const tagged = q.options.map((text, i) => ({ text, i }))
      const shuffled = shuffle(tagged)
      return {
        ...q,
        options: shuffled.map((o) => o.text),
        answer: shuffled.findIndex((o) => o.i === q.answer),
      }
    })
  }, [moduleId])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState({})
  const [finished, setFinished] = useState(false)

  if (!mod) return <div className="content"><p>{t('notFound')}</p></div>
  if (!questions.length) return <div className="content"><p>—</p></div>

  const q = questions[current]
  const selected = answers[current]
  const isLast = current === questions.length - 1

  function pick(i) {
    if (answers[current] != null) return
    setAnswers((prev) => ({ ...prev, [current]: i }))
  }

  function finish() {
    const correct = questions.reduce((n, qq, i) => n + (answers[i] === qq.answer ? 1 : 0), 0)
    const score = Math.round((correct / questions.length) * 100)
    recordQuiz(mod.id, score)
    setFinished(true)
  }

  if (finished) {
    const correct = questions.reduce((n, qq, i) => n + (answers[i] === qq.answer ? 1 : 0), 0)
    const score = Math.round((correct / questions.length) * 100)
    const pass = score >= 70
    const modules = getModules()
    const idx = modules.findIndex((m) => m.id === mod.id)
    const nextMod = modules[idx + 1]
    return (
      <div className="content">
        <h1 style={{ fontSize: 26 }}>{t('quizResults', mod.title)}</h1>
        <div className="card center" style={{ marginTop: 16 }}>
          <div className="score-ring" style={{ color: pass ? 'var(--green)' : 'var(--accent)' }}>{score}%</div>
          <div className="muted">{t('ofCorrect', correct, questions.length)}</div>
          <div style={{ marginTop: 10 }}>
            <span className={pass ? 'pill green' : 'pill'}>{pass ? t('passed') : t('belowPass')}</span>
          </div>
        </div>

        <h2 style={{ fontSize: 19, marginTop: 30 }}>{t('review')}</h2>
        <div className="stack">
          {questions.map((qq, i) => {
            const sel = answers[i]
            const ok = sel === qq.answer
            return (
              <div key={qq.id} className="card">
                <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <span className={ok ? 'pill green' : 'pill'} style={ok ? {} : { background: 'var(--red-soft)', color: 'var(--red)' }}>
                    {ok ? '✓' : '✗'}
                  </span>
                  <strong>{qq.question}</strong>
                </div>
                <div style={{ marginTop: 10 }}>
                  {qq.options.map((opt, oi) => {
                    let cls = 'choice'
                    if (oi === qq.answer) cls += ' correct'
                    else if (oi === sel) cls += ' wrong'
                    return (
                      <div key={oi} className={cls} style={{ cursor: 'default' }}>
                        <span className="marker">{LETTERS[oi]}</span><span>{opt}</span>
                      </div>
                    )
                  })}
                </div>
                <div className={`explain ${ok ? 'correct' : 'wrong'}`}>{qq.explanation}</div>
              </div>
            )
          })}
        </div>

        <div className="divider" />
        <div className="row between wrap">
          <button className="btn" onClick={() => { setFinished(false); setAnswers({}); setCurrent(0) }}>{t('retake')}</button>
          <div className="row">
            <Link className="btn btn-sm" to={`/module/${mod.id}`}>{t('moduleOverview').replace('← ', '')}</Link>
            {nextMod && <Link className="btn btn-primary" to={`/module/${nextMod.id}`}>{t('nextModule')}: {nextMod.title} →</Link>}
          </div>
        </div>
      </div>
    )
  }

  const answeredCount = Object.keys(answers).length

  return (
    <div className="content">
      <div className="row between" style={{ fontSize: 13 }}>
        <Link to={`/module/${mod.id}`} className="muted">← {t('module')} {mod.num}: {mod.title}</Link>
        <span className="muted">{mod.quiz.length} {t('questions')} · {t('passAbove')}</span>
      </div>

      <div className="progress-bar" style={{ marginTop: 14 }}>
        <span style={{ width: `${((current + (selected != null ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>
      <div className="q-counter" style={{ marginTop: 10 }}>{t('questionOf', current + 1, questions.length)}</div>

      <div className="card">
        <p style={{ fontWeight: 600, fontSize: '16px', marginTop: 0 }}>{q.question}</p>
        {q.options.map((opt, i) => {
          let cls = 'choice'
          if (selected != null) {
            if (i === q.answer) cls += ' correct'
            else if (i === selected) cls += ' wrong'
          }
          return (
            <button key={i} className={cls} onClick={() => pick(i)} disabled={selected != null}>
              <span className="marker">{LETTERS[i]}</span><span>{opt}</span>
            </button>
          )
        })}

        {selected != null && (
          <div className={`explain ${selected === q.answer ? 'correct' : 'wrong'}`}>
            <strong>{selected === q.answer ? `✓ ${t('correct')} ` : `${t('incorrect')} `}</strong>{q.explanation}
          </div>
        )}

        <div className="row between" style={{ marginTop: 8 }}>
          <button className="btn btn-sm" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>{t('previous')}</button>
          {!isLast ? (
            <button className="btn btn-primary" onClick={() => setCurrent((c) => c + 1)} disabled={selected == null}>{t('next')}</button>
          ) : (
            <button className="btn btn-primary" onClick={finish} disabled={answeredCount < questions.length}>
              {t('finishQuiz')}
            </button>
          )}
        </div>
      </div>
      {isLast && answeredCount < questions.length && (
        <p className="muted center" style={{ fontSize: 13 }}>{t('answerAll', questions.length, answeredCount)}</p>
      )}
    </div>
  )
}
