#!/usr/bin/env node
/**
 * Regenerate the editor service-worker precache list from disk
 * (review phase 5, item 18).
 *
 * The hand-curated CORE_ASSETS in editor/sw.js drifted out of sync
 * (6+ files missing; cache.addAll is atomic, so one bad URL kills
 * install). Run this after adding/renaming editor files:
 *
 *   node editor/tools/generate-sw-precache.mjs
 *
 * It scans editor/ for web assets, rewrites only the CORE_ASSETS block
 * in sw.js, and preserves everything else (CACHE_NAME, strategies).
 * No build step — dev-only tooling, safe to run by hand.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const EDITOR_DIR = join(fileURLToPath(import.meta.url), '..', '..');
const SW_PATH = join(EDITOR_DIR, 'sw.js');

const INCLUDE_EXTS = new Set(['.html', '.css', '.js', '.webmanifest', '.svg']);
const EXCLUDE_DIRS = new Set(['tools']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = relative(EDITOR_DIR, full).split(sep).join('/');
    if (statSync(full).isDirectory()) {
      if (EXCLUDE_DIRS.has(rel.split('/')[0]) || EXCLUDE_DIRS.has(name)) continue;
      walk(full, out);
    } else {
      out.push(rel);
    }
  }
  return out;
}

function discoverAssets() {
  const editorAssets = walk(EDITOR_DIR)
    .filter((rel) => {
      if (rel === 'sw.js') return false;
      const dot = rel.lastIndexOf('.');
      if (dot < 0) return false;
      return INCLUDE_EXTS.has(rel.slice(dot));
    })
    .map((rel) => `./${rel}`)
    .sort();
  // Neutral runtime modules imported by the editor must also work offline.
  return [...editorAssets, '../js/action-schema.js', '../js/script-data.js'];
}

function buildSwBody(assets) {
  const lines = [
    "const CORE_ASSETS = [",
    "  './',",
    ...assets.map((a) => `  '${a}',`),
    "];",
  ];
  return lines.join('\n');
}

const assets = discoverAssets();
const swSrc = readFileSync(SW_PATH, 'utf8');

const start = swSrc.indexOf('const CORE_ASSETS = [');
const end = swSrc.indexOf('];', start);
if (start < 0 || end < 0) {
  console.error('CORE_ASSETS block not found in sw.js');
  process.exit(1);
}

const prevBlock = swSrc.slice(start, end + 2);
const nextBlock = buildSwBody(assets);

if (prevBlock === nextBlock) {
  console.log(`sw.js precache already in sync (${assets.length} assets).`);
  process.exit(0);
}

const prevAssets = [...prevBlock.matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1]);
const added = assets.filter((a) => a !== './' && !prevAssets.includes(a));
const removed = prevAssets.filter((a) => a !== './' && !assets.includes(a));

writeFileSync(SW_PATH, swSrc.slice(0, start) + nextBlock + swSrc.slice(end + 2));
console.log(`Wrote ${assets.length} precache entries to editor/sw.js.`);
if (added.length) console.log(`  added: ${added.join(', ')}`);
if (removed.length) console.log(`  removed: ${removed.join(', ')}`);
