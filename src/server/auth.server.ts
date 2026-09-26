import { randomBytes } from 'node:crypto'
import { db, ensureAdmin } from './db.server'

const sessionDuration = 1000 * 60 * 60 * 24 * 14

export function authenticate(request: Request) {
  ensureAdmin()
  const token = request.headers.get('cookie')?.match(/techsoc_session=([^;]+)/)?.[1]
  if (!token) return null
  const session = db.prepare(`select admins.id, admins.email from sessions join admins on admins.id = sessions.admin_id where sessions.token = ? and sessions.expires_at > datetime('now')`).get(token) as { id: number; email: string } | undefined
  return session || null
}

export function createSession(adminId: number) {
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + sessionDuration).toISOString()
  db.prepare('insert into sessions (token, admin_id, expires_at) values (?, ?, ?)').run(token, adminId, expires)
  return { token, expires }
}

export function clearSession(request: Request) {
  const token = request.headers.get('cookie')?.match(/techsoc_session=([^;]+)/)?.[1]
  if (token) db.prepare('delete from sessions where token = ?').run(token)
}

export function sessionCookie(token: string, expires: string) {
  return `techsoc_session=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expires).toUTCString()}`
}
