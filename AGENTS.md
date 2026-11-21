# Repository workflow

This repository uses Sapling for version control.

- Use `sl status`, `sl diff`, and `sl commit` for checkpoints.
- Do not use Git commands for repository history or commits.

## Release verification and approval

The executable release procedure is documented in [RELEASE.md](RELEASE.md).

- Before publishing, show the user evidence that the requested fix works and
  wait for their approval to publish. Tests and isolated smoke checks do not
  replace a live `proxy-check` for compatibility fixes. Verify the changed
  guidance in the running T3 session before claiming the live issue is fixed.
- Keep source changes and release artifacts local until this verification and
  approval are complete. Do not push release commits, create remote release
  tags, or publish npm packages before that point.
- npm release authentication uses the user's YubiKey through npm's browser
  approval flow. Start the appropriate npm web authentication or publication
  flow, give the user the approval URL, and wait for them to approve with their
  YubiKey. Continue the same pending command after approval.
- Do not request an npm token, YubiKey secret, PIN, private key, or pasted OTP
  as a substitute for browser approval. Do not use a secure credential card to
  collect these values for this release process.
- If live verification requires restarting T3's shared backend, explain the
  interruption and coordinate the restart with the user. Preserve the current
  workflow state so verification can resume after the restart.
