import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const projectRoot = path.join(__dirname, '..');
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const pluginJsonPath = path.join(projectRoot, 'openclaw.plugin.json');

  const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  const version = pkg.version;

  const pluginJson = JSON.parse(await fs.readFile(pluginJsonPath, 'utf8'));
  pluginJson.version = version;
  await fs.writeFile(pluginJsonPath, JSON.stringify(pluginJson, null, 2) + '\n', 'utf8');

  console.log(`✅ Bumped version across files to ${version}`);
}

main();
