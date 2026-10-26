import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { macReleaseNames, macUpdateManifest, compareMacVersions } from "./promote-mac-update.mjs";

test("Mac feed pins the immutable signed candidate ZIP with its digest and architecture", () => {
  const bytes = Buffer.from("synthetic ZIP");
  const manifest = macUpdateManifest("0.1.0-rc.15", "desk-mac-v0.1.0-rc.15-signed", { name: "8rney-mac-arm64-0.1.0-rc.15.zip", size: bytes.length, sha512: createHash("sha512").update(bytes).digest("base64") });
  assert.equal(manifest.version, "0.1.0-rc.15");
  assert.equal(manifest.files[0].url, "https://github.com/abhiwrld/8rney-downloads/releases/download/desk-mac-v0.1.0-rc.15-signed/8rney-mac-arm64-0.1.0-rc.15.zip");
  assert.equal(manifest.files[0].size, bytes.length);
  assert.ok(!manifest.files.some(file => file.url.includes("x64")));
});
test("promotion rejects demo, mismatched or unsafe version and artifact metadata", () => {
  for (const version of ["0.0.0", "0.0.0-rc.15", "../1.2.3", "1.2.3/evil", "1.2.3-rc.0"]) assert.throws(() => macReleaseNames(version, `desk-mac-v${version}-signed`));
  assert.throws(() => macReleaseNames("1.2.3", "desk-mac-v1.2.4-signed"));
  assert.throws(() => macUpdateManifest("1.2.3", "desk-mac-v1.2.3-signed", { name: "../bad.zip", size: 5, sha512: "bad" }));
});
test("promotion orders prereleases numerically and refuses regressions", () => {
  assert.equal(compareMacVersions("0.1.0-rc.15", "0.1.0-rc.14"), 1);
  assert.equal(compareMacVersions("0.1.0-rc.9", "0.1.0-rc.15"), -1);
  assert.equal(compareMacVersions("0.1.0", "0.1.0-rc.15"), 1);
  assert.equal(compareMacVersions("1.0.0", "1.0.0"), 0);
});
