// Determine batch window label per business rule
// Windows: 07:00–15:00 => AM, 15:01–06:59 => PM (spans overnight)
export const getCurrentBatchKey = (now = new Date()) => {
  const date = now.toISOString().slice(0, 10)
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const am = hours > 6 && (hours < 15 || (hours === 15 && minutes === 0))
  const label = am ? "AM" : "PM"
  return `${date}-${label}`
}


