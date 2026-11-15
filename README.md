# T3 Codex Proxy

T3 Codex Proxy is a local wrapper for the Codex app-server. It applies the
configured compatibility fixes, adds the `proxy-check` diagnostic, and can
grant configured directories to workspace-write turns. T3 itself is not
modified.

The package requires Node.js 24 or newer and an existing Codex CLI
installation. It has no runtime dependencies.

## Why it exists

T3 adds orchestration guidance and tool descriptions to the Codex app-server.
Some releases have made that guidance too prescriptive for workflows that need
to keep their own review context, fixer assignment, wait deadlines, retry and
recovery rules, or tool choices. Browser instructions have also treated a URL
or page name as a reason to use browser automation even when an authenticated
API, CLI, or connector is the better interface. Workspace-write turns may
also need access to directories outside the normal project root.

## What it changes

- Rewrites only known, version-specific T3 guidance and tool descriptions so
  the user's workflow controls review routing, continuity, fixer assignment,
  delegate waits, PR waits, and browser versus API/CLI/connector selection.
- Preserves user input, tool results, schemas, unrelated guidance, and unknown
  wording. Unknown wording is reported instead of being broadly removed.
- Routes T3's local MCP connection through a loopback proxy and adds the
  read-only `proxy-check` diagnostic.
- Adds configured writable roots to `workspaceWrite` turns and reports each
  directory's proxy-process and Codex-turn write status.
- Reloads valid override and writable-root edits for later turns. It does not
  add a scheduler or timeout engine, and it does not modify T3 itself.

## Install

Install it in the environment that runs T3's Codex backend (inside the WSL
backend when T3 uses WSL):

```sh
npm install --global t3-codex-proxy
t3-codex-proxy configure
```

The explicit `configure` command prints a short-lived, token-protected
loopback URL. Open it locally, save the Codex executable path and any optional
settings, then close the page. It does not run during normal T3 startup.

In T3 Code, open **Settings → Providers → Codex**, select the provider that
uses the Codex CLI, and set **Binary path** to:

```sh
command -v t3-codex-proxy
```

Fully quit and reopen T3 Code so its shared app-server starts through the
wrapper. Existing conversations use the wrapper when resumed.

## Check the installation

Open a conversation with that provider and send:

```text
proxy-check
```

The diagnostic checks the T3 connection, compatibility guidance, MCP
connectivity, and every configured writable directory. A directory is green
only when both the proxy process and the Codex turn can create and delete a
marker file.

## Configuration

The setup page writes
`$XDG_CONFIG_HOME/t3-codex-proxy/config.json`, or
`~/.config/t3-codex-proxy/config.json` when `XDG_CONFIG_HOME` is unset.
Set `T3_CODEX_PROXY_CONFIG` to use another absolute path. The configuration
contains the absolute `realCodex` path, optional `additionalWritableRoots`,
and independent `overrides` for review workflow, PR waiting, and browser
routing. Changes to overrides and writable roots reload for later turns;
changing `realCodex` requires a T3 restart.

See [usage and compatibility details](docs/usage.md) and
[verification notes](docs/verification.md).

## Development

```sh
npm run check
npm test
npm run pack:check
```

For a release, publish a tagged npm version from this repository. Use Sapling
for repository history and commits.

MIT licensed. See [LICENSE](LICENSE) and
[third-party notices](THIRD_PARTY_NOTICES.md).
