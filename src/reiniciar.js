import fs from 'node:fs';
import { config } from './config.js';
for (const sufijo of ['', '-wal', '-shm']) fs.rmSync(config.rutaBD + sufijo, { force: true });
const { sembrar } = await import('./seed.js');
sembrar();
console.log('Base de datos reiniciada con los datos de ejemplo.');
