import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = [manifest.background.service_worker, manifest.side_panel.default_path, manifest.options_page, ...manifest.content_scripts.flatMap(script => script.js)];
for (const file of files) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing extension file: ${file}`);
for (const file of files.filter(file => file.endsWith('.js'))) { const source = fs.readFileSync(path.join(root, file), 'utf8'); new Function(source.replace(/import .*?;\n/g, '').replace(/export /g, '')); }
if (manifest.manifest_version !== 3 || !manifest.permissions.includes('storage')) throw new Error('Invalid Manifest V3 configuration');
console.log(`Extension manifest valid: ${files.length} referenced files`);
