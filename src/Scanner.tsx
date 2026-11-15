import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { qrDataUrl } from './Qr'
import { qrText } from './lib'

interface SampleBtn {
  id: string
  name: string
}

// QRの読み取り。画像は端末の中だけで処理し、外へは送りません。
export default function Scanner({ samples, onFound }: { samples: SampleBtn[]; onFound: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const [cam, setCam] = useState(false)
  const [msg, setMsg] = useState('')
  const [demo, setDemo] = useState<{ id: string; url: string } | null>(null)
  const timer = useRef(0)

  function stopCamera() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCam(false)
  }
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      clearTimeout(timer.current)
    },
    [],
  )

  function decode(src: CanvasImageSource, w: number, h: number): string | null {
    const cv = document.createElement('canvas')
    const max = 900
    const k = Math.min(1, max / Math.max(w, h))
    cv.width = Math.max(1, Math.round(w * k))
    cv.height = Math.max(1, Math.round(h * k))
    const g = cv.getContext('2d', { willReadFrequently: true })!
    g.drawImage(src, 0, 0, cv.width, cv.height)
    const d = g.getImageData(0, 0, cv.width, cv.height)
    const r = jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' })
    return r ? r.data : null
  }

  async function startCamera() {
    setMsg('')
    setDemo(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setMsg('この端末・ブラウザではカメラを使えません。「写真から読み取る」か、下の管理番号の一覧から選んでください。')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      streamRef.current = stream
      setCam(true)
      // 画面に video が出てから接続する
      setTimeout(() => {
        const v = videoRef.current
        if (!v) return
        v.srcObject = stream
        void v.play()
        const tick = () => {
          const vv = videoRef.current
          if (!vv || !streamRef.current) return
          if (vv.readyState >= 2 && vv.videoWidth > 0) {
            const t = decode(vv, vv.videoWidth, vv.videoHeight)
            if (t) {
              stopCamera()
              onFound(t)
              return
            }
          }
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      }, 0)
    } catch {
      setMsg('カメラが許可されませんでした。ブラウザの設定でカメラを許可するか、「写真から読み取る」を使ってください。')
    }
  }

  function fromFile(f: File | undefined) {
    if (!f) return
    setMsg('')
    setDemo(null)
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      const t = decode(img, img.naturalWidth, img.naturalHeight)
      URL.revokeObjectURL(url)
      if (t) onFound(t)
      else setMsg('QRコードを読み取れませんでした。QRが大きく、まっすぐ写った写真で、もう一度お試しください。')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      setMsg('画像を開けませんでした。')
    }
    img.src = url
  }

  // 見本QR：QRの画像を実際に描き、その画像から読み取る（カメラが無い審査環境でも試せる）
  function sample(s: SampleBtn) {
    stopCamera()
    setMsg('')
    clearTimeout(timer.current)
    const url = qrDataUrl(qrText(s.id))
    setDemo({ id: s.id, url })
    timer.current = window.setTimeout(() => {
      const img = new Image()
      img.onload = () => {
        const t = decode(img, img.naturalWidth, img.naturalHeight)
        setDemo(null)
        if (t) onFound(t)
        else setMsg('見本のQRを読み取れませんでした。')
      }
      img.src = url
    }, 900)
  }

  return (
    <div className="scanner">
      <div className="scan-btns">
        <button type="button" className="btn primary big" onClick={() => (cam ? stopCamera() : void startCamera())}>
          {cam ? '読み取りをやめる' : 'カメラで読み取る'}
        </button>
        <label className="btn big">
          写真から読み取る
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              fromFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {cam && (
        <div className="cam-box">
          <video ref={videoRef} playsInline muted />
          <div className="cam-frame" />
          <p className="cam-tip">測定器のQRを枠に入れてください</p>
        </div>
      )}
      {demo && (
        <div className="demo-box" role="status">
          <img src={demo.url} alt="見本のQRコード" />
          <p>読み取り中…（{demo.id}）</p>
        </div>
      )}
      {msg && <p className="msg warn">{msg}</p>}
      <div className="samples">
        <p className="samples-title">審査・お試し用：見本のQRをワンタップで読み取る</p>
        <div className="sample-grid">
          {samples.map((s) => (
            <button key={s.id} type="button" className="btn sample" onClick={() => sample(s)}>
              <span className="sid">{s.id}</span>
              <span className="sname">{s.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
