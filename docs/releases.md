# Packaging and releases

The installable app is **Heaven's Door**, with application ID `com.pochihh.heavens-door`. macOS uses a DMG plus update ZIP; Windows uses a per-user NSIS installer with Start menu and desktop shortcuts. The supplied logo source is `src/assets/logo_v1_black.svg`. `build/icon.svg` uses it unchanged, and the PNG, ICNS and ICO exports live beside it. The Test icon uses the same logo with a deep-purple background (`#433266`) instead of black. Packaging includes built code and production dependencies, excluding workspaces, development references and source maps.

## Versions

`package.json` and its lock file hold the displayed version, initially **0.1.2**. `buildNumber` is a separate increasing native build identifier. It maps to `CFBundleVersion`/Windows file version as `N.0.0`, keeping the Euler patch sequence independent of native installer limits.

```sh
npm run version:bump -- --dry-run
npm run version:bump
# 0.1.2 -> 0.1.27 -> 0.1.271 -> 0.1.2718
npm run version:bump -- minor
# Starts the next minor series at .2
```

The script synchronizes both package versions, increments the build number, rejects mismatched files and non-Euler patches, and rolls back a failed write. SemVer components must remain safe integers; before the next Euler patch exceeds that limit, explicitly start a new minor series. Native build numbers stop at 9999. It does not commit, tag or publish automatically.

## Local packages

```sh
npm ci
npm run check
npm run package:mac -- --arm64
# On a Mac: --universal for Apple Silicon and Intel together.
npm run package:win -- --x64
# Prefer a Windows machine or the Windows Actions runner.
```

Outputs are in `release/`. Drag the macOS app to Applications; the Windows installer registers the app and creates its shortcuts. Neither installer removes Markdown workspaces. Uninstall does not remove app-owned preferences.

Without an Apple Developer account, macOS builds are ad-hoc signed for local use, without notarization. Downloads on another Mac will receive Gatekeeper warnings; the first installation needs explicit user approval. Sparkle verifies signed updates independently of Apple membership; **Open download page** remains available if the native bridge or feed fails. Windows builds are initially unsigned and can receive SmartScreen warnings.

## GitHub Actions

`Check` runs lint, tests and the production build for branches and pull requests. `Release` runs checks on macOS and Windows, builds a universal Mac package and a Windows x64 installer, and uploads installers, blockmaps and updater manifests. A `v<package version>` tag creates a **draft** GitHub release only after both builds succeed. Manual dispatch builds downloadable workflow artifacts without creating a release.

For a release:

1. Complete `npm run check` and test the installers on the target systems.
2. Commit the app changes, including package files and `buildNumber`.
3. Tag the same commit (initially `v0.1.2`) and push that tag to `pochihh/heavens-door`.
4. Inspect both installers and update metadata in the draft release.
5. Publish the draft after testing. Never replace a published version; bump the version instead. Workflow reruns refuse to overwrite a published release.

No credentials are stored in the app or source. Public GitHub releases work without a user token. The repository must contain the workflow before Actions can run it.

## Signing

