import 'dotenv/config';
import app from './app.js';
import { ensureAdminAndRoles } from './seed/seedAdmin.js';

const PORT = process.env.PORT || 8080;

(async () => {
  // crea rol admin + usuario cufita/1969 si no existen
  await ensureAdminAndRoles();
  app.listen(PORT, () => console.log(`API lista en http://localhost:${PORT}`));
})();
