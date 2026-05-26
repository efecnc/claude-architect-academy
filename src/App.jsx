import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ModuleView from './pages/ModuleView.jsx'
import LessonView from './pages/LessonView.jsx'
import PracticeView from './pages/PracticeView.jsx'
import QuizView from './pages/QuizView.jsx'

export default function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/module/:moduleId" element={<ModuleView />} />
          <Route path="/module/:moduleId/lesson/:lessonId" element={<LessonView />} />
          <Route path="/module/:moduleId/practice" element={<PracticeView />} />
          <Route path="/module/:moduleId/quiz" element={<QuizView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
