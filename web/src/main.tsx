import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from '@/components/NotFound'

// The current build loaded: allow the one-time reload again for a future deployment switch.
try {
  sessionStorage.removeItem('pbb-reloaded')
} catch {
  /* storage blocked: nothing to reset */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
