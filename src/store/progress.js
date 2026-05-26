import { useEffect, useState, useCallback } from 'react'

const KEY = 'caa-progress-v1'

// Shape:
// {
//   lessons: { [moduleId]: { [lessonId]: true } },
//   exercises: { [moduleId]: { [exerciseId]: true } },
//   quizzes: { [moduleId]: { best: 0-100, attempts: n, lastScore } },
// }
function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { /* ignore */ }
  return { lessons: {}, exercises: {}, quizzes: {} }
}

let state = load()
const listeners = new Set()

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch (e) { /* ignore */ }
  listeners.forEach((l) => l(state))
}

export function markLesson(moduleId, lessonId, done = true) {
  state = { ...state, lessons: { ...state.lessons, [moduleId]: { ...(state.lessons[moduleId] || {}), [lessonId]: done } } }
  persist()
}

export function markExercise(moduleId, exerciseId, done = true) {
  state = { ...state, exercises: { ...state.exercises, [moduleId]: { ...(state.exercises[moduleId] || {}), [exerciseId]: done } } }
  persist()
}

export function recordQuiz(moduleId, score) {
  const prev = state.quizzes[moduleId] || { best: 0, attempts: 0 }
  state = {
    ...state,
    quizzes: {
      ...state.quizzes,
      [moduleId]: { best: Math.max(prev.best, score), attempts: prev.attempts + 1, lastScore: score },
    },
  }
  persist()
}

export function resetAll() {
  state = { lessons: {}, exercises: {}, quizzes: {} }
  persist()
}

export function resetModule(moduleId) {
  const lessons = { ...state.lessons }; delete lessons[moduleId]
  const exercises = { ...state.exercises }; delete exercises[moduleId]
  const quizzes = { ...state.quizzes }; delete quizzes[moduleId]
  state = { lessons, exercises, quizzes }
  persist()
}

export function getState() { return state }

// React hook
export function useProgress() {
  const [s, setS] = useState(state)
  useEffect(() => {
    const l = (next) => setS(next)
    listeners.add(l)
    return () => listeners.delete(l)
  }, [])
  return s
}

// Compute module completion 0..1 given a module definition
export function moduleProgress(s, mod) {
  const totalLessons = mod.lessons.length
  const totalExercises = (mod.exercises || []).length
  const hasQuiz = (mod.quiz || []).length > 0
  const total = totalLessons + totalExercises + (hasQuiz ? 1 : 0)
  if (total === 0) return 0
  let done = 0
  const ls = s.lessons[mod.id] || {}
  mod.lessons.forEach((l) => { if (ls[l.id]) done++ })
  const ex = s.exercises[mod.id] || {}
  ;(mod.exercises || []).forEach((e) => { if (ex[e.id]) done++ })
  if (hasQuiz && (s.quizzes[mod.id]?.best ?? 0) >= 70) done++
  return done / total
}

export function isModuleComplete(s, mod) {
  return moduleProgress(s, mod) >= 0.999
}

export function useModuleActions() {
  return useCallback(() => ({ markLesson, markExercise, recordQuiz }), [])
}
