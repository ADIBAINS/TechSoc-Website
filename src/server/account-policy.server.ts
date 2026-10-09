// This identity is reserved. Owner is derived, never an assignable DB role.
export const OWNER_EMAIL = 'adibains06@gmail.com'

type Account = { email: string; role: string | null }
export type AccountRole = 'owner' | 'admin' | 'editor'

export function isOwnerAccount(account: { email: string }): boolean {
  return account.email.trim().toLowerCase() === OWNER_EMAIL
}

export function accountRole(account: Account): AccountRole {
  if (isOwnerAccount(account)) return 'owner'
  return account.role === 'editor' ? 'editor' : 'admin'
}

export function canManageAccount(actor: Account, target: Account): boolean {
  const actorRole = accountRole(actor)
  const targetRole = accountRole(target)
  if (targetRole === 'owner') return false
  return actorRole === 'owner' || (actorRole === 'admin' && targetRole === 'editor')
}
