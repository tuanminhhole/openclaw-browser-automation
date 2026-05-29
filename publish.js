import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const srcDir = __dirname;
  const buildDir = path.join(srcDir, '..', 'openclaw-browser-automation-build');
  const pkgPath = path.join(srcDir, 'package.json');

  console.log('🚀 Starting ClawHub Release Workflow...');

  // 1. Read package.json to get version
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
  const version = pkg.version;
  console.log(`📦 Releasing openclaw-browser-automation@${version}...`);

  try {
    // 2. Package for ClawHub
    console.log('✈️ Preparing ClawHub package build folder...');
    try {
      await fs.rm(buildDir, { recursive: true, force: true });
    } catch (e) {}
    await fs.mkdir(buildDir, { recursive: true });

    const filesToCopy = [
      'package.json',
      'openclaw.plugin.json',
      'index.js',
      'search-tool.js',
      'browser-tool.js',
      'start-chrome-debug.bat',
      'start-chrome-debug.sh',
      'SKILL.md',
      'README.md',
      'README.vi.md',
      'LICENSE'
    ];

    for (const file of filesToCopy) {
      const srcFile = path.join(srcDir, file);
      const destFile = path.join(buildDir, file);
      try {
        await fs.copyFile(srcFile, destFile);
      } catch (err) {
        console.warn(`  ⚠ Warning: could not copy ${file}:`, err.message);
      }
    }

    // Get current git commit hash
    let commitHash = 'unknown';
    try {
      commitHash = execSync('git rev-parse HEAD', { cwd: srcDir, encoding: 'utf8' }).trim();
    } catch (e) {}

    // Publish to ClawHub
    console.log('✈️ Publishing package to ClawHub...');
    execSync(
      `npx clawhub package publish "${buildDir}" --source-repo="https://github.com/tuanminhhole/openclaw-smart-search" --source-commit="${commitHash}"`,
      { stdio: 'inherit', cwd: srcDir }
    );
    console.log('✨ ClawHub Publish Completed Successfully!');

  } catch (err) {
    console.error('❌ Error during release workflow:', err.message);
  } finally {
    // Cleanup build directory
    console.log('🧹 Cleaning up temporary build artifacts...');
    try {
      await fs.rm(buildDir, { recursive: true, force: true });
    } catch (e) {}
  }

  console.log('🎉 Release Workflow Finished Successfully!');
}

main();
