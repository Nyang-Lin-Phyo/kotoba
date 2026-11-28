#!/usr/bin/env node
/**
 * Copy the kuromoji.js runtime dictionary and its required notices into
 * resources/, which Electron Forge bundles as extra resources.
 *
 * Generated output is gitignored. The script is deterministic and fails loudly
 * when the pinned package or one of its dictionary files is missing.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'node_modules', 'kuromoji', 'dict');
const targetDir = path.join(root, 'resources', 'tokenizer', 'dict');
const noticeSource = path.join(root, 'node_modules', 'kuromoji');
const noticeTarget = path.join(root, 'resources', 'notices');

const REQUIRED = [
  'base.dat.gz',
  'cc.dat.gz',
  'check.dat.gz',
  'tid.dat.gz',
  'tid_map.dat.gz',
  'tid_pos.dat.gz',
  'unk.dat.gz',
  'unk_char.dat.gz',
  'unk_compat.dat.gz',
  'unk_invoke.dat.gz',
  'unk_map.dat.gz',
  'unk_pos.dat.gz',
];

function fail(message) {
  console.error(`copy_tokenizer_dict: ${message}`);
  process.exit(1);
}

if (!existsSync(sourceDir)) fail('kuromoji is not installed. Run npm ci first.');
const allFiles = readdirSync(sourceDir).filter((name) => name.endsWith('.dat.gz'));
const present = new Set(allFiles);
for (const name of REQUIRED) {
  if (!present.has(name)) fail(`missing dictionary file ${name}`);
  if (statSync(path.join(sourceDir, name)).size === 0) fail(`empty dictionary file ${name}`);
}

mkdirSync(path.join(root, 'resources', 'tokenizer'), { recursive: true });
mkdirSync(noticeTarget, { recursive: true });
const partial = path.join(root, 'resources', 'tokenizer', 'dict.partial');
rmSync(partial, { recursive: true, force: true });
mkdirSync(partial, { recursive: true });

let bytes = 0;
for (const name of allFiles) {
  const file = path.join(sourceDir, name);
  copyFileSync(file, path.join(partial, name));
  bytes += statSync(file).size;
}

for (const [from, to] of [
  ['LICENSE-2.0.txt', 'APACHE-2.0-kuromoji.txt'],
  ['NOTICE.md', 'IPADIC-NOTICE.txt'],
]) {
  const source = path.join(noticeSource, from);
  if (!existsSync(source)) fail(`missing required licence notice ${from}`);
  copyFileSync(source, path.join(noticeTarget, to));
}

rmSync(targetDir, { recursive: true, force: true });
renameSync(partial, targetDir);
console.log(`copy_tokenizer_dict: ${allFiles.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MiB`);
