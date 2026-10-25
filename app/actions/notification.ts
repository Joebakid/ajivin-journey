'use server';

import { sql } from '@/src/lib/db';
import { revalidatePath } from 'next/cache';

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  time: string;
  is_read: boolean;
  target_role?: string | null;
  target_user_id?: number | null;
  created_at: string;
}

// Ensures table and all role/user target columns exist in PostgreSQL
let ready: Promise<void> | null = null;
export async function ensureNotificationsTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          target_user_id INTEGER,
          target_role TEXT,
          is_read BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_user_id INTEGER`;
      await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_role TEXT`;
      await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false`;
      await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`;
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  await ready;
}

function formatTimeAgo(dateInput: string | Date | null): string {
  if (!dateInput) return 'Just now';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return 'Just now';
  const diffInSeconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diffInSeconds < 45) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
}

export async function getNotificationsAction(
  userId?: number,
  role: 'manager' | 'driver' = 'driver'
): Promise<NotificationItem[]> {
  try {
    await ensureNotificationsTable();

    let rows: any[] = [];

    if (role === 'manager') {
      rows = await sql`
        SELECT * FROM notifications
        WHERE (target_user_id = ${userId || null} OR target_user_id IS NULL)
          AND (target_role = 'manager' OR target_role = 'all' OR target_role IS NULL)
        ORDER BY created_at DESC
        LIMIT 40
      `;
    } else {
      rows = await sql`
        SELECT * FROM notifications
        WHERE (
          target_user_id = ${userId || null}
          OR (
            (target_user_id IS NULL OR target_user_id = ${userId || null})
            AND (target_role = 'driver' OR target_role = 'all' OR target_role IS NULL)
            AND target_role != 'manager'
            AND title NOT ILIKE '%Registration%'
            AND title NOT ILIKE '%New User%'
            AND title NOT ILIKE '%New Journey Request%'
          )
        )
        ORDER BY created_at DESC
        LIMIT 40
      `;
    }

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      message: r.message,
      time: formatTimeAgo(r.created_at),
      is_read: Boolean(r.is_read),
      target_role: r.target_role,
      target_user_id: r.target_user_id,
      created_at: String(r.created_at),
    }));
  } catch (error) {
    console.error('Failed to get notifications:', error);
    return [];
  }
}

export async function markAllNotificationsReadAction(userId?: number, role?: string) {
  try {
    await ensureNotificationsTable();

    if (userId) {
      await sql`
        UPDATE notifications 
        SET is_read = true 
        WHERE target_user_id = ${userId}
      `;
    }

    if (role === 'manager') {
      await sql`
        UPDATE notifications 
        SET is_read = true 
        WHERE target_role = 'manager' OR (target_role IS NULL AND target_user_id IS NULL)
      `;
    } else {
      await sql`
        UPDATE notifications 
        SET is_read = true 
        WHERE target_role = 'driver'
      `;
    }

    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/manager');
    return { success: true };
  } catch (error) {
    console.error('Failed to mark notifications read:', error);
    return { error: 'Failed to mark as read' };
  }
}

export async function createNotificationAction(
  title: string,
  message: string,
  targetUserId?: number | null,
  targetRole?: string | null
) {
  try {
    await ensureNotificationsTable();
    await sql`
      INSERT INTO notifications (title, message, target_user_id, target_role)
      VALUES (${title}, ${message}, ${targetUserId || null}, ${targetRole || null})
    `;
    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/manager');
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
}