// Minimal line icons per module topic. Stroke uses currentColor so they adapt
// to theme/accent. viewBox 0 0 24 24.
const ICONS = {
  'api-fundamentals': (
    <>
      <path d="M9 4c-3 0-2 7-5 8 3 1 2 8 5 8" />
      <path d="M15 4c3 0 2 7 5 8-3 1-2 8-5 8" />
    </>
  ),
  'tool-interfaces': (
    <>
      <line x1="4" y1="8" x2="20" y2="8" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <circle cx="9" cy="8" r="2.3" />
      <circle cx="15" cy="16" r="2.3" />
    </>
  ),
  'error-handling': (
    <>
      <path d="M12 4l9 16H3z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  'data-extraction': (
    <path d="M4 5h16l-6 7v6l-4-2v-4z" />
  ),
  'context-management': (
    <>
      <path d="M12 3l8 4-8 4-8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 16.5l8 4 8-4" />
    </>
  ),
  'system-prompts': (
    <path d="M5 5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9l-4 3V6a1 1 0 0 1 1-1z" />
  ),
  'mcp': (
    <>
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="5" cy="6" r="1.8" />
      <circle cx="19" cy="6" r="1.8" />
      <circle cx="12" cy="20" r="1.8" />
      <path d="M10.5 10.5L6 7.2M13.5 10.5L18 7.2M12 14.2V18.2" />
    </>
  ),
  'agentic-patterns': (
    <>
      <circle cx="6" cy="7" r="2.2" />
      <circle cx="18" cy="7" r="2.2" />
      <circle cx="12" cy="18" r="2.2" />
      <path d="M8 8.2l3 8M16 8.2l-3 8M8 7h8" />
    </>
  ),
  'customer-service': (
    <>
      <path d="M5 13v-1a7 7 0 0 1 14 0v1" />
      <rect x="3" y="13" width="3.5" height="6" rx="1" />
      <rect x="17.5" y="13" width="3.5" height="6" rx="1" />
      <path d="M19 19a4 4 0 0 1-4 3h-2" />
    </>
  ),
  'claude-code': (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M7 10l3 2-3 2" />
      <line x1="13" y1="14" x2="17" y2="14" />
    </>
  ),
  'evaluation': (
    <>
      <rect x="5" y="4" width="14" height="16" rx="1.5" />
      <path d="M8.5 9l1.3 1.3L12.5 7.5" />
      <line x1="14" y1="9" x2="16.5" y2="9" />
      <path d="M8.5 15l1.3 1.3 2.7-2.8" />
      <line x1="14" y1="15" x2="16.5" y2="15" />
    </>
  ),
  'batch-cost-latency': (
    <path d="M13 3L5 13h6l-2 8 10-11h-6z" />
  ),
}

export default function ModuleIcon({ id, size = 22 }) {
  const paths = ICONS[id]
  if (!paths) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  )
}
