#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { deploy } from './index.js'

const DEFAULTS = {
  exclude: ['**/.DS_Store'],
  branch: 'gh-pages',
  message: 'Updates',
  remote: 'origin',
  force: false,
  dryRun: false,
  logLevel: 'normal'
}

const HELP = `Usage: oneclickpush <dir> [options]

Replace the contents of a remote git branch with that of a
local directory.

Arguments:
  dir                     Directory to deploy (required)

Options:
  -e, --exclude <glob>    Paths to leave out, relative to dir
                          (default: "${DEFAULTS.exclude.join(', ')}")
  -b, --branch <name>     Target branch (default: "${DEFAULTS.branch}")
  -m, --message <msg>     Commit message (default: "${DEFAULTS.message}")
  -r, --remote <name|url> Remote name or repo URL to deploy to
                          (default: "${DEFAULTS.remote}")
  -a, --author <author>   Commit author, as "Name <email>"
  -f, --force             Force push new commit with no history
  -n, --dry-run           Show what would change, without
                          committing or pushing
  -l, --log-level <level> Output: silent, normal or verbose
                          (default: "${DEFAULTS.logLevel}")
  -V, --version           Print version
  -h, --help              Show this help

--exclude takes glob patterns (*, **, ?) and can be repeated.
Patterns are matched against the full path, so use **/name to
match at any depth.

Log levels: "silent" prints nothing (check the exit code),
"normal" prints the result and errors, "verbose" also logs git
commands and full errors.`

const LEVELS = ['silent', 'normal', 'verbose']

/** @param {string} msg @returns {never} */
const fail = (msg) => {
  console.error(`${msg}\nTry "oneclickpush --help" for usage`)
  process.exit(1)
}

const { values: v, positionals } = (() => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        exclude: { type: 'string', short: 'e', multiple: true, default: DEFAULTS.exclude },
        branch: { type: 'string', short: 'b', default: DEFAULTS.branch },
        message: { type: 'string', short: 'm', default: DEFAULTS.message },
        remote: { type: 'string', short: 'r', default: DEFAULTS.remote },
        author: { type: 'string', short: 'a' },
        force: { type: 'boolean', short: 'f', default: DEFAULTS.force },
        'dry-run': { type: 'boolean', short: 'n', default: DEFAULTS.dryRun },
        'log-level': { type: 'string', short: 'l', default: DEFAULTS.logLevel },
        version: { type: 'boolean', short: 'V', default: false },
        help: { type: 'boolean', short: 'h', default: false }
      }
    })
  } catch (/** @type {any} */ e) {
    if (!e.code?.startsWith('ERR_PARSE_ARGS_')) throw e
    // Keep only the first sentence, Node appends a long "-- " hint to some messages
    fail(e.message.split('. ')[0].replace(/\.$/, ''))
  }
})()

if (v.help) {
  console.log(HELP)
  process.exit(0)
}

if (v.version) {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  console.log(pkg.version)
  process.exit(0)
}

if (positionals.length !== 1) {
  fail(
    positionals.length === 0 ? 'Missing required argument <dir>' : 'Expected exactly one directory'
  )
}
const dir = positionals[0]

const level = v['log-level']
if (!LEVELS.includes(level)) {
  fail(`Invalid --log-level "${level}", expected one of: ${LEVELS.join(', ')}`)
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
  const changes = await deploy({ ...v, dir, verbose: level === 'verbose', dryRun: v['dry-run'] })
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
