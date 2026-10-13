import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { publish } from './index.js'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.js')

// Commits are made in a temp clone, so git needs an identity
Object.assign(process.env, {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com'
})

/**
 * Run a git command synchronously and return trimmed stdout.
 * @param {string} cwd Directory to run in
 * @param {...string} args Git arguments
 * @returns {string}
 */
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

/** @type {string} Temp directory holding everything for one test */
let root
/** @type {string} Bare repo acting as the remote */
let remote
/** @type {string} Working repo whose origin points at `remote` */
let work
/** @type {string} Directory being published */
let dist
/** @type {string} */
let originalCwd

// Each test gets a bare "remote", a working repo whose origin points at it, and a dist dir
beforeEach(async () => {
  originalCwd = process.cwd()
  root = await mkdtemp(join(tmpdir(), 'oneclickpush-test-'))
  remote = join(root, 'remote.git')
  work = join(root, 'work')
  dist = join(root, 'dist')
  await mkdir(dist)
  await mkdir(work)
  git(root, 'init', '-q', '--bare', '-b', 'main', remote)
  git(work, 'init', '-q', '-b', 'main')
  git(work, 'remote', 'add', 'origin', `file://${remote}`)
  process.chdir(work) // publish() reads the remote url from the cwd
})

afterEach(async () => {
  process.chdir(originalCwd)
  await rm(root, { recursive: true, force: true })
})

/**
 * Write files into the dist directory, creating parent folders as needed.
 * @param {Record<string, string>} files Map of relative path to file content
 * @returns {Promise<void>}
 */
const write = async (files) => {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dist, path)), { recursive: true })
    await writeFile(join(dist, path), content)
  }
}

/**
 * List the files on a branch of the remote, sorted.
 * @param {string} [branch="gh-pages"]
 * @returns {string[]}
 */
const remoteFiles = (branch = 'gh-pages') =>
  git(remote, 'ls-tree', '-r', '--name-only', branch).split('\n').filter(Boolean).sort()

/**
 * Count the commits on a branch of the remote.
 * @param {string} [branch="gh-pages"]
 * @returns {number}
 */
const commitCount = (branch = 'gh-pages') => Number(git(remote, 'rev-list', '--count', branch))

test('publishes dist to a new gh-pages branch', async () => {
  await write({ 'index.html': 'hi', 'assets/app.js': 'x' })
  const status = await publish({ dist })
  assert.deepEqual(remoteFiles(), ['assets/app.js', 'index.html'])
  assert.match(status, /^A\tindex\.html$/m)
  assert.equal(git(remote, 'log', '-1', '--format=%s', 'gh-pages'), 'Updates')
})

test('excludes .DS_Store at any depth by default', async () => {
  await write({ 'index.html': 'hi', '.DS_Store': 'x', 'a/.DS_Store': 'x', 'a/b/.DS_Store': 'x' })
  await publish({ dist })
  assert.deepEqual(remoteFiles(), ['index.html'])
})

test('includes other dotfiles', async () => {
  await write({ 'index.html': 'hi', '.nojekyll': '' })
  await publish({ dist })
  assert.deepEqual(remoteFiles(), ['.nojekyll', 'index.html'])
})

test('custom exclude patterns', async () => {
  await write({ 'index.html': 'hi', 'app.js.map': 'x', 'a/b/c.js.map': 'x', 'a/keep.js': 'x' })
  await publish({ dist, exclude: ['**/*.map'] })
  assert.deepEqual(remoteFiles(), ['a/keep.js', 'index.html'])
})

test('uses a custom message and branch', async () => {
  await write({ 'index.html': 'hi' })
  await publish({ dist, branch: 'site', message: 'Deploy v1' })
  assert.deepEqual(remoteFiles('site'), ['index.html'])
  assert.equal(git(remote, 'log', '-1', '--format=%s', 'site'), 'Deploy v1')
})

test('returns an empty string and skips the commit when nothing changed', async () => {
  await write({ 'index.html': 'hi' })
  await publish({ dist })
  const status = await publish({ dist })
  assert.equal(status, '')
  assert.equal(commitCount(), 1)
})

test('branch mirrors dist: modified, added and deleted files', async () => {
  await write({ 'index.html': 'v1', 'old.txt': 'old content' })
  await publish({ dist })

  await rm(join(dist, 'old.txt'))
  await write({ 'index.html': 'v2', 'new.txt': 'completely different' })
  const status = await publish({ dist })

  assert.match(status, /^M\tindex\.html$/m)
  assert.match(status, /^A\tnew\.txt$/m)
  assert.match(status, /^D\told\.txt$/m)
  assert.deepEqual(remoteFiles(), ['index.html', 'new.txt'])
  assert.equal(commitCount(), 2)
})

