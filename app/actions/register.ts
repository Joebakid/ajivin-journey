'use server';

import { revalidatePath } from 'next/cache';
import { sql } from '@/src/lib/db';
import bcrypt from 'bcryptjs';
import { ensureVehiclesTable } from './vehicle';

export type CreateAccountResponse = {
  success: boolean;
  message: string;
  credentials?: {
    name: string;
    email: string;
    phone: string;
    role: string;
    license?: string | null;
    plateNumber?: string | null;
    vehicleModel?: string | null;
    password: string;
  };
};

export async function createStaffAccount(formData: FormData): Promise<CreateAccountResponse> {
  const name = (formData.get('name') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const phone = (formData.get('phone') as string)?.trim();
  const role = (formData.get('role') as string)?.trim();
  const password = formData.get('password') as string;
  const license = role === 'manager' ? null : ((formData.get('license') as string)?.trim() || null);

  const rawPlate = (formData.get('plate_number') as string)?.trim();
  const plateNumber = rawPlate ? rawPlate.toUpperCase() : null;
  const vehicleModel = (formData.get('vehicle_model') as string)?.trim() || 'Fleet Truck / Van';

  if (!name || !email || !password || !role) {
    return { success: false, message: 'All required fields must be completed.' };
  }

  try {
    // 1. Check duplicate email
    const existingUser = await sql`
      SELECT id FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
    `;
    if (existingUser.length > 0) {
      return { success: false, message: 'An account with this email address already exists.' };
    }

    // 2. Strict plate check: 2 drivers CANNOT have the same plate number
    if (role === 'driver' && plateNumber) {
      await ensureVehiclesTable();
      const normalizedPlate = plateNumber.replace(/[\s-]/g, '');

      const existingVehicle = await sql`
        SELECT v.id, v.plate_number, u.name as driver_name
        FROM vehicles v
        LEFT JOIN users u ON v.driver_id = u.id
        WHERE UPPER(REPLACE(REPLACE(v.plate_number, ' ', ''), '-', '')) = ${normalizedPlate}
        LIMIT 1
      `;

      if (existingVehicle.length > 0) {
        const holder = existingVehicle[0].driver_name ? `driver "${existingVehicle[0].driver_name}"` : 'another vehicle';
        return {
          success: false,
          message: `Plate number "${plateNumber}" is already in use by ${holder}. Two drivers cannot have the same plate number.`,
        };
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const insertedUser = await sql`
      INSERT INTO users (name, email, phone, license_number, role, password_hash, is_online)
      VALUES (${name}, ${email}, ${phone}, ${license}, ${role}, ${passwordHash}, FALSE)
      RETURNING id
    `;

    const newUserId = insertedUser[0]?.id;

    if (role === 'driver' && newUserId && plateNumber) {
      await ensureVehiclesTable();
      await sql`
        INSERT INTO vehicles (driver_id, plate_number, model, is_active)
        VALUES (${newUserId}, ${plateNumber}, ${vehicleModel}, TRUE)
      `;
    }

    revalidatePath('/dashboard/manager');
    return {
      success: true,
      message: `Account for ${name} created successfully!`,
      credentials: {
        name,
        email,
        phone,
        role,
        license,
        plateNumber,
        vehicleModel,
        password,
      },
    };
  } catch (error) {
    console.error('Failed to create account:', error);
    return { success: false, message: 'Database error occurred while creating the account.' };
  }
}