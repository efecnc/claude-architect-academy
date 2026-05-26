import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import Mermaid from './Mermaid.jsx'

// Recursively pull plain text out of a react-markdown <code> child, even when
// syntax highlighting has split it into nested token <span>s.
function extractText(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node.props) return extractText(node.props.children)
  return ''
}
function codeText(node) {
  return extractText(node?.props?.children)
}

const components = {
  // Intercept ```mermaid fenced blocks and render real diagrams.
  // react-markdown wraps fenced code in <pre><code>, so we unwrap here to
  // avoid putting a <div> (the SVG) inside a <pre> (invalid HTML).
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children
    const cls = child?.props?.className || ''
    if (/language-mermaid/.test(cls)) {
      return <Mermaid code={codeText(child).replace(/\n$/, '')} />
    }
    return <pre>{children}</pre>
  },
}

const rehypePlugins = [[rehypeHighlight, { ignoreMissing: true, detect: false }]]

export default function Markdown({ children }) {
  return (
    <div className="lesson-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={components}>{children}</ReactMarkdown>
    </div>
  )
}

export function Callout({ kind = 'tip', title, children }) {
  const icon = kind === 'pitfall' ? '⚠️' : kind === 'principle' ? '◆' : '💡'
  const label = title || (kind === 'pitfall' ? 'Common pitfall' : kind === 'principle' ? 'Key principle' : 'Tip')
  return (
    <div className={`callout ${kind}`}>
      <div className="ico">{icon}</div>
      <div>
        <div className="callout-title">{label}</div>
        <div className="callout-body">
          {typeof children === 'string'
            ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
            : children}
        </div>
      </div>
    </div>
  )
}
