import { useCallback, useEffect, useState } from 'react'
import type { State } from './data'
import { makeSeed } from './data'
import { loadState, saveState } from './lib'
import InputView from './InputView'
import LedgerView from './LedgerView'
import ReportView from './ReportView'

type Tab = 'input' | 'ledger' | 'report'

export default function App() {
  const [state, setState] = useState<State>(() => loadState() ?? makeSeed())
  const [tab, setTab] = useState<Tab>('input')
  const [selId, setSelId] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    setSaveFailed(!saveState(state))
  }, [state])

  const update = useCallback((f: (s: State) => State) => setState((s) => f(s)), [])
  const replace = useCallback((s: State) => setState(s), [])

  function go(t: Tab) {
    setTab(t)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="app">
      <header className="top no-print">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="26" height="26" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 11V8a2 2 0 0 1 2-2h3M22 6h3a2 2 0 0 1 2 2v3M27 21v3a2 2 0 0 1-2 2h-3M10 26H7a2 2 0 0 1-2-2v-3" />
              <path d="M11 16.5l4 4 7-8" stroke="#3ccfb4" strokeWidth="3" />
            </svg>
          </span>
          <div>
            <h1>校正ナビ</h1>
            <p>QRを読んで、その場で入力。台帳も報告書も自動。</p>
          </div>
        </div>
      </header>

      {saveFailed && (
        <p className="msg warn no-print wrap">
          この端末では保存できない設定になっています（プライベートウィンドウなど）。このまま使えますが、閉じると内容は消えます。
        </p>
      )}

      <main className="wrap">
        {tab === 'input' && (
          <InputView state={state} update={update} selId={selId} setSelId={setSelId} goLedger={() => go('ledger')} />
        )}
        {tab === 'ledger' && (
          <LedgerView
            state={state}
            update={update}
            replace={replace}
            goInput={(id) => {
              setSelId(id)
              go('input')
            }}
          />
        )}
        {tab === 'report' && <ReportView state={state} update={update} />}
      </main>

      <nav className="tabs no-print" aria-label="画面の切り替え">
        <button className={tab === 'input' ? 'on' : ''} onClick={() => go('input')} aria-current={tab === 'input'}>
          <i aria-hidden="true">▣</i>入力
        </button>
        <button className={tab === 'ledger' ? 'on' : ''} onClick={() => go('ledger')} aria-current={tab === 'ledger'}>
          <i aria-hidden="true">☰</i>台帳
        </button>
        <button className={tab === 'report' ? 'on' : ''} onClick={() => go('report')} aria-current={tab === 'report'}>
          <i aria-hidden="true">▤</i>報告書
        </button>
      </nav>
    </div>
  )
}
