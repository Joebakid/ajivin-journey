'use server';

import { sql } from '@/src/lib/db';
import { revalidatePath } from 'next/cache';

export async function updatePresence(userId: number) {
  if (!userId || isNaN(userId)) return;

  try {
    // 1. Mark current active user online and record timestamp
    await sql`
      UPDATE users 
      SET is_online = true, last_seen = NOW() 
      WHERE id = ${userId}
    `;

    // 2. Sweep inactive users whose heartbeat has expired (older than 25 seconds)
    await sql`
      UPDATE users 
      SET is_online = false 
      WHERE is_online = true AND last_seen < NOW() - INTERVAL '25 seconds'
    `;
  } catch (error) {
    console.error('Failed to update presence:', error);
  }
}

export async function setOfflineAction(userId: number) {
  if (!userId || isNaN(userId)) return;

  try {
    await sql`
      UPDATE users 
      SET is_online = false, last_seen = NOW() 
      WHERE id = ${userId}
    `;

    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/driver');
  } catch (error) {
    console.error('Failed to set offline status:', error);
  }
}

export async function getLivePresenceAction() {
  try {
    // 1. Sweep ghost users before returning roster
    await sql`
      UPDATE users 
      SET is_online = false 
      WHERE is_online = true AND last_seen < NOW() - INTERVAL '25 seconds'
    `;

    // 2. Fetch live personnel list
    const personnel = await sql`
      SELECT id, name, email, role, phone, license_number, is_online, last_seen 
      FROM users 
      ORDER BY is_online DESC, role ASC, name ASC
    `;

    return personnel;
  } catch (error) {
    console.error('Failed to fetch live presence:', error);
    return [];
  }
}

/** Used by the chat header: is this one person online right now? */
export async function getPresenceAction(userId: number): Promise<{ online: boolean }> {
  if (!userId || isNaN(userId)) return { online: false };

  try {
    const rows = await sql`
      SELECT (is_online = true AND last_seen IS NOT NULL AND last_seen > NOW() - INTERVAL '25 seconds') AS online
      FROM users
      WHERE id = ${userId}
    `;
    return { online: rows.length > 0 && rows[0].online === true };
  } catch (error) {
    console.error('Failed to read presence:', error);
    return { online: false };
  }
}