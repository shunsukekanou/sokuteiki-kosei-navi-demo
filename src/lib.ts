import type { Instrument, Rec, State, Status } from './data'

// ---- 日付（端末の日付をそのまま使う）----
const p2 = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
export const todayStr = () => ymd(new Date())

export const nowStr = () => {
  const d = new Date()
  return `${ymd(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

export function parseYmd(s: string): Date | null {
  const m = s.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null
  return d
}
export const normYmd = (s: string): string | null => {
  const d = parseYmd(s)
  return d ? ymd(d) : null
}
export function addDays(s: string, n: number): string {
  const d = parseYmd(s)!
  d.setDate(d.getDate() + n)
  return ymd(d)
}
export function addMonths(s: string, n: number): string {
  const d = parseYmd(s)!
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return ymd(d)
}
export function daysBetween(a: string, b: string): number {
  const x = parseYmd(a)!
  const y = parseYmd(b)!
  return Math.round((y.getTime() - x.getTime()) / 86400000)
}
export function fmtJa(s: string): string {
  const d = parseYmd(s)
  return d ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` : s
}

// ---- 台帳の計算 ----
export function latestRecord(recs: Rec[], instId: string): Rec | undefined {
  let best: Rec | undefined
  for (const r of recs) {
    if (r.instId !== instId) continue
    if (!best || r.date > best.date || (r.date === best.date && r.id > best.id)) best = r
  }
  return best
}
export const recordsOf = (recs: Rec[], instId: string) =>
  recs.filter((r) => r.instId === instId).sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1))

export function nextDue(inst: Instrument, recs: Rec[]): string {
  const last = latestRecord(recs, inst.id)
  return addMonths(last ? last.date : inst.lastDate, inst.interval)
}
export function lastDone(inst: Instrument, recs: Rec[]): string {
  const last = latestRecord(recs, inst.id)
  return last ? last.date : inst.lastDate
}

// ---- 実施期間：次の期限の1か月前になると、自動で「今回の実施」に切り替わる（結果はリセットして数え直す）----
export interface Cycle {
  prev: string // いまの周期の「前回の校正日」（前の周期の最後の記録の日付）
  recs: Rec[] // いまの周期の記録
  last: Rec | undefined // いまの周期の結果（無ければ未実施）
  due: string // 次の期限
  windowStart: string // 実施期間の開始日（前回から数えた期限の1か月前）
  inWindow: boolean
}
export function cycleOf(inst: Instrument, recs: Rec[], today: string): Cycle {
  const wm = Math.min(1, inst.interval - 1) // 周期が1か月のときは、前倒しなし
  let prev = inst.lastDate
  for (const r of recs) {
    if (r.instId !== inst.id) continue
    // この記録の「次の実施期間」がもう始まっていれば、この記録までは前の周期のもの
    if (today >= addMonths(addMonths(r.date, inst.interval), -wm) && r.date > prev) prev = r.date
  }
  const mine = recs.filter((r) => r.instId === inst.id && r.date > prev)
  const last = latestRecord(mine, inst.id)
  const due = addMonths(last ? last.date : prev, inst.interval)
  const windowStart = addMonths(addMonths(prev, inst.interval), -wm)
  return { prev, recs: mine, last, due, windowStart, inWindow: today >= windowStart }
}
export function statusOf(inst: Instrument, recs: Rec[], today: string): Status {
  const c = cycleOf(inst, recs, today)
  if (c.last) return c.last.result
  return c.inWindow ? '未実施' : '期間外'
}
export function dueNote(inst: Instrument, recs: Rec[], today: string): string {
  const d = daysBetween(today, nextDue(inst, recs))
  if (d < 0) return `期限を${-d}日すぎています`
  if (d === 0) return '期限は今日です'
  return `期限まで${d}日`
}

export function decimalsOf(...vals: string[]): number {
  let n = 0
  for (const v of vals) {
    const m = v.trim().match(/\.(\d+)/)
    if (m) n = Math.max(n, m[1].length)
  }
  return Math.min(n, 4)
}
export const fmtNum = (v: number, dec: number) => v.toFixed(dec)
export const fmtDiff = (diff: number, dec: number) => (Math.abs(diff) < 1e-9 ? '±' : diff > 0 ? '+' : '−') + Math.abs(diff).toFixed(dec)
export const withinTol = (measured: number, inst: Instrument) => Math.abs(measured - inst.ref) <= inst.tol + 1e-9

// ---- QRの中身 ----
export const QR_PREFIX = 'KOSEI:'
export const qrText = (id: string) => QR_PREFIX + id
export function idFromQr(text: string): string {
  const t = text.trim()
  return t.startsWith(QR_PREFIX) ? t.slice(QR_PREFIX.length) : t
}

// ---- CSV ----
export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  // 先頭の BOM（Excel で文字化けしないための目印）
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'
}
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"'
          i++
        } else q = false
      } else cell += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((x) => x.trim() !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}
