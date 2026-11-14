/** UTC 天数偏移，避免本地时区在跨午夜边界时的漂移（同 CarePlan/MealRecord 的排期生成使用）。 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
