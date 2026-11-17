import { useState, type FormEvent } from 'react'
import { LANGS, setLang, useT, type TKey } from './lib/i18n'
import { demoMode, login, sync, useStore } from './lib/store'
import Animals, { AnimalDetail } from './screens/Animals'
import Money from './screens/Money'
import Reports from './screens/Reports'
import Settings from './screens/Settings'
import Today from './screens/Today'
import { Field, useRoute } from './ui'

const TABS: { id: string; label: TKey; icon: string }[] = [
  { id: 'today', label: 'today', icon: '🥛' },
  { id: 'animals', label: 'animals', icon: '🐄' },
  { id: 'money', label: 'money', icon: '💵' },
  { id: 'reports', label: 'reports', icon: '📊' },
  { id: 'settings', label: 'settings', icon: '⚙️' },
]

export default function App() {
  const { t } = useT()
  const profile = useStore((s) => s.profile)
  const online = useStore((s) => s.online)
  const pending = useStore((s) => s.outbox.length)
  const syncing = useStore((s) => s.syncing)
  const [route, nav] = useRoute()

  if (!profile) return <Login />

  const tab = route[0]
  let screen
  if (tab === 'animals' && route[1]) screen = <AnimalDetail id={route[1]} />
  else if (tab === 'animals') screen = <Animals />
  else if (tab === 'money') screen = <Money />
  else if (tab === 'reports') screen = <Reports />
  else if (tab === 'settings') screen = <Settings />
  else screen = <Today />

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">🐄 {t('appName')}</span>
        <span className="grow" />
        {demoMode ? (
          <span className="pill muted">demo</span>
        ) : (
          <button className={'pill ' + (online ? '' : 'warn')} onClick={() => void sync()} title={t('syncNow')}>
            {syncing ? '⟳' : online ? (pending ? `↑ ${pending}` : '✓') : `⚠ ${pending}`}
          </button>
        )}
      </header>
      {!online && !demoMode && <div className="banner">{t('offline')}</div>}
      {profile.role === 'viewer' && <div className="banner info">{t('viewOnly')}</div>}
      <main>{screen}</main>
      <nav className="tabbar">
        {TABS.map((x) => (
          <button key={x.id} className={tab === x.id || (x.id === 'today' && !TABS.some((y) => y.id === tab)) ? 'on' : ''} onClick={() => nav(x.id)}>
            <span className="tab-icon" aria-hidden>
              {x.icon}
            </span>
            <span>{t(x.label)}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function Login() {
  const { t, lang } = useT()
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await login(u, p)
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <h1>🐄 {t('appName')}</h1>
        <div className="segmented" style={{ marginBottom: 16 }}>
          {LANGS.map(([code, label]) => (
            <button type="button" key={code} className={lang === code ? 'on' : ''} onClick={() => setLang(code)}>
              {label}
            </button>
          ))}
        </div>
        <Field label={t('username')}>
          <input value={u} autoCapitalize="none" autoComplete="username" required onChange={(e) => setU(e.target.value)} />
        </Field>
        <Field label={t('password')}>
          <input type="password" value={p} autoComplete="current-password" required onChange={(e) => setP(e.target.value)} />
        </Field>
        {err && <p className="hint warn-text">{err}</p>}
        <button className="btn primary block" disabled={busy}>
          {t('login')}
        </button>
      </form>
    </div>
  )
}
