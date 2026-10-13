/**
 * The people, companies and wording behind `npm run seed:mock`. Plain data, no
 * database access, so it can be read and edited without running anything.
 */

export type UserKey = 'ceo' | 'manager' | 'salesA' | 'salesB' | 'salesC' | 'reception' | 'coordinator';
export type OwnerKey = 'salesA' | 'salesB' | 'salesC';

export const ADMIN_PROFILE = { firstName: 'Agron', lastName: 'Leka', phone: '+355 69 201 1001', language: 'sq' };

export const STAFF: Array<{ key: UserKey; local: string; firstName: string; lastName: string; roleKey: string; phone: string; language: string }> = [
  { key: 'ceo', local: 'elira.hoxha', firstName: 'Elira', lastName: 'Hoxha', roleKey: 'CEO', phone: '+355 69 201 1002', language: 'sq' },
  { key: 'manager', local: 'genti.kola', firstName: 'Genti', lastName: 'Kola', roleKey: 'SALES_MANAGER', phone: '+355 69 201 1003', language: 'sq' },
  { key: 'salesA', local: 'arta.berisha', firstName: 'Arta', lastName: 'Berisha', roleKey: 'SALES_USER', phone: '+355 69 201 1004', language: 'sq' },
  { key: 'salesB', local: 'besnik.cela', firstName: 'Besnik', lastName: 'Çela', roleKey: 'SALES_USER', phone: '+355 69 201 1005', language: 'sq' },
  { key: 'salesC', local: 'dorina.mehmeti', firstName: 'Dorina', lastName: 'Mehmeti', roleKey: 'SALES_USER', phone: '+355 69 201 1006', language: 'en' },
  { key: 'reception', local: 'rea.gjoka', firstName: 'Rea', lastName: 'Gjoka', roleKey: 'RECEPTION', phone: '+355 69 201 1007', language: 'sq' },
];

/** Looks after Wellness+ members: a custom role copied from Reception, with the member permissions added. */
export const COORDINATOR = { key: 'coordinator' as UserKey, local: 'anila.ferati', firstName: 'Anila', lastName: 'Ferati', phone: '+355 69 201 1008', language: 'sq', roleNameSq: 'Koordinatore Wellness+', roleNameEn: 'Wellness+ Coordinator' };

export const TENANT_PROFILE = {
  registrationNumber: 'L51407018N',
  addressLine: 'Rruga Ismail Qemali 27, Kati 2',
  addressCity: 'Tiranë',
  addressState: 'Tiranë',
  addressPostalCode: '1019',
  contactEmail: 'info@wellness-albania.al',
  contactPhone: '+355 4 222 3344',
};

export const OFFER_LETTERHEAD = {
  companyName: 'Wellness Albania Sh.p.k.',
  nipt: 'L51407018N',
  address: 'Rruga Ismail Qemali 27, Kati 2, Tiranë 1019',
  phone: '+355 4 222 3344',
  email: 'oferta@wellness-albania.al',
  website: 'https://www.wellness-albania.al',
  bankDetails: 'Banka Raiffeisen Albania, IBAN AL47 2021 1109 0000 0000 0123 4567, SWIFT SGSBALTX',
};

export interface CompanySpec {
  name: string;
  businessType: string;
  area: string;
  city: string;
  employees: number;
  owner: OwnerKey;
  street: string;
  contacts: Array<{ name: string; position: string }>;
  note: string;
}

const c = (
  name: string,
  businessType: string,
  area: string,
  city: string,
  employees: number,
  owner: OwnerKey,
  street: string,
  contacts: Array<[string, string]>,
  note: string
): CompanySpec => ({ name, businessType, area, city, employees, owner, street, contacts: contacts.map(([n, p]) => ({ name: n, position: p })), note });

