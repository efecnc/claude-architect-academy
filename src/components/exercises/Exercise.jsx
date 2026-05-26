import MCQ from './MCQ.jsx'
import Match from './Match.jsx'
import Order from './Order.jsx'
import Lab from './Lab.jsx'
import { useT } from '../../i18n.js'

export default function Exercise({ exercise, index, done, onSolved }) {
  const t = useT()
  const TYPE_LABEL = {
    mcq: t('mcqLabel'),
    match: t('matchLabel'),
    order: t('orderLabel'),
    lab: t('labLabel'),
  }
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 14 }}>
        <span className="tag">{t('exercise')} {index + 1} · {TYPE_LABEL[exercise.type] || exercise.type}</span>
        {done && <span className="pill green">✓ {t('done')}</span>}
      </div>
      {exercise.type === 'mcq' && <MCQ exercise={exercise} onSolved={onSolved} />}
      {exercise.type === 'match' && <Match exercise={exercise} onSolved={onSolved} />}
      {exercise.type === 'order' && <Order exercise={exercise} onSolved={onSolved} />}
      {exercise.type === 'lab' && <Lab exercise={exercise} onSolved={onSolved} />}
    </div>
  )
}
