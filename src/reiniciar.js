import fs from 'node:fs';
import { config } from './config.js';

if (process.env.TURSO_DATABASE_URL) {
  console.error('reset-db solo borra la base de datos LOCAL. Para Turso, borra y vuelve a crear la base desde turso.tech.');
  process.exit(1);
}
for (const sufijo of ['', '-wal', '-shm']) fs.rmSync(config.rutaBD + sufijo, { force: true });
const { iniciarBD, db } = await import('./db.js');
const { sembrar } = await import('./seed.js');
await iniciarBD();
await sembrar();
await db.cerrar();
console.log('Base de datos reiniciada con los datos de ejemplo.');
