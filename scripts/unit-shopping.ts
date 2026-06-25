// Pure-function check for the clothing shopping lib (§10) — the hard URL rule.
// Run: npx tsx scripts/unit-shopping.ts
import { buildSearchLinks, procurementMode } from '../src/lib/shopping';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

const links = buildSearchLinks('emerald green bandhgala men');
ok(links.length === 3, '3 platform links built');
ok(links.every((l) => l.kind === 'search'), 'all are kind "search"');
ok(links[0].url === 'https://www.myntra.com/emerald-green-bandhgala-men', `Myntra slug url (got ${links[0].url})`);
ok(links[1].url === 'https://www.ajio.com/search/?text=emerald%20green%20bandhgala%20men', `Ajio query url (got ${links[1].url})`);
ok(links[2].url === 'https://www.flipkart.com/search?q=emerald%20green%20bandhgala%20men', `Flipkart query url (got ${links[2].url})`);
ok(links.every((l) => !/<|>|"/.test(l.url)), 'urls have no stray markup');

// Hard rule: a model-leaked URL in the "query" must never survive into a link.
const dirty = buildSearchLinks('navy bandhgala https://myntra.com/p/12345-FAKE-SKU men');
ok(dirty.every((l) => !l.url.includes('12345') && !l.url.includes('FAKE')), 'leaked SKU URL is stripped from the query');
ok(dirty[0].url === 'https://www.myntra.com/navy-bandhgala-men', `cleaned slug (got ${dirty[0].url})`);

ok(buildSearchLinks('   ').length === 0, 'empty/blank query → no links');

// Procurement mode gates on days-left.
ok(procurementMode(20).mode === 'tailored', '20 days → tailored');
ok(procurementMode(9).mode === 'online', '9 days → online');
ok(procurementMode(5).mode === 'online', '5 days → online');
ok(procurementMode(3).mode === 'in-store', '3 days → in-store');
ok(procurementMode(-2).mode === 'in-store' && /passed/i.test(procurementMode(-2).note), 'past date → in-store, reference note');
ok(procurementMode(9).note.includes('size'), 'online mode flags size risk');

console.log(failures === 0 ? '\nOK — shopping lib verified.' : `\nFAILED — ${failures} assertion(s).`);
process.exit(failures === 0 ? 0 : 1);
