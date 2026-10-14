/** Build check: no external asset/network references in source or the built bundle. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = (d: string, out: string[] = []): string[] => {
  for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p, out) : out.push(p); }
  return out;
};
let problems = 0;
const fail = (m: string) => { problems++; console.error('FAIL', m); };

// 1) built output: only html/js/css, no binary asset files, no remote URLs (SDK tag only in platform builds)
const dist = join(root, 'dist');
const files = walk(dist);
const bad = files.filter((f) => !['.html', '.js', '.css'].includes(extname(f)));
bad.forEach((f) => fail(`unexpected non-code file in build: ${f}`));
for (const f of files) {
  const txt = readFileSync(f, 'utf8');
  const urls = txt.match(/https?:\/\/[^\s"'`)<>]+/g) ?? [];
  // allow w3.org namespace strings used by SVG/DOM APIs
  const remote = urls.filter((u) => !/^https?:\/\/(www\.w3\.org|vitejs\.dev|reactjs\.org)/.test(u));
  if (remote.length) fail(`${f}: remote URLs: ${[...new Set(remote)].join(', ')}`);
}
// 2) source: no fetch/XHR/image/audio files referenced
for (const f of walk(join(root, 'src'))) {
  const txt = readFileSync(f, 'utf8');
  if (/\b(fetch|XMLHttpRequest)\s*\(/.test(txt)) fail(`${f}: network call`);
  if (/\.(png|jpe?g|gif|webp|mp3|ogg|wav|woff2?|ttf|glb|gltf|mp4)['"`]/i.test(txt)) fail(`${f}: references a binary asset file`);
  if (/new (Image|Audio)\s*\(/.test(txt)) fail(`${f}: loads image/audio element`);
}
console.log(problems ? `${problems} problem(s)` : `asset check OK (${files.length} build files, all code; no remote URLs, no binary assets)`);
process.exit(problems ? 1 : 0);
