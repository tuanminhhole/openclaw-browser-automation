import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const srcDir = path.join(__dirname, '..');
  const buildDir = path.join(srcDir, '..', 'openclaw-browser-automation-build');
  const pkgPath = path.join(srcDir, 'package.json');

  console.log('🚀 Starting Browser Automation Release Workflow (Git & ClawHub)...');

  // 1. Read package.json to get version
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
  const version = pkg.version;
  console.log(`📦 Releasing openclaw-browser-automation@${version}...`);

  try {
    // 2. Commit and Push version bumps & changes to Git
    console.log('📤 Committing and Pushing version changes to GitHub main branch...');
    try {
      execSync('git add .', { stdio: 'inherit', cwd: srcDir });
      
      const commitMsg = `release: v${version}`;
      execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit', cwd: srcDir });
      
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: srcDir, encoding: 'utf8' }).trim();
      execSync(`git push origin ${currentBranch}`, { stdio: 'inherit', cwd: srcDir });
      console.log(`  ✓ Successfully pushed to GitHub ${currentBranch}!`);

      // Create and Push Git Tag
      try {
        console.log(`🏷️  Creating git tag v${version}...`);
        execSync(`git tag -a v${version} -m "Release v${version}"`, { stdio: 'inherit', cwd: srcDir });
        execSync(`git push origin v${version}`, { stdio: 'inherit', cwd: srcDir });
        console.log(`  ✓ Successfully pushed tag v${version} to GitHub!`);
      } catch (tagErr) {
        console.warn('⚠️ Tag creation failed or already exists:', tagErr.message);
      }
    } catch (gitErr) {
      console.warn('⚠️ Git push skipped or failed (possibly no changes or network issue):', gitErr.message);
    }

    // 3. Package for ClawHub
    console.log('✈️ Preparing ClawHub package build folder...');
    try {
      await fs.rm(buildDir, { recursive: true, force: true });
    } catch (e) {}
    await fs.mkdir(buildDir, { recursive: true });

    const filesToCopy = [
      'package.json',
      'openclaw.plugin.json',
      'index.js',
      'browser-tool.js',
      'start-chrome-debug.bat',
      'start-chrome-debug.sh',
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
      `npx clawhub package publish "${buildDir}" --source-repo="https://github.com/tuanminhhole/openclaw-browser-automation" --source-commit="${commitHash}"`,
      { stdio: 'inherit', cwd: srcDir }
    );
    console.log('✨ ClawHub Publish Completed Successfully!');

  } catch (err) {
    console.error('❌ Error during release workflow:', err.message);
  } finally {
    // 4. Cleanup build directory
    console.log('🧹 Cleaning up temporary build artifacts...');
    try {
      await fs.rm(buildDir, { recursive: true, force: true });
    } catch (e) {}
  }

  console.log('🎉 Release Workflow Finished Successfully!');
}

main();
