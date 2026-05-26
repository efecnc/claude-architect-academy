// Module loading. Each file in ./modules exports default a module object.
// import.meta.glob with eager:true imports all of them at build time.

const files = import.meta.glob('./modules/*.js', { eager: true })

export const modules = Object.values(files)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => a.num - b.num)

export const moduleById = Object.fromEntries(modules.map((m) => [m.id, m]))

export function getModules() {
  return modules
}

export function getModule(id) {
  return moduleById[id]
}

export function totalLessons() {
  return modules.reduce((n, m) => n + m.lessons.length, 0)
}
