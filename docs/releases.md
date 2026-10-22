# Packaging and releases

The installable app is **Heaven's Door** (`com.pochihh.heavens-door`). Stable releases contain a universal macOS DMG and update ZIP, a Windows x64 NSIS installer, and signed update metadata. The normal release path below uses the existing Mac Keychain signing key; no CI signing secret is needed. Keep development on **Heaven's Door Test** until the user explicitly approves a stable version bump.

## Normal release workflow

Run these commands from the repository root on macOS, with Node.js 24.21+, Git, Xcode command-line tools, and an authenticated GitHub CLI (`gh auth status`). Install dependencies with `npm ci` when the lock file changes. The push URL for `origin` must match `package.json`'s GitHub repository. Commit the feature changes before preparing a release.

1. Write the release notes in `.local/release-notes.md`, including the user-facing changes and any known limitations. `.local/` is ignored by Git.
2. Preview the next Euler version without changing any files:

   ```sh
   npm run release -- plan
   ```

3. After approval to bump, prepare the candidate:

   ```sh
   npm run release -- prepare --notes .local/release-notes.md
   ```

   This increments the displayed version and native build number once, copies the notes to `docs/releases/<version>.md`, and commits those three files. The prepared commit becomes the source for every subsequent checkpoint. Repeating this command resumes an unfinished preparation instead of bumping again. `--kind minor` and `--kind major` start a new Euler series at `.2`.

4. Build and stage a private draft:

   ```sh
   npm run release -- stage
   npm run release -- status
   ```

   Staging runs the checks below, builds both platforms, signs the Mac feed, pushes the prepared commit to `origin/main` without force, waits for **Check** to pass for that exact commit, creates a GitHub draft, and verifies every uploaded file. It does not publish a release or expose an update in the app. Review the release notes and the draft. Test the Windows installer on Windows before broader distribution; a successful cross-build does not verify Windows runtime behavior.

5. After release approval, publish:

   ```sh
   npm run release -- publish
   ```

   This rechecks the source, local artifacts, CI, draft assets and release tag, then publishes the draft as the latest stable release. It verifies the anonymous public feed and download URLs, retrying briefly for GitHub propagation. Publishing creates the `v<version>` tag at the prepared commit; it never force-pushes a tag or replaces a published asset.

`prepare` changes versions and commits; `stage` pushes source and uploads a draft; **`publish` is the only local command that makes the update public**. No command installs the release into your regular app. Use that app's updater afterward for longer-term testing.

## Checkpoints and recovery

State and append-only build logs live in `.local/releases/<version>/`. `state.json` records the source SHA, completed checkpoints, artifact sizes and SHA-256 hashes; it contains no signing key. A lock prevents overlapping local release commands. These files are local recovery data, not source files to commit.

| Checkpoint | Required evidence |
| --- | --- |
| Prepared | Clean source tree; synchronized package/lock versions; committed release notes and version bump |
| Checks | Lint, TypeScript, all tests and production build pass |
| Sparkle | Isolated native update/relaunch test passes, including tamper rejection, save-conflict cancellation and two-window saves |
| Mac | Universal arm64/x86_64 bundle; valid code signature; correct identity/version/build/feed/public key; required application bundles; signed ZIP and signed appcast; ZIP contents agree with the verified app |
| Windows | x64 installer and manifest; required application bundles with the stable app identity/version/build |
| Verified | Both manifests match installer sizes and SHA-512 hashes; all eight distribution files and a SHA-256 checksum file are recorded |
| CI | GitHub **Check** passed for the prepared source SHA |
| Staged | Draft targets the prepared SHA; all nine uploads match GitHub's reported sizes and SHA-256 digests |
| Published | Immutable release/tag agree with the candidate; anonymous latest-release API, feed, manifests, checksums and download URLs work |

When interrupted, repeat the same command. Completed checkpoints are reused only while the source commit and recorded artifact bytes are unchanged. A partially successful upload resumes with the missing files. An incomplete GitHub `starter` asset can be removed and retried; a different completed asset stops the process for inspection. The workflow never uses upload `--clobber`.

- **Failed version commit:** fix the Git hook or other reported error, then repeat `prepare`. Its pending journal preserves the original and intended files; the version does not increase again. Unrelated edits stop recovery instead of being overwritten or committed.
- **Failed test/build:** inspect `checks.log`, `sparkle.log`, `mac.log` or `win.log` in the version's checkpoint folder. Fix an environment problem and repeat `stage`. If source code must change, commit the fix and prepare a new candidate with `prepare --next --notes .local/release-notes.md`.
- **Source changed after preparation:** complete and commit the changes, then use `prepare --next`. Keep the abandoned draft unpublished. The driver deliberately refuses to reuse the old version for different source.
- **Recorded artifacts changed or were deleted:** restore the exact recorded files from a trusted copy, or prepare a new candidate with `--next`. Do not clear a successful checkpoint just to bypass a mismatch.
- **Upload/network failure:** repeat `stage`. Correctly uploaded assets are compared and retained.
- **Publication succeeded but public verification failed:** repeat `publish`. It verifies the already-published release and retries the public endpoints without publishing a second time. You can also run `npm run release -- verify-public` when the current package version is the latest release and its local distribution files are available.
- **Stopped process left a lock:** run `npm run release -- unlock`, then repeat the command. Unlock refuses while the recorded release process or its build child is still running. Stop that work normally first.

