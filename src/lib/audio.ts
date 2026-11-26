// En enda delad <audio> som "låses upp" vid första trycket.
// iOS tillåter bara ljud efter en användargest – därefter kan samma element spelas från kod.
export const CLIP_SECONDS = 10

const SILENT =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

let el: HTMLAudioElement | null = null
let stopTimer: ReturnType<typeof setTimeout> | undefined
let startTimer: ReturnType<typeof setTimeout> | undefined

function player(): HTMLAudioElement {
  if (!el) {
    el = new Audio()
    el.preload = 'auto'
    el.setAttribute('playsinline', '')
  }
  return el
}

export async function unlockAudio(): Promise<void> {
  const p = player()
  try {
    p.src = SILENT
    // Safari kan låta play()-löftet hänga för evigt – vänta aldrig mer än 500 ms.
    // play() måste anropas synkront i användargesten, så det sker här direkt.
    await Promise.race([p.play(), new Promise((r) => setTimeout(r, 500))])
    p.pause()
  } catch {
    /* ignoreras – vi försöker igen vid uppspelning */
  }
}

export function preload(url: string): Promise<void> {
  const p = player()
  return new Promise((resolve) => {
    if (p.src === url && p.readyState >= 3) return resolve()
    const done = () => {
      p.removeEventListener('canplaythrough', done)
      p.removeEventListener('error', done)
      resolve()
    }
    p.addEventListener('canplaythrough', done)
    p.addEventListener('error', done)
    p.src = url
    p.load()
    setTimeout(done, 6000)
  })
}

export function stopClip() {
  clearTimeout(stopTimer)
  clearTimeout(startTimer)
  el?.pause()
}

/** iTunes-klippen är ~30 s långa, så längre speltid än så går inte. */
export const MAX_CLIP_SECONDS = 30

/** Spelar klippet i `seconds` sekunder, med start vid `startAt` (Date.now()-tid). */
export async function playClip(
  url: string,
  startAt = Date.now(),
  onEnd?: () => void,
  seconds = CLIP_SECONDS,
): Promise<boolean> {
  stopClip()
  await preload(url)
  const p = player()
  return new Promise((resolve) => {
    const go = async () => {
      // Om vi är sena (t.ex. långsam laddning) hoppar vi fram så att alla hör samma ställe
      const lateSec = Math.max(0, (Date.now() - startAt) / 1000)
      const remaining = Math.min(seconds, MAX_CLIP_SECONDS) - lateSec
      if (remaining <= 0.5) {
        onEnd?.()
        return resolve(false)
      }
      try {
        p.currentTime = lateSec
        // Safari kan lämna play() hängande i stället för att avvisa – räkna det som blockerat
        await Promise.race([
          p.play(),
          new Promise<void>((_, reject) => setTimeout(() => (p.paused ? reject(new Error('play timeout')) : undefined), 1500)),
        ])
        stopTimer = setTimeout(() => {
          p.pause()
          onEnd?.()
        }, remaining * 1000)
        resolve(true)
      } catch {
        resolve(false) // blockerat – UI visar "Tryck för att spela"
      }
    }
    const wait = startAt - Date.now()
    if (wait > 0) startTimer = setTimeout(go, wait)
    else go()
  })
}
