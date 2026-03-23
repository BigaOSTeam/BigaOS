#!/usr/bin/env node
/**
 * Build plugin tarballs and registry from plugin-sources/ for distribution.
 * Usage: node tools/build-plugins.js [plugin-id]
 * Output: plugin-sources/dist/<plugin-id>.tar.gz + registry.json
 */

const fs = require('fs');
const path = require('path');
const tar = require(path.join(__dirname, '..', 'server', 'node_modules', 'tar'));

const SOURCES_DIR = path.join(__dirname, '..', 'plugin-sources');
const OUTPUT_DIR = path.join(__dirname, '..', 'plugin-sources', 'dist');
const GITHUB_BASE = 'https://github.com/BigaOSTeam/BigaOS/raw/main/plugin-sources/dist';
const REPO_BASE = 'https://github.com/BigaOSTeam/BigaOS/tree/main/plugin-sources';

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

/**
 * Generate registry.json from all plugin.json manifests.
 */
function buildRegistry(pluginDirs) {
  const plugins = [];

  for (const dir of pluginDirs) {
    const manifestPath = path.join(SOURCES_DIR, dir, 'plugin.json');
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const downloadUrl = `${GITHUB_BASE}/${manifest.id}.tar.gz`;

    const versions = (manifest.versions || []).map(v => ({
      version: v.version,
      downloadUrl,
      releaseDate: v.date,
      changelog: v.changelog,
    }));

    plugins.push({
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      author: manifest.author,
      type: manifest.type,
      flag: manifest.flag || 'community',
      latestVersion: manifest.version,
      capabilities: manifest.capabilities || [],
      downloadUrl,
      repository: `${REPO_BASE}/${manifest.id}`,
      versions,
    });
  }

  const registry = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString().split('T')[0] + 'T00:00:00Z',
    plugins,
  };

  const registryPath = path.join(OUTPUT_DIR, 'registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
  console.log(`[+] Generated ${registryPath} (${plugins.length} plugins)`);
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
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const targetId = process.argv[2];
  const pluginDirs = targetId
    ? [targetId]
    : fs.readdirSync(SOURCES_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== 'dist')
        .map(d => d.name);

  for (const dir of pluginDirs) {
    await buildPlugin(dir);
  }

  // Always regenerate registry from all plugins
  const allDirs = fs.readdirSync(SOURCES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'dist')
    .map(d => d.name);
  buildRegistry(allDirs);

  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
