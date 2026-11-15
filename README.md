# T3 Codex Proxy

T3 Codex Proxy is a local wrapper for the Codex app-server. It applies the
configured compatibility fixes, adds the `proxy-check` diagnostic, and can
grant configured directories to workspace-write turns. T3 itself is not
modified.

The package requires Node.js 24 or newer and an existing Codex CLI
installation. It has no runtime dependencies.

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
