// Packages the Vite build (dist/) for publishing as a claude.ai Artifact.
//
// Artifact hosting serves only standard web file types, so binary formats the
// game needs (.glb .bin .hdr .efk .efkmat .efkmodel) ship as base64 text
// (<file>.b64.txt). A small loader shim injected into the page decodes them
// transparently for fetch() (three.js loaders) and XMLHttpRequest (Effekseer).
//
// Usage: npm run build:artifact
// Output: dist-artifact/index.html (the page), the supporting files, and
//         dist-artifact/.publish.json listing upload batches within host limits.
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'dist';
const OUT = 'dist-artifact';
const PACKED = /\.(glb|bin|hdr|efk|efkmat|efkmodel)$/i;
const AS_TEXT = /(\.gltf|\.fnt|\/LICENSE)$/i;
// Import metadata that the game never loads.
const SKIP = new Set([
  'index.html',
  'autoplay/source.json',
  'station/SOURCE.json',
  'station/material-sources.json',
  'lobby/SOURCE.json',
  'lobby/hunt-title-source.json',
  'lobby/operator-lobby-source.json',
  'castle/GENERATED-ASSETS.md',
  'reward-tags/GENERATED-ASSETS.md',
]);
const BATCH_FILES = 240;
const BATCH_BYTES = 58e6;

const SHIM = `<script>
(() => {
  // Binary assets are published as base64 text; decode them on load.
  const PACKED = ${PACKED};
  const isPacked = (u) => { try { return PACKED.test(new URL(String(u), document.baseURI).pathname); } catch { return false; } };
  const decode = (text) => {
    text = text.trim();
    if (Uint8Array.fromBase64) return Uint8Array.fromBase64(text);
    const s = atob(text), b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  };
  // Serve object URLs from memory so loaders never need a network fetch of blob: URLs.
  const blobs = new Map(), create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  URL.createObjectURL = (o) => { const u = create(o); if (o instanceof Blob) blobs.set(u, o); return u; };
  URL.revokeObjectURL = (u) => { blobs.delete(u); revoke(u); };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input && input.url;
    if (url && blobs.has(url)) return Promise.resolve(new Response(blobs.get(url)));
    if (url && isPacked(url)) {
      return nativeFetch(url + '.b64.txt', { signal: (init && init.signal) || (input && input.signal) || undefined })
        .then(async (r) => r.ok ? new Response(decode(await r.text()), { status: 200 }) : r);
    }
    return nativeFetch(input, init);
  };
  const open = XMLHttpRequest.prototype.open;
  const responseOf = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response').get;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (isPacked(url)) {
      let decoded;
      Object.defineProperty(this, 'response', { configurable: true, get() {
        const raw = responseOf.call(this);
        if (!(raw instanceof ArrayBuffer) || this.status !== 200) return raw;
        return (decoded ??= decode(new TextDecoder().decode(raw)).buffer);
      } });
      url = String(url) + '.b64.txt';
    }
    return open.call(this, method, url, ...rest);
  };
})();
</script>`;

if (!fs.existsSync(path.join(SRC, 'index.html'))) {
  console.error('dist/index.html not found. Run "npm run build" first.');
  process.exit(1);
}
fs.rmSync(OUT, { recursive: true, force: true });

// The host wraps the page in its own document skeleton, so keep only the content.
let page = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8')
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<\/?(html|head|body)(\s[^>]*)?>\s*/gi, '');
const title = page.match(/\s*<title>[^<]*<\/title>\s*/)[0];
page = title.trim() + '\n' + page.replace(title, '\n');
const firstScript = page.indexOf('<script');
page = page.slice(0, firstScript) + SHIM + '\n    ' + page.slice(firstScript);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), page);

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    const rel = path.relative(SRC, full).split(path.sep).join('/');
    if (SKIP.has(rel)) continue;
    const packed = PACKED.test(rel);
    const outRel = packed ? rel + '.b64.txt' : rel;
    const outFull = path.join(OUT, outRel);
    fs.mkdirSync(path.dirname(outFull), { recursive: true });
    if (packed) fs.writeFileSync(outFull, fs.readFileSync(full).toString('base64'));
    else fs.copyFileSync(full, outFull);
    const item = { path: outRel };
    if (AS_TEXT.test('/' + rel)) item.contentType = 'text/plain';
    files.push({ item, size: fs.statSync(outFull).size });
  }
})(SRC);

const batches = [];
let current = [], bytes = 0;
for (const { item, size } of files.sort((a, b) => a.item.path.localeCompare(b.item.path))) {
  if (current.length >= BATCH_FILES || bytes + size > BATCH_BYTES) { batches.push(current); current = []; bytes = 0; }
  current.push(item); bytes += size;
}
if (current.length) batches.push(current);
fs.writeFileSync(path.join(OUT, '.publish.json'), JSON.stringify(batches));

const total = files.reduce((n, f) => n + f.size, 0);
console.log(`${files.length} files, ${(total / 1e6).toFixed(1)} MB in ${batches.length} batches: ` +
  batches.map((b) => b.length).join(' + '));
