# Release process

This repository publishes stable releases to npm and creates a matching GitHub
release. Use Sapling for repository history and commits.

## 1. Prepare the candidate

1. Confirm the intended version in `package.json` and update the compatibility
   table and fixtures when the release changes supported behavior.
2. Run the complete checks:

   ```sh
   npm run check
   npm test
   npm run pack:check
   ```

3. For compatibility changes, run a live `proxy-check` in the running T3
   session. Record whether the version is tested or assumed compatible.
4. Complete the required independent review, PR review, and CI checks for the
   exact candidate head. Keep the source tree and release artifacts local until
   the evidence is shown to the user and publication is approved.

## 2. Merge the PR

1. Open or update the PR from the release branch.
2. Confirm the exact head, base, review result, and required checks.
3. Merge using the repository's enabled merge method. Record the resulting
   merge commit and verify that the merged tree matches the reviewed tree.

## 3. Build and publish npm

1. Confirm that the version is not already published:

   ```sh
   npm view t3-codex-proxy@VERSION version
   ```

2. Build the package outside the checkout and inspect the actual tarball:

   ```sh
   mkdir -p /tmp/t3-codex-proxy-release-VERSION
   npm pack --cache /tmp/t3-codex-proxy-release-VERSION/cache \
     --json --pack-destination /tmp/t3-codex-proxy-release-VERSION
   ```

   Verify the version, file list, checksums, and that the contents match the
   reviewed checkout. Do not include review files, tests, temporary files, or
   credentials in the package.

3. Start npm's browser flow with a private user config and give the user the
   approval URL:

   ```sh
   npm login --auth-type=web --browser=false \
     --registry=https://registry.npmjs.org \
     --userconfig=/tmp/t3-codex-proxy-release-VERSION/npmrc \
     --cache=/tmp/t3-codex-proxy-release-VERSION/cache
   ```

   The user approves with their YubiKey. Continue the same pending command
   after approval. Never request or paste an npm token, PIN, OTP, or secret.

4. Publish the exact verified tarball with the public `latest` tag:

   ```sh
   npm publish /tmp/t3-codex-proxy-release-VERSION/t3-codex-proxy-VERSION.tgz \
     --access=public --tag=latest --auth-type=web --browser=false \
     --registry=https://registry.npmjs.org \
     --userconfig=/tmp/t3-codex-proxy-release-VERSION/npmrc \
     --cache=/tmp/t3-codex-proxy-release-VERSION/cache
   ```

5. Wait for registry processing, then verify the version, `latest` tag,
   checksum, integrity, and downloaded tarball bytes. Remove the temporary npm
   config after publication.

## 4. Create the GitHub release

Create the tag and release at the verified merge commit. Include the release
notes, validation evidence, npm link, and any compatibility qualification:

```sh
gh release create vVERSION \
  --repo omry/t3-codex-proxy \
  --target MERGE_COMMIT \
  --title vVERSION \
  --latest \
  --notes-file RELEASE_NOTES.md
```

Verify that the tag points to `MERGE_COMMIT`, the release is published and not
draft or prerelease, and GitHub marks it as the latest release.

## 5. Close out

Record the npm and GitHub URLs, published checksums, merge commit, review and
CI evidence, and any assumed-compatibility qualification. Use `sl status` to
confirm that only intentional local files remain. Do not delete unrelated
review evidence or generated files that were present before the release.
