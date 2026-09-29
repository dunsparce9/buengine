import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePrecache } from '../editor/tools/generate-sw-precache.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const slash = (path) => path.split(sep).join('/');

// Only clean the fixed output directory; reject links to another location.
const actualDist = await realpath(dist).catch((error) => {
  if (error.code !== 'ENOENT') throw error;
  return dist;
});
if (resolve(actualDist) !== resolve(dist) || dirname(dist) !== resolve(root)) {
  throw new Error('Refusing to clean a dist directory outside this project.');
}
// Keep the directory itself: Windows can lock it while a static server uses it.
await mkdir(dist, { recursive: true });
for (const name of await readdir(dist)) {
  await rm(join(dist, name), { recursive: true, force: true });
}
await mkdir(join(dist, 'editor'), { recursive: true });

const result = await build({
  absWorkingDir: root,
  entryPoints: {
    'js/main': 'js/main.js',
    'editor/js/editor': 'editor/js/editor.js',
    'css/style': 'css/style.css',
    'css/material-symbols': 'css/material-symbols.css',
    'editor/css/editor': 'editor/css/editor.css',
  },
  outdir: dist,
  entryNames: '[dir]/[name]-[hash]',
  assetNames: 'assets/bundled/[name]-[hash]',
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: 'linked',
  metafile: true,
  loader: Object.fromEntries(
    ['.ttf', '.woff', '.woff2', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']
      .map((extension) => [extension, 'file'])
  ),
  logLevel: 'info',
});

for (const path of ['assets', 'games', 'editor/assets', 'editor/manifest.webmanifest', 'editor/sw.js']) {
  await cp(join(root, path), join(dist, path), { recursive: true });
}

// Use esbuild's metadata instead of guessing the hashed output filenames.
const outputs = Object.entries(result.metafile.outputs);
function outputFor(input) {
  const output = outputs.find(([, metadata]) => metadata.entryPoint === input
    || (!metadata.entryPoint && Object.hasOwn(metadata.inputs, input)));
  if (!output) throw new Error(`No build output found for ${input}`);
  return resolve(root, output[0]);
}

for (const htmlPath of ['index.html', 'editor/index.html']) {
  let html = await readFile(join(root, htmlPath), 'utf8');
  const htmlDir = dirname(htmlPath);
  for (const input of [
    'js/main.js', 'editor/js/editor.js', 'css/style.css',
    'css/material-symbols.css', 'editor/css/editor.css',
    'assets/fonts/material-symbols-outlined.ttf',
  ]) {
    const sourceRef = slash(relative(join(root, htmlDir), join(root, input)));
    const outputRef = slash(relative(join(dist, htmlDir), outputFor(input)));
    html = html.replaceAll(`src="${sourceRef}"`, `src="${outputRef}"`)
      .replaceAll(`href="${sourceRef}"`, `href="${outputRef}"`);
  }
  await writeFile(join(dist, htmlPath), html);
}

// The editor's worker does not control runtime tabs. Cache its bundles and shared
// font assets, leaving games, runtime-only bundles, and source maps on the host.
const emittedAssets = outputs.filter(([path, metadata]) => !path.endsWith('.map')
    && metadata.entryPoint !== 'js/main.js' && metadata.entryPoint !== 'css/style.css')
  .map(([path]) => slash(relative(join(dist, 'editor'), resolve(root, path))));
generatePrecache({ root: dist, releaseBuild: true, extraAssets: emittedAssets });
console.log('Release ready in dist/. Serve or upload its contents to a static host.');
