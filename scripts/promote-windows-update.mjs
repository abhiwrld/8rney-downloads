import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout} from 'node:timers/promises';
const {VERSION:version,INSTALLER_SHA256:expected,PROMOTION_ROOT:root,GITHUB_REPOSITORY:repo}=process.env;
assert.match(version,/^0\.1\.0-rc\.[1-9][0-9]*$/);assert.match(expected,/^[a-f0-9]{64}$/);assert.equal(repo,'abhiwrld/8rney-downloads');
const gh=(...args)=>execFileSync('gh',[...args,'--repo',repo],{encoding:'utf8'});
const alias='desk-windows-latest',file=`8rney-win-x64-${version}.exe`,source=path.join(root,file);
const data=fs.readFileSync(source),sha256=createHash('sha256').update(data).digest('hex'),sha512=createHash('sha512').update(data).digest('base64');assert.equal(sha256,expected);
const prior=await fetch(`https://github.com/${repo}/releases/download/${alias}/latest.yml?nocache=${Date.now()}`,{headers:{'Cache-Control':'no-cache'}});
if(prior.ok){const old=await prior.json();assert.match(old.version,/^0\.1\.0-rc\.\d+$/);assert.ok(Number(version.split('.').at(-1))>=Number(old.version.split('.').at(-1)),'Refusing a downgrade');}
else assert.equal(prior.status,404,'Previous Windows feed could not be checked');
const immutable=`https://github.com/${repo}/releases/download/desk-windows-v${version}/${file}`;
const manifest={version,files:[{url:immutable,sha512,size:data.length}],path:immutable,sha512,releaseDate:new Date().toISOString()};
const listing=JSON.parse(gh('release','list','--limit','100','--json','tagName'));if(!listing.some(r=>r.tagName===alias))gh('release','create',alias,'--title','8rney Windows x64 preview — latest','--notes','Unsigned Windows preview. Use Settings → Updates to check, download and restart.','--latest=false');
const rolling=path.join(root,'8rney-win-x64-latest.exe');const release=JSON.parse(execFileSync('gh',['api',`repos/${repo}/releases/tags/${alias}`],{encoding:'utf8'}));const existing=release.assets.find(a=>a.name==='8rney-win-x64-latest.exe');if(existing?.digest!==`sha256:${sha256}`||existing.size!==data.length){fs.copyFileSync(source,rolling);gh('release','upload',alias,rolling,'--clobber');}
const manifestFile=path.join(root,'latest.yml');fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');gh('release','upload',alias,manifestFile,'--clobber');
let publicFeed,delivered=false;for(let attempt=0;attempt<12;attempt++){publicFeed=await fetch(`https://github.com/${repo}/releases/download/${alias}/latest.yml?nocache=${Date.now()}`,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(publicFeed.ok){const actual=await publicFeed.json();if(JSON.stringify(actual)===JSON.stringify(manifest)){delivered=true;break;}}await setTimeout(5000);}assert.ok(delivered,'Published update metadata did not propagate to anonymous clients');
fs.writeFileSync(path.join(root,'promotion-receipt.json'),JSON.stringify({version,installerSha256:sha256,installerBytes:data.length,sha512,immutable,feed:`https://github.com/${repo}/releases/download/${alias}/latest.yml`,rollingInstaller:`https://github.com/${repo}/releases/download/${alias}/8rney-win-x64-latest.exe`,installerPublishedBeforeManifest:true,unsignedPreview:true},null,2)+'\n');console.log('Windows preview installer and OTA manifest promoted.');
