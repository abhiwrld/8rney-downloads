"""Verify anonymous public delivery against the reviewed artifact hashes."""
import argparse, base64, hashlib, json, re, time, urllib.request, urllib.error
p = argparse.ArgumentParser()
p.add_argument('--version', required=True)
p.add_argument('--dmg-sha256', required=True)
p.add_argument('--zip-sha256', required=True)
a = p.parse_args()
assert re.fullmatch(r'\d+\.\d+\.\d+(?:-rc\.[1-9]\d*)?', a.version)
assert all(re.fullmatch(r'[a-f0-9]{64}', value) for value in [a.dmg_sha256, a.zip_sha256])

def get(url):
    # No authorization headers or cookie jar: installers and feeds must be public.
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': '8rney-release-check/1'}), timeout=120)

feeds = ['https://app.8rney.com/desk/update/latest-mac.yml', 'https://8rney.com/desk/update/latest-mac.yml', 'https://github.com/abhiwrld/8rney-downloads/releases/download/desk-macos-latest/latest-mac.yml']
manifests = []
for url in feeds:
    with get(url + '?verification=' + str(time.time_ns())) as response:
        assert response.status == 200
        manifests.append(json.load(response))
manifest = manifests[0]
assert all(m['version'] == a.version and m['files'] == manifest['files'] for m in manifests)
expected_zip = f'https://github.com/abhiwrld/8rney-downloads/releases/download/desk-mac-v{a.version}-signed/8rney-mac-arm64-{a.version}.zip'
assert len(manifest['files']) == 1 and manifest['files'][0]['url'] == expected_zip

def download_digest(url):
    sha256, sha512, size = hashlib.sha256(), hashlib.sha512(), 0
    with get(url) as response:
        assert response.status == 200
        while chunk := response.read(1024 * 1024):
            sha256.update(chunk)
            sha512.update(chunk)
            size += len(chunk)
    return {'sha256': sha256.hexdigest(), 'sha512': base64.b64encode(sha512.digest()).decode(), 'bytes': size}

installer = download_digest('https://8rney.com/download/mac')
assert installer['sha256'] == a.dmg_sha256, 'Website installer differs from the reviewed DMG'
zip_file = download_digest(expected_zip)
assert zip_file['sha256'] == a.zip_sha256
assert zip_file['sha512'] == manifest['files'][0]['sha512'] and zip_file['bytes'] == manifest['files'][0]['size']

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        return None
try:
    urllib.request.build_opener(NoRedirect).open('https://app.8rney.com/research', timeout=30)
    raise AssertionError('Protected research unexpectedly allowed an anonymous request')
except urllib.error.HTTPError as error:
    assert error.code == 307 and '/sign-in' in error.headers.get('Location', '')

receipt = {'version': a.version, 'anonymousFullInstallerDownload': installer, 'anonymousFullZipDownload': zip_file, 'validatedFeeds': feeds, 'protectedResearchStillRequiresSignIn': True}
with open('public-delivery-receipt.json', 'w') as f:
    json.dump(receipt, f, indent=2)
    f.write('\n')
print(json.dumps(receipt, indent=2))
