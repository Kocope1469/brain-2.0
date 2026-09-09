/**
 * Ingang voor Vercel. Elke aanvraag komt hier binnen en gaat naar dezelfde
 * handler als bij `npm start`. De app wordt één keer per instantie opgebouwd
 * en daarna hergebruikt, zodat niet elke aanvraag een nieuwe databaseverbinding
 * opzet.
 *
 * De app wordt bewust pas ín de handler ingeladen. Zou dat bovenaan gebeuren en
 * er ging iets mis bij het laden, dan valt de hele functie om vóór onze
 * foutafhandeling draait, en zie je enkel een kale 500 zonder uitleg.
 */

let appBelofte;

async function bouw() {
  const { bouwApp } = await import('../server/index.js');
  return bouwApp();
}

export default async function handler(req, res) {
  let app;
  try {
    appBelofte ??= bouw();
    app = await appBelofte;
  } catch (err) {
    // een mislukte start niet onthouden: anders blijft deze instantie stuk,
    // ook nadat de database wél gekoppeld is
    appBelofte = undefined;
    console.error('[klantenkaart] opstarten mislukt:', err);

    // altijd JSON terugsturen; het platform zou er anders een tekstpagina van
    // maken en dan ziet de gebruiker enkel "Unexpected token" in de browser
    const body = JSON.stringify({
      errors: [err.message || 'De app kon niet opstarten.'],
      hulp: 'Kijk in de logs van je hosting naar de regel die begint met [klantenkaart].',
    });
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    return res.end(body);
  }
  return app.handle(req, res);
}
