import { useState } from 'react'
import type { Instrument, Rec, Result, State } from './data'
import { makeRec } from './data'
import Scanner from './Scanner'
import { Badge, refText } from './ui'
import { cycleOf, daysBetween, dueNote, fmtDiff, fmtJa, fmtNum, fmtPeriod, fmtYM, idFromQr, lastDone, nextDue, periodOf, recordsOf, statusOf, todayStr, withinTol } from './lib'

interface Props {
  state: State
  update: (f: (s: State) => State) => void
  selId: string | null
  setSelId: (id: string | null) => void
  goLedger: () => void
}

export default function InputView({ state, update, selId, setSelId, goLedger }: Props) {
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)
  const today = todayStr()
  const inst = state.instruments.find((i) => i.id === selId) ?? null
  // 進み具合は「実施期間中」の測定器だけ数える（次の期限の1か月前から自動で数え直す）
  const stats = state.instruments.map((i) => statusOf(i, state.records, today))
  const done = stats.filter((s) => s === '合格' || s === '要調整' || s === '異常').length
  const pending = stats.filter((s) => s === '未実施').length
  const total = done + pending
  const off = stats.length - total
  // 校正期間（期限の月の1日〜期限）と、いまの状態
  const per = periodOf(state.instruments, state.records, today)
  let periodState = ''
  if (per.targets > 0) {
    const toEnd = daysBetween(today, per.end)
    if (pending === 0) periodState = '今回の校正は、すべて完了しました'
    else if (today < per.start) periodState = `校正期間は ${fmtJa(per.start)} からです`
    else if (toEnd > 0) periodState = `ただいま校正期間中です（期限まで${toEnd}日）`
    else if (toEnd === 0) periodState = 'ただいま校正期間中です（期限は今日です）'
    else periodState = `期限を${-toEnd}日すぎています。未実施の機器があります`
    if (per.overdue > 0 && toEnd >= 0) periodState += `　期限をすぎた機器：${per.overdue}台`
  }

  function found(text: string) {
    const id = idFromQr(text)
    const hit = state.instruments.find((i) => i.id === id)
    if (hit) {
      setSelId(hit.id)
      setMsg(null)
    } else {
      setSelId(null)
      setMsg({ kind: 'warn', text: `「${id}」は台帳にありません。台帳に追加するか、別のQRを読み取ってください。` })
    }
  }

  // 見本のQRは、未実施の測定器を先に、足りなければ実施期間外のものを並べる
  const ordered = state.instruments.map((i, k) => ({ i, s: stats[k] }))
  const sampleList = [
    ...ordered.filter((x) => x.s === '未実施'),
    ...ordered.filter((x) => x.s === '期間外'),
    ...ordered.filter((x) => x.s !== '未実施' && x.s !== '期間外'),
  ]
    .slice(0, 4)
    .map((x) => ({ id: x.i.id, name: x.i.name }))

  return (
    <section>
      <div className="progress card">
        <div className="period">
          {per.targets > 0 ? (
            <>
              <small className="plabel">今年の校正期間</small>
              <b>{fmtPeriod(per.start, per.end)}</b>
              <span className={`pstate ${pending > 0 && today > per.end ? 'late' : pending === 0 ? 'done' : 'now'}`}>{periodState}</span>
              <small>前回の実施：{per.prevMin === per.prevMax ? fmtYM(per.prevMin) : `${fmtYM(per.prevMin)}〜${fmtYM(per.prevMax)}`}</small>
            </>
          ) : (
            <>
              <b>いまは、校正期間ではありません</b>
              {per.next && <small>次の校正期間：{fmtJa(per.next)} から</small>}
            </>
          )}
        </div>
        <div className="progress-top">
          <b>今回の校正の進み具合</b>
          <span>
            {done} / {total} 台
          </span>
        </div>
        <div className="bar" aria-hidden="true">
          <i style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
        </div>
        <p className="muted small">
          {pending > 0 ? `残り ${pending} 台。` : total > 0 ? '「報告書」で自動作成できます。' : ''}
          {off > 0 ? `校正期間外の ${off} 台は数えません。` : ''}
        </p>
      </div>

      {!inst && (
        <div className="card">
          <h2 className="step">
            <span>1</span>測定器のQRコードを読み取る
          </h2>
          <Scanner samples={sampleList} onFound={found} />
          {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
          <div className="manual">
            <label htmlFor="pick">QRが読めないとき：管理番号を選ぶ</label>
            <select id="pick" value="" onChange={(e) => e.target.value && found(e.target.value)}>
              <option value="">選んでください</option>
              {state.instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.id}　{i.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {inst && (
        <Entry
          key={inst.id}
          inst={inst}
          state={state}
          update={update}
          onBack={() => {
            setSelId(null)
            setMsg(null)
          }}
          onSaved={(t) => {
            setSelId(null)
            setMsg({ kind: 'ok', text: t })
          }}
          goLedger={goLedger}
        />
      )}

    </section>
  )
}

function Entry({
  inst,
  state,
  update,
  onBack,
  onSaved,
  goLedger,
}: {
  inst: Instrument
  state: State
  update: Props['update']
  onBack: () => void
  onSaved: (t: string) => void
  goLedger: () => void
}) {
  const today = todayStr()
  const [date, setDate] = useState(today)
  const [measured, setMeasured] = useState('')
  const [picked, setPicked] = useState<Result | null>(null)
  const [person, setPerson] = useState(state.person)
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState<{ text: string; rec: Rec } | null>(null)

  const status = statusOf(inst, state.records, today)
  const hist = recordsOf(state.records, inst.id)
  const num = measured.trim() === '' ? NaN : Number(measured.replace(/,/g, ''))
  const mv: number | null = Number.isFinite(num) ? num : null
  const mOk = mv !== null
  const inTol = mv !== null ? withinTol(mv, inst) : null
  const auto: Result | null = inTol === null ? null : inTol ? '合格' : '要調整'
  const result = picked ?? auto
  const needNote = result !== null && result !== '合格'
  const problems: string[] = []
  if (!mOk) problems.push('実測値を数字で入れてください')
  if (!result) problems.push('判定を選んでください')
  if (needNote && !note.trim()) problems.push('「要調整」「異常」のときは、処置内容を書いてください')
  if (!person.trim()) problems.push('担当者を入れてください（監査で「誰が」を示すため）')
  if (!date) problems.push('校正日を入れてください')
  const cyc = cycleOf(inst, state.records, today)
  const alreadyThisRound = !!cyc.last

  function save() {
    if (problems.length || !result || mv === null) return
    const rec: Rec = makeRec(inst, date, mv, result, person.trim(), note.trim())
    update((s) => ({ ...s, records: [...s.records, rec], person: person.trim() }))
    const next = nextDue(inst, [...state.records, rec])
    setSaved({ text: `保存しました。${inst.id}：${result}。次回の期限は ${fmtJa(next)} です。`, rec })
  }

  if (saved) {
    return (
      <div className="card saved" role="status">
        <p className="saved-title">✔ {saved.text}</p>
        <p className="muted">台帳には、すぐ反映されます。事務所でのExcelへの転記は要りません。</p>
        <div className="row">
          <button className="btn primary big" onClick={() => onSaved(saved.text)}>
            次の測定器を読み取る
          </button>
          <button className="btn big" onClick={goLedger}>
            台帳を見る
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="card inst-card">
        <div className="inst-head">
          <div>
            <p className="inst-id">{inst.id}</p>
            <h2 className="inst-name">{inst.name}</h2>
          </div>
          <Badge s={status} />
        </div>
        <dl className="kv">
          <div>
            <dt>保管場所</dt>
            <dd>{inst.place || '―'}</dd>
          </div>
          <div>
            <dt>前回の校正日</dt>
            <dd>{fmtJa(lastDone(inst, state.records))}</dd>
          </div>
          <div>
            <dt>次回の期限</dt>
            <dd>
              {fmtJa(nextDue(inst, state.records))}
              <small>（{dueNote(inst, state.records, today)}）</small>
            </dd>
          </div>
          <div>
            <dt>標準器</dt>
            <dd>{inst.standard || '―'}</dd>
          </div>
          <div className="wide">
            <dt>基準値と公差</dt>
            <dd className="ref">{refText(inst)}</dd>
          </div>
        </dl>
        <button className="link" onClick={onBack}>
          ← 別の測定器を読み取る
        </button>
      </div>

      <div className="card">
        <h2 className="step">
          <span>2</span>その場で結果を入力する
        </h2>
        {alreadyThisRound && (
          <p className="msg warn">
            この測定器は、今回すでに {fmtJa(cyc.last!.date)} に「{cyc.last!.result}」で入力済みです。保存すると、新しい記録として追加されます（古い記録は履歴に残ります）。
          </p>
        )}
        <label className="field">
          <span>実測値（{inst.unit}）</span>
          <input
            inputMode="decimal"
            value={measured}
            onChange={(e) => setMeasured(e.target.value)}
            placeholder={`例 ${fmtNum(inst.ref, inst.decimals)}`}
            autoComplete="off"
          />
        </label>
        {mv !== null && (
          <p className={`judge ${inTol ? 'in' : 'out'}`} role="status">
            基準との差 <b>{fmtDiff(mv - inst.ref, inst.decimals + 1)}</b> {inst.unit}　→　{inTol ? '公差の中です' : '公差の外です'}
          </p>
        )}
        <div className="field">
          <span>判定{picked === null && auto ? '（実測値から自動で選びました。変えられます）' : ''}</span>
          <div className="seg3">
            {(['合格', '要調整', '異常'] as Result[]).map((r) => (
              <button
                key={r}
                type="button"
                className={`segbtn r-${r} ${result === r ? 'on' : ''}`}
                aria-pressed={result === r}
                onClick={() => setPicked(r)}
              >
                {r === '異常' ? (<>異常<small>使用停止</small></>) : r}
              </button>
            ))}
          </div>
        </div>
        {needNote && (
          <label className="field">
            <span>処置内容（必須）</span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例：零点を調整した／使用停止の札を付け、修理を依頼した"
            />
          </label>
        )}
        <div className="two">
          <label className="field">
            <span>担当者（必須）</span>
            <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="例 担当A" autoComplete="off" />
          </label>
          <label className="field">
            <span>校正日</span>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        {!needNote && (
          <label className="field">
            <span>メモ（任意）</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="気づいたことがあれば" />
          </label>
        )}
        {problems.length > 0 && measured !== '' && <p className="muted small">保存するには：{problems.join('／')}</p>}
        <p className="muted small">保存すると、日時・担当者・使った基準・判定・処置が、そのまま監査用の記録として残ります（あとから書き換えず、直すときは新しい記録を追加します）。</p>
        <button className="btn primary big full" disabled={problems.length > 0} onClick={save}>
          保存する（台帳に反映）
        </button>
      </div>

      {hist.length > 0 && (
        <div className="card">
          <h3 className="sub">この測定器のこれまでの結果</h3>
          <ul className="hist">
            {hist.slice(0, 5).map((r) => (
              <li key={r.id}>
                <span>{fmtJa(r.date)}</span>
                <span>{r.measured === null ? '―' : `${fmtNum(r.measured, r.decimals + 1)} ${r.unit}`}</span>
                <b className={`res r-${r.result}`}>{r.result}</b>
                <span className="muted">{r.person}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
