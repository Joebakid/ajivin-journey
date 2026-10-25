import { neon } from "@neondatabase/serverless"

// Note: Use process.env.DATABASE_URL for Next.js/Node environments
// Use import.meta.env.VITE_DATABASE_URL for Vite environments 
// (Warning: Be careful not to expose your Postgres credentials to the client in a SPA!)
const connectionString = process.env.DATABASE_URL || import.meta.env.VITE_DATABASE_URL

if (!connectionString) {
  throw new Error("Neon connection string is missing. Please check your environment variables.")
}

export const sql = neon(connectionString)
