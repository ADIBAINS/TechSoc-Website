import { randomBytes } from 'node:crypto'
import { dbGet, dbRun, ensureAdmin, isPostgres } from './db.server'

const sessionDuration = 1000 * 60 * 60 * 24 * 14

// SQLite uses datetime('now'), Postgres uses NOW().
const nowExpr = isPostgres ? 'NOW()' : `datetime('now')`

export async function authenticate(request: Request) {
  await ensureAdmin()
  const token = request.headers.get('cookie')?.match(/techsoc_session=([^;]+)/)?.[1]
  if (!token) return null
  const session = await dbGet<{ id: number; email: string }>(
    `select admins.id, admins.email from sessions join admins on admins.id = sessions.admin_id where sessions.token = ? and sessions.expires_at > ${nowExpr}`,
    [token],
  )
  return session || null
}

export async function createSession(adminId: number) {
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + sessionDuration).toISOString()
  await dbRun('insert into sessions (token, admin_id, expires_at) values (?, ?, ?)', [token, adminId, expires])
  return { token, expires }
}

export async function clearSession(request: Request) {
  const token = request.headers.get('cookie')?.match(/techsoc_session=([^;]+)/)?.[1]
  if (token) await dbRun('delete from sessions where token = ?', [token])
}

export function sessionCookie(token: string, expires: string) {
  return `techsoc_session=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expires).toUTCString()}`
}
