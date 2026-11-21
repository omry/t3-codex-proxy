# T3 Codex Proxy

T3 Codex Proxy is a local wrapper for the Codex app-server. It applies the
configured compatibility fixes, adds the `proxy-check` diagnostic, and can
grant configured directories to workspace-write turns. T3 itself is not
modified.

The package requires Node.js 24 or newer and an existing Codex CLI
installation. It has no runtime dependencies. On Windows, npm-installed
`codex.cmd` and `codex.bat` launchers are supported.

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
- Normalizes the known `next` waiting hint in identified waiting-tool replies
  and matching output-schema literals. Preserves task identity, status, timeout
  facts, input schemas, user input, and unrelated result data. Unknown guidance
  stays unchanged and is reported instead of being broadly removed.
- Routes T3's regular and direct MCP connections through a loopback proxy and
  adds the read-only `proxy-check` diagnostic.
- Adds configured writable roots to `workspaceWrite` turns and reports each
  directory's proxy-process and Codex-turn write status.
- Reloads valid override and writable-root edits for later turns. It does not
  add a scheduler or timeout engine, and it does not modify T3 itself.

## Install

Install it in the environment that runs T3's Codex backend (inside the WSL
backend when T3 uses WSL):

```sh
npm install --global t3-codex-proxy
```

## Configure the proxy

Run the one-shot setup page:

```sh
t3-codex-proxy configure
```

The explicit `configure` command prints a short-lived, token-protected
loopback URL. Open it locally, save the Codex executable path and any optional
settings, then close the page. The executable path must point to the original
Codex binary, not `t3-codex-proxy`. Run `configure` again whenever you want to
edit these settings.

The page writes a config with this shape:

```json
{
  "realCodex": "/absolute/path/to/codex",
  "additionalWritableRoots": [],
  "overrides": {
    "reviewWorkflow": true,
    "prWaiting": true,
    "browserRouting": true,
    "environmentRouting": true
  }
}
```

`additionalWritableRoots` is a list of absolute directories to add to
workspace-write turns. The four overrides are independent and default to
`true`; set one to `false` to leave that category of T3 guidance unchanged.
The diagnostic reports seven checks because `reviewWorkflow` controls four of
them; `prWaiting`, `browserRouting`, and `environmentRouting` control one each.
Valid changes to roots and overrides apply to later turns while the proxy is
running. Changing `realCodex` requires restarting T3.

The file is stored at
`$XDG_CONFIG_HOME/t3-codex-proxy/config.json`, or
`~/.config/t3-codex-proxy/config.json` when `XDG_CONFIG_HOME` is unset. Set
`T3_CODEX_PROXY_CONFIG` to use another absolute path.

## Configure T3

In T3 Code, open **Settings → Providers → Codex**, select the provider that
uses the Codex CLI, and set **Binary path** to:

```sh
command -v t3-codex-proxy
```

On Windows PowerShell, use the absolute path returned by
Get-Command t3-codex-proxy.

Then fully quit and reopen T3 Code. This restarts its shared app-server with
the wrapper. Existing conversations use the wrapper when resumed; a new
conversation is not required.

## Check the installation

Open a conversation with that provider and send:

```text
proxy-check
```

The diagnostic checks the T3 connection, compatibility guidance, MCP
connectivity, and every configured writable directory. A directory is green
only when both the proxy process and the Codex turn can create and delete a
marker file.

See [usage and compatibility details](docs/usage.md) and
[verification notes](docs/verification.md).

## Development

```sh
npm run check
npm test
npm run pack:check
```

See [RELEASE.md](RELEASE.md) for the release procedure, including npm
publication and the matching GitHub release. Use Sapling for repository history
and commits.

MIT licensed. See [LICENSE](LICENSE) and
[third-party notices](THIRD_PARTY_NOTICES.md).
