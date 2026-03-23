#!/usr/bin/env node
/**
 * Build plugin tarballs from plugin-sources/ for distribution.
 * Usage: node tools/build-plugins.js [plugin-id]
 * Output: plugin-sources/dist/<plugin-id>.tar.gz
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const tar = require(path.join(__dirname, '..', 'server', 'node_modules', 'tar'));

const SOURCES_DIR = path.join(__dirname, '..', 'plugin-sources');
const OUTPUT_DIR = path.join(__dirname, '..', 'plugin-sources', 'dist');

async function buildPlugin(pluginId) {
  const srcDir = path.join(SOURCES_DIR, pluginId);
  const manifestPath = path.join(srcDir, 'plugin.json');

  if (!fs.existsSync(manifestPath)) {
    console.log(`Skipping ${pluginId} (no plugin.json)`);
    return;
  }

  console.log(`[>] Building ${pluginId}...`);

  // Stage in a temp directory
  const tmpDir = path.join(OUTPUT_DIR, `_tmp_${pluginId}`);
  const stageDir = path.join(tmpDir, pluginId);

  // Clean previous temp
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  fs.mkdirSync(stageDir, { recursive: true });

  // Copy source files (skip node_modules)
  copyDirSync(srcDir, stageDir, ['node_modules']);

  // For plugins with package.json, DON'T bundle node_modules in the tarball.
  // The target machine (e.g. Raspberry Pi) needs to run npm install itself
  // so native modules like i2c-bus compile for the correct platform.
  // The plugin manager runs npm install post-extraction.
  if (fs.existsSync(path.join(stageDir, 'node_modules'))) {
    fs.rmSync(path.join(stageDir, 'node_modules'), { recursive: true });
  }

  // Create tarball using Node's tar module (works cross-platform)
  const tarball = path.join(OUTPUT_DIR, `${pluginId}.tar.gz`);
  await tar.create(
    { gzip: true, file: tarball, cwd: tmpDir },
    [pluginId]
  );

  // Clean up temp
  fs.rmSync(tmpDir, { recursive: true });

  const stats = fs.statSync(tarball);
  const sizeKB = Math.round(stats.size / 1024);
  console.log(`[+] Built ${tarball} (${sizeKB} KB)`);
}

function copyDirSync(src, dest, exclude = []) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (exclude.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirSync(srcPath, destPath, exclude);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function main() {
  const targetId = process.argv[2];

  if (targetId) {
    await buildPlugin(targetId);
  } else {
    const dirs = fs.readdirSync(SOURCES_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== 'dist');
    for (const dir of dirs) {
      await buildPlugin(dir.name);
    }
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
