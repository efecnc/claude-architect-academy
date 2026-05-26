import { Link, useParams } from 'react-router-dom'
import { getModule } from '../data/index.js'
import Exercise from '../components/exercises/Exercise.jsx'
import { useProgress, markExercise } from '../store/progress.js'
import { useT } from '../i18n.js'

export default function PracticeView() {
  const { moduleId } = useParams()
  const t = useT()
  const mod = getModule(moduleId)
  const progress = useProgress()

  if (!mod) return <div className="content"><p>{t('notFound')}</p></div>
  const exercises = mod.exercises || []
  const done = progress.exercises[mod.id] || {}
  const solvedCount = exercises.filter((e) => done[e.id]).length

  return (
    <div className="content">
      <div className="row between" style={{ fontSize: 13 }}>
        <Link to={`/module/${mod.id}`} className="muted">← {t('module')} {mod.num}: {mod.title}</Link>
        <span className="muted">{solvedCount}/{exercises.length} {t('solved')}</span>
      </div>
      <h1 style={{ fontSize: 26, marginTop: 14 }}>{t('practiceTitle', mod.title)}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{t('practiceIntro')}</p>

      <div className="stack" style={{ marginTop: 18 }}>
        {exercises.map((ex, i) => (
          <Exercise
            key={ex.id}
            exercise={ex}
            index={i}
            done={done[ex.id]}
            onSolved={() => markExercise(mod.id, ex.id, true)}
          />
        ))}
      </div>

      <div className="divider" />
      <div className="row between">
        <Link className="btn btn-sm" to={`/module/${mod.id}`}>{t('moduleOverview')}</Link>
        {(mod.quiz || []).length > 0 && <Link className="btn btn-primary" to={`/module/${mod.id}/quiz`}>{t('takeTheQuiz')}</Link>}
      </div>
    </div>
  )
}
