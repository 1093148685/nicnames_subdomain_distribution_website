import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { api, type Domain, type Subdomain, type DNSRecord } from './api';
import HomePage from './pages/HomePage';
import ConsolePage from './pages/ConsolePage';
import AuthModal from './components/AuthModal';
import Particles from './components/Particles';

function Navbar({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  const { user, credits, signOut } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className="navbar" style={scrolled ? { background: 'rgba(255,255,255,0.95)' } : {}}>
      <a className="navbar-brand" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
        <span className="logo-dot" />
        ReactBits DNS
      </a>
      <div className="navbar-right">
        {user ? (
          <>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              ⚡ {credits} 积分
            </span>
            <button className="btn-ghost" onClick={() => navigate('/console')}>
              控制台
            </button>
            <button className="btn-ghost" onClick={signOut}>
              退出
            </button>
          </>
        ) : (
          <>
            <button className="btn-ghost" onClick={onSignIn}>登录</button>
            <button className="btn-glow" onClick={onSignUp}><span>注册</span></button>
          </>
        )}
      </div>
    </nav>
  );
}

function AppInner() {
  const [showAuth, setShowAuth] = useState<'signin' | 'signup' | null>(null);
  const { user } = useAuth();
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="app">
      <Particles />
      <div className="bg-canvas" />
      <div className="grid-overlay" />
      <Navbar
        onSignIn={() => setShowAuth('signin')}
        onSignUp={() => setShowAuth('signup')}
      />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/console/*" element={<ConsolePage />} />
      </Routes>
      {!user && (
        <AuthModal
          open={showAuth !== null}
          defaultMode={showAuth || 'signin'}
          onClose={() => setShowAuth(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
