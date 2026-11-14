/** 金额存储用最小货币单位（分），展示用元。 */
export function toMajorUnits(minorUnits: number | null | undefined): number | null {
  if (minorUnits === null || minorUnits === undefined) return null
  return minorUnits / 100
}

export function toMinorUnits(majorUnits: number | null | undefined): number | undefined {
  if (majorUnits === null || majorUnits === undefined) return undefined
  return Math.round(majorUnits * 100)
}