/** Thirty businesses across the country, each with two or three contacts. */
export const COMPANIES: CompanySpec[] = [
  c('Hotel Dajti Park', 'Hotel', 'Tiranë', 'Tiranë', 85, 'salesA', 'Rruga e Dajtit 12', [['Ilir Dervishi', 'Drejtor i përgjithshëm'], ['Mimoza Kola', 'Përgjegjëse e burimeve njerëzore'], ['Altin Prifti', 'Menaxher operacionesh']], 'Hotel me 85 punonjës, turnet ndërrojnë çdo javë. Kërkon vizita edhe për stafin e kuzhinës.'),
  c('Restorant Oda Garden', 'Restorant', 'Tiranë', 'Tiranë', 24, 'salesA', 'Rruga Ismail Qemali 5', [['Fatmir Basha', 'Pronar'], ['Elda Shehu', 'Administratore']], 'Pronari preferon takime në mëngjes, para hapjes së lokalit.'),
  c('Kafe Blloku Lounge', 'Kafene', 'Tiranë', 'Tiranë', 12, 'salesB', 'Rruga Pjetër Bogdani 18', [['Sokol Marku', 'Pronar'], ['Era Lleshi', 'Menaxhere']], 'Kafene e vogël në qendër, interes i lartë për paketën bazë.'),
  c('Fabrika e Tekstilit Albtex', 'Fabrikë', 'Durrës', 'Durrës', 240, 'salesB', 'Zona Industriale, Porto Romano', [['Dritan Gjoni', 'Drejtor prodhimi'], ['Valbona Rexha', 'Përgjegjëse e sigurisë në punë'], ['Kristi Noka', 'Financë']], 'Fabrikë me tre turne. Ka nevojë për kontroll vjetor mjekësor për të gjithë stafin.'),
  c('Ndërtimi Alb-Konstruksion', 'Ndërtim', 'Tiranë', 'Kamëz', 160, 'salesC', 'Autostrada Tiranë-Durrës km 8', [['Gezim Hasani', 'Drejtor teknik'], ['Anila Meta', 'Burime njerëzore']], 'Punonjës në kantiere të ndryshme, vizitat duhet të planifikohen sipas projekteve.'),
  c('Qendra e Thirrjeve CallAlb', 'Qendër thirrjesh', 'Tiranë', 'Tiranë', 120, 'salesA', 'Bulevardi Dëshmorët e Kombit 3', [['Sidorela Hysi', 'Drejtore operative'], ['Arben Zenelaj', 'IT dhe administrim']], 'Interes i veçantë për shëndetin e shikimit dhe stresin në punë.'),
  c('Zyra Avokatore Hoxha & Partnerët', 'Zyrë', 'Tiranë', 'Tiranë', 9, 'salesC', 'Rruga e Durrësit 91', [['Lorenc Hoxha', 'Avokat kryesor'], ['Teuta Cani', 'Sekretare']], 'Zyrë e vogël, vendimi merret nga pronari.'),
  c('Techmax Elektronik', 'Dyqan', 'Tiranë', 'Vorë', 14, 'salesB', 'Rruga Kryesore, Vorë', [['Ervin Bushati', 'Pronar'], ['Jonida Alla', 'Shitëse kryesore']], 'Dyqan elektronik me magazinë, 14 të punësuar.'),
  c('Frigo Fier Magazina', 'Magazinë', 'Fier', 'Fier', 22, 'salesC', 'Zona Industriale Fier', [['Ardian Malaj', 'Drejtor'], ['Suela Gjika', 'Administratore']], 'Magazinë me frigorifer, punonjësit punojnë në temperatura të ulëta.'),
  c('Hotel Butrinti View', 'Hotel', 'Vlorë', 'Sarandë', 48, 'salesB', 'Rruga Jonianët 7, Sarandë', [['Marsela Tafaj', 'Menaxhere e përgjithshme'], ['Genci Dollani', 'Shef kuzhine']], 'Hotel sezonal; stafi rritet në verë deri në 48 persona.'),
  c('Restorant Te Kalaja', 'Restorant', 'Gjirokastër', 'Gjirokastër', 15, 'salesA', 'Lagjja Palorto, Gjirokastër', [['Ndriçim Cekani', 'Pronar'], ['Elona Zeka', 'Menaxhere']], 'Restorant turistik në qytetin e vjetër.'),
  c('Shkodra Shoes', 'Fabrikë', 'Shkodër', 'Shkodër', 180, 'salesC', 'Zona Industriale Shkodër', [['Pjerin Gjoka', 'Drejtor i përgjithshëm'], ['Mirela Gega', 'Përgjegjëse e burimeve njerëzore'], ['Aleksandër Prenga', 'Kryetar i sindikatës']], 'Fabrikë këpucësh për eksport. Sindikata kërkon garanci për kontrollet vjetore.'),
  c('Kafe Rinia', 'Kafene', 'Korçë', 'Korçë', 7, 'salesB', 'Bulevardi Shën Gjergji 22', [['Petrit Lako', 'Pronar']], 'Kafene e vogël familjare.'),
  c('Elbasani Projekt', 'Ndërtim', 'Elbasan', 'Elbasan', 95, 'salesA', 'Rruga Qemal Stafa 40', [['Besim Cuka', 'Drejtor'], ['Aurela Peqini', 'Financë dhe burime njerëzore']], 'Kompani ndërtimi me kantiere në Elbasan dhe Librazhd.'),
  c('Fiscon Kontabilitet', 'Zyrë', 'Durrës', 'Durrës', 11, 'salesC', 'Rruga Tregtare 15, Durrës', [['Mirjan Doçi', 'Kontabilist i miratuar'], ['Klea Rama', 'Asistente']], 'Zyrë kontabiliteti, 11 të punësuar, interes për paketën për zyra.'),
  c('Mini Market Vlora', 'Dyqan', 'Vlorë', 'Vlorë', 9, 'salesB', 'Rruga Sadik Zotaj 4, Vlorë', [['Agim Shehu', 'Pronar'], ['Brikena Isaku', 'Menaxhere']], 'Dyqan ushqimor me orar të gjatë.'),
  c('Porti Logjistik Sh.p.k.', 'Magazinë', 'Durrës', 'Durrës', 60, 'salesA', 'Porti i Durrësit, Hangari 11', [['Eduart Tola', 'Drejtor operacionesh'], ['Rudina Çela', 'Përgjegjëse e sigurisë']], 'Magazinë logjistike pranë portit; punë fizike me ngarkesa të rënda.'),
  c('Lura Resort', 'Hotel', 'Dibër', 'Peshkopi', 35, 'salesC', 'Rruga Kryesore, Peshkopi', [['Bardhyl Nika', 'Pronar'], ['Flutura Zogaj', 'Menaxhere']], 'Resort malor me stafin kryesisht sezonal.'),
  c('Pizzeria Napoli', 'Restorant', 'Tiranë', 'Kavajë', 18, 'salesB', 'Rruga e Plazhit, Kavajë', [['Luan Pashaj', 'Pronar'], ['Silvana Hoti', 'Administratore']], 'Pizzeri me porosi dhe shërbim në vend.'),
  c('Bio-Lezha Qumësht', 'Fabrikë', 'Lezhë', 'Lezhë', 75, 'salesA', 'Zona Industriale Lezhë', [['Gjergj Marku', 'Drejtor'], ['Vjollca Dedja', 'Cilësi dhe siguri ushqimore']], 'Fabrikë qumështi, kërkesa higjienike të rrepta për stafin.'),
  c('Contact Plus', 'Qendër thirrjesh', 'Tiranë', 'Tiranë', 200, 'salesC', 'Rruga e Kavajës 120', [['Anxhela Rusi', 'Drejtore e burimeve njerëzore'], ['Mentor Haxhia', 'Drejtor i përgjithshëm'], ['Greta Qoku', 'Asistente ekzekutive']], 'Qendër thirrjesh e madhe me turne ditë dhe natë.'),
  c('Kafe Liqeni Pogradec', 'Kafene', 'Korçë', 'Pogradec', 10, 'salesB', 'Rruga e Liqenit 3, Pogradec', [['Eltjon Vaso', 'Pronar'], ['Anisa Trebicka', 'Kamariere kryesore']], 'Kafene buzë liqenit, aktiviteti rritet në verë.'),
  c('Kukësi Infra', 'Ndërtim', 'Kukës', 'Kukës', 70, 'salesA', 'Rruga Nacionale, Kukës', [['Ramiz Bytyçi', 'Drejtor'], ['Dëshira Gashi', 'Financë']], 'Ndërtim rrugësh, punonjës në terren.'),
  c('Alb-Garant Sigurime', 'Zyrë', 'Tiranë', 'Tiranë', 30, 'salesC', 'Rruga Abdi Toptani 1', [['Ledian Shkreli', 'Drejtor tregtar'], ['Orjola Xhaferri', 'Përgjegjëse e burimeve njerëzore']], 'Kompani sigurimesh, interes për programin Wellness+ për familjarët.'),
  c('Moda Plus Berat', 'Dyqan', 'Berat', 'Berat', 8, 'salesB', 'Rruga Antipatrea 9, Berat', [['Xhuliana Kodra', 'Pronare']], 'Dyqan veshjesh me tetë të punësuar.'),
  c('Myzeqe Bujqësore', 'Magazinë', 'Fier', 'Lushnjë', 28, 'salesA', 'Rruga Kryesore, Lushnjë', [['Fredi Sula', 'Drejtor'], ['Nertila Kapo', 'Administratore']], 'Magazinë mjetesh bujqësore dhe pjesë këmbimi.'),
  c('Hotel Rozafa', 'Hotel', 'Shkodër', 'Shkodër', 52, 'salesC', 'Rruga Gjuhadol 6, Shkodër', [['Zef Ukaj', 'Drejtor'], ['Marjana Kuqi', 'Përgjegjëse e recepsionit']], 'Hotel në qendër të Shkodrës.'),
  c('Restorant Balkoni', 'Restorant', 'Elbasan', 'Librazhd', 13, 'salesB', 'Rruga e Liqenit, Librazhd', [['Qazim Doda', 'Pronar'], ['Entela Mara', 'Menaxhere']], 'Restorant familjar me kuzhinë tradicionale.'),
  c('Papirus Letër', 'Fabrikë', 'Elbasan', 'Cërrik', 110, 'salesA', 'Zona Industriale Cërrik', [['Skënder Lami', 'Drejtor prodhimi'], ['Roza Cani', 'Burime njerëzore']], 'Fabrikë letre me makineri të rënda; interes për rregullat e sigurisë.'),
  c('Studio Arch Arkitekturë', 'Zyrë', 'Tiranë', 'Tiranë', 16, 'salesC', 'Rruga Myslym Shyri 22', [['Redi Aliaj', 'Arkitekt kryesor'], ['Sara Peci', 'Menaxhere projektesh']], 'Studio arkitekture me punë të gjatë përpara kompjuterit.'),
];

