// Aplica migrações pendentes e sai. Uso: npm run migrate (ou `node dist-server/scripts/migrate.js`).
import {openDatabase, databasePath, migrationsDir} from '../../lib/runtime/env';
import {runMigrations} from '../../lib/runtime/migrate';

const db = openDatabase(databasePath(), {migrate: false});
const {applied, skipped} = runMigrations(db, migrationsDir(), (m: string) => console.log(m));
console.log(`banco: ${databasePath()} · aplicadas: ${applied.length} · já existentes: ${skipped}`);
db.close();
