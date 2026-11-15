import { useRef, useState } from 'react'
import type { Instrument, State, Status } from './data'
import { fillSampleResults, makeSeed } from './data'
import { QrSvg } from './Qr'
import { Badge } from './ui'
import {
  INST_HEADERS,
  addDays,
  clearState,
  cycleOf,
  decimalsOf,
  addMonths,
  downloadText,
  dueNote,
  fmtDiff,
  fmtJa,
  fmtNum,
  importInstruments,
  lastDone,
  nextDue,
  normYmd,
  qrText,
  readTextFile,
  recordsOf,
  sanitize,
  statusOf,
  todayStr,
  toCsv,
} from './lib'
import { refText } from './ui'

interface Props {
  state: State
  update: (f: (s: State) => State) => void
  replace: (s: State) => void
  goInput: (id: string) => void
}

const FILTERS: ('すべて' | Status)[] = ['すべて', '未実施', '合格', '要調整', '異常', '期間外']

export default function LedgerView({ state, update, replace, goInput }: Props) {
  const [filter, setFilter] = useState<'すべて' | Status>('すべて')
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<Instrument | 'new' | null>(null)
  const [labels, setLabels] = useState(false)
  const [note, setNote] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const jsonRef = useRef<HTMLInputElement>(null)
  const today = todayStr()

  const rows = state.instruments.map((i) => ({ i, st: statusOf(i, state.records, today) }))
  const count = (f: 'すべて' | Status) => (f === 'すべて' ? rows.length : rows.filter((r) => r.st === f).length)
  const shown = rows.filter((r) => filter === 'すべて' || r.st === filter)

  if (labels) {
    return (
      <section className="labels-view">
        <div className="no-print card">
          <h2>QRラベルを印刷する</h2>
          <p className="muted">A4に切り取り線つきで並びます。印刷して、測定器やケースに貼ってください。QRの中身は「管理番号」だけで、個人情報は入っていません。</p>
          <div className="row">
            <button className="btn primary big" onClick={() => window.print()}>
              A4で印刷／PDF保存
            </button>
            <button className="btn big" onClick={() => setLabels(false)}>
              台帳にもどる
            </button>
          </div>
        </div>
        <div className="label-sheet">
          {state.instruments.map((i) => (
            <div className="label" key={i.id}>
              <QrSvg text={qrText(i.id)} label={`${i.id} のQRコード`} />
              <div className="label-text">
                <b>{i.id}</b>
                <span>{i.name}</span>
                <small>{i.place}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  function saveInst(inst: Instrument, isNew: boolean, oldId?: string) {
    update((s) => {
      if (isNew) return { ...s, instruments: [...s.instruments, inst] }
      return {
        ...s,
        instruments: s.instruments.map((x) => (x.id === oldId ? inst : x)),
        // 管理番号を変えたときは、記録も付け替える
        records: oldId && oldId !== inst.id ? s.records.map((r) => (r.instId === oldId ? { ...r, instId: inst.id } : r)) : s.records,
      }
    })
    setEditing(null)
    setOpen(inst.id)
    setNote({ kind: 'ok', text: `${inst.id} を${isNew ? '追加' : '更新'}しました。` })
  }
  function remove(i: Instrument) {
    const n = state.records.filter((r) => r.instId === i.id).length
    if (n > 0) {
      setNote({ kind: 'warn', text: `${i.id} には校正の記録が ${n} 件あるため、削除できません（監査で過去の記録をたどれるようにするためです）。` })
      return
    }
    if (!window.confirm(`${i.id}「${i.name}」を台帳から削除します。よろしいですか？`)) return
    update((s) => ({ ...s, instruments: s.instruments.filter((x) => x.id !== i.id) }))
    setOpen(null)
    setNote({ kind: 'ok', text: `${i.id} を削除しました。` })
  }

  function exportLedger() {
    const rows2: (string | number)[][] = [INST_HEADERS]
    for (const i of state.instruments)
      rows2.push([i.id, i.name, i.place, lastDone(i, state.records), i.interval, i.standard, fmtNum(i.ref, i.decimals), fmtNum(i.tol, i.decimals), i.unit])
    downloadText(`測定器台帳_${today}.csv`, toCsv(rows2), 'text/csv;charset=utf-8')
  }
  function exportRecords() {
    // 生産管理システムへ渡す／監査で示す「実施結果」。1行＝1回の校正（いつ・誰が・どの基準で・合否と処置）
    const rows2: (string | number)[][] = [
      ['管理番号', '名称', '校正日', '記録日時', '担当者', '標準器', '基準値', '公差(±)', '単位', '実測値', '差', '判定', '処置内容・メモ', '次回期限'],
    ]
    const sorted = [...state.records].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    for (const r of sorted) {
      const i = state.instruments.find((x) => x.id === r.instId)
      if (!i) continue
      rows2.push([
        i.id,
        i.name,
        r.date,
        r.at,
        r.person,
        r.standard,
        fmtNum(r.ref, r.decimals),
        fmtNum(r.tol, r.decimals),
        r.unit,
        r.measured === null ? '' : fmtNum(r.measured, r.decimals + 1),
        r.measured === null ? '' : fmtDiff(r.measured - r.ref, r.decimals + 1),
        r.result,
        r.note,
        addMonths(r.date, i.interval),
      ])
    }
    downloadText(`校正実施結果_${today}.csv`, toCsv(rows2), 'text/csv;charset=utf-8')
  }
  async function importCsv(f: File | undefined) {
    if (!f) return
    try {
      const text = await readTextFile(f)
      const r = importInstruments(text, state.instruments)
      if (r.errors.length && r.added + r.updated === 0) {
        setNote({ kind: 'warn', text: r.errors.slice(0, 5).join(' ') })
        return
      }
      update((s) => ({ ...s, instruments: importInstruments(text, s.instruments).next }))
      setNote({
        kind: r.errors.length ? 'warn' : 'ok',
        text: `読み込みました：追加 ${r.added} 台、更新 ${r.updated} 台（管理番号が同じものは上書き。重複しません）。${r.errors.length ? ` 読めなかった行：${r.errors.slice(0, 4).join(' ')}` : ''}`,
      })
    } catch {
      setNote({ kind: 'warn', text: 'ファイルを読めませんでした。' })
    }
  }
  function exportJson() {
    downloadText(`校正ナビ_バックアップ_${today}.json`, JSON.stringify(state, null, 1), 'application/json')
  }
  async function importJson(f: File | undefined) {
    if (!f) return
    try {
      const s = sanitize(JSON.parse(await f.text()))
      if (!s) throw new Error('形が違う')
      if (!window.confirm(`バックアップを読み込みます。いまの台帳（${state.instruments.length}台）は、バックアップの内容（${s.instruments.length}台）に置き換わります。よろしいですか？`)) return
      replace(s)
      setNote({ kind: 'ok', text: `バックアップを読み込みました（${s.instruments.length}台・記録${s.records.length}件）。` })
    } catch {
      setNote({ kind: 'warn', text: 'バックアップのファイルとして読めませんでした。このアプリで書き出したJSONを選んでください。' })
    }
  }

  return (
    <section>
      <div className="chips" role="tablist" aria-label="状態で絞り込む">
        {FILTERS.map((f) => (
          <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>
            {f === '異常' ? '異常' : f}
            <b>{count(f)}</b>
          </button>
        ))}
      </div>

      {note && <p className={`msg ${note.kind}`}>{note.text}</p>}

      {editing && (
        <InstForm
          init={editing === 'new' ? null : editing}
          existing={state.instruments.map((i) => i.id)}
          locked={editing !== 'new' && state.records.some((r) => r.instId === editing.id)}
          onCancel={() => setEditing(null)}
          onSave={(inst) => saveInst(inst, editing === 'new', editing === 'new' ? undefined : editing.id)}
        />
      )}

      <ul className="ledger">
        {shown.map(({ i, st }) => {
          const isOpen = open === i.id
          const hist = recordsOf(state.records, i.id)
          return (
            <li key={i.id} className={`lrow st-${st} ${isOpen ? 'open' : ''}`}>
              <button className="lhead" onClick={() => setOpen(isOpen ? null : i.id)} aria-expanded={isOpen}>
                <div className="l-main">
                  <span className="l-id">{i.id}</span>
                  <span className="l-name">{i.name}</span>
                  <span className="l-sub">
                    <span className="nw">{i.place}</span>
                    <span className="nw">次回 {fmtJa(nextDue(i, state.records))}</span>
                    {st === '未実施' ? (
                      <span className="nw">（{dueNote(i, state.records, today)}）</span>
                    ) : st === '期間外' ? (
                      <span className="nw">（校正期間は {fmtJa(cycleOf(i, state.records, today).periodStart)} から）</span>
                    ) : null}
                  </span>
                </div>
                <Badge s={st} />
              </button>
              {isOpen && (
                <div className="ldetail">
                  <p className="small">
                    標準器：{i.standard || '―'}　／　基準：{refText(i)}　／　周期：{i.interval}か月
                  </p>
                  {hist.length > 0 ? (
                    <ul className="hist">
                      {hist.slice(0, 4).map((r) => (
                        <li key={r.id}>
                          <span>{fmtJa(r.date)}</span>
                          <span>{r.measured === null ? '―' : `${fmtNum(r.measured, r.decimals + 1)} ${r.unit}`}</span>
                          <b className={`res r-${r.result}`}>{r.result}</b>
                          <span className="muted">{r.person || '担当者なし'}　{r.at}</span>
                          {r.note && <em>{r.note}</em>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted small">このアプリでの記録はまだありません（前回の校正日は台帳の値です）。</p>
                  )}
                  <div className="row">
                    <button className="btn primary" onClick={() => goInput(i.id)}>
                      この測定器の結果を入力
                    </button>
                    <button className="btn" onClick={() => setEditing(i)}>
                      直す
                    </button>
                    <button className="btn danger" onClick={() => remove(i)}>
                      削除
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
        {shown.length === 0 && <li className="empty">この状態の測定器はありません。</li>}
      </ul>

      <div className="row stick">
        <button className="btn primary" onClick={() => setEditing('new')}>
          ＋ 測定器を追加
        </button>
        <button className="btn" onClick={() => setLabels(true)}>
          QRラベルを印刷
        </button>
      </div>

      <div className="card link-card">
        <h2 className="h-link">生産管理システムとの連携（CSV）</h2>
        <p className="muted small">
          台帳は生産管理システムから取り込み、校正の実施結果はシステムへ戻せます。入力した内容は、監査で求められる「いつ・誰が・どの基準で測り、合否と処置はどうしたか」を1行ずつ残します。
        </p>
        <div className="flow" aria-hidden="true">
          <span>生産管理システム</span>
          <i>台帳CSV →</i>
          <b>校正ナビ（現場で入力）</b>
          <i>実施結果CSV →</i>
          <span>生産管理システム／監査</span>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => csvRef.current?.click()}>
            台帳CSVを取り込む
          </button>
          <button className="btn primary" onClick={exportRecords}>
            実施結果CSVを書き出す
          </button>
          <button className="btn primary" onClick={exportLedger}>
            台帳CSVを書き出す
          </button>
          <input
            ref={csvRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              void importCsv(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
        <p className="muted small">
          取り込みCSVの1行目の見出し：{INST_HEADERS.join('・')}。管理番号が同じ行は上書きされ、重複しません。ExcelのCSV（Shift_JIS）も読めます。実施結果CSVの項目：管理番号・名称・校正日・記録日時・担当者・標準器・基準値・公差・単位・実測値・差・判定・処置内容・次回期限。実際のシステムの取り込み形式に合わせるときは、見出しの対応づけが必要になる場合があります。
        </p>
      </div>

      <details className="card tools">
        <summary>バックアップ・設定・見本データ</summary>
        <h3 className="sub">バックアップ（端末を変えるとき）</h3>
        <div className="row">
          <button className="btn" onClick={exportJson}>
            すべてを書き出す（JSON）
          </button>
          <button className="btn" onClick={() => jsonRef.current?.click()}>
            バックアップを読み込む
          </button>
          <input
            ref={jsonRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              void importJson(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
        <h3 className="sub">校正期間のしくみ（年1回の校正）</h3>
        <p className="muted small">
          各測定器に「前回の校正日」と「校正周期（月）」を入れておくと、次の期限の月の1日から期限までが、その測定器の校正期間になります（期限が月末なら、その月まるごと）。期間に入ると、自動で「今回の実施」に切り替わり、前回までの結果は履歴に残したまま、進み具合を0から数え直します。期間の前の測定器は「実施期間外」と表示し、進み具合にも報告書の対象にも含めません。前回の校正日と周期は、測定器の「直す」で変えられます。
        </p>
        <h3 className="sub">見本データ（お試し用）</h3>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              update((s) => fillSampleResults(s))
              setNote({ kind: 'ok', text: '残りの測定器にも「合格」の結果を入れました（報告書を全台そろった形で試すため）。' })
            }}
          >
            残りに合格の結果を入れる
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (!window.confirm('台帳と記録を、見本データに戻します。いまの内容は消えます（バックアップを取っていない場合は戻せません）。よろしいですか？')) return
              clearState()
              replace(makeSeed())
              setNote({ kind: 'ok', text: '見本データに戻しました。' })
            }}
          >
            見本データに戻す
          </button>
        </div>
        <p className="muted small">データはこの端末のブラウザの中だけに保存され、外へは送られません。</p>
      </details>
    </section>
  )
}

function InstForm({
  init,
  existing,
  locked,
  onCancel,
  onSave,
}: {
  init: Instrument | null
  existing: string[]
  locked: boolean
  onCancel: () => void
  onSave: (i: Instrument) => void
}) {
  const [id, setId] = useState(init?.id ?? '')
  const [name, setName] = useState(init?.name ?? '')
  const [place, setPlace] = useState(init?.place ?? '')
  const [last, setLast] = useState(init?.lastDate ?? addDays(todayStr(), -365))
  const [interval, setIv] = useState(String(init?.interval ?? 12))
  const [standard, setStandard] = useState(init?.standard ?? '')
  const [ref, setRef] = useState(init ? fmtNum(init.ref, init.decimals) : '')
  const [tol, setTol] = useState(init ? fmtNum(init.tol, init.decimals) : '')
  const [unit, setUnit] = useState(init?.unit ?? 'mm')

  const errs: string[] = []
  const idT = id.trim()
  if (!idT) errs.push('管理番号')
  else if (idT !== init?.id && existing.includes(idT)) errs.push('管理番号が重複しています')
  if (!name.trim()) errs.push('名称')
  if (!normYmd(last)) errs.push('前回の校正日')
  const iv = Number(interval)
  if (!Number.isInteger(iv) || iv < 1 || iv > 120) errs.push('校正周期（1〜120か月）')
  if (ref.trim() === '' || !Number.isFinite(Number(ref))) errs.push('基準値（数字）')
  if (tol.trim() === '' || !Number.isFinite(Number(tol)) || Number(tol) < 0) errs.push('公差（0以上の数字）')

  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault()
        if (errs.length) return
        onSave({
          id: idT,
          name: name.trim(),
          place: place.trim(),
          lastDate: normYmd(last)!,
          interval: iv,
          standard: standard.trim(),
          ref: Number(ref),
          tol: Number(tol),
          unit: unit.trim(),
          decimals: decimalsOf(ref, tol),
        })
      }}
    >
      <h3 className="sub">{init ? `${init.id} を直す` : '測定器を追加する'}</h3>
      <div className="two">
        <label className="field">
          <span>管理番号（QRの中身になります）{locked ? '※記録があるため変更できません' : ''}</span>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="例 MI-011" disabled={locked} />
        </label>
        <label className="field">
          <span>名称</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例 外側マイクロメータ 50-75mm" />
        </label>
      </div>
      <label className="field">
        <span>保管場所</span>
        <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="例 第1加工場 工具棚A" />
      </label>
      <div className="two">
        <label className="field">
          <span>前回の校正日</span>
          <input type="date" value={last} onChange={(e) => setLast(e.target.value)} />
        </label>
        <label className="field">
          <span>校正周期（月）</span>
          <input inputMode="numeric" value={interval} onChange={(e) => setIv(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>標準器（何と比べるか）</span>
        <input value={standard} onChange={(e) => setStandard(e.target.value)} placeholder="例 ゲージブロック 25mm" />
      </label>
      <div className="three">
        <label className="field">
          <span>基準値</span>
          <input inputMode="decimal" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="25.000" />
        </label>
        <label className="field">
          <span>公差（±）</span>
          <input inputMode="decimal" value={tol} onChange={(e) => setTol(e.target.value)} placeholder="0.002" />
        </label>
        <label className="field">
          <span>単位</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="mm" />
        </label>
      </div>
      {errs.length > 0 && <p className="muted small">必要な項目：{errs.join('、')}</p>}
      {init && <p className="muted small">基準値・公差を直しても、すでに入力した記録は「当時の基準」のまま残ります。</p>}
      <div className="row">
        <button className="btn primary" type="submit" disabled={errs.length > 0}>
          {init ? '更新する' : '追加する'}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          やめる
        </button>
      </div>
    </form>
  )
}
