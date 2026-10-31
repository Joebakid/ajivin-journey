'use server';

import { sql } from '@/src/lib/db';
import { revalidatePath } from 'next/cache';
import { ensureNotificationsTable } from './notification';
import { ensureVehiclesTable } from './vehicle';
import { ensureTripsTable } from './trip';

export async function ensureStaffTables() {
  await ensureNotificationsTable();
  await ensureVehiclesTable();
  await ensureTripsTable();

  await sql`
    CREATE TABLE IF NOT EXISTS trip_comments (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_name VARCHAR(150) NOT NULL,
      comment TEXT NOT NULL,
      rating INTEGER DEFAULT 5,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS driver_reports (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      staff_name VARCHAR(150) NOT NULL,
      driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      driver_name VARCHAR(150) NOT NULL,
      plate_number VARCHAR(100),
      incident_type VARCHAR(100) NOT NULL,
      description TEXT NOT NULL,
      status VARCHAR(50) DEFAULT 'Pending Review',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

export async function bookStaffTripAction(formData: FormData) {
  const staffId = parseInt(formData.get('staff_id') as string, 10);
  const destination = (formData.get('destination') as string)?.trim();
  const purpose = (formData.get('purpose') as string)?.trim();
  const passengers = (formData.get('passengers') as string)?.trim() || '1';
  const preferredTime = (formData.get('preferred_time') as string)?.trim() || 'Immediate';

  if (!staffId || !destination || !purpose) {
    return { success: false, message: 'Destination and purpose are required.' };
  }

  try {
    await ensureStaffTables();

    const staffRows = await sql`SELECT name FROM users WHERE id = ${staffId}`;
    const staffName = staffRows[0]?.name || 'Staff Member';

    const fullDestination = `${destination} (Staff: ${staffName}, ${passengers} passenger(s)) - ${purpose} [Time: ${preferredTime}]`;

    await sql`
      INSERT INTO trips (destination, status, requester_id, scheduled_time, created_at)
      VALUES (${fullDestination}, 'Pending', ${staffId}, ${preferredTime}, NOW())
    `;

    await sql`
      INSERT INTO notifications (title, message, target_role)
      VALUES (
        'New Staff Trip Booking',
        ${`${staffName} requested official transport to ${destination} (Scheduled: ${preferredTime}). Driver assignment required.`},
        'manager'
      )
    `;

    revalidatePath('/dashboard/staff');
    revalidatePath('/dashboard/manager');
    return { success: true, message: 'Your trip request has been submitted for manager approval.' };
  } catch (error) {
    console.error('Failed to book staff trip:', error);
    return { success: false, message: 'Failed to submit booking request.' };
  }
}

export async function addTripCommentAction(formData: FormData) {
  const tripId = parseInt(formData.get('trip_id') as string, 10);
  const staffId = parseInt(formData.get('staff_id') as string, 10);
  const comment = (formData.get('comment') as string)?.trim();
  const rating = parseInt(formData.get('rating') as string, 10) || 5;

  if (!tripId || !staffId || !comment) {
    return { success: false, message: 'Trip ID and comment are required.' };
  }

  try {
    await ensureStaffTables();

    const staffRows = await sql`SELECT name FROM users WHERE id = ${staffId}`;
    const staffName = staffRows[0]?.name || 'Staff Member';

    await sql`
      INSERT INTO trip_comments (trip_id, user_id, user_name, comment, rating)
      VALUES (${tripId}, ${staffId}, ${staffName}, ${comment}, ${rating})
    `;

    revalidatePath('/dashboard/staff');
    revalidatePath('/dashboard/manager');
    return { success: true, message: 'Comment submitted successfully.' };
  } catch (error) {
    console.error('Failed to add trip comment:', error);
    return { success: false, message: 'Failed to submit comment.' };
  }
}

export async function reportDriverAction(formData: FormData) {
  const staffId = parseInt(formData.get('staff_id') as string, 10);
  const driverIdRaw = formData.get('driver_id') as string;
  const driverId = driverIdRaw ? parseInt(driverIdRaw, 10) : null;
  const driverNameInput = (formData.get('driver_name') as string)?.trim();
  const plateNumber = (formData.get('plate_number') as string)?.trim().toUpperCase() || 'N/A';
  const incidentType = (formData.get('incident_type') as string)?.trim();
  const description = (formData.get('description') as string)?.trim();

  if (!staffId || !incidentType || !description) {
    return { success: false, message: 'Please specify the incident type and provide details.' };
  }

  try {
    await ensureStaffTables();

    const staffRows = await sql`SELECT name FROM users WHERE id = ${staffId}`;
    const staffName = staffRows[0]?.name || 'Staff';

    let finalDriverName = driverNameInput || 'Unspecified Driver';
    if (driverId) {
      const dRows = await sql`SELECT name FROM users WHERE id = ${driverId}`;
      if (dRows.length > 0) finalDriverName = dRows[0].name;
    }

    await sql`
      INSERT INTO driver_reports (staff_id, staff_name, driver_id, driver_name, plate_number, incident_type, description)
      VALUES (${staffId}, ${staffName}, ${driverId}, ${finalDriverName}, ${plateNumber}, ${incidentType}, ${description})
    `;

    await sql`
      INSERT INTO notifications (title, message, target_role)
      VALUES (
        'Driver Incident Report',
        ${`${staffName} filed a report against driver ${finalDriverName} (${incidentType}).`},
        'manager'
      )
    `;

    revalidatePath('/dashboard/staff');
    revalidatePath('/dashboard/manager');
    return { success: true, message: 'Driver report submitted to Logistics Management for investigation.' };
  } catch (error) {
    console.error('Failed to report driver:', error);
    return { success: false, message: 'Failed to submit driver report.' };
  }
}

export async function reportStaffVehicleExpenseAction(formData: FormData) {
  const staffId = parseInt(formData.get('staff_id') as string, 10);
  const vehicleId = parseInt(formData.get('vehicle_id') as string, 10);
  const expenseType = (formData.get('expense_type') as string)?.trim();
  const amount = parseFloat(formData.get('amount') as string);
  const description = (formData.get('description') as string)?.trim() || '';

  if (!staffId || !vehicleId || isNaN(amount) || !expenseType) {
    return { success: false, message: 'Vehicle, category, and a valid amount are required.' };
  }

  try {
    await ensureStaffTables();

    const staffRows = await sql`SELECT name FROM users WHERE id = ${staffId}`;
    const staffName = staffRows[0]?.name || 'Staff';

    await sql`
      INSERT INTO vehicle_expenses (vehicle_id, expense_type, amount, description, logged_by_name)
      VALUES (${vehicleId}, ${expenseType}, ${amount}, ${description}, ${staffName + ' (Staff)'})
    `;

    const vRows = await sql`SELECT plate_number FROM vehicles WHERE id = ${vehicleId}`;
    const plate = vRows[0]?.plate_number || 'Vehicle';

    await sql`
      INSERT INTO notifications (title, message, target_role)
      VALUES (
        'Vehicle Expense Logged',
        ${`${staffName} logged a ${expenseType} expense of ₦${amount.toLocaleString()} for vehicle ${plate}.`},
        'manager'
      )
    `;

    revalidatePath('/dashboard/staff');
    revalidatePath('/dashboard/manager');
    return { success: true, message: `Expense of ₦${amount.toLocaleString()} logged for vehicle ${plate}.` };
  } catch (error) {
    console.error('Failed to log staff vehicle expense:', error);
    return { success: false, message: 'Failed to record vehicle expense.' };
  }
}