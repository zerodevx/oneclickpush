# oneclickpush

> One-click GitHub Pages deployer

Replace the contents of a remote git branch (like `gh-pages`) with the contents of a local directory
in one command.

[`gh-pages`](https://github.com/tschaub/gh-pages) is
[complicated](https://github.com/tschaub/gh-pages/tree/main/lib),
[buggy](https://github.com/tschaub/gh-pages/issues), and
[unmaintained](https://github.com/tschaub/gh-pages/issues/657#issue-4979248775); `oneclickpush` is
none of these, has zero dependencies and only uses built-in Node APIs + `git`.

## Quick Start

Deploy your build directory (e.g. `dist`) to the `gh-pages` branch:

```text
$ cd dist
$ npx oneclickpush
```

## CLI Usage

```text
Usage: oneclickpush [options]

Replace the contents of a remote git branch with that of a local directory.

Options:
  -d, --dist <dir>        Directory to publish (default: ".")
  -e, --exclude <glob>    Paths to leave out, relative to dist (default: "**/.DS_Store")
  -b, --branch <name>     Target branch (default: "gh-pages")
  -m, --message <msg>     Commit message (default: "Updates")
  -r, --remote <name|url> Remote name or repo URL to publish to (default: "origin")
  -a, --author <author>   Commit author, as "Name <email>"
  -f, --force             Force push new commit with no history
  -n, --dry-run           Show what would change, without committing or pushing
  -v, --verbose           Log git commands
  -V, --version           Print version
  -h, --help              Show this help
```

> [!TIP]  
> `--exclude` takes glob patterns (`*`, `**`, `?`) and can be repeated. Patterns are matched against
> the full path, so use `**/name` to match at any depth.

### Examples

```bash
# Preview what would be deployed without pushing
npx oneclickpush -d build --dry-run

# Custom branch and commit message
npx oneclickpush -d public -b release -m "deploy: v1.0.0"

# Exclude source maps and test files
npx oneclickpush -d dist -e "**/*.map" -e "**/tests/**"

# Deploy to a different remote or repository URL
npx oneclickpush -d dist -r upstream
npx oneclickpush -d dist -r git@github.com:user/repo.git

# Set commit author (useful in CI environments)
npx oneclickpush -d dist -a "Deploy Bot <bot@example.com>"

# Force push fresh history
npx oneclickpush -d dist --force
```

## Programmatic API

You can also use `oneclickpush` as an ES module:

```bash
# Install the library
npm i oneclickpush
```

```javascript
import { publish } from 'oneclickpush'

const changes = await publish({
  dist: 'dist',
  exclude: ['**/.DS_Store', '**/*.map'],
  branch: 'gh-pages',
  message: 'Deploy updates',
  remote: 'origin',
  author: 'Deploy Bot <bot@example.com>',
  force: false,
  dryRun: false,
  verbose: false
})

if (changes) {
  console.log('Published changes:\n' + changes)
} else {
  console.log('Nothing to publish')
}
```

### Options

| Option    | Type       | Default            | Description                                         |
| --------- | ---------- | ------------------ | --------------------------------------------------- |
| `dist`    | `string`   | `"."`              | Directory to publish                                |
| `exclude` | `string[]` | `["**/.DS_Store"]` | Paths to exclude relative to `dist`                 |
| `branch`  | `string`   | `"gh-pages"`       | Target git branch                                   |
| `message` | `string`   | `"Updates"`        | Git commit message                                  |
| `remote`  | `string`   | `"origin"`         | Remote name or repository URL/path to publish to    |
| `author`  | `string`   | —                  | Commit author and committer, as `"Name <email>"`    |
| `force`   | `boolean`  | `false`            | Force push fresh commit with no previous history    |
| `dryRun`  | `boolean`  | `false`            | Return staged changes without committing or pushing |
| `verbose` | `boolean`  | `false`            | Log executed git commands                           |

## How It Works

1. Resolves the target repository URL from git remote configuration or uses the provided remote
   URL/path directly.
2. Creates an isolated temporary directory and fetches the target branch (or initializes it if it
   doesn't exist).
3. Clears the target branch index and stages the contents of `dist` (minus `exclude` patterns)
   directly via Git `work-tree`.
4. Checks for differences (`git diff --cached --name-status`). If there are changes, commits and
   pushes back to the remote repository.
5. Cleans up the temporary directory.

> [!WARNING]  
> Requires Node 18.3+ and Git 2.28+.

### Notes

- Dotfiles (except `.DS_Store`) are included by default; use `-e` to exclude.
- Contents in target branch are emptied and replaced with the contents of `dist` (WYSIWYG).
- If `.nojekyll` or `CNAME` files are required, add them to `dist`; use a post-build step if needed.
- If the target branch does not exist, it will be created.
- When `--remote` is a repository URL or path, running from within an existing git repository is not
  required.

## License

ISC
