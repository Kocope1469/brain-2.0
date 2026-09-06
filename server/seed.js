import { openDb } from './db.js';
import { Store } from './store.js';
import { Auth } from './auth.js';

/** Datum n dagen geleden, als JJJJ-MM-DD. */
const dagenTerug = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/**
 * Voorbeeldklanten verspreid over Vlaanderen, met een bezoekgeschiedenis die
 * alle drie de kleurgroepen laat zien: recent bezocht, een tijdje geleden,
 * en lang niet meer geweest.
 */
export async function seed(store, { stil = false } = {}) {
  const klanten = [
    {
      klant: {
        external_id: 'CRM-1001', name: 'Demagro', contact_name: 'Peter Vandriessche', phone: '051 26 03 30',
        email: 'info@demagro.be', street: 'Diksmuidsesteenweg 406', postal_code: '8800',
        city: 'Roeselare', lat: 50.9556, lon: 3.1256, tags: ['voeders', 'west-vlaanderen'],
        notes: 'Peter is het aanspreekpunt voor voeders. Beslist zelf over voorraad.\nLevering liefst voor 10u.',
      },
      bezoeken: [
        { visit_date: dagenTerug(21), with_whom: 'Peter', notes: 'Nieuwe Type B voorraad besproken' },
        { visit_date: dagenTerug(128), with_whom: 'Peter', notes: 'Jaaroverzicht en prijzen doorgenomen' },
      ],
    },
    {
      klant: {
        external_id: 'CRM-1002', name: 'Landbouwbedrijf Vermeulen', contact_name: 'Lieve Vermeulen', phone: '09 223 44 12',
        email: 'lieve@lbvermeulen.be', street: 'Sleepstraat 42', postal_code: '9000',
        city: 'Gent', vat_number: 'BE0123456749', lat: 51.0596, lon: 3.7256,
        tags: ['akkerbouw', 'oost-vlaanderen'],
        notes: 'Twee percelen, tweede ligt richting Destelbergen.\nZoon Jasper neemt stilaan over.',
      },
      bezoeken: [
        { visit_date: dagenTerug(9), with_whom: 'Lieve', notes: 'Bemesting voorjaar doorgenomen' },
        { visit_date: dagenTerug(94), with_whom: 'Jasper', notes: 'Rondleiding nieuwe loods' },
        { visit_date: dagenTerug(210), with_whom: 'Lieve', notes: 'Contract verlengd voor twee jaar' },
      ],
    },
    {
      klant: {
        external_id: 'CRM-1003', name: 'Melkveebedrijf Claes', contact_name: 'Dirk Claes', phone: '014 55 22 11',
        email: 'info@claesmelkvee.be', street: 'Steenweg op Gierle 200', postal_code: '2300',
        city: 'Turnhout', vat_number: 'BE0789456175', lat: 51.3226, lon: 4.9447,
        tags: ['melkvee', 'antwerpen'],
        notes: 'Zeventig melkkoeien. Bereikbaar op de gsm, mailt zelden terug.',
      },
      bezoeken: [
        { visit_date: dagenTerug(47), with_whom: 'Dirk', notes: 'Klacht over vorige levering afgehandeld' },
      ],
    },
    {
      klant: {
        external_id: 'CRM-1004', name: 'Hoeve Peeters & Zonen', contact_name: 'Tom Peeters', phone: '011 45 67 89',
        email: 'tom@hoevepeeters.be', street: 'Kempische Steenweg 118', postal_code: '3500',
        city: 'Hasselt', vat_number: 'BE0456789133', lat: 50.9307, lon: 5.3378,
        tags: ['varkens', 'limburg'],
        notes: 'Prijsbewust, beslist traag, betaalt altijd stipt.',
      },
      bezoeken: [
        { visit_date: dagenTerug(72), with_whom: 'Tom', notes: 'Offerte voermengeling toegelicht' },
        { visit_date: dagenTerug(240), with_whom: 'Tom', notes: 'Eerste kennismaking op de beurs opgevolgd' },
      ],
    },
    {
      klant: {
        name: 'Fruitbedrijf Van Dijck', contact_name: 'An Van Dijck', phone: '016 22 88 41',
        street: 'Diestsesteenweg 90', postal_code: '3010', city: 'Leuven',
        lat: 50.8903, lon: 4.7204, tags: ['fruit', 'vlaams-brabant'],
        notes: 'Appelen en peren, verkoopt ook op de markt.\nAlles loopt via An, haar man doet enkel het veld.',
      },
      bezoeken: [
        { visit_date: dagenTerug(310), with_whom: 'An', notes: 'Kennismaking, nog geen bestelling' },
      ],
    },
    {
      klant: {
        name: 'Akkerbouw Deschutter', contact_name: 'Marc Deschutter', phone: '057 20 14 62',
        street: 'Poperingseweg 12', postal_code: '8900', city: 'Ieper',
        lat: 50.8503, lon: 2.8779, tags: ['akkerbouw', 'west-vlaanderen'],
        notes: 'Grote aardappelteler. Contract loopt tot eind volgend jaar.',
      },
      bezoeken: [
        { visit_date: dagenTerug(4), with_whom: 'Marc', notes: 'Oogstplanning en leveringsdata vastgelegd' },
        { visit_date: dagenTerug(60), with_whom: 'Marc', notes: 'Proefveld bekeken' },
      ],
    },
    {
      klant: {
        name: 'Tuinbouw Wauters', contact_name: 'Koen Wauters', phone: '053 21 45 90',
        street: 'Brusselsesteenweg 55', postal_code: '9300', city: 'Aalst',
        lat: 50.9378, lon: 4.0409, tags: ['tuinbouw', 'oost-vlaanderen'],
        notes: 'Serres, vooral tomaten. Kleine speler maar groeit snel.',
      },
      bezoeken: [],
    },
    {
      klant: {
        name: 'Veehouderij Gijbels', contact_name: 'Rita Gijbels', phone: '089 51 32 07',
        street: 'Bilzersteenweg 30', postal_code: '3700', city: 'Tongeren',
        lat: 50.7806, lon: 5.4639, tags: ['melkvee', 'limburg'],
        notes: 'Rita neemt de beslissingen, haar zoon staat in de stal.',
      },
      bezoeken: [
        { visit_date: dagenTerug(16), with_whom: 'Rita', notes: 'Nieuwe mengeling uitgeprobeerd, tevreden' },
      ],
    },
    {
      // bewust zonder coördinaten: toont hoe de app omgaat met klanten die nog niet op de kaart staan
      klant: {
        name: 'Loonwerk Byloos', contact_name: 'Stijn Byloos', phone: '013 44 21 08',
        postal_code: '3980', city: 'Tessenderlo', tags: ['loonwerk', 'limburg'],
        notes: 'Adres nog niet doorgekregen — stip staat nog niet op de kaart.',
      },
      bezoeken: [
        { visit_date: dagenTerug(35), with_whom: 'Stijn', notes: 'Telefonisch afgesproken langs te gaan' },
      ],
    },
  ];

  let aantal = 0;
  for (const rij of klanten) {
    const res = await store.createCustomer(rij.klant);
    if (!res.ok) {
      console.error('Seed mislukt voor', rij.klant.name, res.errors);
      continue;
    }
    for (const b of rij.bezoeken) await store.addVisit(res.value.id, b, 'Voorbeelddata');
    aantal++;
  }
  if (!stil) console.log(`${aantal} voorbeeldklanten toegevoegd.`);
  return aantal;
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const db = await openDb();
  const store = new Store(db);
  const bestaand = (await store.listCustomers()).length;
  if (bestaand > 0 && !process.argv.includes('--force')) {
    console.log(`Database bevat al ${bestaand} klanten. Gebruik --force om toch te seeden.`);
  } else {
    await seed(store);
  }
  // handig voor een demo: een gebruiker meegeven zodat je meteen kunt inloggen
  const auth = new Auth(db);
  if (process.env.SEED_GEBRUIKER && await auth.aantalGebruikers() === 0) {
    const [email, wachtwoord] = process.env.SEED_GEBRUIKER.split(':');
    const res = await auth.maakGebruiker({ email, name: 'Demo', wachtwoord });
    console.log(res.ok ? `Gebruiker ${email} aangemaakt.` : `Gebruiker niet aangemaakt: ${res.errors}`);
  }
  await db.close();
}