export const ACTIVITY_NOTES: Array<{ channel: 'CALL' | 'MEETING' | 'EMAIL' | 'VISIT' | 'ONLINE_MEETING' | 'NOTE'; content: string; feedback: string; next: string }> = [
  { channel: 'CALL', content: 'Telefonatë e parë njohëse: u prezantua shërbimi dhe paketa vjetore.', feedback: 'Kërkon të shohë një ofertë me çmime të qarta.', next: 'Dërgo ofertën me email brenda javës.' },
  { channel: 'MEETING', content: 'Takim në zyrat e klientit me drejtorin dhe përgjegjësen e burimeve njerëzore.', feedback: 'Pëlqeu kontrolli vjetor mjekësor në vend.', next: 'Përgatit ofertën me dy opsione frekuence.' },
  { channel: 'EMAIL', content: 'U dërgua prezantimi i shërbimit dhe lista e çmimeve.', feedback: 'Konfirmoi pranimin e email-it.', next: 'Telefono pas tri ditësh.' },
  { channel: 'VISIT', content: 'Vizitë në vendin e punës për të parë kushtet dhe numrin e punonjësve.', feedback: 'Numri i punonjësve u konfirmua në vend.', next: 'Përditëso ofertën me numrin e saktë.' },
  { channel: 'ONLINE_MEETING', content: 'Takim online me pronarin dhe kontabilistin për kushtet e pagesës.', feedback: 'Preferon pagesë çdo tre muaj.', next: 'Dërgo kontratën për shqyrtim.' },
  { channel: 'NOTE', content: 'Shënim i brendshëm: klienti ka pasur ofertë nga një konkurrent me çmim më të ulët.', feedback: 'Pa përgjigje nga klienti për këtë shënim.', next: 'Përgatit krahasim të shërbimeve.' },
];

