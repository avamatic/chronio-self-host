import {readFileSync, writeFileSync, readdirSync, renameSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// This overlay deliberately targets an immutable upstream build. Required matches
// fail the image build if its structure changes; no heuristic runtime DOM patching.
const root = process.argv[2] || '/app';
const directory = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(join(directory, 'playlists-component.js'), 'utf8');
const replacements = new Map([
  ['/assets/nuvio-app-logo-wordmark.webp', '/assets/chronio-wordmark.png'],
  ['/assets/Logo_1080x1080.png', '/assets/chronio-mark.png'],
  ['Open Nuvio account dashboard', 'Open Chronio account dashboard'],
  ['Nuvio does not host or provide media.', 'Chronio does not host or provide media.'],
  ['One account for your Nuvio sync data across web, mobile, and TV.', 'One account for your Chronio sync data across web and TV.'],
  ['"Nuvio"', '"Chronio"'],
  [' | Nuvio', ' | Chronio'],
  ['"Nuvio Sync"', '"Chronio Sync"'],
  ['"Nuvio Library"', '"Chronio Library"'],
  ['your Nuvio account password', 'your Chronio account password'],
  ['supported Nuvio clients', 'supported Chronio clients'],
  ['Important: update every Nuvio client before relying on sync.', 'Playlist sync needs the updated Chronio TV build.'],
  ['Data sync requires Android TV 0.7.9 Beta or newer, mobile 0.2.9 Beta or newer, and the latest available desktop or webOS build. Older clients will not sync account data at all.', 'Install the latest Chronio TV build to synchronize playlist sources and selections. Older builds keep playlist settings on each device.'],
]);
const files = [];
function walk(path) {
  for (const entry of readdirSync(path, {withFileTypes:true})) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|json|html|rsc|meta)$/.test(entry.name)) files.push(full);
  }
}
walk(join(root, '.next'));
const documents = new Map(files.map(path => [path, readFileSync(path, 'utf8')]));
const counts = new Map([...replacements.keys()].map(term => [term, 0]));
const nav = '{key:"addons",label:"Addons",countKey:"addons"}';
let navigationCount = 0;
for (const [path, original] of documents) {
  let text = original;
  for (const [before, after] of replacements) {
    const count = text.split(before).length-1;
    counts.set(before, counts.get(before)+count);
    text = text.split(before).join(after);
  }
  navigationCount += text.split(nav).length-1;
  text = text.split(nav).join(nav+',{key:"playlists",label:"Playlists"}');
  documents.set(path, text);
}
for (const term of ['/assets/nuvio-app-logo-wordmark.webp', '/assets/Logo_1080x1080.png', 'Open Nuvio account dashboard', '"Nuvio"']) {
  if (!counts.get(term)) throw new Error(`Pinned dashboard branding marker missing: ${term}`);
}
if (navigationCount !== 2) throw new Error(`Expected server and browser navigation definitions, got ${navigationCount}`);
function once(path, before, after) {
  const text = documents.get(path);
  if (!text || text.split(before).length !== 2) throw new Error(`Pinned dashboard integration marker missing/ambiguous: ${before}`);
  documents.set(path, text.replace(before, after));
}
const client = files.find(path => /\/static\/chunks\/app\/account\/page-[^/]+\.js$/.test(path));
const server = join(root, '.next/server/app/account/page.js');
for (const [path, react, profile, loader, module, functionName, jsx, activeTab] of [
  [client, 'r', 'u', 'a', 5096, 'll', 'l', 'W'],
  [server, 'e', 'l', 'c', 44512, 'c7', 'd', 'Q'],
]) {
  const wrapper = `\n${component}\nfunction ChronioPlaylistPanel(){const profile=(0,${profile}.x)();return ${react}.createElement(ChronioPlaylistEditor,{React:${react},request:chronioPlaylistRequest,profileId:profile.activeProfileId,profileName:profile.activeProfile?.name,key:profile.activeProfileId});}\nfunction chronioPlaylistRequest(path,body){return ${loader}(${module}).A.request(path,{method:"POST",body,auth:true});}\n`;
  once(path, `function ${functionName}({onProfilePinChanged:`, wrapper+`function ${functionName}({onProfilePinChanged:`);
  once(path, `children:["overview"===${activeTab}?`, `children:["playlists"===${activeTab}?(0,${jsx}.jsx)(ChronioPlaylistPanel,{}):null,"overview"===${activeTab}?`);
}

// Next serves chunks with immutable caching. Give changed chunks and their runtime
// new URLs, updating both server manifests and the webpack chunk hash map.
const hashes = new Map();
const overlayId = createHash('sha256').update(component).update(JSON.stringify([...replacements])).digest('hex');
for (const [path, text] of documents) {
  if (!path.includes('/static/chunks/') || !path.endsWith('.js')) continue;
  if (text === readFileSync(path, 'utf8') && !/\/webpack-/.test(path)) continue;
  const match = path.match(/-([a-f0-9]{16})\.js$/);
  if (!match) throw new Error(`Cannot version changed chunk ${path}`);
  hashes.set(match[1], createHash('sha256').update(text).update(overlayId).digest('hex').slice(0,16));
}
for (const [path, original] of documents) {
  let text = original;
  for (const [before, after] of hashes) text = text.split(before).join(after);
  writeFileSync(path, text);
}
for (const path of documents.keys()) {
  if (!path.includes('/static/chunks/') || !path.endsWith('.js')) continue;
  const match = path.match(/-([a-f0-9]{16})\.js$/);
  if (match && hashes.has(match[1])) renameSync(path, path.replace(match[1], hashes.get(match[1])));
}
console.log(`Chronio dashboard overlay applied; ${hashes.size} browser chunks versioned.`);
