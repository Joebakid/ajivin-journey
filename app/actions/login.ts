'use server';

import { sql } from '@/src/lib/db';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

export async function handleLogin(formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Please fill in all required fields.' };
  }

  let redirectUrl: string | null = null;

  try {
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

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return { error: 'Invalid email address or password.' };
    }

    await sql`
      UPDATE users 
      SET is_online = TRUE, last_seen = CURRENT_TIMESTAMP 
      WHERE id = ${user.id}
    `;

    const normalizedRole = (user.role || '').toLowerCase();

    try {
      const cookieStore = await cookies();
      cookieStore.set('userId', String(user.id), {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7,
      });
      cookieStore.set('userRole', normalizedRole, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7,
      });
    } catch (cookieErr) {
      console.warn('Could not set session cookies:', cookieErr);
    }

    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/staff');

    if (normalizedRole === 'manager') {
      redirectUrl = '/dashboard/manager';
    } else if (normalizedRole === 'staff') {
      redirectUrl = '/dashboard/staff';
    } else {
      redirectUrl = '/dashboard/driver';
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
      throw error;
    }
    console.error('Login action error:', error);
    return { error: 'An unexpected authentication error occurred. Please try again.' };
  }

  if (redirectUrl) {
    redirect(redirectUrl);
  }
}

export async function handleLogoutAction(userId?: number) {
  let targetId = userId;

  try {
    const cookieStore = await cookies();

    if (!targetId) {
      const cookieUserId = cookieStore.get('userId')?.value;
      if (cookieUserId) targetId = parseInt(cookieUserId, 10);
    }

    if (targetId) {
      await sql`
        UPDATE users 
        SET is_online = FALSE, last_seen = CURRENT_TIMESTAMP 
        WHERE id = ${targetId}
      `;
    }

    cookieStore.delete('userId');
    cookieStore.delete('userRole');

    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/staff');
  } catch (error) {
    console.error('Failed to update logout status:', error);
  }

  redirect('/login');
}