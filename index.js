import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** @typedef {'silent' | 'normal' | 'verbose'} OcpOptionsLogLevel */

export const DEFAULTS = {
  exclude: ['**/.DS_Store'],
  branch: 'gh-pages',
  message: 'Updates',
  remote: 'origin',
  force: false,
  dryRun: false,
  logLevel: /** @type {OcpOptionsLogLevel} */ ('normal')
}

/**
 * @typedef {object} OcpOptions
 * @prop {string} dir Directory to deploy (required)
 * @prop {string[]} [exclude] Paths to leave out, relative to dir (default: `**\/.DS_Store`)
 * @prop {string} [branch="gh-pages"] Target branch
 * @prop {string} [message="Updates"] Commit message
 * @prop {string} [remote="origin"] Remote name of the current repo, or a repository URL or path
 * @prop {string} [author] Commit author and committer as "Name <email>"
 * @prop {boolean} [force=false] Force push new commit with no history
 * @prop {boolean} [dryRun=false] Show what would change, without committing or pushing
 * @prop {OcpOptionsLogLevel} [logLevel="normal"] Only "verbose" logs (git commands, to stderr)
 */

/**
 * Replace the contents of a git branch with the contents of a directory.
 * Returns the staged changes as `git diff --name-status` text or "" if nothing changed.
 * @param {OcpOptions} options
 * @returns {Promise<string>}
 */
export async function deploy({
  dir,
  exclude = DEFAULTS.exclude,
  branch = DEFAULTS.branch,
  message = DEFAULTS.message,
  remote = DEFAULTS.remote,
  author,
  force = DEFAULTS.force,
  dryRun = DEFAULTS.dryRun,
  logLevel = DEFAULTS.logLevel
}) {
  if (!dir) throw new Error('dir is required')
  dir = resolve(dir)
  const run = promisify(execFile)

  // Env vars beat git config, so this also overrides any identity already set in CI
  /** @type {Record<string, string>} */
  let identity = {}
  if (author) {
    const m = /^(.+?)\s*<(.+)>$/.exec(author)
    if (!m) throw new Error('--author must look like "Name <email>"')
    identity = {
      GIT_AUTHOR_NAME: m[1],
      GIT_AUTHOR_EMAIL: m[2],
      GIT_COMMITTER_NAME: m[1],
      GIT_COMMITTER_EMAIL: m[2]
    }
  }

  /** @type {(args: string[], cwd?: string, env?: Record<string, string>) => Promise<string>} */
  const git = async (args, cwd, env) => {
    if (logLevel === 'verbose') console.error(`$ git ${args.join(' ')}`)
    const { stdout } = await run('git', args, { cwd, env: { ...process.env, ...env } })
    return stdout.trim()
  }

  // A remote name resolves to its url; anything else is used as a url or path as-is
  let url = remote
  try {
    url = await git(['remote', 'get-url', remote])
  } catch {
    if (/^[\w-]+$/.test(remote)) throw new Error(`Remote "${remote}" not found`)
  }

  const tmp = await mkdtemp(join(tmpdir(), 'oneclickpush-'))

  try {
    // Reuse existing branch history unless forcing; otherwise start fresh
    let cloned = false
    if (!force) {
      try {
        await git(['clone', '--branch', branch, '--single-branch', '--depth', '1', url, tmp])
        cloned = true
        // eslint-disable-next-line no-empty
      } catch {}
    }
    if (!cloned) {
      await git(['init', '-q', '-b', branch], tmp)
      await git(['remote', 'add', 'origin', url], tmp)
    }

    // Empty the index, then stage everything from dir except excluded paths
    await git(['read-tree', '--empty'], tmp)
    await git(
      [
        '--git-dir',
        join(tmp, '.git'),
        '--work-tree',
        dir,
        'add',
        '--force',
        '--',
        '.',
        ...exclude.map((p) => `:(exclude,glob)${p}`)
      ],
      dir
    )

    const status = await git(['diff', '--cached', '--name-status'], tmp)
    if (!status || dryRun) return status

    await git(['commit', '-q', '-m', message], tmp, identity)
    await git(['push', '-q', ...(force ? ['--force'] : []), 'origin', branch], tmp)
    return status
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}