To enable signed and notarized macOS builds, add repository Actions secrets `CSC_LINK` (Developer ID Application certificate as base64), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`. A paid Apple Developer Program account is needed. An App Store release is a separate workflow.

For signed Windows builds, add `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`. Signing does not immediately establish SmartScreen reputation. Configure certificates through GitHub secrets, never in the repository or client application.

## Update behavior

Packaged apps check once after startup. **Settings → About and updates** and the macOS application menu offer an explicit check. A newer version prompts the user; downloads and restarts require an explicit choice. Prereleases and downgrades are disabled, and checks/downloads are coalesced.

Windows uses `electron-updater` and its generated GitHub feed. macOS uses Sparkle with an Ed25519 public key embedded in the signed bundle. Both the appcast and update archive are authenticated, and archives are verified before extraction. Native build numbers decide Sparkle upgrade order; the Euler version remains the display version. Development builds and macOS bridge failures use website updates. An error always retains the website option; the updater never opens a URL supplied by release content. The current fallback URL is the GitHub latest-release page; change `DOWNLOAD_PAGE` in `src/updates.ts` when the landing page is ready.

An install asks **every open window** to flush drafts and workspace preferences through the existing save queue. A conflict, failed write, closed window or timeout cancels the install. The native installer runs only after all windows acknowledge their saves. Closing the app never silently installs a downloaded update.

Run `npm run test:sparkle` on a Mac before rollout. It builds isolated 0.1.2 and 0.1.27 apps, rejects a tampered archive, verifies that a save conflict cancels installation, saves drafts in two windows, and checks the native replacement and relaunch. It uses temporary notes and a loopback feed; neither personal workspaces nor public releases are touched. This test does not verify first-install Gatekeeper behavior on another Mac or the live GitHub feed.

References: [Electron Builder auto update](https://www.electron.build/v26/docs/features/auto-update/), [macOS signing](https://www.electron.build/v26/docs/features/code-signing/).

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

The currently installed ad-hoc build cannot install native macOS updates. Replace it manually with the first Developer ID signed build once. Subsequent published signed versions can use the in-app updater. Test that transition with two signed versions before inviting users. Keep the bundle ID `com.pochihh.heavens-door` and Apple Team identity stable.

## Sparkle for early macOS iterations

The bridge is pinned to `electron-sparkle-updater@0.5.3`. Its native addon is compiled for both architectures against unmodified upstream Sparkle 2.10.0 before packaging. The rebuild script pins and verifies the official archive SHA-256; the bridge’s older bundled framework is never shipped. Delta chains are disabled for this first pass; updates use the full ZIP. The public feed and public key live in `build/sparkle.json`. Only the public key is committed and embedded; never regenerate it for each release.

The private key was created in macOS Keychain under account `com.pochihh.heavens-door`, in the Sparkle signing-key item. Back it up securely: losing it prevents existing installations from trusting future updates. Use Sparkle's `generate_keys --account com.pochihh.heavens-door -x /secure/path/key` to export it to protected storage; keep the export out of the repository.

Local builds use that Keychain key:

```sh
npm run package:mac -- --universal
npm run sparkle:appcast
```

The appcast script checks that the signing key matches the app, signs the appcast and ZIP, and writes `release/sparkle/appcast.xml`. The release workflow uploads this file alongside the universal ZIP. For Actions, set repository secret `SPARKLE_PRIVATE_KEY` to the exported base64 seed. The script passes it to Sparkle through standard input; it is not written into a build artifact or printed. Release-feed creation fails if the secret is absent or mismatched. Apple credentials are optional while using ad-hoc builds.

The feed is `https://github.com/pochihh/heavens-door/releases/latest/download/appcast.xml`. Keep each ZIP at its immutable versioned release URL. The app checks GitHub's latest stable release to announce an update; Sparkle checks the corresponding signed feed only after the user chooses Download. Installation requires the user to choose Restart and install and all windows to finish saving. No update installs on ordinary quit.

The currently installed pre-Sparkle build needs one manual replacement with a Sparkle-enabled build. Later versions can update in the app. Publishing and the first real GitHub update remain separate from the local smoke test; a draft or prerelease will not appear in the current latest-stable feed.

## Temporary local test app

Keep the release version unchanged during back-and-forth development. Run:

```sh
npm run test:app -- /absolute/path/to/workspace
```

This creates and opens `.local/test-app/mac-arm64/Heaven's Door Test.app` on an Apple Silicon Mac (or `mac/` on Intel). Its name, Test badge icon, bundle ID (`com.pochihh.heavens-door.test`), and app data are separate from the installed release. Temporary versions are `current-release-test.N`; the local counter lives in `.local/test-app/build.json`. Nothing changes `package.json`'s release version, creates a tag or publishes a release. The Test build disables the release updater and automatic update checks. It uses an ad-hoc signature and is for local testing.

Quit Heaven's Door Test normally before rebuilding; the command refuses to overwrite a running Test app. Use `--no-open` to build without launching. Passing a workspace opens its real local files, so edits remain normal persistent edits; use a sample workspace for disposable tests. Avoid opening the same workspace in the stable and Test apps at the same time.

Only after the user confirms a release is ready should the Euler version script bump the regular version. Then use the existing build/sign/release workflow, and test updating the installed regular app through the release feed. The current local Test command targets macOS; it does not publish a Windows test installer.
