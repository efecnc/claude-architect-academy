// Validates every ```mermaid block in src/data/modules/*.js using a jsdom DOM.
import { readdirSync, readFileSync } from 'fs'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true })
globalThis.window = dom.window
globalThis.document = dom.window.document
if (!globalThis.navigator) {
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
}

const mermaid = (await import('mermaid')).default
mermaid.initialize({ startOnLoad: false })

const dir = './src/data/modules'
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort()

let total = 0
let bad = 0
let textFences = 0
for (const f of files) {
  // In the JS source, fences inside template literals are escaped as \` and
  // $ as \$. Normalize those away so we can match the real markdown fences.
  const src = readFileSync(`${dir}/${f}`, 'utf8').replace(/\\`/g, '`').replace(/\\\$/g, '$')
  // Flag leftover plain-text fences — these should have become a diagram,
  // table, real code fence, or a blockquote.
  const tf = (src.match(/```(text|txt|plaintext)\b/g) || []).length
  if (tf) { textFences += tf; console.log(`⚠ ${f}: ${tf} leftover \`\`\`text block(s)`) }
  const re = /```mermaid\n([\s\S]*?)```/g
  let m
  let n = 0
  while ((m = re.exec(src))) {
    n++
    total++
    const code = m[1].replace(/\\`/g, '`').replace(/\\\$/g, '$').trimEnd()
    try {
      await mermaid.parse(code)
    } catch (e) {
      bad++
      console.log(`\n❌ ${f} diagram #${n}: ${String(e.message).split('\n')[0]}`)
      console.log(code.split('\n').slice(0, 12).map((l) => '   | ' + l).join('\n'))
    }
  }
  console.log(`${bad ? ' ' : '✓'} ${f}: ${n} mermaid diagram(s)`)
}
console.log(`\n${total} diagrams total, ${bad} invalid. ${textFences} leftover text fence(s).`)
process.exit(bad || textFences ? 1 : 0)
