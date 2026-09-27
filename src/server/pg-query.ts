import type { SqlValue } from './db.server'
import { neon } from '@neondatabase/serverless'

let sql: ReturnType<typeof neon> | null = null

function getSql() {
  if (!sql) sql = neon(process.env.DATABASE_URL!)
  return sql
}

/** Parameterized query against Neon Postgres. `text` uses $1, $2 placeholders. */
export async function neonQuery<T = Record<string, unknown>>(text: string, params: SqlValue[] = []): Promise<T[]> {
  const client = getSql() as unknown as {
    query?: (text: string, params: unknown[]) => Promise<T[] | { rows: T[] }>
  }
  if (typeof client.query !== 'function') {
    throw new Error('Neon driver .query() not available — check @neondatabase/serverless version')
  }
  const result = await client.query(text, params as unknown[])
  // Some drivers return { rows }, others return rows directly.
  if (Array.isArray(result)) return result as T[]
  if (result && Array.isArray((result as { rows: T[] }).rows)) return (result as { rows: T[] }).rows
  return []
}
