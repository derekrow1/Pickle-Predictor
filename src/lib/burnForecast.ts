/**
 * Simple least-squares line on y vs x = 0..n-1; extrapolate the next `horizon` points.
 * Burn is non-negative; projections are floored at 0.
 */
export function linearBurnForecast(values: number[], horizon: number, fitMaxPoints = 12): number[] {
  const h = Math.max(1, Math.floor(horizon));
  if (values.length === 0) return Array.from({ length: h }, () => 0);
  const ys = values.slice(-Math.max(2, Math.min(fitMaxPoints, values.length)));
  const m = ys.length;
  if (m === 1) return Array.from({ length: h }, () => Math.max(0, ys[0]!));

  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < m; i++) {
    sx += i;
    sy += ys[i]!;
    sxy += i * ys[i]!;
    sxx += i * i;
  }
  const den = m * sxx - sx * sx;
  const slope = den === 0 ? 0 : (m * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / m;

  const out: number[] = [];
  for (let k = 1; k <= h; k++) {
    const x = m - 1 + k;
    const y = intercept + slope * x;
    out.push(Math.max(0, y));
  }
  return out;
}
