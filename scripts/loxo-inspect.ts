/**
 * Loxo field discovery. Run once with your real credentials to confirm the
 * endpoint and field names the mapper expects.
 *
 *   LOXO_API_KEY=... LOXO_AGENCY_SLUG=eggers-executive-search npx tsx scripts/loxo-inspect.ts
 *
 * It prints the keys of the first record from a few likely endpoints so you can
 * adjust src/lib/loxo/mapping.ts to match your account. Nothing is written to the DB.
 */
import { loxoGet, loxoConfig } from '../src/lib/loxo/client';

async function dump(path: string) {
  try {
    const { items, raw } = await loxoGet(path, { per_page: 3 });
    console.log(`\n=== ${path} ===`);
    if (!items.length) {
      console.log('No array items. Top-level keys:', Object.keys(raw || {}));
      return;
    }
    console.log(`items: ${items.length}. First item keys:`);
    console.log(Object.keys(items[0]).sort().join(', '));
    console.log('First item (truncated):');
    console.log(JSON.stringify(items[0], null, 2).slice(0, 2500));
  } catch (error) {
    console.log(`\n=== ${path} === FAILED: ${error instanceof Error ? error.message : error}`);
  }
}

async function main() {
  const config = loxoConfig();
  console.log(`Loxo ${config.slug} @ ${config.domain}`);
  // Try the most likely places placements/placed candidates live.
  await dump('placements');
  await dump('jobs');
  await dump('scorecards');
  await dump('people');
  console.log('\nDone. Update src/lib/loxo/mapping.ts key lists to match the fields above.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
