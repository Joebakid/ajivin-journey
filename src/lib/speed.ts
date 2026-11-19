// src/lib/speed.ts
// Speed monitoring settings. Override any of them in .env.local.

/** Speed limit in km/h. Driving above this counts as speeding. */
export const SPEED_LIMIT_KMH = Number(process.env.SPEED_LIMIT_KMH) || 100;

/** How long (seconds) a driver must stay over the limit before managers are alerted. */
export const SPEEDING_ALERT_AFTER_SECONDS = Number(process.env.SPEEDING_ALERT_AFTER_SECONDS) || 10;

/** Minimum gap (seconds) between two speeding alerts for the same trip. */
export const SPEEDING_ALERT_COOLDOWN_SECONDS = Number(process.env.SPEEDING_ALERT_COOLDOWN_SECONDS) || 300;

/** Readings above this are treated as GPS glitches and ignored. */
export const MAX_PLAUSIBLE_KMH = 250;

/**
 * Reads the driver's speed in km/h from a stored location payload.
 * Accepts `speedKmh` (km/h) or the older `speed` field (metres per second).
 */
export function kmhFromLocationPayload(raw: string): number | null {
  try {
    const p = JSON.parse(raw);
    let kmh: number | null = null;

    if (p?.speedKmh !== null && p?.speedKmh !== undefined && Number.isFinite(Number(p.speedKmh))) {
      kmh = Number(p.speedKmh);
    } else if (p?.speed !== null && p?.speed !== undefined && Number.isFinite(Number(p.speed))) {
      kmh = Number(p.speed) * 3.6;
    }

    if (kmh === null || kmh < 0 || kmh > MAX_PLAUSIBLE_KMH) return null;
    return Math.round(kmh * 10) / 10;
  } catch {
    return null;
  }
}