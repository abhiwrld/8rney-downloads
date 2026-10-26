#!/usr/bin/env node
// Promote an already signed candidate. Run explicitly on a Mac after upgrade testing.
import { createHash } from "node:crypto";
import { createReadStream, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const MAC_RELEASE_REPOSITORY = "abhiwrld/8rney-downloads";
export const MAC_UPDATE_TAG = "desk-macos-latest";
const team = "DJY72WH77T";
export function macReleaseNames(version, tag) {
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-rc\.[1-9]\d*)?$/.test(version) || version.startsWith("0.0.0")) throw new Error("A nonzero release version is required");
  if (tag !== `desk-mac-v${version}-signed`) throw new Error("Candidate tag must match the version");
  return { zip: `8rney-mac-arm64-${version}.zip`, dmg: `8rney-mac-arm64-${version}-signed.dmg` };
}
export function macUpdateManifest(version, tag, zip) {
  const names = macReleaseNames(version, tag);
  if (zip.name !== names.zip || !Number.isSafeInteger(zip.size) || zip.size < 1 || !/^[A-Za-z0-9+/]{86}==$/.test(zip.sha512)) throw new Error("Invalid ZIP metadata");
  return { version, files: [{ url: `https://github.com/${MAC_RELEASE_REPOSITORY}/releases/download/${tag}/${names.zip}`, sha512: zip.sha512, size: zip.size }], releaseDate: new Date().toISOString() };
}
export function compareMacVersions(a, b) {
  const parse = value => { macReleaseNames(value, `desk-mac-v${value}-signed`); const [core, rc] = value.split("-rc."); return [...core.split(".").map(Number), rc === undefined ? Infinity : Number(rc)]; };
  const left = parse(a), right = parse(b);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
async function digests(file) {
  const sha256 = createHash("sha256"), sha512 = createHash("sha512"); let size = 0;
  for await (const bytes of createReadStream(file)) { sha256.update(bytes); sha512.update(bytes); size += bytes.length; }
  return { name: path.basename(file), size, sha256: sha256.digest("hex"), sha512: sha512.digest("base64") };
}
const run = (command, args) => execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 });
const gh = args => run("gh", [...args, "--repo", MAC_RELEASE_REPOSITORY]);
function verifyApp(app, version) {
  const config = readFileSync(path.join(app, "Contents/Resources/app-update.yml"), "utf8");
  if (!/^updaterCacheDirName:\s*['"]?[A-Za-z0-9][A-Za-z0-9._-]*['"]?\s*$/m.test(config)) throw new Error("Missing updater download metadata in candidate app");
  run("codesign", ["--verify", "--deep", "--strict", app]);
  const identity = spawnSync("codesign", ["-dv", "--verbose=4", app], { encoding: "utf8" });
  if (identity.status !== 0 || !identity.stderr.split("\n").includes(`TeamIdentifier=${team}`)) throw new Error("Unexpected signing team");
  const actual = run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", path.join(app, "Contents/Info.plist")]).trim();
  if (actual !== version) throw new Error("App version does not match the candidate");
  run("xcrun", ["stapler", "validate", app]);
  run("spctl", ["--assess", "--type", "execute", app]);
}
async function main() {
  const args = process.argv.slice(2), option = name => args[args.indexOf(name) + 1];
  for (const flag of ["--version", "--release-tag", "--assets-dir"]) if (!args.includes(flag) || !option(flag)) throw new Error(`Missing ${flag}`);
  const version = option("--version"), tag = option("--release-tag"), directory = path.resolve(option("--assets-dir"));
  const names = macReleaseNames(version, tag), zip = path.join(directory, names.zip), dmg = path.join(directory, names.dmg);
  const metadata = await Promise.all([digests(zip), digests(dmg)]);
  const manifest = macUpdateManifest(version, tag, metadata[0]);
  if (args.includes("--dry-run")) { console.log(JSON.stringify({ repository: MAC_RELEASE_REPOSITORY, tag: MAC_UPDATE_TAG, manifest, artifacts: metadata }, null, 2)); return; }
  if (process.platform !== "darwin") throw new Error("Promotion requires macOS trust checks");
  const release = JSON.parse(gh(["release", "view", tag, "--json", "assets,isDraft"]));
  if (release.isDraft) throw new Error("Publish the candidate before promotion");
  for (const file of metadata) {
    const asset = release.assets.find(asset => asset.name === file.name);
    if (asset?.size !== file.size || asset.digest !== `sha256:${file.sha256}`) throw new Error(`Candidate asset digest mismatch: ${file.name}`);
  }
  let existing = null;
  try { existing = JSON.parse(gh(["release", "view", MAC_UPDATE_TAG, "--json", "assets"])); } catch { /* First promotion creates the feed. */ }
  if (existing?.assets.some(asset => asset.name === "latest-mac.yml")) {
    const previous = run("curl", ["--fail", "--silent", "--show-error", "--location", `https://github.com/${MAC_RELEASE_REPOSITORY}/releases/download/${MAC_UPDATE_TAG}/latest-mac.yml`]);
    writeFileSync(path.join(directory, "previous-latest-mac.yml"), previous);
    const current = JSON.parse(previous);
    if (compareMacVersions(version, current.version) <= 0) throw new Error("Promotion must increase the feed version");
  }
  const temporary = mkdtempSync(path.join(tmpdir(), "8rney-promote-mac-"));
  let mounted = false; const mount = path.join(temporary, "mount");
  try {
    // Reject archive traversal and additional root payloads before extraction.
    run("python3", ["-c", 'import zipfile,sys,pathlib; z=zipfile.ZipFile(sys.argv[1]); assert all(not p.is_absolute() and ".." not in p.parts and p.parts[0]=="8rney.app" for p in map(pathlib.PurePosixPath,z.namelist()))', zip]);
    run("ditto", ["-x", "-k", zip, temporary]); verifyApp(path.join(temporary, "8rney.app"), version);
    run("codesign", ["--verify", "--strict", dmg]); run("xcrun", ["stapler", "validate", dmg]);
    run("spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", dmg]);
    run("hdiutil", ["verify", dmg]); run("hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, dmg]); mounted = true;
    verifyApp(path.join(mount, "8rney.app"), version);
    const manifestPath = path.join(temporary, "latest-mac.yml"); writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    if (!existing) gh(["release", "create", MAC_UPDATE_TAG, "--title", "8rney Mac updates", "--notes", "Signed and notarized Apple silicon Mac release feed. Versioned ZIPs are immutable candidate assets.", "--prerelease", "--latest=false"]);
    // Make the website installer available before committing the update pointer.
    gh(["release", "upload", MAC_UPDATE_TAG, `${dmg}#8rney-mac-arm64-latest.dmg`, "--clobber"]);
    gh(["release", "upload", MAC_UPDATE_TAG, `${manifestPath}#latest-mac.yml`, "--clobber"]);
    writeFileSync(path.join(directory, "promotion-receipt.json"), JSON.stringify({ version, tag, feedTag: MAC_UPDATE_TAG, manifest, artifacts: metadata, signingTeam: team, trustChecksPassed: true }, null, 2) + "\n");
    console.log(`Promoted Mac ${version}; installer and update feed published.`);
  } finally { if (mounted) run("hdiutil", ["detach", mount]); rmSync(temporary, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