export const FOLLOW_UP_NOTES = [
  'Telefono për të marrë përgjigjen e ofertës.',
  'Kujtesë: konfirmo datën e vizitës së parë.',
  'Dërgo kontratën e nënshkruar për arkivim.',
  'Takim për të diskutuar zbritjen e kërkuar.',
  'Pyet nëse ka punonjës të rinj për t’u shtuar në plan.',
  'Kontrollo nëse fatura u mor nga kontabiliteti.',
];

export const LOSS_NOTES = [
  'Zgjodhi një ofrues tjetër që ka marrëveshje për të gjithë grupin.',
  'Buxheti i këtij viti u shterua; rikontakt në janar.',
  'Pronari tha se çmimi është mbi pritshmëritë.',
  'Nuk u përgjigj pas tre telefonatash dhe dy email-eve.',
];

export const MEMBER_FIRST_NAMES = ['Ardit', 'Blerina', 'Çlirim', 'Drita', 'Edlira', 'Fatjon', 'Gerta', 'Hysen', 'Ina', 'Jorgo', 'Klodiana', 'Luan', 'Majlinda', 'Nikolin', 'Olta', 'Pëllumb', 'Qamil', 'Rezarta', 'Shpëtim', 'Tefta', 'Ulpiana', 'Vasil', 'Xhensila', 'Yllka', 'Zamir', 'Artan', 'Brunilda', 'Dionis', 'Ela', 'Flori'];
export const MEMBER_LAST_NAMES = ['Aliu', 'Bashllari', 'Çaushi', 'Dervishi', 'Ferati', 'Gjata', 'Hoxhaj', 'Islami', 'Jahaj', 'Kryeziu', 'Lika', 'Mërkuri', 'Neziri', 'Osmani', 'Pema', 'Qyrfyku', 'Ruçi', 'Sulaj', 'Toska', 'Uka', 'Veizi', 'Xhaferri', 'Zhupa'];
