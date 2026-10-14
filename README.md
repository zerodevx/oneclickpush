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
  -d, --dist <dir>        Directory to deploy (default: ".")
  -e, --exclude <glob>    Paths to leave out, relative to dist (default: "**/.DS_Store")
  -b, --branch <name>     Target branch (default: "gh-pages")
  -m, --message <msg>     Commit message (default: "Updates")
  -r, --remote <name|url> Remote name or repo URL to deploy to (default: "origin")
  -a, --author <author>   Commit author, as "Name <email>"
  -f, --force             Force push new commit with no history
  -n, --dry-run           Show what would change, without committing or pushing
  -l, --log-level <level> Output: silent, normal or verbose (default: "normal")
  -V, --version           Print version
  -h, --help              Show this help
```

> [!TIP]  
> `--exclude` takes glob patterns (`*`, `**`, `?`) and can be repeated. Patterns are matched against
> the full path, so use `**/name` to match at any depth.

### Log levels

| Level     | Behavior                                                             |
| --------- | -------------------------------------------------------------------- |
| `silent`  | Prints nothing, not even errors. Check the exit code instead.        |
| `normal`  | Prints the result and error messages (plus a spinner in a terminal). |
| `verbose` | Also logs every git command to stderr and prints full errors.        |

> [!WARNING]  
> If your remote URL contains a token (e.g. `https://user:TOKEN@github.com/o/r.git`), git error
> messages shown at `normal` and `verbose` may include it. Use `-l silent` in CI, or keep tokens out
> of the URL with a credential helper.

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

# Silent output (useful in CI, check the exit code)
npx oneclickpush -d dist -l silent

# Log every git command
npx oneclickpush -d dist -l verbose
```

## Programmatic API

You can also use `oneclickpush` as an ES module:

```bash
# Install
npm i oneclickpush
```

```javascript
import { deploy } from 'oneclickpush'

const changes = await deploy({
  dist: 'dist',
  exclude: ['**/.DS_Store', '**/*.map'],
  branch: 'gh-pages',
  message: 'Deploy updates',
  remote: 'origin',
  author: 'Deploy Bot <bot@example.com>',
  force: false,
  dryRun: false,
  logLevel: 'normal'
})

if (changes) {
  console.log('Deployed changes:\n' + changes)
} else {
  console.log('Nothing to deploy')
}
```

### Options

| Option     | Type                                | Default            | Description                                         |
| ---------- | ----------------------------------- | ------------------ | --------------------------------------------------- |
| `dist`     | `string`                            | `"."`              | Directory to deploy                                 |
| `exclude`  | `string[]`                          | `["**/.DS_Store"]` | Paths to exclude relative to `dist`                 |
| `branch`   | `string`                            | `"gh-pages"`       | Target git branch                                   |
| `message`  | `string`                            | `"Updates"`        | Git commit message                                  |
| `remote`   | `string`                            | `"origin"`         | Remote name or repository URL/path to deploy to     |
| `author`   | `string`                            | —                  | Commit author and committer, as `"Name <email>"`    |
| `force`    | `boolean`                           | `false`            | Force push fresh commit with no previous history    |
| `dryRun`   | `boolean`                           | `false`            | Return staged changes without committing or pushing |
| `logLevel` | `"silent" \| "normal" \| "verbose"` | `"normal"`         | Only `"verbose"` has an effect: logs git commands   |

> [!NOTE]  
> The library never prints anything except at `"verbose"`. `"silent"` and `"normal"` only differ in
> the CLI.

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

- The target branch is fully replaced with the contents of `dist` (WYSIWYG), and it's created if it
  doesn't exist yet. If you need files like `.nojekyll` or `CNAME`, put them in `dist`, adding a
  post-build step if your build tool wipes the directory.
- Dotfiles are included by default, except `.DS_Store`. Use `-e` to exclude more, but note that it
  replaces the default list, so repeat `-e "**/.DS_Store"` if you still want that file excluded.
- When `--remote` is a repository URL or path, you don't need to run from inside a git repository.
- In dry-run output, identical content moved to a new path appears as a rename (`R100`).

## License

ISC
