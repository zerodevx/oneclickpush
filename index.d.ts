/**
 * Replace the contents of a git branch with the contents of a directory.
 * Returns the staged changes as `git diff --name-status` text or "" if nothing changed.
 * @param {object} o
 * @param {string} o.dir Directory to deploy (required)
 * @param {string[]} [o.exclude] Paths to leave out, relative to dir (default: `**\/.DS_Store`)
 * @param {string} [o.branch="gh-pages"] Target branch
 * @param {string} [o.message="Updates"] Commit message
 * @param {string} [o.remote="origin"] Remote name of the current repo, or a repository URL or path
 * @param {string} [o.author] Commit author and committer as "Name <email>"
 * @param {boolean} [o.force=false] Force push new commit with no history
 * @param {boolean} [o.dryRun=false] Return staged changes without committing or pushing
 * @param {boolean} [o.verbose=false] Log git commands to stderr
 * @returns {Promise<string>}
 */
export declare function deploy({
  dir,
  exclude,
  branch,
  message,
  remote,
  author,
  force,
  dryRun,
  verbose
}: {
  dir: string
  exclude?: string[]
  branch?: string
  message?: string
  remote?: string
  author?: string
  force?: boolean
  dryRun?: boolean
  verbose?: boolean
}): Promise<string>
