'use server';

import { sql } from '@/src/lib/db';
import { revalidatePath } from 'next/cache';

// Automatically add the vehicle_plate column if it doesn't exist yet
async function ensureVehiclePlateColumn() {
  try {
    await sql`ALTER TABLE expenses ADD COLUMN vehicle_plate VARCHAR(50)`;
  } catch {
    // Column already exists, safe to ignore
  }
}

export async function submitExpenseAction(formData: FormData) {
  await ensureVehiclePlateColumn();

  const expenseIdRaw = formData.get('expense_id');
  const expenseId = expenseIdRaw ? parseInt(expenseIdRaw as string, 10) : null;
  const driverId = parseInt(formData.get('driver_id') as string, 10);
  const expenseType = (formData.get('expense_type') || formData.get('category') || 'Maintenance') as string;
  const amount = parseFloat(formData.get('amount') as string) || 0;
  const description = (formData.get('description') as string) || '';
  
  // Normalize the plate: Remove all spaces and special characters, make uppercase
  const rawPlate = (formData.get('vehicle_plate') as string) || '';
  const vehiclePlate = rawPlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  if (!driverId || isNaN(amount) || !vehiclePlate) {
    return { success: false, error: 'Missing required fields (including Vehicle Plate)' };
  }

  try {
    if (expenseId) {
      // Update existing expense (if submitted via the main form with an ID)
      try {
        await sql`
          UPDATE expenses 
          SET expense_type = ${expenseType}, amount = ${amount}, description = ${description}, vehicle_plate = ${vehiclePlate}
          WHERE id = ${expenseId}
        `;
      } catch {
        await sql`
          UPDATE expenses 
          SET category = ${expenseType}, amount = ${amount}, description = ${description}, vehicle_plate = ${vehiclePlate}
          WHERE id = ${expenseId}
        `;
      }
    } else {
      // Insert new expense
      try {
        await sql`
          INSERT INTO expenses (driver_id, expense_type, amount, description, vehicle_plate)
          VALUES (${driverId}, ${expenseType}, ${amount}, ${description}, ${vehiclePlate})
        `;
      } catch {
        await sql`
          INSERT INTO expenses (driver_id, category, amount, description, vehicle_plate)
          VALUES (${driverId}, ${expenseType}, ${amount}, ${description}, ${vehiclePlate})
        `;
      }

      // Fetch driver name and send notification to the manager
      try {
        const userResult = await sql`SELECT name FROM users WHERE id = ${driverId}`;
        const driverName = userResult[0]?.name || 'A driver';

        await sql`
          INSERT INTO notifications (title, message, target_role)
          VALUES (
            'New Expense Logged',
            ${`${driverName} submitted a ₦${amount.toLocaleString()} expense for vehicle ${vehiclePlate}.`},
            'manager'
          )
        `;
      } catch (notifError) {
        console.error('Failed to insert notification:', notifError);
      }
    }

    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/driver');
    return { success: true };
  } catch (error) {
    console.error('Failed to save expense:', error);
    return { success: false, error: 'Failed to save expense' };
  }
}

// Alias to prevent breaking any other components using the old name
export const saveExpenseAction = submitExpenseAction;

// Allows either the manager or driver to correct the pricing AND the plate number inline
export async function editExpenseDetailsAction(expenseId: number, newAmount: number, newPlate: string) {
  try {
    await ensureVehiclePlateColumn();
    const vehiclePlate = newPlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    
    await sql`
      UPDATE expenses 
      SET amount = ${newAmount}, vehicle_plate = ${vehiclePlate} 
      WHERE id = ${expenseId}
    `;
    
    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/driver');
    return { success: true };
  } catch (error) {
    console.error('Failed to edit expense details:', error);
    return { success: false, error: 'Failed to update expense details' };
  }
}

// Fetches the driver's expense history so they have a copy
export async function getDriverExpensesAction(driverId: number) {
  try {
    await ensureVehiclePlateColumn();
    const rows = await sql`SELECT * FROM expenses WHERE driver_id = ${driverId} ORDER BY created_at DESC`;
    return { success: true, expenses: rows };
  } catch (error) {
    console.error('Failed to fetch expenses:', error);
    return { success: false, expenses: [] };
  }
}

export async function deleteExpenseAction(expenseId: number) {
  try {
    await sql`DELETE FROM expenses WHERE id = ${expenseId}`;
    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/driver');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete expense:', error);
    return { error: 'Failed to delete expense' };
  }
}