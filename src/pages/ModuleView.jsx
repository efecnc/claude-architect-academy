import { Link, useParams, useNavigate } from 'react-router-dom'
import { getModule, getModules } from '../data/index.js'
import { useProgress, moduleProgress, resetModule } from '../store/progress.js'
import { useT } from '../i18n.js'
import ModuleIcon from '../components/ModuleIcon.jsx'

export default function ModuleView() {
  const { moduleId } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const mod = getModule(moduleId)
  const progress = useProgress()

  if (!mod) return <div className="content"><p>{t('module')} {t('notFound')}</p></div>

  const modules = getModules()
  const ls = progress.lessons[mod.id] || {}
  const ex = progress.exercises[mod.id] || {}
  const quiz = progress.quizzes[mod.id]
  const p = moduleProgress(progress, mod)
  const idx = modules.findIndex((m) => m.id === mod.id)
  const prev = modules[idx - 1]
  const nextMod = modules[idx + 1]
  const firstLesson = mod.lessons[0]

  return (
    <div className="content">
      <Link to="/" className="muted" style={{ fontSize: 13 }}>← {t('dashboard')}</Link>
      <div className="row between wrap" style={{ marginTop: 10 }}>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <div className="module-hero-icon"><ModuleIcon id={mod.id} size={28} /></div>
          <div>
            <div className="tag">{t('module')} {mod.num}</div>
            <h1 style={{ fontSize: 28, margin: '8px 0 6px' }}>{mod.title}</h1>
          </div>
        </div>
        <div className="row">
          {(mod.tags || []).map((t2) => <span key={t2} className="tag">{t2}</span>)}
          <span className="pill">~{mod.estMinutes} min</span>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 15.5 }}>{mod.summary}</p>

      <div className="progress-bar" style={{ marginTop: 8 }}><span style={{ width: `${Math.round(p * 100)}%` }} /></div>
      <div className="progress-label"><span>{Math.round(p * 100)}% {t('pctComplete')}</span></div>

      <div className="row" style={{ marginTop: 18, gap: 10 }}>
        <Link className="btn btn-primary" to={`/module/${mod.id}/lesson/${firstLesson.id}`}>
          {Object.keys(ls).length ? t('resumeLessons') : t('startLessons')} →
        </Link>
        {(mod.exercises || []).length > 0 && (
          <Link className="btn" to={`/module/${mod.id}/practice`}>{t('practice')}</Link>
        )}
        {(mod.quiz || []).length > 0 && (
          <Link className="btn" to={`/module/${mod.id}/quiz`}>{t('takeQuiz')}</Link>
        )}
      </div>

      <h2 style={{ marginTop: 36, fontSize: 19 }}>{t('lessonsHeading')}</h2>
      <div className="stack">
        {mod.lessons.map((l, i) => {
          const done = ls[l.id]
          return (
            <Link key={l.id} to={`/module/${mod.id}/lesson/${l.id}`} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'inherit' }}>
              <span className="nav-module" style={{ padding: 0 }}>
                <span className="num" style={done ? { background: 'var(--green-soft)', color: 'var(--green)' } : {}}>{done ? '✓' : i + 1}</span>
              </span>
              <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{l.title}</div>
                <div className="muted" style={{ fontSize: 13 }}>~{l.minutes || 5} {t('minRead')}</div>
              </span>
              <span className="muted">→</span>
            </Link>
          )
        })}
      </div>

      <div className="grid grid-2" style={{ marginTop: 24 }}>
        {(mod.exercises || []).length > 0 && (
          <Link to={`/module/${mod.id}/practice`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h3 style={{ marginTop: 0 }}>{t('practiceExercises')}</h3>
            <p className="muted" style={{ fontSize: 14 }}>{t('practiceExercisesBody', mod.exercises.length)}</p>
            <div className="muted">{Object.values(ex).filter(Boolean).length}/{mod.exercises.length} {t('solved')}</div>
          </Link>
        )}
        {(mod.quiz || []).length > 0 && (
          <Link to={`/module/${mod.id}/quiz`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h3 style={{ marginTop: 0 }}>{t('moduleQuiz')}</h3>
            <p className="muted" style={{ fontSize: 14 }}>{t('moduleQuizBody', mod.quiz.length)}</p>
            <div className="muted">{quiz?.best != null ? `${t('bestScore')}: ${quiz.best}% · ${quiz.attempts} ${t('attempts')}` : t('notAttempted')}</div>
          </Link>
        )}
      </div>

      <div className="divider" />
      <div className="row between">
        <button className="btn btn-sm btn-ghost" onClick={() => { if (confirm(t('resetModuleConfirm'))) resetModule(mod.id) }}>
          {t('resetModule')}
        </button>
        <div className="row">
          {prev && <button className="btn btn-sm" onClick={() => navigate(`/module/${prev.id}`)}>← {prev.title}</button>}
          {nextMod && <button className="btn btn-sm" onClick={() => navigate(`/module/${nextMod.id}`)}>{nextMod.title} →</button>}
        </div>
      </div>
    </div>
  )
}
