import 'dotenv/config';
import { pool } from '../src/db/client.js';
import { redis } from '../src/lib/redis.js';
import { runProvisioning } from '../src/modules/admin/provision-admin.service.js';
import { fileURLToPath } from 'url';
import path from 'path';

function printUsage() {
  console.log(`
Usage:
  npx tsx scripts/provision-admin.ts promote --email <email> [--password <password>] --confirm
  npx tsx scripts/provision-admin.ts demote --email <email> --confirm
  npx tsx scripts/provision-admin.ts cleanup --email <email> --confirm
  npx tsx scripts/provision-admin.ts cleanup --all --confirm
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const emailIndex = args.indexOf('--email');
  const email = emailIndex !== -1 ? args[emailIndex + 1] : undefined;
  const passwordIndex = args.indexOf('--password');
  const password = passwordIndex !== -1 ? args[passwordIndex + 1] : undefined;
  const confirm = args.includes('--confirm');
  const all = args.includes('--all');

  try {
    const result = await runProvisioning(command, { email, password, confirm, all });
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

const currentFilePath = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(currentFilePath) === path.resolve(process.argv[1]);

if (isMain) {
  main()
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    })
    .finally(async () => {
      await pool.end();
      await redis.quit();
    });
}
