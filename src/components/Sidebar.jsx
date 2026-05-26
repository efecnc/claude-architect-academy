import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { getModules } from '../data/index.js'
import { useProgress, moduleProgress, isModuleComplete } from '../store/progress.js'
import { useTheme, setTheme } from '../store/theme.js'
import { useT } from '../i18n.js'

export default function Sidebar() {
  const progress = useProgress()
  const theme = useTheme()
  const t = useT()
  const modules = getModules()
  const location = useLocation()

  const modMatch = location.pathname.match(/^\/module\/([^/]+)/)
  const activeModuleId = modMatch ? modMatch[1] : null

  // Accordion: at most one module open at a time. Navigating to a module
  // opens it (and collapses whichever was open).
  const [openId, setOpenId] = useState(activeModuleId)
  useEffect(() => {
    if (activeModuleId) setOpenId(activeModuleId)
  }, [activeModuleId])

  function toggle(id) {
    setOpenId((prev) => (prev === id ? null : id))
  }

  const overall = modules.reduce((sum, m) => sum + moduleProgress(progress, m), 0) / modules.length
  const completed = modules.filter((m) => isModuleComplete(progress, m)).length

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <svg className="logo" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="7" fill="#d97757" />
          <path d="M9 22 L16 9 L23 22" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M12 17 H20" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <div>
          Architect Academy
          <small>{t('brandSub')}</small>
        </div>
      </div>

      <div className="sidebar-progress">
        <div className="progress-bar"><span style={{ width: `${Math.round(overall * 100)}%` }} /></div>
        <div className="progress-label">
          <span>{Math.round(overall * 100)}% {t('pctComplete')}</span>
          <span>{completed}/{modules.length} {t('modulesCount')}</span>
        </div>
        <div className="theme-toggle">
          <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>🌙 Dark</button>
          <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>☀ Light</button>
        </div>
      </div>

      <nav className="nav">
        <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          ▦ {t('dashboard')}
        </NavLink>

        <div className="nav-section">{t('modules')}</div>

        {modules.map((m) => {
          const done = isModuleComplete(progress, m)
          const open = openId === m.id
          const isActiveMod = activeModuleId === m.id
          const ls = progress.lessons[m.id] || {}
          const readCount = m.lessons.filter((l) => ls[l.id]).length
          const allRead = readCount === m.lessons.length

          return (
            <div key={m.id} className="nav-mod-group">
              <div className={'nav-mod-row' + (isActiveMod ? ' active' : '') + (done ? ' done' : '')}>
                <button
                  className="nav-mod-toggle"
                  onClick={() => toggle(m.id)}
                  aria-label={open ? 'Collapse lessons' : 'Expand lessons'}
                  aria-expanded={open}
                >
                  <span className={'chev' + (open ? ' open' : '')}>▸</span>
                </button>
                <NavLink to={`/module/${m.id}`} className="nav-mod-link">
                  <span className="num">{done ? '✓' : m.num}</span>
                  <span className="nav-mod-title">{m.title}</span>
                  <span className={'nav-mod-count' + (allRead ? ' done' : '')}>{readCount}/{m.lessons.length}</span>
                </NavLink>
              </div>

              {open && (
                <div className="nav-lessons">
                  {m.lessons.map((l) => {
                    const read = ls[l.id]
                    return (
                      <NavLink
                        key={l.id}
                        to={`/module/${m.id}/lesson/${l.id}`}
                        className={({ isActive }) => 'nav-lesson' + (isActive ? ' active' : '')}
                      >
                        <span className={'lesson-dot' + (read ? ' read' : '')}>{read ? '✓' : ''}</span>
                        <span className="nav-lesson-title">{l.title}</span>
                      </NavLink>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