Keep `.local/releases/` and `release/` until publication and verification finish. After a successful release, retain the checkpoint data for diagnosis; GitHub retains the immutable published artifacts. Fix published releases by creating a new version, never by replacing their files.

## Automated verification and tests

```sh
npm run test:release
# Release/version unit and recovery tests only; uses temporary repositories,
# synthetic signing keys and mocked GitHub responses, never a real publication.

npm run check
# Full application checks, including the release tests.

npm run release -- verify
# Audit current local Mac + Windows distribution files and unpacked apps.
npm run release -- verify --platform mac
npm run release -- verify --platform win

npm run release -- verify-public
# Audit the current latest stable release using anonymous public requests.
# Requires all nine local distribution files; does not change any files.
```

The tests exercise failed preparation commits, checkpoint reuse, changed source/artifacts, concurrent command protection, interrupted uploads, wrong/missing signing metadata, tampered feed/archive bytes, incorrect packaged app identity, exact-SHA CI gating, publication recovery and the GitHub preflight. `stage` additionally runs `npm run test:sparkle` on every new candidate: this uses temporary notes and a loopback update feed, leaving personal workspaces and public releases untouched.

Local verification cannot establish first-install Gatekeeper or SmartScreen behavior on another machine. It also does not replace testing new UI behavior in the Test app or testing the Windows installer on Windows.

## GitHub Actions

**Check** runs lint, tests and the production build on branch pushes and pull requests. Local staging waits for its success at the prepared commit.

**Release** handles `v*` tags and manual dispatch. Its first job verifies package metadata and the tag. If that version is already published, it skips packaging successfully: a locally published release no longer starts redundant builds that need a CI signing key. If packaging is needed but `SPARKLE_PRIVATE_KEY` is absent, it stops immediately with an actionable message, before expensive builds.

Hosted packaging is optional. To use it, deliberately configure `SPARKLE_PRIVATE_KEY` in repository Actions secrets. The private key is never uploaded automatically by local tooling. The matrix runs checks, native Mac update tests, builds a universal Mac package and Windows x64 installer, then calls the same artifact verifier as the local driver. Successful tag builds create a **draft only**, using committed `docs/releases/<version>.md`, with verified checksums and resumable uploads. Manual dispatch creates workflow artifacts only. No Actions job automatically publishes a release.

Use one packaging route for each candidate. The recommended prepare/stage/publish path owns its local checkpoint state. A separately built hosted draft is a separate review path; it is not automatically adopted by local checkpoints, because installers rebuilt from the same source can have different signatures/timestamps. Do not mix the routes or overwrite a mismatched draft. Keep the local driver as the standard path while the signing key stays in Keychain.

## Versions and low-level packaging

`package.json` and its lock file hold the displayed version. Patches append Euler digits: `0.1.2 → 0.1.27 → 0.1.271 → 0.1.2718`. `buildNumber` independently increases and maps to native `N.0.0`, avoiding native installer component limits. Before an Euler patch exceeds JavaScript's safe integer range, start a new minor series. Native build numbers stop at 9999.

The lower-level `npm run version:bump -- --dry-run` and `npm run version:bump -- [patch|minor|major]` remain available for maintenance. They synchronize package files and roll back a failed write, but do not record release checkpoints, commit, tag or publish. Use `release prepare` for regular releases; do not manually bump again during a prepared release.

For an installer without a release:

```sh
npm run package:mac -- --universal
npm run package:win -- --x64
```

Outputs are in `release/`. macOS also supports `--arm64` for local packaging, but stable artifact verification requires the universal bundle. The Windows NSIS installer is per-user and creates Start menu/desktop shortcuts. Neither installer removes Markdown workspaces. Uninstall keeps app-owned preferences.

The supplied logo source is `src/assets/logo_v2_black.svg`. `build/icon.svg` uses it unchanged; PNG, ICNS and ICO exports live beside it. The Test icon has a warm-orange background (`#d85b32`). Packaging excludes workspaces, development references and source maps.

## Signing and update behavior

Sparkle's public key and latest-stable feed URL live in `build/sparkle.json`. Keep that key and `com.pochihh.heavens-door` stable. The private key is stored locally in macOS Keychain under account `com.pochihh.heavens-door`; losing it prevents existing installations from trusting future updates. Back it up to protected storage using Sparkle's key-export tooling, outside the repository. Never print it in logs, chat, release notes or artifacts.

