import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { api } from './api'
import { showToast } from './components/Toast'

type User = { id: number; username: string; email: string; credits: number; whois_privacy: boolean; role: string; oidc_provider?: string; oidc_id?: string; oidc_avatar?: string } | null

interface AuthContextType {
  user: User
  credits: number
  loading: boolean
  signIn: (username: string, password: string, remember?: boolean) => Promise<void>
  signUp: (data: { username: string; email: string; password: string; invite_code?: string; email_code?: string }) => Promise<void>
  signOut: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>(null!)

// 快速采集浏览器指纹（同步，无 DOM 阻塞）
function collectFingerprintShort(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  let bid = localStorage.getItem('browser_id')
  if (!bid) {
    bid = 'bid_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
    localStorage.setItem('browser_id', bid)
  }
  return {
    browser_id: bid,
    screen_resolution: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    timezone: Intl.DateTimeFormat?.().resolvedOptions?.().timeZone || '',
    platform: (navigator as any).userAgentData?.platform || (navigator as any).platform || '',
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null)
  const [credits, setCredits] = useState(0)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) { setLoading(false); return }
    try {
      const data = await api.getMe()
      setUser(data.user)
      setCredits(data.user.credits || 0)
    } catch {
      localStorage.removeItem('token')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refreshUser() }, [refreshUser])

  // Handle OIDC callback token from URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const oidcToken = params.get('token')
      if (oidcToken) {
        localStorage.setItem('token', oidcToken)
        // Clean URL without full page reload
        const url = new URL(window.location.href)
        url.searchParams.delete('token')
        window.history.replaceState({}, '', url.toString())
        refreshUser()
        showToast('OIDC 登录成功', 'success')
      }
    }
  }, [refreshUser])

  const signIn = async (username: string, password: string, remember?: boolean) => {
    const fp = collectFingerprintShort()
    const data = await api.signIn({ username, password, remember, ...fp })
    localStorage.setItem('token', data.token)
    setUser(data.user)
    setCredits(data.user.credits || 0)
    showToast('登录成功', 'success')
  }

  const signUp = async (d: { username: string; email: string; password: string; invite_code?: string; email_code?: string }) => {
    const fp = collectFingerprintShort()
    const data = await api.signUp({ ...d, ...fp })
    localStorage.setItem('token', data.token)
    setUser(data.user)
    setCredits(data.user.credits || 0)
    showToast('注册成功', 'success')
  }

  const signOut = () => {
    localStorage.removeItem('token')
    setUser(null)
    setCredits(0)
    showToast('已退出登录', 'success')
  }

  return (
    <AuthContext.Provider value={{ user, credits, loading, signIn, signUp, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
