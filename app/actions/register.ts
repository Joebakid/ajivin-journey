'use server';

import { redirect } from 'next/navigation';
import { sql } from '@/src/lib/db';
import bcrypt from 'bcryptjs';
import { ensureNotificationsTable } from './notification';

export async function handleRegister(formData: FormData) {
  const name = formData.get('name') as string;
  const email = formData.get('email') as string;
  const phone = formData.get('phone') as string;
  const role = formData.get('role') as string;
  const password = formData.get('password') as string;

  // Managers do not need a license number
  const license = role === 'manager' ? null : (formData.get('license') as string);

  try {
    await ensureNotificationsTable();
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await sql`
      INSERT INTO users (name, email, phone, license_number, role, password_hash)
      VALUES (${name}, ${email}, ${phone}, ${license}, ${role}, ${passwordHash})
    `;

    // Only logistics managers will see this notification
    await sql`
      INSERT INTO notifications (title, message, target_role)
      VALUES (
        'New Registration',
        ${`${name} has registered as a ${role || 'Driver'}.`},
        'manager'
      )
    `;

  } catch (error) {
    console.error('Failed to register user:', error);
    return;
  }

  redirect('/login');
}