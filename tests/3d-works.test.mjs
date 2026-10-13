import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

test('Blender uploads and published 3D works through the built HTTP API', { timeout: 45_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'techsoc-3d-test-'))
  const password = 'Fixture-Password-123'
  const server = spawn(process.execPath, [fileURLToPath(new URL('../.output/server/index.mjs', import.meta.url))], {
    cwd: directory,
    env: { ...process.env, DATABASE_URL: '', BLOB_READ_WRITE_TOKEN: '', VERCEL: '', ADMIN_EMAIL: 'adibains06@gmail.com', ADMIN_PASSWORD: password, PORT: '0', HOST: '127.0.0.1', NITRO_PORT: '0', NITRO_HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      const stopped = new Promise((resolve) => server.once('exit', resolve)); server.kill('SIGTERM'); await stopped
    }
    await rm(directory, { recursive: true, force: true })
  })
  let output = ''
  server.stderr.on('data', (data) => { output += data })
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(output)), 10000)
    server.stdout.on('data', (data) => { output += data; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]) } })
    server.once('error', (error) => { clearTimeout(timer); reject(error) })
    server.once('exit', () => { clearTimeout(timer); reject(new Error(output)) })
  })
  let cookie = ''
  async function send(path, method = 'GET', data, authenticated = true, extraHeaders = {}) {
    const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(authenticated ? { cookie } : {}), ...extraHeaders }, body: data === undefined ? undefined : JSON.stringify(data) })
    const session = response.headers.get('set-cookie'); if (session) cookie = session.split(';')[0]
    return { status: response.status, body: await response.json() }
  }
  async function upload(bytes, name, type = '', authenticated = true, extraHeaders = {}) {
    const form = new FormData(); form.set('file', new File([bytes], name, { type }))
    const response = await fetch(base + '/api/upload', { method: 'POST', headers: { ...(authenticated ? { cookie } : {}), ...extraHeaders }, body: form })
    return { status: response.status, body: await response.json() }
  }
  const model = await readFile(new URL('../public/models/techsoc.glb', import.meta.url))
  const login = await send('/api/auth', 'POST', { email: 'adibains06@gmail.com', password })
  assert.equal(login.status, 200)
  let modelPath, sourcePath, id

  await t.test('anonymous and cross-origin uploads are blocked', async () => {
    assert.equal((await upload(model, 'work.glb', '', false)).status, 401)
    assert.equal((await upload(model, 'work.glb', '', true, { origin: 'https://evil.example' })).status, 403)
    assert.equal((await send('/api/admin-content', 'POST', { type: 'works', data: { title: 'Blocked', model_path: '/models/techsoc.glb' } }, false)).status, 401)
  })
  await t.test('GLB exports with generic MIME types upload and retain their bytes', async () => {
    for (const type of ['', 'application/octet-stream']) {
      const result = await upload(model, 'BLENDER-WORK.GLB', type)
      assert.equal(result.status, 200)
      modelPath = result.body.path
      const served = await fetch(base + modelPath)
      assert.equal(served.headers.get('content-type'), 'model/gltf-binary')
      assert.deepEqual(Buffer.from(await served.arrayBuffer()), model)
    }
  })
  await t.test('spoofed, truncated, wrong-version and oversized files are rejected', async () => {
    assert.equal((await upload(Buffer.from('not a model'), 'fake.glb')).status, 415)
    assert.equal((await upload(model.subarray(0, 20), 'partial.glb')).status, 415)
    const wrongVersion = Buffer.from(model); wrongVersion.writeUInt32LE(1, 4)
    assert.equal((await upload(wrongVersion, 'old.glb')).status, 415)
    assert.equal((await upload(model, 'model.png', 'image/png')).status, 415)
    assert.equal((await upload(Buffer.alloc(25 * 1024 * 1024 + 1), 'large.glb')).status, 413)
    assert.equal((await upload(model, 'model.exe')).status, 415)
  })
  await t.test('GLTF is parsed beyond 4KB and external companion files are rejected', async () => {
    const selfContained = JSON.stringify({ asset: { version: '2.0' }, extras: { note: 'x'.repeat(5000) }, buffers: [{ byteLength: 4, uri: 'data:application/octet-stream;base64,AAAAAA==' }] })
    assert.equal((await upload(selfContained, 'embedded.gltf', 'application/json')).status, 200)
    for (const data of [{ hello: 'world' }, { asset: { version: '2.0' }, buffers: [{ uri: 'model.bin' }] }, { asset: { version: '2.0' }, images: [{ uri: 'https://example.com/texture.png' }] }]) {
      assert.equal((await upload(JSON.stringify(data), 'broken.gltf')).status, 415)
    }
  })
  await t.test('Blender sources upload as downloads, compressed files explain the requirement', async () => {
    const source = Buffer.from('BLENDER-v450fixture')
    const result = await upload(source, 'work.blend')
    assert.equal(result.status, 200); sourcePath = result.body.path
    const served = await fetch(base + sourcePath)
    assert.match(served.headers.get('content-disposition'), /^attachment/)
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), source)
    assert.equal((await upload(Buffer.from('BLENDER17-01v0500fixture'), 'modern.blend')).status, 200)
    const compressed = await upload(Buffer.from([31, 139, 0, 0]), 'compressed.blend')
    assert.equal(compressed.status, 415); assert.match(compressed.body.error, /uncompressed/)
  })
  await t.test('work fields are validated and drafts stay out of the public feed', async () => {
    for (const data of [{ title: 'Missing model' }, { title: 'Bad link', model_path: 'javascript:alert(1).glb' }, { title: 'Wrong source', model_path: modelPath, source_path: modelPath }, { title: 'Bad visibility', model_path: modelPath, published: 2 }]) {
      assert.equal((await send('/api/admin-content', 'POST', { type: 'works', data })).status, 400)
    }
    const result = await send('/api/admin-content', 'POST', { type: 'works', data: { title: 'Fixture sculpture', model_path: modelPath, source_path: sourcePath, published: 0, creator: 'Fixture creator', sort_order: 2 } })
    assert.equal(result.status, 200); id = result.body.id
    assert.equal((await send('/api/content')).body.works.length, 0)
    assert.equal((await send('/api/admin-content')).body.works.length, 1)
    assert.equal((await send('/api/admin-content', 'PUT', { type: 'works', id, data: { model_path: '' } })).status, 400)
    assert.equal((await send('/api/admin-content', 'PUT', { type: 'works', id, data: { published: 1 } })).status, 200)
    const content = (await send('/api/content')).body.works
    assert.equal(content[0].model_path, modelPath); assert.equal(content[0].source_path, sourcePath)
    const earlier = await send('/api/admin-content', 'POST', { type: 'works', data: { title: 'First work', model_path: modelPath, sort_order: 0, published: 1 } })
    assert.deepEqual((await send('/api/content')).body.works.map((work) => work.id), [earlier.body.id, id])
    assert.equal((await send('/api/admin-content', 'DELETE', { type: 'works', id })).status, 200)
    assert.deepEqual((await send('/api/content')).body.works.map((work) => work.id), [earlier.body.id])
  })
  await t.test('editors can manage works without homepage settings privileges', async () => {
    assert.equal((await send('/api/admins', 'POST', { email: 'editor@example.com', password, role: 'editor' })).status, 201)
    assert.equal((await send('/api/auth', 'POST', { email: 'editor@example.com', password })).status, 200)
    assert.equal((await send('/api/admin-content', 'POST', { type: 'works', data: { title: 'Editor work', model_path: modelPath } })).status, 200)
    assert.equal((await send('/api/settings', 'PUT', { hero_asset: modelPath })).status, 403)
  })
})
