import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deploy } from './index.js'

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
/** @type {string} Directory being deployed */
let dir
/** @type {string} */
let originalCwd

// Each test gets a bare "remote", a working repo whose origin points at it, and a dir to deploy
beforeEach(async () => {
  originalCwd = process.cwd()
  root = await mkdtemp(join(tmpdir(), 'oneclickpush-test-'))
  remote = join(root, 'remote.git')
  work = join(root, 'work')
  dir = join(root, 'dir')
  await mkdir(dir)
  await mkdir(work)
  git(root, 'init', '-q', '--bare', '-b', 'main', remote)
  git(work, 'init', '-q', '-b', 'main')
  git(work, 'remote', 'add', 'origin', `file://${remote}`)
  process.chdir(work) // deploy() reads the remote url from the cwd
})

afterEach(async () => {
  process.chdir(originalCwd)
  await rm(root, { recursive: true, force: true })
})

/**
 * Write files into the deploy directory, creating parent folders as needed.
 * @param {Record<string, string>} files Map of relative path to file content
 * @returns {Promise<void>}
 */
const write = async (files) => {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true })
    await writeFile(join(dir, path), content)
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

test('deploys dir to a new gh-pages branch', async () => {
  await write({ 'index.html': 'hi', 'assets/app.js': 'x' })
  const status = await deploy({ dir })
  assert.deepEqual(remoteFiles(), ['assets/app.js', 'index.html'])
  assert.match(status, /^A\tindex\.html$/m)
  assert.equal(git(remote, 'log', '-1', '--format=%s', 'gh-pages'), 'Updates')
})

test('requires dir', async () => {
  // @ts-expect-error dir is intentionally missing
  await assert.rejects(deploy({}), /dir is required/)
})

test('excludes .DS_Store at any depth by default', async () => {
  await write({ 'index.html': 'hi', '.DS_Store': 'x', 'a/.DS_Store': 'x', 'a/b/.DS_Store': 'x' })
  await deploy({ dir })
  assert.deepEqual(remoteFiles(), ['index.html'])
})

test('includes other dotfiles', async () => {
  await write({ 'index.html': 'hi', '.nojekyll': '' })
  await deploy({ dir })
  assert.deepEqual(remoteFiles(), ['.nojekyll', 'index.html'])
})

test('custom exclude patterns', async () => {
  await write({ 'index.html': 'hi', 'app.js.map': 'x', 'a/b/c.js.map': 'x', 'a/keep.js': 'x' })
  await deploy({ dir, exclude: ['**/*.map'] })
  assert.deepEqual(remoteFiles(), ['a/keep.js', 'index.html'])
})

test('uses a custom message and branch', async () => {
  await write({ 'index.html': 'hi' })
  await deploy({ dir, branch: 'site', message: 'Deploy v1' })
  assert.deepEqual(remoteFiles('site'), ['index.html'])
  assert.equal(git(remote, 'log', '-1', '--format=%s', 'site'), 'Deploy v1')
})

test('returns an empty string and skips the commit when nothing changed', async () => {
  await write({ 'index.html': 'hi' })
  await deploy({ dir })
  const status = await deploy({ dir })
  assert.equal(status, '')
  assert.equal(commitCount(), 1)
})

test('branch mirrors dir: modified, added and deleted files', async () => {
  await write({ 'index.html': 'v1', 'old.txt': 'old content' })
  await deploy({ dir })

  await rm(join(dir, 'old.txt'))
  await write({ 'index.html': 'v2', 'new.txt': 'completely different' })
  const status = await deploy({ dir })

  assert.match(status, /^M\tindex\.html$/m)
  assert.match(status, /^A\tnew\.txt$/m)
  assert.match(status, /^D\told\.txt$/m)
  assert.deepEqual(remoteFiles(), ['index.html', 'new.txt'])
  assert.equal(commitCount(), 2)
})

test('reports identical content moved to a new path as a rename', async () => {
  await write({ 'old.txt': 'same' })
  await deploy({ dir })
  await rm(join(dir, 'old.txt'))
  await write({ 'new.txt': 'same' })
  const status = await deploy({ dir })
  assert.match(status, /^R100\told\.txt\tnew\.txt$/m)
})

test('removes a .DS_Store that is already committed on the branch', async () => {
  await write({ 'index.html': 'hi', '.DS_Store': 'x' })
  await deploy({ dir, exclude: [] }) // seed the branch with a .DS_Store
  assert.ok(remoteFiles().includes('.DS_Store'))

  const status = await deploy({ dir }) // default exclude
  assert.match(status, /^D\t\.DS_Store$/m)
  assert.deepEqual(remoteFiles(), ['index.html'])
})

test('dry run reports changes without pushing', async () => {
  await write({ 'index.html': 'hi' })
  const status = await deploy({ dir, dryRun: true })
  assert.match(status, /^A\tindex\.html$/m)
  assert.equal(git(remote, 'branch', '--list'), '')
})

test('dry run does not modify an existing branch', async () => {
  await write({ 'index.html': 'v1' })
  await deploy({ dir })
  await write({ 'index.html': 'v2' })
  await deploy({ dir, dryRun: true })
  assert.equal(commitCount(), 1)
})

