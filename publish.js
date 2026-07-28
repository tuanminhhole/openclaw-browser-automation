/**
 * ClawHub release for openclaw-browser-automation.
 *
 * Publishes from the GitHub repo, not from a local build folder. A local-folder publish with
 * --source-commit is what shipped 1.3.7: ClawHub accepted it and scanned it clean, but the
 * release never became resolvable ("Version not found") and the `latest` tag never moved, so
 * nobody could install it. Publishing the pushed commit — the same way the other openclaw-*
 * plugins do it — is the path that actually lands.
 *
 * Preconditions checked below, because both of them silently publish the wrong thing:
 *   - clean working tree (ClawHub reads GitHub, not your disk)
 *   - the current commit is pushed to origin/main
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = 'tuanminhhole/openclaw-browser-automation';

function git(args) {
  return execSync(`git ${args}`, { cwd: __dirname, encoding: 'utf8' }).trim();
}

async function main() {
  const pkg = JSON.parse(await fs.readFile(path.join(__dirname, 'package.json'), 'utf8'));
  const plugin = JSON.parse(await fs.readFile(path.join(__dirname, 'openclaw.plugin.json'), 'utf8'));
  console.log(`🚀 Releasing openclaw-browser-automation@${pkg.version} from ${REPO}@main`);

  if (plugin.version !== pkg.version) {
    console.error(`✖ openclaw.plugin.json says ${plugin.version}, package.json says ${pkg.version}. Run: node docs/bump-version.js`);
    process.exit(1);
  }

  const dirty = git('status --porcelain');
  if (dirty) {
    console.error('✖ Working tree is not clean. Commit and push first — ClawHub publishes what is on GitHub:\n' + dirty);
    process.exit(1);
  }

  const head = git('rev-parse HEAD');
  let remoteHead = '';
  try {
    remoteHead = git('ls-remote origin refs/heads/main').split(/\s+/)[0];
  } catch (err) {
    console.error(`✖ Could not read origin/main: ${err.message}`);
    process.exit(1);
  }
  if (head !== remoteHead) {
    console.error(`✖ HEAD (${head.slice(0, 7)}) is not what origin/main points at (${remoteHead.slice(0, 7)}). Push first.`);
    process.exit(1);
  }

  // No --source-commit: passing it is what the stuck 1.3.7 publish did.
  execSync(`npx clawhub package publish ${REPO}`, { stdio: 'inherit', cwd: __dirname });

  console.log(`\n✨ Published. Verify the tag actually moved (promotion is async):`);
  console.log(`   npx clawhub package inspect openclaw-browser-automation --version ${pkg.version}`);
  console.log(`   npx clawhub package inspect openclaw-browser-automation | grep -i latest`);
}

main();
