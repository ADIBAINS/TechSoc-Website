// In-memory fixed-window rate limiter.
// NOTE: on serverless (Vercel Fluid) each isolate keeps its own counters, so a
// determined attacker can spread requests across instances. This stops casual
// abuse and credential-stuffing bursts; for durable limits add Redis/Upstash
// behind an env var (see OVERVIEW.md).
type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

// Opportunistic cleanup so the map can't grow forever on long-lived servers.
let lastSweep = Date.now()
function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

export function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now()
  sweep(now)
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSec: 0 }
  }
  bucket.count += 1
  if (bucket.count > limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }
  return { allowed: true, retryAfterSec: 0 }
}

export function rateLimitResponse(retryAfterSec: number): Response {
  return new Response(JSON.stringify({ error: 'Too many requests, slow down.' }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(retryAfterSec) },
  })
}
