'use server';

import { sql } from '@/src/lib/db';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

export async function handleLogin(formData: FormData) {
  const email = (formData.get('email') as string)?.trim();
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Please fill in all required fields.' };
  }

  let redirectUrl: string | null = null;

  try {
    // 1. Fetch user by email
    const userResult = await sql`
      SELECT id, name, email, role, password_hash 
      FROM users 
      WHERE LOWER(email) = LOWER(${email}) 
      LIMIT 1
    `;

    const user = userResult[0];

    if (!user) {
      return { error: 'Invalid email address or password.' };
    }

    // 2. Verify hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return { error: 'Invalid email address or password.' };
    }

    // 3. Update database presence (Set user online upon successful login)
    await sql`
      UPDATE users 
      SET is_online = TRUE, last_seen = CURRENT_TIMESTAMP 
      WHERE id = ${user.id}
    `;

    // 4. Store authenticated user identity in HTTP-only cookies
    try {
      const cookieStore = await cookies();
      cookieStore.set('userId', String(user.id), {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
      cookieStore.set('userRole', String(user.role), {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
      });
    } catch (cookieErr) {
      console.warn('Could not set session cookies:', cookieErr);
    }

    // 5. Purge stale caches across both portals
    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/manager');

    // 6. Assign target dashboard URL
    redirectUrl =
      user.role === 'manager'
        ? `/dashboard/manager?userId=${user.id}`
        : `/dashboard/driver?userId=${user.id}`;
  } catch (error) {
    console.error('Login action error:', error);
    return { error: 'An unexpected authentication error occurred. Please try again.' };
  }

  // Next.js redirect must be called outside try/catch
  if (redirectUrl) {
    redirect(redirectUrl);
  }
}

// Handler to mark user offline and clear session cookies on Logout
export async function handleLogoutAction(userId?: number) {
  try {
    if (userId) {
      await sql`
        UPDATE users 
        SET is_online = FALSE, last_seen = CURRENT_TIMESTAMP 
        WHERE id = ${userId}
      `;
    }

    try {
      const cookieStore = await cookies();
      cookieStore.delete('userId');
      cookieStore.delete('userRole');
    } catch (e) {
      console.warn('Could not clear cookies:', e);
    }

    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/manager');
  } catch (error) {
    console.error('Failed to update logout status:', error);
  }
}