import type { Instrument, Status } from './data'
import { fmtNum } from './lib'

const CLS: Record<Status, string> = {
  未実施: 'st-none',
  期限間近: 'st-soon',
  合格: 'st-ok',
  要調整: 'st-adj',
  異常: 'st-ng',
}
const LABEL: Record<Status, string> = {
  未実施: '未実施',
  期限間近: '期限間近',
  合格: '合格',
  要調整: '要調整',
  異常: '異常・使用停止',
}
export function Badge({ s }: { s: Status }) {
  return <span className={`badge ${CLS[s]}`}>{LABEL[s]}</span>
}
export const statusLabel = (s: Status) => LABEL[s]

export const refText = (i: Instrument) =>
  `${fmtNum(i.ref, i.decimals)} ${i.unit}（公差 ±${fmtNum(i.tol, i.decimals)}）`
