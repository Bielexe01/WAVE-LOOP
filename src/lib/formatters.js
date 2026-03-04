export function compact(value) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1).replace('.0', '')}m`
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace('.0', '')}k`
  }

  return `${value}`
}

export function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0])
    .join('')
    .toUpperCase()
}

export function gradientFromSeed(seed) {
  const palettes = [
    ['#ff7a59', '#ffd166'],
    ['#00a99d', '#59e3d2'],
    ['#2166f3', '#72c9ff'],
    ['#ec4899', '#fb923c'],
    ['#16a34a', '#86efac'],
  ]

  const index = seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % palettes.length
  const [start, end] = palettes[index]

  return `linear-gradient(135deg, ${start}, ${end})`
}

export function timeAgo(value) {
  const date = value instanceof Date ? value : new Date(value)
  const diffSeconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000))

  if (diffSeconds < 60) {
    return `${diffSeconds}s`
  }

  const minutes = Math.floor(diffSeconds / 60)
  if (minutes < 60) {
    return `${minutes} min`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} h`
  }

  const days = Math.floor(hours / 24)
  return `${days} d`
}

export function normalizeHandle(handle) {
  return handle.startsWith('@') ? handle.slice(1) : handle
}
