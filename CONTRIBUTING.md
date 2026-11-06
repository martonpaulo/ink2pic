# Contributing to Ink2Pic

Ink2Pic favors small, tested changes that keep the flow at three taps and need nothing outside the
Supernote. Read [`docs/product.md`](docs/product.md) for what belongs in the plugin and
[`docs/brief.md`](docs/brief.md) for the platform facts and the plan.

## Report a bug

Open an [issue](https://github.com/martonpaulo/ink2pic/issues) with the device, the firmware, the
Ink2Pic version and the steps. Report a vulnerability through GitHub's private advisory form, never
in a public issue.

## Local setup

Node.js 18 or newer, npm, Python 3 for the repository checks, and a JDK 21 whose `javac` is on
`PATH` for the native tests (on macOS with Homebrew: `export PATH="$(brew --prefix openjdk@21)/bin:$PATH"`,
because the keg is not linked and the system `java` stub fails with «Unable to locate a Java Runtime»):

```bash
git clone https://github.com/martonpaulo/ink2pic.git
cd ink2pic
npm ci
npm run validate
```

## Commands

| Command | What it does |
| :--- | :--- |
| `npm run validate` | Runs the full gate: lint, type check, tests and repository checks, as CI does. |
| `npm run lint` | Lints the code with the template's ESLint rules. |
| `npm run typecheck` | Checks TypeScript types without emitting files. |
| `npm test` | Runs the Jest unit tests. |
| `npm start` | Starts the Metro bundler. |

The package manager is npm, not pnpm: the template's build script calls `npx` and reads a flat
`node_modules` ([`AGENTS.md`](AGENTS.md#project-identity-and-policy)).

## Device tests

Only the owner can run a build on a Supernote. Each build sent for testing follows the protocol in
[brief section 18](docs/brief.md#18-device-test-protocol), and each result goes into
`docs/device-tests.md`.

## Commits

English [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), one concern per
commit, on `main`.