test('force replaces history with a single commit', async () => {
  await write({ 'index.html': 'v1' })
  await deploy({ dir })
  await write({ 'index.html': 'v2' })
  await deploy({ dir })
  assert.equal(commitCount(), 2)

  await deploy({ dir, force: true, message: 'Fresh' })
  assert.equal(commitCount(), 1)
  assert.equal(git(remote, 'log', '-1', '--format=%s', 'gh-pages'), 'Fresh')
  assert.equal(git(remote, 'show', 'gh-pages:index.html'), 'v2')
})

test('does not touch the working repo', async () => {
  await write({ 'index.html': 'hi' })
  await deploy({ dir })
  assert.equal(git(work, 'status', '--porcelain'), '')
  assert.equal(git(work, 'branch', '--list'), '')
})

test('--remote accepts a url and needs no git repo', async () => {
  await write({ 'index.html': 'hi' })
  process.chdir(root) // not a repo
  await deploy({ dir, remote: `file://${remote}` })
  assert.deepEqual(remoteFiles(), ['index.html'])
})

test('--remote accepts the name of another remote', async () => {
  const other = join(root, 'other.git')
  git(root, 'init', '-q', '--bare', '-b', 'main', other)
  git(work, 'remote', 'add', 'other', `file://${other}`)
  await write({ 'index.html': 'hi' })
  await deploy({ dir, remote: 'other' })
  assert.equal(git(other, 'ls-tree', '-r', '--name-only', 'gh-pages'), 'index.html')
  assert.equal(git(remote, 'branch', '--list'), '')
})

test('--remote reports an unknown remote name', async () => {
  await write({ 'index.html': 'hi' })
  await assert.rejects(deploy({ dir, remote: 'nope' }), /Remote "nope" not found/)
})

test('--author sets the commit author and committer', async () => {
  await write({ 'index.html': 'hi' })
  await deploy({ dir, author: 'Jane Doe <jane@example.com>' })
  assert.equal(
    git(remote, 'log', '-1', '--format=%an|%ae|%cn|%ce', 'gh-pages'),
    'Jane Doe|jane@example.com|Jane Doe|jane@example.com'
  )
})

test('--author rejects a malformed value', async () => {
  await write({ 'index.html': 'hi' })
  await assert.rejects(deploy({ dir, author: 'Jane' }), /Name <email>/)
})

test('cli: --help exits 0 and prints usage', () => {
  const r = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /Usage: oneclickpush/)
})

test('cli: deploys and supports --dry-run', async () => {
  await write({ 'index.html': 'hi' })

  const dry = spawnSync('node', [CLI, dir, '-n'], { cwd: work, encoding: 'utf8' })
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /Dry run, would deploy/)
  assert.equal(git(remote, 'branch', '--list'), '')

  const real = spawnSync('node', [CLI, dir], { cwd: work, encoding: 'utf8' })
  assert.equal(real.status, 0, real.stderr)
  assert.match(real.stdout, /Deployed/)
  assert.deepEqual(remoteFiles(), ['index.html'])

  const again = spawnSync('node', [CLI, dir], { cwd: work, encoding: 'utf8' })
  assert.match(again.stdout, /Nothing to deploy/)
})

test('cli: dir can come after the options', async () => {
  await write({ 'index.html': 'hi' })
  const r = spawnSync('node', [CLI, '-n', dir], { cwd: work, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /Dry run, would deploy/)
})

test('cli: requires dir', () => {
  const r = spawnSync('node', [CLI], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /Missing required argument <dir>/)
})

test('cli: rejects more than one directory', () => {
  const r = spawnSync('node', [CLI, 'a', 'b'], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /exactly one directory/)
})

test('cli: fails with a message outside a git repo', async () => {
  const r = spawnSync('node', [CLI, dir], { cwd: root, encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.ok(r.stderr.length > 0)
})

test('cli: --log-level silent prints nothing on success', async () => {
  await write({ 'index.html': 'hi' })
  const r = spawnSync('node', [CLI, dir, '-l', 'silent'], { cwd: work, encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
  assert.equal(r.stderr, '')
  assert.deepEqual(remoteFiles(), ['index.html'])
})

test('cli: --log-level silent prints nothing on failure but still exits 1', async () => {
  const r = spawnSync('node', [CLI, dir, '-l', 'silent'], { cwd: root, encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.equal(r.stdout, '')
  assert.equal(r.stderr, '')
})

test('cli: --log-level verbose logs git commands to stderr', async () => {
  await write({ 'index.html': 'hi' })
  const r = spawnSync('node', [CLI, dir, '-l', 'verbose'], { cwd: work, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /^\$ git remote get-url origin$/m)
  assert.match(r.stdout, /Deployed/)
})

test('cli: normal level does not log git commands', async () => {
  await write({ 'index.html': 'hi' })
  const r = spawnSync('node', [CLI, dir], { cwd: work, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.doesNotMatch(r.stderr, /\$ git/)
})

test('cli: rejects an invalid --log-level', () => {
  const r = spawnSync('node', [CLI, 'x', '-l', 'loud'], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /Invalid --log-level/)
})

test('cli: unknown option prints a one-line error and a one-line help hint', () => {
  const r = spawnSync('node', [CLI, 'x', '--nope'], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /Unknown option '--nope'\n.*oneclickpush --help/)
  assert.equal(r.stderr.trim().split('\n').length, 2) // no stack trace
})
