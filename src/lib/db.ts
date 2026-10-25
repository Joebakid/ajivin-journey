import { neon } from '@neondatabase/serverless';

// Ensure the DATABASE_URL is loaded from your .env file
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be a Neon postgres string');
}

export const sql = neon(process.env.DATABASE_URL);
