'use server';

import { sql } from '@/src/lib/db';

export async function handleLogoutAction(userId: number) {
  try {
    await sql`
      UPDATE users 
      SET is_online = FALSE, last_seen = CURRENT_TIMESTAMP 
      WHERE id = ${userId}
    `;
  } catch (error) {
    console.error('Failed to update logout status:', error);
  }
}