The bridge is pinned to `electron-sparkle-updater@0.5.3`, rebuilt for both architectures against unmodified upstream Sparkle 2.10.0. The rebuild script checks the official archive's pinned SHA-256. Updates use a full ZIP, with delta chains disabled. `sparkle:appcast` validates the signing key against the embedded public key and signs both the archive and feed. It reads Keychain locally or `SPARKLE_PRIVATE_KEY` on CI and passes the secret through standard input.

Ad-hoc macOS signing works with Sparkle without Apple membership, but first-time downloads on another Mac can receive Gatekeeper warnings and require explicit approval. Developer ID signing/notarization improves that first-install experience. Windows builds are initially unsigned and may receive SmartScreen warnings. For Windows signing, configure `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`; certificates belong in protected local storage or GitHub secrets, not source.

Packaged apps check after startup. **Settings → General** shows the installed version and update controls; the macOS application menu also offers an explicit check. A newer version prompts the user; downloading and restarting require explicit choices. Prereleases and downgrades are disabled. The macOS native feed is `https://github.com/pochihh/heavens-door/releases/latest/download/appcast.xml`; Windows uses `latest.yml`. **Open download page** remains available if in-app updating fails. Its URL comes from `DOWNLOAD_PAGE` in `src/updates.ts`, never from arbitrary release content.

Before installation, every open window must flush drafts and workspace preferences through the save queue. A conflict, failed write, closed window or timeout cancels installation. Ordinary quit does not silently install a downloaded update. A pre-Sparkle app needs one manual replacement; later Sparkle-enabled versions can use the in-app updater.

## First-time Apple setup

1. [Enroll in the Apple Developer Program](https://developer.apple.com/programs/enroll/). Individual enrollment is suitable for a solo developer; it needs an Apple Account with two-factor authentication and your legal identity. Membership is USD 99 per year, with regional pricing. Enrollment, identity verification, agreements and payment are completed by the account holder.
2. In Keychain Access, choose **Certificate Assistant → Request a Certificate From a Certificate Authority**. Enter your email and a recognizable key name, leave the CA email blank, and save the CSR to disk. [Apple CSR instructions](https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request).
3. In Apple Developer **Certificates, Identifiers & Profiles → Certificates → +**, choose **Developer ID Application**, upload the CSR, download the certificate and double-click it to install in the same Mac's keychain. The Application certificate signs our app; Developer ID Installer is for PKG installers, which this project does not use. [Apple Developer ID instructions](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/).
4. Export that signing identity, including its private key, from Keychain Access **My Certificates** as a password-protected `.p12`. Store the certificate and password securely. Keep them out of chat, source files and releases.
5. Generate an [app-specific password](https://support.apple.com/en-us/102654) for notarization. This is separate from your Apple Account password. Find your Team ID in the Apple Developer account's Membership details.
6. Under the GitHub repository's **Settings → Secrets and variables → Actions**, add:

   | Secret | Value |
   | --- | --- |
   | `CSC_LINK` | Base64 encoding of the `.p12`, without line breaks |
   | `CSC_KEY_PASSWORD` | The password you assigned when exporting the `.p12` |
   | `APPLE_ID` | Your Apple Account email |
   | `APPLE_APP_SPECIFIC_PASSWORD` | The generated app-specific password |
   | `APPLE_TEAM_ID` | Your Apple Developer Team ID |

7. Build and test the first signed/notarized release, then publish its draft on GitHub. The workflow handles signing, notarization and the updater ZIP/manifest. Direct distribution does not require a Mac App Store listing.

Sparkle also supports our ad-hoc signed builds; Apple membership is not required for the current in-app update path. Developer ID signing and notarization improve first-install distribution. Test the transition to Developer ID signing before inviting more users, keeping the bundle ID `com.pochihh.heavens-door` and the Sparkle public key stable.

## Temporary local Test app

Keep the stable version unchanged during back-and-forth development:

```sh
npm run test:app -- /absolute/path/to/workspace
```

This creates and opens `.local/test-app/mac-arm64/Heaven's Door Test.app` on Apple Silicon (`mac/` on Intel). Its name, orange Test icon, bundle ID `com.pochihh.heavens-door.test`, and app data are separate from the installed stable app. Versions use `current-release-test.N`, with the counter in `.local/test-app/build.json`; package versions, tags and public releases stay unchanged. Test builds disable the stable updater.

Quit the Test app normally before rebuilding; the command refuses to overwrite a running copy. Use `--no-open` to build without launching. A workspace passed to this command contains real files and edits persist. Avoid opening the same workspace in the stable and Test apps simultaneously. The local Test command currently targets macOS.