// Excel が日本語のまま保存したファイル（Shift_JIS）も読めるようにする
export async function readTextFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('shift_jis').decode(buf)
  }
}
export function downloadText(name: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const INST_HEADERS = ['管理番号', '名称', '保管場所', '前回校正日', '校正周期(月)', '標準器', '基準値', '公差(±)', '単位']

export function importInstruments(text: string, cur: Instrument[]): { next: Instrument[]; added: number; updated: number; errors: string[] } {
  const rows = parseCsv(text)
  const errors: string[] = []
  if (rows.length < 2) return { next: cur, added: 0, updated: 0, errors: ['データの行がありません。'] }
  const head = rows[0].map((h) => h.trim())
  const idx = INST_HEADERS.map((n) => head.indexOf(n))
  const missing = INST_HEADERS.filter((_, i) => idx[i] < 0)
  if (missing.length) return { next: cur, added: 0, updated: 0, errors: [`見出しが合いません（足りない列：${missing.join('、')}）。書き出したCSVの1行目と同じにしてください。`] }
  const map = new Map(cur.map((i) => [i.id, i]))
  let added = 0
  let updated = 0
  rows.slice(1).forEach((r, k) => {
    const line = k + 2
    const g = (n: number) => (r[idx[n]] ?? '').trim()
    const id = g(0)
    if (!id) return errors.push(`${line}行目：管理番号が空です。`)
    const name = g(1)
    if (!name) return errors.push(`${line}行目：名称が空です。`)
    const last = normYmd(g(3))
    if (!last) return errors.push(`${line}行目：前回校正日「${g(3)}」が日付として読めません（例 2025-11-20）。`)
    const interval = Number(g(4))
    if (!Number.isInteger(interval) || interval < 1 || interval > 120) return errors.push(`${line}行目：校正周期(月)「${g(4)}」は1〜120の整数にしてください。`)
    const ref = Number(g(6))
    const tol = Number(g(7))
    if (g(6) === '' || !Number.isFinite(ref)) return errors.push(`${line}行目：基準値「${g(6)}」が数字ではありません。`)
    if (g(7) === '' || !Number.isFinite(tol) || tol < 0) return errors.push(`${line}行目：公差「${g(7)}」が0以上の数字ではありません。`)
    const inst: Instrument = {
      id,
      name,
      place: g(2),
      lastDate: last,
      interval,
      standard: g(5),
      ref,
      tol,
      unit: g(8),
      decimals: decimalsOf(g(6), g(7)),
    }
    if (map.has(id)) updated++
    else added++
    map.set(id, inst)
  })
  return { next: [...map.values()], added, updated, errors }
}

// ---- 保存 ----
const KEY = 'sokuteiki-kosei-v1'
export function loadState(): State | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return sanitize(JSON.parse(raw))
  } catch {
    return null
  }
}
export function saveState(s: State): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
    return true
  } catch {
    return false
  }
}
export function clearState() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 何もしない */
  }
}
// 読み込んだ値の形を確かめる（足りない項目は補う。古い形・手で直した形でも開けるように）
export function sanitize(x: unknown): State | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (!Array.isArray(o.instruments) || !Array.isArray(o.records)) return null
  const insts: Instrument[] = []
  const seen = new Set<string>()
  for (const v of o.instruments as Record<string, unknown>[]) {
    if (!v || typeof v.id !== 'string' || !v.id || typeof v.name !== 'string' || seen.has(v.id)) continue
    seen.add(v.id)
    const last = typeof v.lastDate === 'string' ? normYmd(v.lastDate) : null
    insts.push({
      id: v.id,
      name: v.name,
      place: typeof v.place === 'string' ? v.place : '',
      lastDate: last ?? todayStr(),
      interval: Number.isInteger(v.interval) && (v.interval as number) > 0 ? (v.interval as number) : 12,
      standard: typeof v.standard === 'string' ? v.standard : '',
      ref: Number.isFinite(v.ref) ? (v.ref as number) : 0,
      tol: Number.isFinite(v.tol) ? Math.abs(v.tol as number) : 0,
      unit: typeof v.unit === 'string' ? v.unit : '',
      decimals: Number.isInteger(v.decimals) ? Math.min(Math.max(v.decimals as number, 0), 4) : 2,
    })
  }
  const recs: Rec[] = []
  for (const v of o.records as Record<string, unknown>[]) {
    if (!v || typeof v.instId !== 'string' || typeof v.date !== 'string' || !normYmd(v.date)) continue
    const result = v.result === '合格' || v.result === '要調整' || v.result === '異常' ? v.result : null
    if (!result) continue
    const inst = insts.find((i) => i.id === v.instId)
    const date = normYmd(v.date)!
    recs.push({
      id: typeof v.id === 'string' ? v.id : String(Math.random()),
      instId: v.instId,
      date,
      at: typeof v.at === 'string' && v.at ? v.at : date,
      measured: typeof v.measured === 'number' && Number.isFinite(v.measured) ? v.measured : null,
      result,
      person: typeof v.person === 'string' ? v.person : '',
      note: typeof v.note === 'string' ? v.note : '',
      // 古い形の記録は、いまの台帳の基準で補う
      standard: typeof v.standard === 'string' ? v.standard : (inst?.standard ?? ''),
      ref: typeof v.ref === 'number' && Number.isFinite(v.ref) ? v.ref : (inst?.ref ?? 0),
      tol: typeof v.tol === 'number' && Number.isFinite(v.tol) ? Math.abs(v.tol) : (inst?.tol ?? 0),
      unit: typeof v.unit === 'string' ? v.unit : (inst?.unit ?? ''),
      decimals: Number.isInteger(v.decimals) ? Math.min(Math.max(v.decimals as number, 0), 4) : (inst?.decimals ?? 2),
    })
  }
  return {
    instruments: insts,
    records: recs,
    person: typeof o.person === 'string' ? o.person : '',
    comment: typeof o.comment === 'string' ? o.comment : null,
  }
}
