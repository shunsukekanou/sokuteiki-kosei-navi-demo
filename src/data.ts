import { addDays, addMonths, nowStr, todayStr } from './lib'

export type Result = '合格' | '要調整' | '異常'
export type Status = '未実施' | '期限間近' | Result

export interface Instrument {
  id: string // 管理番号
  name: string
  place: string
  lastDate: string // 前回の校正日（記録が無いときの基準）
  interval: number // 校正周期（月）
  standard: string // 標準器（何と比べるか）
  ref: number // 基準値
  tol: number // 公差（±）
  unit: string
  decimals: number
}
export interface Rec {
  id: string
  instId: string
  date: string // 校正日
  at: string // 記録した日時（監査証跡。入力した瞬間の端末の日時）
  measured: number | null
  result: Result
  person: string // 誰が
  note: string // 処置内容・メモ
  // 当時の基準（どの基準で測ったか）。台帳の基準値をあとで直しても、過去の記録は当時のまま残る
  standard: string
  ref: number
  tol: number
  unit: string
  decimals: number
}
export interface State {
  instruments: Instrument[]
  records: Rec[]
  roundStart: string // 今回の校正の開始日（この日以降の記録を「今回実施」とみなす）
  person: string
  comment: string | null // 報告書の総括コメント（null＝自動の文）
}

// 見本の測定器（すべて架空。社名・実名・実際の管理番号は入っていません）
interface Seed {
  id: string
  name: string
  place: string
  standard: string
  ref: number
  tol: number
  unit: string
  dec: number
  dueOffset: number // 今日から見た次回期限（日）
}
const SEEDS: Seed[] = [
  { id: 'MI-001', name: '外側マイクロメータ 0-25mm', place: '第1加工場 工具棚A', standard: 'ゲージブロック 25mm', ref: 25.0, tol: 0.002, unit: 'mm', dec: 3, dueOffset: -10 },
  { id: 'MI-002', name: '外側マイクロメータ 25-50mm', place: '第1加工場 工具棚A', standard: 'ゲージブロック 50mm', ref: 50.0, tol: 0.002, unit: 'mm', dec: 3, dueOffset: 5 },
  { id: 'MI-003', name: 'ノギス 150mm', place: '第1加工場 工具棚B', standard: 'ゲージブロック 100mm', ref: 100.0, tol: 0.03, unit: 'mm', dec: 2, dueOffset: 40 },
  { id: 'MI-004', name: 'ダイヤルゲージ 0.01mm', place: '第1加工場 検査台', standard: 'ゲージブロック 1mm', ref: 1.0, tol: 0.005, unit: 'mm', dec: 3, dueOffset: 90 },
  { id: 'MI-005', name: 'ハイトゲージ 300mm', place: '検査室 定盤横', standard: 'ゲージブロック 200mm', ref: 200.0, tol: 0.03, unit: 'mm', dec: 2, dueOffset: 120 },
  { id: 'MI-006', name: 'シリンダゲージ 18-35mm', place: '検査室 棚C', standard: 'リングゲージ φ25', ref: 25.0, tol: 0.003, unit: 'mm', dec: 3, dueOffset: 20 },
  { id: 'MI-007', name: '表面粗さ測定機', place: '検査室 測定台', standard: '粗さ標準片 Ra1.60', ref: 1.6, tol: 0.16, unit: 'µm', dec: 2, dueOffset: 200 },
  { id: 'MI-008', name: 'トルクレンチ 20-100N·m', place: '第2加工場 工具棚D', standard: 'トルク校正器 50N·m', ref: 50.0, tol: 1.5, unit: 'N·m', dec: 1, dueOffset: 250 },
  { id: 'MI-009', name: 'ピンゲージ φ5.000', place: '検査室 棚C', standard: '基準ピン φ5', ref: 5.0, tol: 0.001, unit: 'mm', dec: 3, dueOffset: 300 },
  { id: 'MI-010', name: 'デジタル温度計', place: '第2加工場 事務台', standard: '標準温度計 20.0℃', ref: 20.0, tol: 0.5, unit: '℃', dec: 1, dueOffset: 330 },
]

export function makeRec(inst: Instrument, date: string, measured: number | null, result: Result, person: string, note: string, at?: string): Rec {
  return {
    id: newId(),
    instId: inst.id,
    date,
    at: at ?? nowStr(),
    measured,
    result,
    person,
    note,
    standard: inst.standard,
    ref: inst.ref,
    tol: inst.tol,
    unit: inst.unit,
    decimals: inst.decimals,
  }
}

let seq = 0
export const newId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`

export function makeSeed(): State {
  const today = todayStr()
  const instruments: Instrument[] = SEEDS.map((s) => ({
    id: s.id,
    name: s.name,
    place: s.place,
    standard: s.standard,
    ref: s.ref,
    tol: s.tol,
    unit: s.unit,
    decimals: s.dec,
    interval: 12,
    lastDate: addMonths(addDays(today, s.dueOffset), -12),
  }))
  const roundStart = addDays(today, -20)
  const mk = (instId: string, ago: number, measured: number, result: Result, person: string, note: string): Rec => {
    const date = addDays(today, -ago)
    return makeRec(instruments.find((i) => i.id === instId)!, date, measured, result, person, note, `${date} ${ago % 2 ? '10:20' : '14:05'}`)
  }
  const records: Rec[] = [
    mk('MI-002', 3, 50.001, '合格', '担当A', ''),
    mk('MI-003', 3, 100.01, '合格', '担当A', ''),
    mk('MI-004', 2, 1.002, '合格', '担当B', ''),
    mk('MI-005', 2, 200.05, '要調整', '担当B', '零点を調整し、再測定で公差内を確認。次回は周期を短くして様子を見る。'),
    mk('MI-007', 1, 1.92, '異常', '担当A', '測定針の摩耗の疑い。使用停止の札を付け、メーカーへ修理を依頼。'),
    mk('MI-009', 1, 5.0, '合格', '担当A', ''),
  ]
  return { instruments, records, roundStart, person: '担当A', comment: null }
}

// 見本の「残りの測定器にも、合格の結果を入れる」（報告書を全台そろった形で試すため）
export function fillSampleResults(s: State): State {
  const today = todayStr()
  const have = new Set(s.records.filter((r) => r.date >= s.roundStart).map((r) => r.instId))
  const add: Rec[] = []
  s.instruments.forEach((i, k) => {
    if (have.has(i.id)) return
    const dev = (k % 3 === 0 ? 0.3 : k % 3 === 1 ? -0.2 : 0.1) * i.tol
    add.push(makeRec(i, today, Number((i.ref + dev).toFixed(i.decimals + 1)), '合格', s.person || '担当A', ''))
  })
  return { ...s, records: [...s.records, ...add] }
}
