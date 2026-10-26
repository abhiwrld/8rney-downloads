# 8rney desktop downloads

Official desktop installers for 8rney, the legal AI workspace from Aeternum Ventures Private Limited.

[Download for Windows x64](https://8rney.com/download/windows)

Preview builds are identified as release candidates. Windows previews are currently unsigned and may show an unknown-publisher warning.

This repository distributes installer binaries and checksums. Product source, account data and credentials are not published here.

[Download for Mac (Apple silicon)](https://8rney.com/download/mac)

Mac releases are signed by Aeternum Ventures Private Limited and notarized by Apple. The public updater metadata is available at `https://8rney.com/desk/update/latest-mac.yml`; older clients reach it through `https://app.8rney.com/desk/update/latest-mac.yml`.

To publish a future Mac update, upload a signed and stapled `8rney-mac-arm64-VERSION.zip` and signed, notarized and stapled `8rney-mac-arm64-VERSION-signed.dmg` to the public candidate release `desk-mac-vVERSION-signed`. Verify a native download-and-restart upgrade, then run **Promote signed Mac update** from Actions. It checks immutable asset hashes, the signing team, Apple notarization tickets, and the app version before changing the installer and update manifest. A version must increase. After promotion, the workflow anonymously downloads the website installer and ZIP, checks their hashes and all three feed paths, and confirms that research still requires sign-in. Receipts are saved as workflow artifacts. The updater ZIP stays on its immutable candidate release; only the feed pointer and latest website installer change.

Clients check according to their saved update preferences. Downloading and restarting remain user controlled unless the user or firm enables automatic downloads. Firm policy still applies. The original rc.14 installer lacks updater packaging metadata and requires one installation of the replacement DMG. Builds labelled `0.0.0` also need one installation of a versioned release before they can update. Intel Mac and Windows update feeds are not enabled by this Mac release.
