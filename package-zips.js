#!/usr/bin/env node
'use strict';

// Packages each shipped topic into a self-contained zip for web-team handoff.
// No npm deps (project convention: no build step). Zips via PowerShell's
// built-in Compress-Archive — Node's zlib only does gzip/deflate streams,
// not the ZIP container format, and no zip library is installed in this repo.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPO_ROOT = __dirname;
const OUT_DIR = path.join(REPO_ROOT, 'dist-zips');

const TOPIC_NAME_RE = /^graphics_module_|^graphics_diploma_module_/i;
const EXPLICIT_TOPICS = ['Module1', 'Module2'];

function discoverTopics() {
  const entries = fs.readdirSync(REPO_ROOT, { withFileTypes: true });
  const topics = entries
    .filter((e) => e.isDirectory() && TOPIC_NAME_RE.test(e.name))
    .map((e) => e.name);
  for (const name of EXPLICIT_TOPICS) {
    if (fs.existsSync(path.join(REPO_ROOT, name))) topics.push(name);
  }
  return topics.sort();
}

function walkFiles(dir, baseDir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, baseDir, out);
    } else if (entry.isFile()) {
      out.push(path.relative(baseDir, full));
    }
  }
  return out;
}

// Whitelist, not blacklist: only files empirically confirmed necessary for
// the sim to boot ship. Root *.html/*.js (covers Module1's seven pages,
// each with its own script, and single-sim topics' index.html + main.js),
// the whole src/ tree (verified repo-wide to hold only runtime .js/.css,
// no docs/dev artifacts), and meta.json (RULES.md §2.11 — the platform's
// upload pipeline rejects a zip without it, even though no in-sim JS
// fetches it at runtime — see package-zips.js audit, 2026-08-08).
function collectTopicFiles(topicDir) {
  const files = [];

  for (const entry of fs.readdirSync(topicDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (/\.(html|js)$/i.test(entry.name)) files.push(entry.name);
  }

  const srcDir = path.join(topicDir, 'src');
  if (fs.existsSync(srcDir)) {
    for (const rel of walkFiles(srcDir, topicDir, [])) files.push(rel);
  }

  const metaPath = path.join(topicDir, 'meta.json');
  if (fs.existsSync(metaPath)) {
    files.push('meta.json');
  } else {
    console.warn(`  WARNING: ${path.basename(topicDir)} has no meta.json — upload will be rejected (RULES.md §2.11)`);
  }

  return files;
}

function stageAndZip(topicName, topicDir, files) {
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simatrix-zip-'));
  try {
    for (const rel of files) {
      const src = path.join(topicDir, rel);
      const dest = path.join(stagingDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }

    const zipPath = path.join(OUT_DIR, `${topicName}.zip`);
    if (fs.existsSync(zipPath)) fs.rmSync(zipPath);

    execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Compress-Archive -Path "${stagingDir}\\*" -DestinationPath "${zipPath}" -Force`,
    ]);

    return zipPath;
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const topics = discoverTopics();
  console.log(`Discovered ${topics.length} topics.\n`);

  const results = [];
  for (const topicName of topics) {
    const topicDir = path.join(REPO_ROOT, topicName);
    const files = collectTopicFiles(topicDir);
    const zipPath = stageAndZip(topicName, topicDir, files);
    const size = fs.statSync(zipPath).size;
    results.push({ topicName, fileCount: files.length, size });
    console.log(`  ${topicName}: ${files.length} files, ${(size / 1024).toFixed(1)} KB`);
  }

  const totalSize = results.reduce((sum, r) => sum + r.size, 0);
  console.log(`\n${results.length} zips written to ${OUT_DIR}`);
  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
}

main();
