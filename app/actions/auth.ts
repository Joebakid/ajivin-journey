'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@/src/lib/db';

const SESSION_COOKIE_NAME = 'ajivin_session_id';

// Set secure HTTP-only cookie upon login
export async function createSession(userId: number) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, String(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // Valid for 7 days
  });
}

// Read and verify the authenticated user from the cookie
export async function getAuthSession(requiredRole?: 'driver' | 'manager') {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const userId = parseInt(sessionCookie.value, 10);
  if (isNaN(userId)) return null;

  try {
    const rows = await sql`
      SELECT id, name, email, phone, role, license_number 
      FROM users 
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (rows.length === 0) return null;

    const user = rows[0];
    if (requiredRole && user.role !== requiredRole) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Failed to verify session:', error);
    return null;
  }
}

// Clear session cookie and update database online status
export async function handleLogoutAction(userId?: number) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
    const targetId = userId || (sessionCookie?.value ? parseInt(sessionCookie.value, 10) : null);

    if (targetId) {
      await sql`
        UPDATE users 
        SET is_online = FALSE, last_seen = CURRENT_TIMESTAMP 
        WHERE id = ${targetId}
      `;
    }

    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch (error) {
    console.error('Failed to update logout status:', error);
  }

  redirect('/login');
}