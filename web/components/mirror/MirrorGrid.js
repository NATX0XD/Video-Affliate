'use client'
import { useState } from 'react'
import { MirrorCell }       from './MirrorCell'
import { MirrorFullscreen } from './MirrorFullscreen'

const MAX_SLOTS = 20

export function MirrorGrid({ devices }) {
  const [fsSerial, setFsSerial] = useState(null)

  const slots = Array.from({ length: MAX_SLOTS }, (_, i) => ({
    idx: i,
    device: devices[i] ?? null,
  }))

  if (fsSerial) {
    const dev = devices.find(d => d.serial === fsSerial)
    return <MirrorFullscreen device={dev} onBack={() => setFsSerial(null)} />
  }

  return (
    <div
      className="grid gap-2 p-3 h-full"
      style={{ gridTemplateColumns: 'repeat(5, 1fr)', gridTemplateRows: 'repeat(4, 1fr)' }}
    >
      {slots.map(({ idx, device }) => (
        <MirrorCell
          key={idx}
          idx={idx}
          device={device}
          onFullscreen={setFsSerial}
        />
      ))}
    </div>
  )
}
