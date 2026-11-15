import { useLayoutEffect, useRef, useState } from 'react'
import type { State } from './data'
import { fmtDiff, fmtJa, fmtNum, latestRecord, nextDue, statusOf, todayStr } from './lib'

const PAGE_W = 680
const PAGE_H = 1009

export default function ReportView({ state, update }: { state: State; update: (f: (s: State) => State) => void }) {
  const today = todayStr()
  const sheetRef = useRef<HTMLElement>(null)
  const [fit, setFit] = useState({ s: 1, h: 0, multi: false })
  const [zoom, setZoom] = useState(1)
  const rows = state.instruments.map((i, k) => {
    const st = statusOf(i, state.records, state.roundStart, today)
    const last = latestRecord(state.records, i.id)
    const rec = last && last.date >= state.roundStart ? last : undefined
    return { no: k + 1, i, st, rec }
  })
  const total = rows.length
  const pass = rows.filter((r) => r.st === '合格').length
  const adj = rows.filter((r) => r.st === '要調整').length
  const ng = rows.filter((r) => r.st === '異常').length
  const done = pass + adj + ng
  const notDone = total - done
  const dates = rows.flatMap((r) => (r.rec ? [r.rec.date] : [])).sort()
  const period = dates.length ? (dates[0] === dates[dates.length - 1] ? fmtJa(dates[0]) : `${fmtJa(dates[0])} 〜 ${fmtJa(dates[dates.length - 1])}`) : '（まだ実施した記録がありません）'
  const action = rows.filter((r) => r.rec && r.rec.result !== '合格')
  const trail = state.records
    .filter((r) => r.date >= state.roundStart && state.instruments.some((i) => i.id === r.instId))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))

  const auto =
    total === 0
      ? '対象の測定器がありません。'
      : `対象${total}台のうち、${done}台の校正を実施した。結果は、合格${pass}台、要調整${adj}台、異常${ng}台。` +
        (notDone > 0 ? `未実施の${notDone}台は、期限を確認のうえ、順次実施する。` : '全数の校正を実施した。') +
        (adj + ng > 0 ? `要調整・異常の機器は、下表の処置内容のとおり対応する。` : done > 0 ? '実施した機器はすべて公差内で、使用に支障はない。' : '') +
        (ng > 0 ? '異常と判定した機器は、処置が済むまで使用しない。' : '')
  const comment = state.comment ?? auto

  // 内容の量に合わせて、A4・縦・1ページに収まる倍率を探す（収まらないほど多いときだけ複数ページ）
  useLayoutEffect(() => {
    const el = sheetRef.current
    if (!el) return
    const run = () => {
      let sc = 1
      for (let n = 0; n < 40; n++) {
        el.style.width = `${PAGE_W / sc}px`
        el.style.transform = `scale(${sc})`
        const h = el.offsetHeight * sc
        if (h <= PAGE_H * 0.97) {
          setFit({ s: sc, h, multi: false })
          return
        }
        sc = Math.round((sc - 0.02) * 1000) / 1000
        if (sc < 0.7) break
      }
      el.style.width = `${PAGE_W}px`
      el.style.transform = 'none'
      setFit({ s: 1, h: el.offsetHeight, multi: true })
    }
    run()
    // 報告書そのものが広げた幅ではなく、端末の画面の幅で測る
    const onSize = () => setZoom(Math.min(1, (Math.min(window.innerWidth, window.screen.width || window.innerWidth) - 28 - 26) / PAGE_W))
    onSize()
    window.addEventListener('resize', onSize)
    window.addEventListener('beforeprint', run)
    void document.fonts?.ready.then(run)
    return () => {
      window.removeEventListener('resize', onSize)
      window.removeEventListener('beforeprint', run)
    }
  }, [state.records, state.instruments, state.roundStart, comment])

  return (
    <section>
      <div className="no-print card">
        <h2>校正結果報告書を自動で作る（監査の提示用）</h2>
        <p className="muted">
          台帳の入力結果から、下の報告書が自動でできています。総括コメントは書き換えられます。内部監査や提出には、「A4で印刷／PDF保存」を押してください。
        </p>
        {notDone > 0 && (
          <p className="msg warn">
            未実施の測定器が {notDone} 台あります。報告書には「未実施」として載ります。（全台の結果がそろってから作るときは、「入力」で残りを入力してください。）
          </p>
        )}
        <label className="field">
          <span>総括コメント{state.comment === null ? '（自動の文）' : '（書き換え済み）'}</span>
          <textarea rows={4} value={comment} onChange={(e) => update((s) => ({ ...s, comment: e.target.value }))} />
        </label>
        <p className={`msg ${fit.multi ? 'warn' : 'ok'}`}>
          {fit.multi
            ? `測定器と記録が多いため、A4・縦の複数ページになります（${state.instruments.length}台）。`
            : `A4・縦・1枚に収まります${fit.s < 0.995 ? `（内容が多いため、${Math.round(fit.s * 100)}%に縮小しています）` : ''}。`}
          余白は15mmあり、コピー機で端が切れにくくしています。
        </p>
        <p className="muted small">印刷の画面では、用紙「A4」・向き「縦」・倍率「100%（初期値）」・余白「初期値」のままにしてください。コピー機で印刷するときは、いったん「PDF保存」してから、PDFを「実際のサイズ」で印刷すると、より確実です。</p>
        <div className="row">
          <button className="btn primary big" onClick={() => window.print()}>
            A4で印刷／PDF保存
          </button>
          {state.comment !== null && (
            <button className="btn" onClick={() => update((s) => ({ ...s, comment: null }))}>
              自動の文に戻す
            </button>
          )}
        </div>
      </div>

      <div className="paperbox-wrap">
      <div className="paperbox" style={{ zoom: String(zoom) }}>
        <div className="fit" style={{ height: fit.multi ? 'auto' : fit.h, width: PAGE_W }}>
      <article
        ref={sheetRef}
        className="sheet"
        aria-label="定期校正結果報告書"
        style={{ width: fit.multi ? PAGE_W : PAGE_W / fit.s, transform: fit.multi ? 'none' : `scale(${fit.s})` }}
      >
        <header>
          <h1>定期校正結果報告書</h1>
          <p className="sheet-sub">測定器・工具の定期校正　／　ISO 9001 の監査での提示を想定した様式</p>
        </header>
        <table className="meta">
          <tbody>
            <tr>
              <th>作成日</th>
              <td>{fmtJa(today)}</td>
              <th>実施日</th>
              <td>{period}</td>
            </tr>
          </tbody>
        </table>

        <h2>1. 実施結果のまとめ</h2>
        <table className="sum">
          <thead>
            <tr>
              <th>対象台数</th>
              <th>実施</th>
              <th>合格</th>
              <th>要調整</th>
              <th>異常・使用停止</th>
              <th>未実施</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{total}台</td>
              <td>{done}台</td>
              <td>{pass}台</td>
              <td className={adj ? 'hl-adj' : ''}>{adj}台</td>
              <td className={ng ? 'hl-ng' : ''}>{ng}台</td>
              <td>{notDone}台</td>
            </tr>
          </tbody>
        </table>

        <h2>2. 総括</h2>
        <p className="comment">{comment}</p>

        <h2>3. 異常・要調整の処置内容</h2>
        {action.length === 0 ? (
          <p className="none">該当なし</p>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>管理番号</th>
                <th>名称</th>
                <th>判定</th>
                <th>実測値</th>
                <th>処置内容</th>
              </tr>
            </thead>
            <tbody>
              {action.map(({ i, rec }) => (
                <tr key={i.id}>
                  <td>{i.id}</td>
                  <td>{i.name}</td>
                  <td className={rec!.result === '異常' ? 'hl-ng' : 'hl-adj'}>{rec!.result}</td>
                  <td>{rec!.measured === null ? '―' : `${fmtNum(rec!.measured, rec!.decimals + 1)} ${rec!.unit}`}</td>
                  <td className="left">{rec!.note || '―'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>4. 校正結果一覧</h2>
        <table className="grid list">
          <thead>
            <tr>
              <th>No.</th>
              <th>管理番号／名称</th>
              <th>基準値（公差）</th>
              <th>実測値</th>
              <th>差</th>
              <th>判定</th>
              <th>実施日</th>
              <th>担当</th>
              <th>次回期限</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ no, i, st, rec }) => (
              <tr key={i.id}>
                <td>{no}</td>
                <td className="left">
                  <b>{i.id}</b>
                  <br />
                  {i.name}
                </td>
                <td className="nw1">
                  {fmtNum(rec ? rec.ref : i.ref, rec ? rec.decimals : i.decimals)} ±{fmtNum(rec ? rec.tol : i.tol, rec ? rec.decimals : i.decimals)} {rec ? rec.unit : i.unit}
                </td>
                <td>{rec && rec.measured !== null ? fmtNum(rec.measured, rec.decimals + 1) : '―'}</td>
                <td>{rec && rec.measured !== null ? fmtDiff(rec.measured - rec.ref, rec.decimals + 1) : '―'}</td>
                <td className={st === '異常' ? 'hl-ng' : st === '要調整' ? 'hl-adj' : ''}>{rec ? rec.result : '未実施'}</td>
                <td>{rec ? rec.date : '―'}</td>
                <td>{rec ? rec.person || '―' : '―'}</td>
                <td>{nextDue(i, state.records)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>5. 監査証跡ログ（いつ・誰が・どの基準で・合否と処置）</h2>
        <p className="note">
          入力した瞬間の日時・担当者と、そのとき使った標準器・基準値・公差を、そのまま記録しています（基準値をあとで直しても過去の記録は当時のまま。記録は書き換えず、訂正は追加で行います）。
        </p>
        {trail.length === 0 ? (
          <p className="none">今回の記録はまだありません。</p>
        ) : (
          <table className="grid trail">
            <thead>
              <tr>
                <th>記録日時</th>
                <th>管理番号</th>
                <th>担当者</th>
                <th>標準器</th>
                <th>基準値（公差）</th>
                <th>実測値</th>
                <th>判定</th>
                <th>処置内容</th>
              </tr>
            </thead>
            <tbody>
              {trail.map((r) => (
                <tr key={r.id}>
                  <td>{r.at}</td>
                  <td>{r.instId}</td>
                  <td>{r.person || '―'}</td>
                  <td className="left">{r.standard || '―'}</td>
                  <td className="nw1">
                    {fmtNum(r.ref, r.decimals)} ±{fmtNum(r.tol, r.decimals)} {r.unit}
                  </td>
                  <td>{r.measured === null ? '―' : fmtNum(r.measured, r.decimals + 1)}</td>
                  <td className={r.result === '異常' ? 'hl-ng' : r.result === '要調整' ? 'hl-adj' : ''}>{r.result}</td>
                  <td className="left">{r.note || '―'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <table className="sign">
          <tbody>
            <tr>
              <th>作成</th>
              <th>確認</th>
              <th>承認</th>
            </tr>
            <tr>
              <td />
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </article>
        </div>
      </div>
      </div>
    </section>
  )
}
