import { openDb } from './db.js';
import { Store } from './store.js';

/** Vult een lege database met voorbeeldkaarten zodat je meteen ziet wat de app doet. */
export function seed(store, { stil = false } = {}) {
  const kaarten = [
    {
      company_name: 'Bakkerij Vermeulen', contact_name: 'Lieve Vermeulen', role: 'Zaakvoerder',
      email: 'lieve@bakkerijvermeulen.be', phone: '09 223 44 12', website: 'bakkerijvermeulen.be',
      vat_number: 'BE0123456749', street: 'Sleepstraat 42', postal_code: '9000', city: 'Gent',
      source: 'Doorverwijzing', tags: ['horeca', 'vaste klant'],
      notes: 'Twee vestigingen, Gent en Destelbergen. Lieve beslist zelf; haar zoon Jasper doet de sociale media.\n\nLevert brood aan drie scholen in de buurt. Wil op termijn online bestellingen.\n\nBellen liefst na 14u, voor die tijd staat ze in de winkel.',
    },
    {
      company_name: 'Garage Peeters & Zonen', contact_name: 'Tom Peeters', role: 'Eigenaar',
      email: 'tom@garagepeeters.be', phone: '011 45 67 89', vat_number: 'BE0456789133',
      street: 'Kempische Steenweg 118', postal_code: '3500', city: 'Hasselt',
      source: 'Beurs', tags: ['automotive'],
      notes: 'Prijsbewust, beslist traag, betaalt altijd stipt.\n\nVier mecaniciens. Doet vooral onderhoud, geen carrosserie — daarvoor stuurt hij door naar Carrosserie Gijbels.',
    },
    {
      company_name: 'Kapsalon Nova', contact_name: 'Sarah De Ridder', role: 'Zaakvoerster',
      email: 'hallo@kapsalonnova.be', phone: '03 234 56 78', website: 'kapsalonnova.be',
      street: 'Kloosterstraat 7', postal_code: '2000', city: 'Antwerpen',
      source: 'Instagram', tags: ['retail', 'antwerpen'],
      notes: 'Opent begin volgend jaar een tweede salon in Berchem.\n\nWerkt zonder afspraak; wil vooral online beter gevonden worden. Budget nog niet uitgesproken.',
    },
    {
      company_name: 'Bouwwerken Claes', contact_name: 'Dirk Claes', role: 'Zaakvoerder',
      email: 'info@bouwwerkenclaes.be', phone: '014 55 22 11', vat_number: 'BE0789456175',
      street: 'Steenweg op Gierle 200', postal_code: '2300', city: 'Turnhout',
      source: 'Doorverwijzing', tags: ['bouw'],
      notes: 'Ruwbouw en verbouwingen, ploeg van zes.\n\nBereikbaar op de gsm, mailt zelden terug. Facturatie loopt via zijn boekhouder.',
    },
    {
      company_name: 'Praktijk Vandenbroucke', contact_name: 'Dr. Els Vandenbroucke', role: 'Huisarts',
      email: 'praktijk@vdbroucke.be', phone: '056 21 33 90',
      street: 'Doorniksewijk 15', postal_code: '8500', city: 'Kortrijk',
      source: 'Website', tags: ['zorg'],
      notes: 'Groepspraktijk met drie artsen.\n\nAlles verloopt via het secretariaat (Ann), niet rechtstreeks met de artsen.',
    },
  ];

  let aantal = 0;
  for (const kaart of kaarten) {
    const res = store.createCustomer(kaart);
    if (res.ok) aantal++;
    else console.error('Seed mislukt voor', kaart.company_name, res.errors);
  }
  if (!stil) console.log(`${aantal} voorbeeldkaarten toegevoegd.`);
  return aantal;
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const store = new Store(openDb());
  const bestaand = store.listCustomers().length;
  if (bestaand > 0 && !process.argv.includes('--force')) {
    console.log(`Database bevat al ${bestaand} kaarten. Gebruik --force om toch te seeden.`);
  } else {
    seed(store);
  }
}
