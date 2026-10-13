import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Exercise the real built HTTP handlers using a fresh offline SQLite database.
// No .env credentials, production connection, or existing account is used.
test('inbox deletion is restricted to admins and preserves other submissions', { timeout: 30_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'techsoc-inbox-test-'))
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
  const editorAccount = await invite(owner, 'editor@example.com', 'editor')
  for (const account of [adminAccount, editorAccount]) assert.equal(account.status, 201)
  assert.equal((await login(admin, 'admin@example.com')).body.admin.role, 'admin')
  assert.equal((await login(editor, 'editor@example.com')).body.admin.role, 'editor')

  const submit = async (name) => {
    assert.equal((await anonymous('/api/contact', 'POST', { name, email: 'visitor@example.com', message: `Message from ${name}` })).status, 200)
    return (await owner('/api/contact')).body.find((message) => message.name === name).id
  }
  const first = await submit('First visitor')
  const second = await submit('Second visitor')
  const retained = await submit('Retained visitor')

  await t.test('anonymous users and editors cannot delete, while editors can still read', async () => {
    assert.equal((await anonymous('/api/contact', 'DELETE', { id: first })).status, 403)
    assert.equal((await editor('/api/contact', 'DELETE', { id: first })).status, 403)
    assert.equal((await editor('/api/contact')).body.length, 3)
  })
  await t.test('CSRF and invalid identifiers are rejected without removing messages', async () => {
    assert.equal((await owner('/api/contact', 'DELETE', { id: first }, { origin: 'https://evil.example' })).status, 403)
    for (const id of [0, -1, 1.5, '1', null]) {
      assert.equal((await owner('/api/contact', 'DELETE', { id })).status, 400)
    }
    assert.equal((await owner('/api/contact', 'DELETE', {})).status, 400)
    assert.equal((await owner('/api/contact', 'DELETE', { id: 999999 })).status, 404)
    assert.equal((await owner('/api/contact')).body.length, 3)
  })
  await t.test('owner and admin can delete individual messages permanently', async () => {
    assert.deepEqual(await owner('/api/contact', 'DELETE', { id: first }), { status: 200, body: { ok: true } })
    assert.deepEqual(await admin('/api/contact', 'DELETE', { id: second }), { status: 200, body: { ok: true } })
    assert.equal((await owner('/api/contact', 'DELETE', { id: first })).status, 404)
    assert.deepEqual((await owner('/api/contact')).body.map((message) => message.id), [retained])
    assert.equal((await owner('/api/contact')).body[0].message, 'Message from Retained visitor')
  })
  await t.test('successful deletions record actor, action, table and message ID', () => {
    // Inspect the isolated fixture with Python; runtime DB imports remain confined to db.server.ts.
    const script = "import sqlite3,json,sys; db=sqlite3.connect(sys.argv[1]); print(json.dumps(db.execute(\"select admin_id,action,target_table,target_id from admin_actions where action='contact.delete' order by id\").fetchall()))"
    const rows = JSON.parse(execFileSync('python3', ['-c', script, join(directory, 'data/techsoc.db')], { encoding: 'utf8' }))
    assert.deepEqual(rows, [[ownerId, 'contact.delete', 'contact_submissions', first], [adminAccount.body.id, 'contact.delete', 'contact_submissions', second]])
  })
})
