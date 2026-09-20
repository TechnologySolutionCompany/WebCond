// Icones das redes sociais desenhados aqui: a versao atual do lucide-react nao traz icones de marca.
const base = (size) => ({ width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: 'false' })

export function InstagramIcon({ size = 16 }) {
  return (
    <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function YoutubeIcon({ size = 16 }) {
  return (
    <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10.2 9.4 15 12l-4.8 2.6V9.4Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function GithubIcon({ size = 16 }) {
  return (
    <svg {...base(size)} fill="currentColor">
      <path d="M12 1.8a10.2 10.2 0 0 0-3.23 19.88c.51.1.7-.22.7-.49l-.01-1.9c-2.84.6-3.44-1.2-3.44-1.2-.47-1.16-1.14-1.47-1.14-1.47-.93-.62.07-.61.07-.61 1.03.07 1.57 1.03 1.57 1.03.91 1.53 2.4 1.09 2.98.83.09-.65.36-1.09.65-1.34-2.27-.25-4.65-1.11-4.65-4.95 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.64 0 0 .84-.26 2.75 1.03a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.03 2.75-1.03.55 1.37.2 2.39.1 2.64.64.7 1.03 1.6 1.03 2.69 0 3.85-2.38 4.7-4.65 4.94.37.31.69.93.69 1.87l-.01 2.78c0 .27.18.59.7.49A10.2 10.2 0 0 0 12 1.8Z" />
    </svg>
  )
}

export function DiscordIcon({ size = 16 }) {
  return (
    <svg {...base(size)} fill="currentColor">
      <path d="M19.3 5.6A16.3 16.3 0 0 0 15.3 4.4l-.2.4a12.4 12.4 0 0 1 3.5 1.7 14.5 14.5 0 0 0-12.4 0 12.4 12.4 0 0 1 3.5-1.7l-.2-.4c-1.4.2-2.8.6-4 1.2C2.4 9.5 1.6 13.2 2 16.9a16.4 16.4 0 0 0 5 2.5l.4-.6c-.6-.2-1.2-.5-1.8-.9l.4-.3a11.6 11.6 0 0 0 10 0l.4.3c-.6.4-1.2.7-1.8.9l.4.6a16.4 16.4 0 0 0 5-2.5c.5-4.3-.8-8-3.7-11.3ZM9 14.7c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
    </svg>
  )
}
