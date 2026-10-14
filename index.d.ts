export type OneclickpushOptions = {
  /**
   * Directory to deploy
   */
  dist?: string
  /**
   * Paths to leave out, relative to dist (default: `**\/.DS_Store`)
   */
  exclude?: string[]
  /**
   * Target branch
   */
  branch?: string
  /**
   * Commit message
   */
  message?: string
  /**
   * Remote name of the current repo, or a repository URL or path
   */
  remote?: string
  /**
   * Commit author and committer as "Name <email>"
   */
  author?: string
  /**
   * Force push new commit with no history
   */
  force?: boolean
  /**
   * Show what would change, without committing or pushing
   */
  dryRun?: boolean
  /**
   * Only "verbose" logs (git commands, to stderr)
   */
  logLevel?: 'silent' | 'normal' | 'verbose'
}
/**
 * @typedef {object} OneclickpushOptions
 * @prop {string} [dist="."] Directory to deploy
 * @prop {string[]} [exclude] Paths to leave out, relative to dist (default: `**\/.DS_Store`)
 * @prop {string} [branch="gh-pages"] Target branch
 * @prop {string} [message="Updates"] Commit message
 * @prop {string} [remote="origin"] Remote name of the current repo, or a repository URL or path
 * @prop {string} [author] Commit author and committer as "Name <email>"
 * @prop {boolean} [force=false] Force push new commit with no history
 * @prop {boolean} [dryRun=false] Show what would change, without committing or pushing
 * @prop {'silent' | 'normal' | 'verbose'} [logLevel="normal"] Only "verbose" logs (git commands, to stderr)
 */
/**
 * Replace the contents of a git branch with the contents of a directory.
 * Returns the staged changes as `git diff --name-status` text or "" if nothing changed.
 * @param {OneclickpushOptions} options
 * @returns {Promise<string>}
 */
export declare function deploy({
  dist,
  exclude,
  branch,
  message,
  remote,
  author,
  force,
  dryRun,
  logLevel
}: OneclickpushOptions): Promise<string>
