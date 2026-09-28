#!/usr/bin/env node
/** Generate the source editor precache, or the release precache from build output. */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_DIR = fileURLToPath(new URL('../../', import.meta.url));
const TEXT_EXTS = new Set(['.html', '.css', '.js', '.webmanifest', '.svg']);
const ASSET_EXTS = new Set([
  ...TEXT_EXTS, '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.ttf', '.woff', '.woff2',
]);
const extension = (path) => path.slice(path.lastIndexOf('.')).toLowerCase();
const slash = (path) => path.split(sep).join('/');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (entry.name === 'tools') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && ASSET_EXTS.has(extension(full))) out.push(full);
  }
  return out;
}

const normalizedText = (text) => text.replace(/\r\n/g, '\n');

export function generatePrecache({ root = PROJECT_DIR, releaseBuild = false, extraAssets = [] } = {}) {
  const editorDir = join(root, 'editor');
  const swPath = join(editorDir, 'sw.js');
  const editorAssets = walk(editorDir).filter((path) => path !== swPath)
    .map((path) => `./${slash(relative(editorDir, path))}`);
  const sharedAssets = releaseBuild ? [] : [
    '../js/shared/action-schema.js', '../js/shared/script-data.js',
    '../css/material-symbols.css', '../assets/fonts/material-symbols-outlined.ttf',
  ];
  const assets = [...new Set([
    ...editorAssets, ...sharedAssets, '../assets/images/seal.png',
    ...extraAssets.map((path) => path.startsWith('.') ? path : `./${path}`),
  ])].sort();
  const swSrc = readFileSync(swPath, 'utf8');
  const assetBlock = /const CORE_ASSETS = \[[\s\S]*?\];/;
  const versionDeclaration = /const CACHE_VERSION = '[^']*';/;
  const releaseDeclaration = /const RELEASE_BUILD = (?:true|false);/;
  if (![assetBlock, versionDeclaration, releaseDeclaration].every((pattern) => pattern.test(swSrc))) {
    throw new Error('Generated declarations not found in editor/sw.js');
  }

  const newline = swSrc.includes('\r\n') ? '\r\n' : '\n';
  const nextBlock = [
    'const CORE_ASSETS = [', "  './',",
    ...assets.map((asset) => `  '${asset}',`), '];',
  ].join(newline);
  const template = swSrc
    .replace(assetBlock, '/* generated precache list */')
    .replace(versionDeclaration, '/* generated cache version */')
    .replace(releaseDeclaration, `const RELEASE_BUILD = ${releaseBuild};`);
  const hash = createHash('sha256').update(normalizedText(template));
  for (const asset of assets) {
    const contents = readFileSync(join(editorDir, asset));
    const bytes = TEXT_EXTS.has(extension(asset)) ? normalizedText(contents.toString('utf8')) : contents;
    hash.update('\0' + asset + '\0');
    hash.update(createHash('sha256').update(bytes).digest());
  }
  const version = hash.digest('hex').slice(0, 16);
  const nextSource = swSrc.replace(assetBlock, () => nextBlock)
    .replace(versionDeclaration, `const CACHE_VERSION = '${version}';`)
    .replace(releaseDeclaration, `const RELEASE_BUILD = ${releaseBuild};`);
  if (swSrc !== nextSource) writeFileSync(swPath, nextSource);
  console.log(`${releaseBuild ? 'Release' : 'Source'} editor precache: ${assets.length + 1} URLs, version ${version}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generatePrecache();
}
