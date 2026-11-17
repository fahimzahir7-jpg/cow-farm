import { useState } from 'react'
import { capitalAsOf, toDay, today } from '../lib/calc'
import { LANGS, fmtUsd, setLang, useT } from '../lib/i18n'
import { changePassword, demoMode, getState, logout, refreshRate, resetDemo, saveSettings, sync, useStore } from '../lib/store'
import type { CapitalEntry } from '../lib/types'
import { CapitalForm } from '../forms'
import { Card, Field, num, useIsAdmin } from '../ui'

export default function Settings() {
  const { t, lang } = useT()
  const data = useStore((s) => s.data)
  const profile = useStore((s) => s.profile)
  const outbox = useStore((s) => s.outbox.length)
  const lastSync = useStore((s) => s.lastSync)
  const isAdmin = useIsAdmin()
  const [sheet, setSheet] = useState<null | { entry?: CapitalEntry }>(null)
  const s = data.settings
  const cap = capitalAsOf(data, toDay(today()))
  const nameOf = (id: string) => data.partners.find((p) => p.id === id)?.name ?? '?'

  return (
    <div className="screen">
      <Card title={t('language')}>
        <div className="segmented">
          {LANGS.map(([code, label]) => (
            <button key={code} className={lang === code ? 'on' : ''} onClick={() => setLang(code)}>
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card
        title={t('capitalEntries')}
        action={
          isAdmin && (
            <button className="btn small primary" onClick={() => setSheet({})}>
              + {t('addCapital')}
            </button>
          )
        }
      >
        <div className="stats">
          {data.partners.map((p) => (
            <div className="stat" key={p.id}>
              <div className="stat-label">{p.name}</div>
              <div className="stat-value">{fmtUsd(cap.get(p.id) ?? 0)}</div>
            </div>
          ))}
        </div>
        <ul className="list">
          {[...data.capital_entries]
            .sort((a, b) => b.entry_date.localeCompare(a.entry_date))
            .map((c) => (
              <li key={c.id} onClick={() => isAdmin && setSheet({ entry: c })}>
                <span>
                  <span className="muted small">{c.entry_date}</span> {nameOf(c.partner_id)}
                </span>
                <span className="muted">{c.note}</span>
                <b>{fmtUsd(Number(c.amount_usd))}</b>
              </li>
            ))}
        </ul>
      </Card>

      <Card title={t('settings')}>
        <NumSetting
          key={s.afn_per_usd}
          label={t('exchangeRate')}
          hint={`${t('rateAuto')}${s.rate_updated_at ? ' · ' + new Date(s.rate_updated_at).toLocaleString() : ''}`}
          value={s.afn_per_usd}
          disabled={!isAdmin}
          onSave={(v) => v > 0 && saveSettings({ afn_per_usd: v, rate_updated_at: new Date().toISOString() })}
        />
        <button className="btn small" style={{ marginTop: -4, marginBottom: 12 }} onClick={() => void refreshRate(true)}>
          ⟳ {t('refreshRate')}
        </button>
        <NumSetting label={t('calfShare')} hint={t('calfShareHint')} value={s.calf_share} disabled={!isAdmin} onSave={(v) => v >= 0 && v <= 1 && saveSettings({ calf_share: v })} />
      </Card>

      <Card title={profile?.full_name ?? ''}>
        {demoMode ? (
          <>
            <p className="hint">{t('demo')}</p>
            <button className="btn" onClick={() => confirm(t('resetDemo') + '?') && resetDemo()}>
              {t('resetDemo')}
            </button>
          </>
        ) : (
          <>
            <p className="hint">
              {outbox > 0 ? `${outbox} ${t('pending')}` : '✓'} {lastSync ? `· ${new Date(lastSync).toLocaleString()}` : ''}
            </p>
            {getState().error && <p className="hint warn-text">{getState().error}</p>}
            <div className="form-buttons">
              <button className="btn" onClick={() => void sync()}>
                {t('syncNow')}
              </button>
              <button className="btn danger" onClick={() => void logout()}>
                {t('logout')}
              </button>
            </div>
            <ChangePassword />
          </>
        )}
      </Card>

      {sheet && <CapitalForm entry={sheet.entry} onClose={() => setSheet(null)} />}
    </div>
  )
}

function NumSetting({ label, value, onSave, disabled, hint }: { label: string; value: number; onSave: (v: number) => void; disabled?: boolean; hint?: string }) {
  const [v, setV] = useState(String(value))
  return (
    <Field label={label} hint={hint}>
      <input
        type="text"
        inputMode="decimal"
        value={v}
        disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = num(v)
          if (Number.isFinite(n) && n !== Number(value)) onSave(n)
          else setV(String(value))
        }}
      />
    </Field>
  )
}

function ChangePassword() {
  const { t } = useT()
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  return (
    <form
      style={{ marginTop: 16 }}
      onSubmit={async (e) => {
        e.preventDefault()
        if (pw.length < 8) return setMsg(t('passwordTooShort'))
        try {
          await changePassword(pw)
          setPw('')
          setMsg(t('saved'))
        } catch (x) {
          setMsg(x instanceof Error ? x.message : String(x))
        }
      }}
    >
      <Field label={t('newPassword')} hint={msg || undefined}>
        <input id="new-password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <button className="btn">{t('save')}</button>
    </form>
  )
}
