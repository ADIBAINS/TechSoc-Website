import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Exercise the real built HTTP handlers using a fresh offline SQLite database.
// No .env credentials, production connection, or existing account is used.
test('the sole owner is protected from account-management requests', { timeout: 30_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'techsoc-owner-test-'))
  const password = 'Fixture-Password-123'
  const ownerEmail = 'adibains06@gmail.com'
  const server = spawn(process.execPath, [fileURLToPath(new URL('../.output/server/index.mjs', import.meta.url))], {
    cwd: directory,
    env: { ...process.env, DATABASE_URL: '', BLOB_READ_WRITE_TOKEN: '', VERCEL: '', ADMIN_EMAIL: ownerEmail, ADMIN_PASSWORD: password, PORT: '0', NITRO_PORT: '0', HOST: '127.0.0.1', NITRO_HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stderr.on('data', (data) => { output += data })
  t.after(async () => {
    const stopped = new Promise((resolve) => server.once('exit', resolve))
    if (server.exitCode === null && server.signalCode === null) { server.kill('SIGTERM'); await stopped }
    await rm(directory, { recursive: true, force: true })
  })
  const baseURL = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Test server did not start: ${output}`)), 10_000)
    server.stdout.on('data', (data) => {
      output += data
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/)
      if (match) { clearTimeout(timer); resolve(match[0]) }
    })
    server.once('error', (error) => { clearTimeout(timer); reject(error) })
    server.once('exit', () => { clearTimeout(timer); reject(new Error(output)) })
  })
  function client() {
    let cookie = ''
    return async (path, method = 'GET', data, headers = {}) => {
      const response = await fetch(`${baseURL}${path}`, {
        method,
        headers: { 'content-type': 'application/json', cookie, ...headers },
        body: data === undefined ? undefined : JSON.stringify(data),
      })
      const session = response.headers.get('set-cookie')
      if (session) cookie = session.split(';')[0]
      return { status: response.status, body: await response.json().catch(() => null) }
    }
  }
  const owner = client(), admin = client(), editor = client(), anonymous = client()
  const login = (send, email, accountPassword = password) => send('/api/auth', 'POST', { email, password: accountPassword })
  const invite = (send, email, role) => send('/api/admins', 'POST', { email, role, password })
  const ownerLogin = await login(owner, ownerEmail)
  assert.equal(ownerLogin.status, 200)
  assert.equal(ownerLogin.body.admin.role, 'owner')
  const ownerId = ownerLogin.body.admin.id
  const adminAccount = await invite(owner, 'admin@example.com', 'admin')
  const peerAccount = await invite(owner, 'peer@example.com', 'admin')
  const editorAccount = await invite(owner, 'editor@example.com', 'editor')
  for (const account of [adminAccount, peerAccount, editorAccount]) assert.equal(account.status, 201)
  assert.equal((await login(admin, 'admin@example.com')).body.admin.role, 'admin')
  assert.equal((await login(editor, 'editor@example.com')).body.admin.role, 'editor')

  await t.test('owner privileges cannot be assigned or claimed', async () => {
    assert.equal((await invite(owner, 'other-owner@example.com', 'owner')).status, 400)
    assert.equal((await invite(admin, 'other-owner@example.com', 'owner')).status, 400)
    assert.equal((await invite(admin, ' ADIBAINS06@gmail.com ', 'editor')).status, 403)
    assert.equal((await invite(owner, ownerEmail, 'admin')).status, 403)
    assert.equal((await invite(admin, 'new-admin@example.com', 'admin')).status, 403)
    assert.equal((await invite(admin, 'new-editor@example.com', 'editor')).status, 201)
    const directory = await owner('/api/admins')
    assert.equal(directory.body.filter((account) => account.role === 'owner').length, 1)
    assert.ok(directory.body.every((account) => !('password_hash' in account)))
  })
  await t.test('direct API calls cannot reset or delete the owner', async () => {
    const reset = { id: ownerId, currentPassword: password, newPassword: 'Unauthorized-Password-456', role: 'owner' }
    assert.equal((await anonymous('/api/admins', 'PUT', reset)).status, 403)
    assert.equal((await editor('/api/admins', 'PUT', reset)).status, 403)
    assert.equal((await admin('/api/admins', 'PUT', reset)).status, 403)
    assert.equal((await admin('/api/admins', 'DELETE', { id: ownerId })).status, 403)
    assert.equal((await owner('/api/admins', 'DELETE', { id: ownerId })).status, 400)
    assert.equal((await owner('/api/auth')).body.admin.role, 'owner')
    assert.equal((await login(client(), ownerEmail)).status, 200)
    assert.equal((await login(client(), ownerEmail, reset.newPassword)).status, 401)
  })
  await t.test('only the owner manages admin-level accounts', async () => {
    const reset = { id: peerAccount.body.id, currentPassword: password, newPassword: 'Peer-Password-456' }
    assert.equal((await admin('/api/admins', 'PUT', reset)).status, 403)
    assert.equal((await admin('/api/admins', 'DELETE', { id: peerAccount.body.id })).status, 403)
    assert.equal((await owner('/api/admins', 'PUT', reset, { origin: 'https://evil.example' })).status, 403)
    assert.equal((await owner('/api/admins', 'PUT', reset)).status, 200)
    assert.equal((await login(client(), 'peer@example.com', reset.newPassword)).status, 200)
    assert.equal((await owner('/api/admins', 'DELETE', { id: peerAccount.body.id })).status, 200)
    const editorReset = { id: editorAccount.body.id, currentPassword: password, newPassword: 'Editor-Password-456' }
    assert.equal((await admin('/api/admins', 'PUT', editorReset)).status, 200)
    assert.equal((await editor('/api/auth')).body.admin, null)
    assert.equal((await admin('/api/admins', 'DELETE', { id: editorAccount.body.id })).status, 200)
  })
  await t.test('the owner keeps full access and changes only their own password', async () => {
    assert.equal((await owner('/api/settings', 'PUT', { test_owner_permission: true })).status, 200)
    const change = { currentPassword: 'wrong', newPassword: 'Owner-Password-789', id: adminAccount.body.id, role: 'owner' }
    assert.equal((await owner('/api/auth', 'PUT', change)).status, 403)
    assert.equal((await owner('/api/auth', 'PUT', { ...change, currentPassword: password })).status, 200)
    assert.equal((await login(client(), ownerEmail)).status, 401)
    const result = await login(client(), ownerEmail, change.newPassword)
    assert.equal(result.status, 200)
    assert.equal(result.body.admin.role, 'owner')
    assert.equal((await login(client(), 'admin@example.com')).body.admin.role, 'admin')
  })
})
