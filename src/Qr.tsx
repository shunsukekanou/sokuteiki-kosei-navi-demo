import qrcode from 'qrcode-generator'

function build(text: string) {
  const q = qrcode(0, 'M')
  q.addData(text)
  q.make()
  return q
}

// 印刷用（拡大しても粗くならない図）
export function QrSvg({ text, label }: { text: string; label: string }) {
  const q = build(text)
  const n = q.getModuleCount()
  const cells: string[] = []
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) cells.push(`M${c + 4} ${r + 4}h1v1h-1z`)
  const size = n + 8
  return (
    <svg className="qr-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={cells.join('')} fill="#000" />
    </svg>
  )
}

// 読み取りの体験用（実際に画像として描いて、そこから読み取る）
export function qrDataUrl(text: string, scale = 8): string {
  const q = build(text)
  const n = q.getModuleCount()
  const size = (n + 8) * scale
  const cv = document.createElement('canvas')
  cv.width = size
  cv.height = size
  const g = cv.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, size, size)
  g.fillStyle = '#000'
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect((c + 4) * scale, (r + 4) * scale, scale, scale)
  return cv.toDataURL('image/png')
}
