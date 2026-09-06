import { openDb } from './db.js';
import { Store } from './store.js';

/** Vult een lege database met voorbeelddata zodat je meteen ziet wat de app doet. */
export function seed(store, { stil = false } = {}) {
  const dag = (verschuiving) => {
    const d = new Date();
    d.setDate(d.getDate() + verschuiving);
    return d.toISOString().slice(0, 10);
  };

  const data = [
    {
      klant: {
        company_name: 'Bakkerij Vermeulen', contact_name: 'Lieve Vermeulen', email: 'lieve@bakkerijvermeulen.be',
        phone: '09 223 44 12', website: 'bakkerijvermeulen.be', vat_number: 'BE0123456749',
        street: 'Sleepstraat 42', postal_code: '9000', city: 'Gent', status: 'actief',
        source: 'Doorverwijzing', tags: ['horeca', 'vaste klant'],
        intro: 'Twee vestigingen. Lieve beslist zelf, haar zoon Jasper doet de sociale media.',
      },
      contact: [
        { type: 'bezoek', subject: 'Jaargesprek in de winkel', body: 'Wil in het najaar een webshop voor bestellingen.', occurred_at: dag(-12) },
        { type: 'email', subject: 'Offerte webshop verstuurd', occurred_at: dag(-9) },
        { type: 'telefoon', subject: 'Offerte goedgekeurd', occurred_at: dag(-5) },
      ],
      opdrachten: [
        { title: 'Website + fotografie', amount: '3.400,00', status: 'betaald', deal_date: dag(-380) },
        { title: 'Webshop met afhaalmodule', amount: '5.200,00', status: 'gewonnen', deal_date: dag(-5) },
      ],
      taken: [{ title: 'Kickoff webshop inplannen', due_date: dag(3) }],
    },
    {
      klant: {
        company_name: 'Garage Peeters & Zonen', contact_name: 'Tom Peeters', email: 'tom@garagepeeters.be',
        phone: '011 45 67 89', vat_number: 'BE0456789133', postal_code: '3500', city: 'Hasselt',
        status: 'actief', source: 'Beurs', tags: ['automotive'],
        intro: 'Prijsbewust. Beslist traag maar betaalt altijd op tijd.',
      },
      contact: [
        { type: 'offerte', subject: 'Offerte onderhoudscontract', occurred_at: dag(-40) },
        { type: 'telefoon', subject: 'Nog geen beslissing, terugbellen', occurred_at: dag(-18) },
      ],
      opdrachten: [
        { title: 'Onderhoudscontract website', amount: '1.200,00', status: 'gefactureerd', deal_date: dag(-60) },
        { title: 'Uitbreiding afsprakenmodule', amount: '2.750,00', status: 'offerte', deal_date: dag(-18) },
      ],
      taken: [{ title: 'Terugbellen over afsprakenmodule', due_date: dag(-2) }],
    },
    {
      klant: {
        company_name: 'Kapsalon Nova', contact_name: 'Sarah De Ridder', email: 'hallo@kapsalonnova.be',
        phone: '03 234 56 78', postal_code: '2000', city: 'Antwerpen', status: 'prospect',
        source: 'Instagram', tags: ['retail', 'antwerpen'],
        intro: 'Start binnenkort een tweede salon. Budget nog onduidelijk.',
      },
      contact: [{ type: 'telefoon', subject: 'Eerste kennismaking', body: 'Wil vooral online zichtbaarder worden.', occurred_at: dag(-3) }],
      opdrachten: [{ title: 'Voorstel huisstijl + site', amount: '2.100,00', status: 'offerte', deal_date: dag(-2) }],
      taken: [{ title: 'Offerte opvolgen bij Sarah', due_date: dag(4) }],
    },
    {
      klant: {
        company_name: 'Bouwwerken Claes', contact_name: 'Dirk Claes', email: 'info@bouwwerkenclaes.be',
        phone: '014 55 22 11', vat_number: 'BE0789456175', postal_code: '2300', city: 'Turnhout',
        status: 'slapend', source: 'Doorverwijzing', tags: ['bouw'],
        intro: 'Site staat er sinds 2022, sindsdien niets meer gehoord.',
      },
      contact: [{ type: 'email', subject: 'Oplevering website', occurred_at: dag(-410) }],
      opdrachten: [{ title: 'Bedrijfswebsite', amount: '2.900,00', status: 'betaald', deal_date: dag(-420) }],
      taken: [{ title: 'Heractiveren: bellen over onderhoud', due_date: dag(7) }],
    },
    {
      klant: {
        company_name: 'Praktijk Vandenbroucke', contact_name: 'Dr. Els Vandenbroucke', email: 'praktijk@vdbroucke.be',
        postal_code: '8500', city: 'Kortrijk', status: 'prospect', source: 'Website', tags: ['zorg'],
      },
      contact: [],
      opdrachten: [],
      taken: [{ title: 'Eerste mail sturen', due_date: dag(1) }],
    },
  ];

  let aantal = 0;
  for (const rij of data) {
    const res = store.createCustomer(rij.klant);
    if (!res.ok) {
      console.error('Seed mislukt voor', rij.klant.company_name, res.errors);
      continue;
    }
    const id = res.value.id;
    for (const c of rij.contact) store.addInteraction(id, c);
    for (const d of rij.opdrachten) store.addDeal(id, d);
    for (const t of rij.taken) store.addTask(id, t);
    aantal++;
  }
  if (!stil) console.log(`${aantal} voorbeeldklanten toegevoegd.`);
  return aantal;
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const store = new Store(openDb());
  const bestaand = store.listCustomers().length;
  if (bestaand > 0 && !process.argv.includes('--force')) {
    console.log(`Database bevat al ${bestaand} klanten. Gebruik --force om toch te seeden.`);
  } else {
    seed(store);
  }
}
