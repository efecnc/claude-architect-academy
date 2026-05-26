import { useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { getModule } from '../data/index.js'
import Markdown, { Callout } from '../components/Markdown.jsx'
import { useProgress, markLesson } from '../store/progress.js'
import { useT } from '../i18n.js'

export default function LessonView() {
  const { moduleId, lessonId } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const mod = getModule(moduleId)
  const progress = useProgress()

  const lessonIdx = mod ? mod.lessons.findIndex((l) => l.id === lessonId) : -1
  const lesson = lessonIdx >= 0 ? mod.lessons[lessonIdx] : null

  useEffect(() => { window.scrollTo(0, 0) }, [lessonId])

  if (!mod || !lesson) return <div className="content"><p>{t('notFound')}</p></div>

  const done = progress.lessons[mod.id]?.[lesson.id]
  const prev = mod.lessons[lessonIdx - 1]
  const next = mod.lessons[lessonIdx + 1]

  function complete() {
    markLesson(mod.id, lesson.id, true)
    if (next) navigate(`/module/${mod.id}/lesson/${next.id}`)
    else navigate(`/module/${mod.id}/practice`)
  }

  return (
    <div className="content">
      <div className="row between" style={{ fontSize: 13 }}>
        <Link to={`/module/${mod.id}`} className="muted">← {t('module')} {mod.num}: {mod.title}</Link>
        <span className="muted">{t('lessonOf', lessonIdx + 1, mod.lessons.length)}</span>
      </div>

      <h1 style={{ fontSize: 27, marginBottom: 4, marginTop: 14 }}>{lesson.title}</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>~{lesson.minutes || 5} {t('minRead')}</p>

      <div className="divider" style={{ margin: '18px 0' }} />

      <Markdown>{lesson.body}</Markdown>

      {(lesson.principles?.length > 0) && (
        <div style={{ marginTop: 24 }}>
          <Callout kind="principle" title={t('keyPrinciples')}>
            {lesson.principles.map((p) => `- ${p}`).join('\n')}
          </Callout>
        </div>
      )}
      {(lesson.pitfalls?.length > 0) && (
        <Callout kind="pitfall" title={t('commonPitfalls')}>
          {lesson.pitfalls.map((p) => `- ${p}`).join('\n')}
        </Callout>
      )}

      <div className="divider" />
      <div className="row between wrap">
        <div>
          {prev ? (
            <Link className="btn btn-sm" to={`/module/${mod.id}/lesson/${prev.id}`}>← {prev.title}</Link>
          ) : (
            <Link className="btn btn-sm" to={`/module/${mod.id}`}>{t('moduleOverview')}</Link>
          )}
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={complete}>
            {done ? (next ? t('nextLesson') : t('goToPractice')) : (next ? t('markReadContinue') : t('markReadPractice'))}
          </button>
        </div>
      </div>
      {done && <p className="muted center" style={{ fontSize: 13, marginTop: 12 }}>{t('markedRead')}</p>}
    </div>
  )
}
