import { backfillTransparencyLog } from '../modules/verify/verify.service.js';
import { pool } from '../db/client.js';

try {
  process.stdout.write(`${JSON.stringify(await backfillTransparencyLog())}\n`);
} finally {
  await pool.end();
}
