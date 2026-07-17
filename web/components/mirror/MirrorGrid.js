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
    <div className="h-full overflow-auto p-4 lg:p-5">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {slots.map(({ idx, device }) => (
          <MirrorCell key={idx} idx={idx} device={device} onFullscreen={setFsSerial} />
        ))}
      </div>
    </div>
  )
}
