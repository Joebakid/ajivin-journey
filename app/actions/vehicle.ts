'use server';

import { sql } from '@/src/lib/db';
import { revalidatePath } from 'next/cache';
import { ensureNotificationsTable } from './notification';

export async function ensureVehiclesTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS vehicles (
      id SERIAL PRIMARY KEY,
      driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      plate_number VARCHAR(100) NOT NULL,
      model VARCHAR(150) NOT NULL DEFAULT 'Standard Fleet Vehicle',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  try {
    await sql`ALTER TABLE vehicles ALTER COLUMN driver_id DROP NOT NULL`;
  } catch (_) {}

  await sql`
    CREATE TABLE IF NOT EXISTS vehicle_expenses (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      expense_type VARCHAR(100) NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      description TEXT,
      logged_by_name VARCHAR(150) DEFAULT 'Manager',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

export async function getDriverVehiclesAction(driverId: number) {
  try {
    await ensureVehiclesTable();
    const rows = await sql`
      SELECT id, plate_number, model, is_active, created_at
      FROM vehicles
      WHERE driver_id = ${driverId}
      ORDER BY is_active DESC, created_at DESC
    `;
    return { success: true, vehicles: rows };
  } catch (error) {
    console.error('Failed to get driver vehicles:', error);
    return { success: false, vehicles: [] };
  }
}

// Manager registers a vehicle directly with duplicate plate check
export async function createVehicleDirectAction(formData: FormData) {
  const rawPlate = (formData.get('plate_number') as string)?.trim();
  const plateNumber = rawPlate ? rawPlate.toUpperCase() : null;
  const model = (formData.get('model') as string)?.trim() || 'Fleet Truck / Van';
  const driverIdRaw = formData.get('driver_id') as string;
  const driverId = driverIdRaw && driverIdRaw !== 'unassigned' ? parseInt(driverIdRaw, 10) : null;

  if (!plateNumber) return { success: false, message: 'Plate number is required.' };

  try {
    await ensureVehiclesTable();
    const normalizedPlate = plateNumber.replace(/[\s-]/g, '');

    // Reject duplicate plate
    const duplicate = await sql`
      SELECT v.id, v.plate_number, u.name as driver_name
      FROM vehicles v
      LEFT JOIN users u ON v.driver_id = u.id
      WHERE UPPER(REPLACE(REPLACE(v.plate_number, ' ', ''), '-', '')) = ${normalizedPlate}
      LIMIT 1
    `;

    if (duplicate.length > 0) {
      const holder = duplicate[0].driver_name
        ? `driver "${duplicate[0].driver_name}"`
        : 'another vehicle in the fleet';
      return {
        success: false,
        message: `Plate number "${plateNumber}" already exists (assigned to ${holder}). Two vehicles cannot share the same plate number. Please correct it.`,
      };
    }

    if (driverId) {
      await sql`UPDATE vehicles SET is_active = FALSE WHERE driver_id = ${driverId}`;
    }

    await sql`
      INSERT INTO vehicles (driver_id, plate_number, model, is_active)
      VALUES (${driverId}, ${plateNumber}, ${model}, TRUE)
    `;

    if (driverId) {
      try {
        await ensureNotificationsTable();
        await sql`
          INSERT INTO notifications (title, message, target_user_id, target_role)
          VALUES (
            'Vehicle Assigned',
            ${`You have been assigned vehicle ${model} (${plateNumber}) by logistics management.`},
            ${driverId},
            'driver'
          )
        `;
      } catch (err) {
        console.error('Failed to notify driver:', err);
      }
    }

    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/driver');
    return { success: true, message: `Vehicle ${plateNumber} registered successfully.` };
  } catch (error) {
    console.error('Failed to register vehicle:', error);
    return { success: false, message: 'Database error occurred while adding vehicle.' };
  }
}

// Manager edits plate number or model with strict duplicate checking
export async function updateVehicleDetailsAction(formData: FormData) {
  const vehicleId = parseInt(formData.get('vehicle_id') as string, 10);
  const rawPlate = (formData.get('plate_number') as string)?.trim();
  const plateNumber = rawPlate ? rawPlate.toUpperCase() : null;
  const model = (formData.get('model') as string)?.trim() || 'Fleet Truck / Van';

  if (!vehicleId || !plateNumber) {
    return { success: false, message: 'Plate number is required.' };
  }

  try {
    await ensureVehiclesTable();
    const normalizedPlate = plateNumber.replace(/[\s-]/g, '');

    // Check duplicate plate against all OTHER vehicles
    const duplicate = await sql`
      SELECT v.id, v.plate_number, u.name as driver_name
      FROM vehicles v
      LEFT JOIN users u ON v.driver_id = u.id
      WHERE UPPER(REPLACE(REPLACE(v.plate_number, ' ', ''), '-', '')) = ${normalizedPlate}
        AND v.id != ${vehicleId}
      LIMIT 1
    `;

    if (duplicate.length > 0) {
      const holder = duplicate[0].driver_name
        ? `driver "${duplicate[0].driver_name}"`
        : 'another vehicle in the fleet';
      return {
        success: false,
        message: `Plate number "${plateNumber}" is already in use by ${holder}. Two vehicles cannot have the same plate number. Please correct it.`,
      };
    }

    const oldRows = await sql`SELECT driver_id, plate_number FROM vehicles WHERE id = ${vehicleId}`;
    const oldVehicle = oldRows[0];

    await sql`
      UPDATE vehicles
      SET plate_number = ${plateNumber}, model = ${model}
      WHERE id = ${vehicleId}
    `;

    // Notify driver if plate changed
    if (oldVehicle?.driver_id && oldVehicle.plate_number !== plateNumber) {
      try {
        await ensureNotificationsTable();
        await sql`
          INSERT INTO notifications (title, message, target_user_id, target_role)
          VALUES (
            'Vehicle Plate Updated',
            ${`Your assigned vehicle plate was updated from ${oldVehicle.plate_number} to ${plateNumber}.`},
            ${oldVehicle.driver_id},
            'driver'
          )
        `;
      } catch (err) {
        console.error('Failed to notify driver:', err);
      }
    }

    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/driver');
    return { success: true, message: `Vehicle updated to ${plateNumber} successfully.` };
  } catch (error) {
    console.error('Failed to update vehicle:', error);
    return { success: false, message: 'Database error occurred while updating vehicle.' };
  }
}

// Manager deletes a vehicle permanently
export async function deleteVehicleAction(formData: FormData) {
  const vehicleId = parseInt(formData.get('vehicle_id') as string, 10);
  if (!vehicleId) return { success: false, message: 'Invalid vehicle ID.' };

  try {
    await ensureVehiclesTable();

    const vehicleRows = await sql`
      SELECT id, driver_id, plate_number, model FROM vehicles WHERE id = ${vehicleId}
    `;
    const vehicle = vehicleRows[0];

    if (vehicle?.driver_id) {
      try {
        await ensureNotificationsTable();
        await sql`
          INSERT INTO notifications (title, message, target_user_id, target_role)
          VALUES (
            'Vehicle Decommissioned',
            ${`Your assigned vehicle ${vehicle.model} (${vehicle.plate_number}) has been removed from the fleet by logistics management.`},
            ${vehicle.driver_id},
            'driver'
          )
        `;
      } catch (err) {
        console.error('Failed to notify driver:', err);
      }
    }

    // Cascade deletes expenses
    await sql`DELETE FROM vehicle_expenses WHERE vehicle_id = ${vehicleId}`;
    await sql`DELETE FROM vehicles WHERE id = ${vehicleId}`;

    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/driver');
    return { success: true, message: `Vehicle ${vehicle?.plate_number || ''} was deleted successfully.` };
  } catch (error) {
    console.error('Failed to delete vehicle:', error);
    return { success: false, message: 'Failed to delete vehicle from the database.' };
  }
}

export async function addOrUpdateVehicleAction(formData: FormData) {
  const driverId = parseInt(formData.get('driver_id') as string, 10);
  const rawPlate = (formData.get('plate_number') as string)?.trim();
  const plateNumber = rawPlate ? rawPlate.toUpperCase() : null;
  const model = (formData.get('model') as string)?.trim() || 'Fleet Truck / Van';

  if (!driverId || !plateNumber) return;

  await ensureVehiclesTable();
  const normalizedPlate = plateNumber.replace(/[\s-]/g, '');

  const duplicate = await sql`
    SELECT id, driver_id FROM vehicles
    WHERE UPPER(REPLACE(REPLACE(plate_number, ' ', ''), '-', '')) = ${normalizedPlate}
      AND driver_id != ${driverId}
    LIMIT 1
  `;
  if (duplicate.length > 0) return;

  await sql`UPDATE vehicles SET is_active = FALSE WHERE driver_id = ${driverId}`;
  await sql`
    INSERT INTO vehicles (driver_id, plate_number, model, is_active)
    VALUES (${driverId}, ${plateNumber}, ${model}, TRUE)
  `;

  try {
    const driverRows = await sql`SELECT name FROM users WHERE id = ${driverId}`;
    const driverName = driverRows[0]?.name || 'Driver';

    await ensureNotificationsTable();
    await sql`
      INSERT INTO notifications (title, message, target_role)
      VALUES (
        'Vehicle Plate Updated',
        ${`${driverName} updated their vehicle to ${model} (${plateNumber}).`},
        'manager'
      )
    `;
  } catch (err) {
    console.error('Failed to dispatch notification:', err);
  }

  revalidatePath('/dashboard/driver');
  revalidatePath('/dashboard/manager');
}

export async function switchActiveVehicleAction(formData: FormData) {
  const driverId = parseInt(formData.get('driver_id') as string, 10);
  const vehicleId = parseInt(formData.get('vehicle_id') as string, 10);
  if (!driverId || !vehicleId) return;

  await ensureVehiclesTable();
  await sql`UPDATE vehicles SET is_active = FALSE WHERE driver_id = ${driverId}`;
  await sql`UPDATE vehicles SET is_active = TRUE WHERE id = ${vehicleId} AND driver_id = ${driverId}`;

  revalidatePath('/dashboard/driver');
  revalidatePath('/dashboard/manager');
}

export async function assignVehicleDriverAction(formData: FormData) {
  const vehicleId = parseInt(formData.get('vehicle_id') as string, 10);
  const driverIdRaw = formData.get('driver_id') as string;
  const driverId = driverIdRaw && driverIdRaw !== 'unassigned' ? parseInt(driverIdRaw, 10) : null;

  if (!vehicleId) return;

  await ensureVehiclesTable();

  const vehicleRows = await sql`
    SELECT id, driver_id, plate_number, model FROM vehicles WHERE id = ${vehicleId}
  `;
  const vehicle = vehicleRows[0];
  const prevDriverId = vehicle?.driver_id;

  if (driverId) {
    await sql`UPDATE vehicles SET is_active = FALSE WHERE driver_id = ${driverId}`;
    await sql`
      UPDATE vehicles
      SET driver_id = ${driverId}, is_active = TRUE
      WHERE id = ${vehicleId}
    `;

    try {
      await ensureNotificationsTable();
      await sql`
        INSERT INTO notifications (title, message, target_user_id, target_role)
        VALUES (
          'Vehicle Assigned',
          ${`You have been assigned vehicle ${vehicle.model} (${vehicle.plate_number}) by logistics management.`},
          ${driverId},
          'driver'
        )
      `;
    } catch (err) {
      console.error('Failed to notify driver:', err);
    }
  } else {
    await sql`
      UPDATE vehicles
      SET driver_id = NULL, is_active = FALSE
      WHERE id = ${vehicleId}
    `;
  }

  if (prevDriverId && prevDriverId !== driverId) {
    try {
      await ensureNotificationsTable();
      await sql`
        INSERT INTO notifications (title, message, target_user_id, target_role)
        VALUES (
          'Vehicle Reassigned',
          ${`You have been unassigned from vehicle ${vehicle.model} (${vehicle.plate_number}).`},
          ${prevDriverId},
          'driver'
        )
      `;
    } catch (err) {
      console.error('Failed to notify previous driver:', err);
    }
  }

  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/driver');
}

export async function addVehicleExpenseAction(formData: FormData) {
  const vehicleId = parseInt(formData.get('vehicle_id') as string, 10);
  const expenseType = (formData.get('expense_type') as string)?.trim();
  const amount = parseFloat(formData.get('amount') as string);
  const description = (formData.get('description') as string)?.trim() || '';
  const loggedByName = (formData.get('logged_by_name') as string)?.trim() || 'Manager';

  if (!vehicleId || isNaN(amount) || !expenseType) return;

  await ensureVehiclesTable();

  await sql`
    INSERT INTO vehicle_expenses (vehicle_id, expense_type, amount, description, logged_by_name)
    VALUES (${vehicleId}, ${expenseType}, ${amount}, ${description}, ${loggedByName})
  `;

  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/driver');
}

export async function deleteVehicleExpenseAction(formData: FormData) {
  const expenseId = parseInt(formData.get('expense_id') as string, 10);
  if (!expenseId) return;

  await ensureVehiclesTable();
  await sql`DELETE FROM vehicle_expenses WHERE id = ${expenseId}`;

  revalidatePath('/dashboard/manager');
}

export async function toggleVehicleStatusAction(formData: FormData) {
  const vehicleId = parseInt(formData.get('vehicle_id') as string, 10);
  const currentStatus = formData.get('current_status') === 'true';

  if (!vehicleId) return;

  await ensureVehiclesTable();
  await sql`UPDATE vehicles SET is_active = ${!currentStatus} WHERE id = ${vehicleId}`;

  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/driver');
}