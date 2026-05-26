import { Link } from 'react-router-dom'
import { getModules, totalLessons } from '../data/index.js'
import { useProgress, moduleProgress, isModuleComplete } from '../store/progress.js'
import { useT } from '../i18n.js'
import ModuleIcon from '../components/ModuleIcon.jsx'

export default function Dashboard() {
  const progress = useProgress()
  const t = useT()
  const modules = getModules()

  const overall = modules.reduce((s, m) => s + moduleProgress(progress, m), 0) / modules.length
  const lessonsDone = modules.reduce((n, m) => n + m.lessons.filter((l) => progress.lessons[m.id]?.[l.id]).length, 0)
  const quizAvg = (() => {
    const scores = modules.map((m) => progress.quizzes[m.id]?.best).filter((s) => s != null)
    if (!scores.length) return null
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  })()

  const next = modules.find((m) => !isModuleComplete(progress, m)) || modules[0]

  return (
    <div className="content">
      <h1 style={{ fontSize: 30, marginBottom: 4 }}>{t('appTitle')}</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: 16 }}>{t('appIntro')}</p>

      <div className="grid grid-3" style={{ marginTop: 22 }}>
        <div className="card center">
          <div className="score-ring" style={{ color: 'var(--accent)' }}>{Math.round(overall * 100)}%</div>
          <div className="muted">{t('overallProgress')}</div>
        </div>
        <div className="card center">
          <div className="score-ring">{lessonsDone}<span style={{ fontSize: 18, color: 'var(--text-faint)' }}>/{totalLessons()}</span></div>
          <div className="muted">{t('lessonsRead')}</div>
        </div>
        <div className="card center">
          <div className="score-ring" style={{ color: quizAvg != null ? 'var(--green)' : 'var(--text-faint)' }}>
            {quizAvg != null ? `${quizAvg}%` : '—'}
          </div>
          <div className="muted">{t('avgQuiz')}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="tag" style={{ marginBottom: 6 }}>{t('continueLearning')}</div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{t('module')} {next.num}: {next.title}</div>
          <div className="muted" style={{ fontSize: 14 }}>{next.summary}</div>
        </div>
        <Link className="btn btn-primary" to={`/module/${next.id}`}>{t('goToModule')}</Link>
      </div>

      <h2 style={{ marginTop: 40, marginBottom: 4, fontSize: 20 }}>{t('allModules')}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{t('allModulesSub', modules.length, totalLessons())}</p>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        {modules.map((m) => {
          const p = moduleProgress(progress, m)
          const done = isModuleComplete(progress, m)
          const best = progress.quizzes[m.id]?.best
          return (
            <Link key={m.id} to={`/module/${m.id}`} className={`module-card ${done ? 'done' : ''}`}>
              <div className="mc-head">
                <div className="mc-num">{done ? '✓' : <ModuleIcon id={m.id} size={22} />}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="mc-kicker">Module {m.num}</div>
                  <h3>{m.title}</h3>
                </div>
              </div>
              <p>{m.summary}</p>
              <div className="progress-bar"><span style={{ width: `${Math.round(p * 100)}%` }} /></div>
              <div className="mc-foot">
                <span>{m.lessons.length} {t('lessons')}</span>
                <span>·</span>
                <span>{(m.exercises || []).length} {t('exercises')}</span>
                <span>·</span>
                <span>{(m.quiz || []).length} {t('quizQs')}</span>
                {best != null && <span className="pill green" style={{ marginLeft: 'auto' }}>{t('quiz')} {best}%</span>}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
