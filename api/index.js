/**
 * Ingang voor Vercel. Elke aanvraag komt hier binnen en gaat naar dezelfde
 * handler als bij `npm start`. De app wordt één keer per instantie opgebouwd
 * en daarna hergebruikt, zodat niet elke aanvraag een nieuwe databaseverbinding
 * opzet.
 */
import { bouwApp } from '../server/index.js';

let appBelofte;

export default async function handler(req, res) {
  appBelofte ??= bouwApp();
  const app = await appBelofte;
  return app.handle(req, res);
}
