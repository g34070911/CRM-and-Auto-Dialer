import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log(`Applying migration: ${f}`);
    await pool.query(sql);
  }
  console.log('Migrations complete.');
  await pool.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
