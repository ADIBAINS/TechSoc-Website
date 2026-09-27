// Production env expectations. Local dev stays fully env-optional; on Vercel
// (VERCEL=1) a missing DATABASE_URL silently downgrades the whole site to
// ephemeral /tmp storage — this module names what's missing instead.

export function missingProdEnv(): string[] {
  if (!process.env.VERCEL) return []
  const missing: string[] = []
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL (site runs on ephemeral /tmp storage without it)')
  if (!process.env.BLOB_READ_WRITE_TOKEN) missing.push('BLOB_READ_WRITE_TOKEN (uploads fall back to ephemeral /tmp without it)')
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    missing.push('ADMIN_EMAIL/ADMIN_PASSWORD (first-boot admin seeding disabled without them)')
  }
  if (!process.env.CRON_SECRET) missing.push('CRON_SECRET (nightly cleanup cron rejects without it)')
  return missing
}

/** Loud boot-time warning on cold start (called once from db.server). */
export function warnProdEnvOnce() {
  const missing = missingProdEnv()
  if (missing.length) {
    console.error(`[techsoc] missing production env: ${missing.join('; ')}`)
  }
}
