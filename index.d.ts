export type OneclickpushOptions = {
  /**
   * Directory to publish
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
   * Force push with no history
   */
  force?: boolean
  /**
   * Show what would change, without committing or pushing
   */
  dryRun?: boolean
  /**
   * Log git commands
   */
  verbose?: boolean
}
/**
 * @typedef {object} OneclickpushOptions
 * @prop {string} [dist="."] Directory to publish
 * @prop {string[]} [exclude] Paths to leave out, relative to dist (default: `**\/.DS_Store`)
 * @prop {string} [branch="gh-pages"] Target branch
 * @prop {string} [message="Updates"] Commit message
 * @prop {boolean} [force=false] Force push with no history
 * @prop {boolean} [dryRun=false] Show what would change, without committing or pushing
 * @prop {boolean} [verbose=false] Log git commands
 */
/**
 * Replace the contents of a git branch with the contents of a directory.
 * Returns the staged changes as `git diff --name-status` text or "" if nothing changed.
 * @param {OneclickpushOptions} options
 * @returns {Promise<string>}
 */
export declare function publish({
  dist,
  exclude,
  branch,
  message,
  force,
  dryRun,
  verbose
}: OneclickpushOptions): Promise<string>
