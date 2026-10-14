#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { deploy } from './index.js'

const HELP = `Usage: oneclickpush [options]

Replace the contents of a remote git branch with that of a
local directory.

Options:
  -d, --dist <dir>        Directory to deploy (default: ".")
  -e, --exclude <glob>    Paths to leave out, relative to dist
                          (default: "**/.DS_Store")
  -b, --branch <name>     Target branch (default: "gh-pages")
  -m, --message <msg>     Commit message (default: "Updates")
  -r, --remote <name|url> Remote name or repo URL to deploy to
                          (default: "origin")
  -a, --author <author>   Commit author, as "Name <email>"
  -f, --force             Force push new commit with no history
  -n, --dry-run           Show what would change, without
                          committing or pushing
  -l, --log-level <level> Output: silent, normal or verbose
                          (default: "normal")
  -V, --version           Print version
  -h, --help              Show this help

--exclude takes glob patterns (*, **, ?) and can be repeated.
Patterns are matched against the full path, so use **/name to
match at any depth.

Log levels: "silent" prints nothing (check the exit code),
"normal" prints the result and errors, "verbose" also logs git
commands and full errors.`

const LEVELS = ['silent', 'normal', 'verbose']

const { values: v } = parseArgs({
  options: {
    dist: { type: 'string', short: 'd', default: '.' },
    exclude: { type: 'string', short: 'e', multiple: true, default: ['**/.DS_Store'] },
    branch: { type: 'string', short: 'b', default: 'gh-pages' },
    message: { type: 'string', short: 'm', default: 'Updates' },
    remote: { type: 'string', short: 'r', default: 'origin' },
    author: { type: 'string', short: 'a' },
    force: { type: 'boolean', short: 'f', default: false },
    'dry-run': { type: 'boolean', short: 'n', default: false },
    'log-level': { type: 'string', short: 'l', default: 'normal' },
    version: { type: 'boolean', short: 'V', default: false },
    help: { type: 'boolean', short: 'h', default: false }
  }
})

if (v.help) {
  console.log(HELP)
  process.exit(0)
}

if (v.version) {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  console.log(pkg.version)
  process.exit(0)
}

const level = /** @type {'silent' | 'normal' | 'verbose'} */ (v['log-level'])
if (!LEVELS.includes(level)) {
  console.error(`Invalid --log-level "${level}", expected one of: ${LEVELS.join(', ')}`)
  process.exit(1)
}

// Dead simple spinner (normal level, TTY only)
const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
let i = 0
const spin =
  process.stderr.isTTY && level === 'normal'
    ? setInterval(() => process.stderr.write(`\r${frames[i++ % frames.length]}`), 100)
    : null
const stop = () => spin && (clearInterval(spin), process.stderr.write('\r \r'))

try {
  const changes = await deploy({ ...v, logLevel: level, dryRun: v['dry-run'] })
  stop()
  if (level !== 'silent') {
    console.log(
      !changes
        ? 'Nothing to deploy'
        : v['dry-run']
          ? `Dry run, would deploy:\n${changes}`
          : 'Deployed!'
    )
  }
} catch (/** @type {any} */ e) {
  stop()
  if (level === 'verbose') console.error(e)
  else if (level === 'normal') console.error(e.message)
  process.exit(1)
}
