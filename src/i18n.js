// UI chrome strings. Course content itself lives in src/data/modules.
const STR = {
  brandSub: 'Claude Certified Architect · Foundations',
  pctComplete: 'complete',
  modulesCount: 'modules',
  dashboard: 'Dashboard',
  modules: 'Modules',

  // Dashboard
  appTitle: 'Claude Architect Academy',
  appIntro: 'An interactive course for the Claude Certified Architect – Foundations exam. Learn each domain, practice with scenarios and hands-on challenges, test yourself with exam-style quizzes, and track your progress.',
  overallProgress: 'overall progress',
  lessonsRead: 'lessons read',
  avgQuiz: 'avg. best quiz score',
  continueLearning: 'Continue learning',
  goToModule: 'Go to module →',
  allModules: 'All modules',
  allModulesSub: (m, l) => `${m} modules · ${l} lessons · scenario practice + hands-on labs + quizzes`,
  lessons: 'lessons',
  exercises: 'exercises',
  quizQs: 'quiz Qs',
  quiz: 'quiz',

  // Module view
  module: 'Module',
  minRead: 'min read',
  startLessons: 'Start lessons',
  resumeLessons: 'Resume lessons',
  practice: 'Practice',
  takeQuiz: 'Take quiz',
  lessonsHeading: 'Lessons',
  practiceExercises: '🎯 Practice exercises',
  practiceExercisesBody: (n) => `${n} interactive exercises — scenarios, matching, ordering, and a hands-on lab.`,
  solved: 'solved',
  moduleQuiz: '📝 Module quiz',
  moduleQuizBody: (n) => `${n} questions. Score 70%+ to mark the module complete.`,
  bestScore: 'Best score',
  attempts: 'attempt(s)',
  notAttempted: 'Not attempted yet',
  resetModule: 'Reset module progress',
  resetModuleConfirm: 'Reset all progress for this module?',

  // Lesson
  lessonOf: (a, b) => `Lesson ${a} of ${b}`,
  moduleOverview: '← Module overview',
  nextLesson: 'Next lesson →',
  goToPractice: 'Go to practice →',
  markReadContinue: 'Mark read & continue →',
  markReadPractice: 'Mark read & practice →',
  markedRead: "✓ You've marked this lesson as read.",
  keyPrinciple: 'Key principle',
  commonPitfall: 'Common pitfall',
  keyPrinciples: 'Key principles',
  commonPitfalls: 'Common pitfalls',

  // Practice
  practiceTitle: (t) => `Practice — ${t}`,
  practiceIntro: 'Work through these to lock in the concepts. The hands-on challenge lets you draft an answer, then reveals a review checklist so you can self-assess.',
  takeTheQuiz: 'Take the quiz →',
  exercise: 'Exercise',
  done: 'Done',

  // Exercise components
  mcqLabel: 'Multiple choice',
  matchLabel: 'Matching',
  orderLabel: 'Ordering',
  labLabel: 'Hands-on lab',
  checkAnswer: 'Check answer',
  tryAgain: 'Try again',
  correct: 'Correct.',
  notQuite: 'Not quite.',
  scenario: 'Scenario.',
  term: 'Term',
  definition: 'Definition',
  checkMatches: 'Check matches',
  allCorrect: '✓ All correct',
  someWrong: 'Some are wrong — green = right, red = wrong',
  clickMatching: 'Now click the matching definition on the right.',
  checkOrder: 'Check order',
  correctOrder: '✓ Correct order',
  notYetOrder: 'Not yet — red rows are out of place',
  dragHint: 'Drag rows or use the arrows to reorder.',
  handsOnLab: '🧪 Hands-on lab',
  apiKeyNeeded: 'API key needed',
  labKeyBody: 'This lab sends your attempt to an LLM for review. Add a provider + key in',
  yourAttempt: 'Your attempt',
  submitReview: 'Submit for AI review',
  reviewing: 'Reviewing…',
  reviewerFeedback: 'Reviewer feedback',
  writeFirst: 'Write your attempt first.',

  // Quiz
  questions: 'questions',
  passAbove: 'pass ≥ 70%',
  questionOf: (a, b) => `Question ${a} of ${b}`,
  previous: '← Previous',
  next: 'Next →',
  finishQuiz: 'Finish quiz',
  answerAll: (n, d) => `Answer all ${n} questions to finish (${d} done).`,
  quizResults: (t) => `Quiz results — ${t}`,
  ofCorrect: (c, t) => `${c} of ${t} correct`,
  passed: '✓ Passed (≥70%)',
  belowPass: 'Below 70% — review and retry',
  review: 'Review',
  retake: '↻ Retake quiz',
  nextModule: 'Next module',
  incorrect: '✗ Incorrect.',

  notFound: 'not found.',
}

export function t(key, ...args) {
  const v = STR[key] ?? key
  return typeof v === 'function' ? v(...args) : v
}

export function useT() {
  return t
}
