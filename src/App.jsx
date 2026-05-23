import { useState } from 'react'
import PortfolioDashboard from './PortfolioDashboard.jsx'
import BondLadderTracker from './BondLadderTracker.jsx'

const IconPortfolio = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    <line x1="12" y1="12" x2="12" y2="16"/>
    <line x1="10" y1="14" x2="14" y2="14"/>
  </svg>
)

const IconLadder = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="3" x2="8" y2="21"/>
    <line x1="16" y1="3" x2="16" y2="21"/>
    <line x1="8" y1="7" x2="16" y2="7"/>
    <line x1="8" y1="12" x2="16" y2="12"/>
    <line x1="8" y1="17" x2="16" y2="17"/>
  </svg>
)

export default function App() {
  const [screen, setScreen] = useState('portfolio')

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div className="page-scroll">
        {screen === 'portfolio' && <PortfolioDashboard />}
        {screen === 'bonds'     && <BondLadderTracker />}
      </div>

      <nav className="bottom-nav">
        <button className={`nav-btn ${screen === 'portfolio' ? 'active' : ''}`}
          onClick={() => setScreen('portfolio')}>
          <IconPortfolio />
          Portfolio
        </button>
        <button className={`nav-btn ${screen === 'bonds' ? 'active' : ''}`}
          onClick={() => setScreen('bonds')}>
          <IconLadder />
          Bond Ladder
        </button>
      </nav>
    </div>
  )
}
