// app/actions/ensure.ts
import { ensureVehiclesTable } from '@/app/actions/vehicle';
import { ensureStaffTables } from '@/app/actions/staff';
import { ensureTripsTable } from '@/app/actions/trip';
import { ensurePanicTable } from '@/app/actions/panic';

let ready: Promise<void> | null = null;

/**
 * Runs all table setup once per server instance, in parallel.
 * If setup fails, the cache is cleared so the next request retries.
 */
export function ensureAllTables(): Promise<void> {
  if (!ready) {
    ready = Promise.all([
      ensureTripsTable(),
      ensureVehiclesTable(),
      ensureStaffTables(),
      ensurePanicTable(),
    ])
      .then(() => undefined)
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  return ready;
}