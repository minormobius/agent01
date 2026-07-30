// shop.selftest — the WARES market: deterministic shelves, sane prices, restock-on-epoch, sell < buy.
import { shopStock, buyPrice, sellPrice, SHOP_SIZE } from '../shop.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// 1. a shelf is the configured size, every slot a real priced item
const a = shopStock(7, 'tA:r3', 0);
ok(a.length === SHOP_SIZE, 'shelf has SHOP_SIZE items');
ok(a.every((e) => e.item && e.item.name && e.price >= 2 && Number.isInteger(e.price)), 'every slot is a named item with a sane integer price');
ok(a.every((e, i) => e.slot === i), 'slots are indexed 0..n');

// 2. determinism: same (seed, desk, epoch) → identical shelf
const a2 = shopStock(7, 'tA:r3', 0);
ok(JSON.stringify(a.map((e) => [e.seed, e.price])) === JSON.stringify(a2.map((e) => [e.seed, e.price])), 'same desk+epoch → identical shelf');

// 3. different desk / epoch / world → different shelf (restock works)
ok(JSON.stringify(a.map((e) => e.seed)) !== JSON.stringify(shopStock(7, 'tA:r3', 1).map((e) => e.seed)), 'a new epoch restocks the shelf');
ok(JSON.stringify(a.map((e) => e.seed)) !== JSON.stringify(shopStock(7, 'tB:r9', 0).map((e) => e.seed)), 'a different desk has different stock');
ok(JSON.stringify(a.map((e) => e.seed)) !== JSON.stringify(shopStock(8, 'tA:r3', 0).map((e) => e.seed)), 'a different world has different stock');

// 4. prices ride value; sell is strictly below buy; both positive
const it = a[0].item;
ok(buyPrice(it) === a[0].price && buyPrice(it) > 0, 'buyPrice matches the shelf price');
ok(sellPrice(it) < buyPrice(it) && sellPrice(it) >= 1, 'you sell back for less than you buy (and ≥1)');
ok(buyPrice({ stats: { value: 240 } }) > buyPrice({ stats: { value: 80 } }), 'a more valuable item costs more');
ok(buyPrice({}) >= 2 && buyPrice(null) >= 2, 'price floor holds for valueless/missing items');

console.log(`shop.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