test('reports identical content moved to a new path as a rename', async () => {
  await write({ 'old.txt': 'same' })
  await publish({ dist })
  await rm(join(dist, 'old.txt'))
  await write({ 'new.txt': 'same' })
  const status = await publish({ dist })
  assert.match(status, /^R100\told\.txt\tnew\.txt$/m)
})

test('removes a .DS_Store that is already committed on the branch', async () => {
  await write({ 'index.html': 'hi', '.DS_Store': 'x' })
  await publish({ dist, exclude: [] }) // seed the branch with a .DS_Store
  assert.ok(remoteFiles().includes('.DS_Store'))

  const status = await publish({ dist }) // default exclude
  assert.match(status, /^D\t\.DS_Store$/m)
  assert.deepEqual(remoteFiles(), ['index.html'])
})

test('dry run reports changes without pushing', async () => {
  await write({ 'index.html': 'hi' })
  const status = await publish({ dist, dryRun: true })
  assert.match(status, /^A\tindex\.html$/m)
  assert.equal(git(remote, 'branch', '--list'), '')
})

test('dry run does not modify an existing branch', async () => {
  await write({ 'index.html': 'v1' })
  await publish({ dist })
  await write({ 'index.html': 'v2' })
  await publish({ dist, dryRun: true })
  assert.equal(commitCount(), 1)
})

test('force replaces history with a single commit', async () => {
  await write({ 'index.html': 'v1' })
  await publish({ dist })
  await write({ 'index.html': 'v2' })
  await publish({ dist })
  assert.equal(commitCount(), 2)

  await publish({ dist, force: true, message: 'Fresh' })
  assert.equal(commitCount(), 1)
  assert.equal(git(remote, 'log', '-1', '--format=%s', 'gh-pages'), 'Fresh')
  assert.equal(git(remote, 'show', 'gh-pages:index.html'), 'v2')
})

test('does not touch the working repo', async () => {
  await write({ 'index.html': 'hi' })
  await publish({ dist })
  assert.equal(git(work, 'status', '--porcelain'), '')
  assert.equal(git(work, 'branch', '--list'), '')
})

test('--remote accepts a url and needs no git repo', async () => {
  await write({ 'index.html': 'hi' })
  process.chdir(root) // not a repo
  await publish({ dist, remote: `file://${remote}` })
  assert.deepEqual(remoteFiles(), ['index.html'])
})

test('--remote accepts the name of another remote', async () => {
  const other = join(root, 'other.git')
  git(root, 'init', '-q', '--bare', '-b', 'main', other)
  git(work, 'remote', 'add', 'other', `file://${other}`)
  await write({ 'index.html': 'hi' })
  await publish({ dist, remote: 'other' })
  assert.equal(git(other, 'ls-tree', '-r', '--name-only', 'gh-pages'), 'index.html')
  assert.equal(git(remote, 'branch', '--list'), '')
})

test('--remote reports an unknown remote name', async () => {
  await write({ 'index.html': 'hi' })
  await assert.rejects(publish({ dist, remote: 'nope' }), /Remote "nope" not found/)
})

test('--author sets the commit author and committer', async () => {
  await write({ 'index.html': 'hi' })
  await publish({ dist, author: 'Jane Doe <jane@example.com>' })
  assert.equal(
    git(remote, 'log', '-1', '--format=%an|%ae|%cn|%ce', 'gh-pages'),
    'Jane Doe|jane@example.com|Jane Doe|jane@example.com'
  )
})

test('--author rejects a malformed value', async () => {
  await write({ 'index.html': 'hi' })
  await assert.rejects(publish({ dist, author: 'Jane' }), /Name <email>/)
})

test('cli: --help exits 0 and prints usage', () => {
  const r = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /Usage: oneclickpush/)
})

test('cli: publishes and supports --dry-run', async () => {
  await write({ 'index.html': 'hi' })

  const dry = spawnSync('node', [CLI, '-d', dist, '-n'], { cwd: work, encoding: 'utf8' })
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /Dry run, would publish/)
  assert.equal(git(remote, 'branch', '--list'), '')

  const real = spawnSync('node', [CLI, '-d', dist], { cwd: work, encoding: 'utf8' })
  assert.equal(real.status, 0, real.stderr)
  assert.match(real.stdout, /Published/)
  assert.deepEqual(remoteFiles(), ['index.html'])

  const again = spawnSync('node', [CLI, '-d', dist], { cwd: work, encoding: 'utf8' })
  assert.match(again.stdout, /Nothing to publish/)
})

test('cli: fails with a message outside a git repo', async () => {
  const r = spawnSync('node', [CLI, '-d', dist], { cwd: root, encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.ok(r.stderr.length > 0)
})
