#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { publish } from './index.js'

const HELP = `Usage: oneclickpush [options]

Replace the contents of a remote git branch with that of a 
local directory.

Options:
  -d, --dist <dir>        Directory to publish (default: ".")
  -e, --exclude <glob>    Paths to leave out, relative to dist
                          (default: "**/.DS_Store")
  -b, --branch <name>     Target branch (default: "gh-pages")
  -m, --message <msg>     Commit message (default: "Updates")
  -f, --force             Force push with no history
  -n, --dry-run           Show what would change, without 
                          committing or pushing
  -v, --verbose           Log git commands
  -V, --version           Print version
  -h, --help              Show this help

--exclude takes glob patterns (*, **, ?) and can be repeated. 
Patterns are matched against the full path, so use **/name to 
match at any depth.`

const { values: v } = parseArgs({
  options: {
    dist: { type: 'string', short: 'd', default: '.' },
    exclude: { type: 'string', short: 'e', multiple: true, default: ['**/.DS_Store'] },
    branch: { type: 'string', short: 'b', default: 'gh-pages' },
    force: { type: 'boolean', short: 'f', default: false },
    message: { type: 'string', short: 'm', default: 'Updates' },
    'dry-run': { type: 'boolean', short: 'n', default: false },
    verbose: { type: 'boolean', short: 'v', default: false },
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

// Dead simple spinner (skipped when verbose or piped)
const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
let i = 0
const spin =
  process.stderr.isTTY && !v.verbose
    ? setInterval(() => process.stderr.write(`\r${frames[i++ % frames.length]}`), 100)
    : null
const stop = () => spin && (clearInterval(spin), process.stderr.write('\r \r'))

try {
  const changes = await publish({ ...v, dryRun: v['dry-run'] })
  stop()
  console.log(
    !changes
      ? 'Nothing to publish'
      : v['dry-run']
        ? `Dry run, would publish:\n${changes}`
        : 'Published'
  )
} catch (/** @type {any} */ e) {
  stop()
  console.error(v.verbose ? e : e.message)
  process.exit(1)
}
