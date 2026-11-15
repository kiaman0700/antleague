// src/lib/rng.ts
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
function range(rng, min, max) {
  return min + rng() * (max - min);
}

// src/game/items.ts
var ITEMS = [
  { kind: "paper", name: "\uB0B4\uC77C \uC2E0\uBB38", emoji: "\u{1F4F0}", type: "info", cost: 12e5, desc: "\uB0B4\uC77C \uC544\uCE68\uC5D0 \uB098\uC62C \uB274\uC2A4 \uD5E4\uB4DC\uB77C\uC778\uC744 \uC624\uB298 \uBBF8\uB9AC \uBD10\uC694. (\uD655\uC2E4\uD55C \uC815\uBCF4\uB77C \uAC00\uC7A5 \uBE44\uC2F8\uC694)" },
  { kind: "analyst", name: "\uC560\uB110\uB9AC\uC2A4\uD2B8 \uCF5C", emoji: "\u{1F4C8}", type: "info", cost: 5e5, desc: "\uC624\uB298 \uC7A5\uC5D0\uC11C \uAC00\uC7A5 \uB9CE\uC774 \uC624\uB97C \uC5C5\uC885\uC744 \uC54C\uB824\uC918\uC694." },
  { kind: "scout", name: "\uCC28\uD2B8 \uBD84\uC11D", emoji: "\u{1F4CA}", type: "info", cost: 4e5, desc: "\uC9C0\uAE08 \uBCF4\uACE0 \uC788\uB294 \uC885\uBAA9\uC774 \uC624\uB298 \uC624\uB97C\uC9C0 \uB0B4\uB9B4\uC9C0 \uC54C\uB824\uC918\uC694. (\uC815\uD655\uB3C4 \uC57D 70%)" },
  { kind: "detector", name: "\uB8E8\uBA38 \uAC10\uBCC4\uAE30", emoji: "\u{1F50D}", type: "info", cost: 15e4, desc: "\uC624\uB298 \uC544\uCE68 \uB274\uC2A4\uAC00 \uD558\uB098\uD558\uB098 \uC0AC\uC2E4\uC778\uC9C0 \uAC00\uC9DC\uC778\uC9C0 \uC54C\uB824\uC918\uC694. \uD45C\uC2DC \uC5C6\uB294 \uAC00\uC9DC \uAE30\uC0AC\uC640 \uC0C1\uB300\uAC00 \uBCF4\uB0B8 \uAC00\uC9DC \uB274\uC2A4\uB3C4 \uC7A1\uC544\uB0B4\uC694." },
  { kind: "spy", name: "\uC5FC\uD0D0", emoji: "\u{1F440}", type: "info", cost: 2e5, desc: "\uACE0\uB978 \uC0C1\uB300\uAC00 \uC9C0\uAE08 \uC5B4\uB5A4 \uC885\uBAA9\uC744 \uC5BC\uB9C8\uB098 \uAC16\uACE0 \uC788\uB294\uC9C0 \uBAB0\uB798 \uBD10\uC694.", multiOnly: true },
  { kind: "freeze", name: "\uAC70\uB798 \uC815\uC9C0", emoji: "\u{1F9CA}", type: "attack", cost: 8e5, desc: "\uACE0\uB978 \uC0C1\uB300\uAC00 \uB0B4\uC77C \uD558\uB8E8 \uB3D9\uC548 \uC0AC\uACE0\uD314 \uC218 \uC5C6\uC5B4\uC694.", multiOnly: true },
  { kind: "blackout", name: "\uC815\uBCF4 \uCC28\uB2E8", emoji: "\u{1F4F5}", type: "attack", cost: 5e5, desc: "\uACE0\uB978 \uC0C1\uB300\uB294 \uB0B4\uC77C \uC544\uCE68 \uB274\uC2A4\uB97C \uBCFC \uC218 \uC5C6\uC5B4\uC694.", multiOnly: true },
  { kind: "fake", name: "\uAC00\uC9DC \uB274\uC2A4", emoji: "\u{1F4E2}", type: "attack", cost: 4e5, desc: "\uB0B4\uC77C \uACE0\uB978 \uC0C1\uB300 \uD654\uBA74\uC5D0\uB9CC \uB0B4\uAC00 \uB9CC\uB4E0 \uAC00\uC9DC \uC18D\uBCF4\uAC00 \uB5A0\uC694.", multiOnly: true },
  { kind: "fee", name: "\uC218\uC218\uB8CC \uD3ED\uD0C4", emoji: "\u{1F4B8}", type: "attack", cost: 4e5, desc: "\uACE0\uB978 \uC0C1\uB300\uC758 \uAC70\uB798 \uC218\uC218\uB8CC\uAC00 \uC0AC\uD758\uAC04 10\uBC30(1%)\uAC00 \uB3FC\uC694.", multiOnly: true },
  { kind: "shield", name: "\uBC29\uD328", emoji: "\u{1F6E1}\uFE0F", type: "defense", cost: 4e5, desc: "\uAC16\uACE0\uB9CC \uC788\uC73C\uBA74 \uB098\uB97C \uB178\uB9B0 \uBC29\uD574 \uCE74\uB4DC\uB97C 1\uBC88 \uC790\uB3D9\uC73C\uB85C \uB9C9\uC544\uC694.", multiOnly: true, passive: true },
  { kind: "mirror", name: "\uBC18\uC0AC \uAC70\uC6B8", emoji: "\u{1FA9E}", type: "defense", cost: 7e5, desc: "\uAC16\uACE0\uB9CC \uC788\uC73C\uBA74 \uB098\uB97C \uB178\uB9B0 \uBC29\uD574 \uCE74\uB4DC\uB97C 1\uBC88 \uC4F4 \uC0AC\uB78C\uC5D0\uAC8C \uB418\uB3CC\uB824\uC694.", multiOnly: true, passive: true },
  { kind: "bonus", name: "\uC6A9\uB3C8 \uBD09\uD22C", emoji: "\u{1F381}", type: "bonus", cost: 0, desc: "\uC4F0\uBA74 \uD604\uAE08 50\uB9CC\uC6D0\uC774 \uB4E4\uC5B4\uC640\uC694. \uC0C1\uC810\uC5D0\uC11C\uB294 \uC0B4 \uC218 \uC5C6\uACE0 \uBB34\uB8CC \uCE74\uB4DC\uB85C\uB9CC \uB098\uC640\uC694.", shopless: true }
];
var ITEM_MAP = Object.fromEntries(ITEMS.map((i) => [i.kind, i]));
var ITEM_KINDS = ITEMS.map((i) => i.kind);
var START_CARDS = 2;
var GRANT_EVERY = 5;
var HOLD_LIMIT = 3;
var USE_LIMIT = 2;
var FEE_BOMB_RATE = 0.01;
var FEE_BOMB_DAYS = 3;
var BONUS_AMOUNT = 5e5;
var SCOUT_ACCURACY = 0.7;
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
function grantDays(totalDays) {
  const out = [];
  for (let d = GRANT_EVERY; d < totalDays; d += GRANT_EVERY) out.push(d);
  return out;
}
function spendsFromRows(rows) {
  return rows.filter((r) => r.action === "buy" || r.action === "use" && r.kind === "bonus").map((r) => ({ day: r.day, cost: r.action === "buy" ? r.cost : -BONUS_AMOUNT }));
}
function deriveItems(seed, playerIds, rows, currentDay, totalDays, solo) {
  const pool = ITEMS.filter((i) => !solo || !i.multiOnly).map((i) => i.kind);
  const players = {};
  for (const id of playerIds) players[id] = { inventory: {}, used: {}, infoUses: [], grants: [], total: 0 };
  const effects = [];
  const add = (p, k, n) => {
    p.inventory[k] = (p.inventory[k] ?? 0) + n;
    p.total += n;
  };
  const consume = (p, k) => {
    add(p, k, -1);
    p.used[k] = (p.used[k] ?? 0) + 1;
  };
  const sorted = [...rows].sort((a, b) => a.day - b.day || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const gdays = new Set(grantDays(totalDays));
  for (let d = 0; d <= currentDay; d++) {
    for (const id of playerIds) {
      const p = players[id];
      const n = d === 0 ? START_CARDS : gdays.has(d) ? 1 : 0;
      const rng = mulberry32((seed ^ hash(id)) + d * 7919);
      for (let i = 0; i < n; i++) {
        const kind = pool[Math.floor(rng() * pool.length)];
        const skipped = p.total >= HOLD_LIMIT;
        p.grants.push({ day: d, kind, skipped });
        if (!skipped) add(p, kind, 1);
      }
    }
    for (const r of sorted) {
      if (r.day !== d) continue;
      const p = players[r.player_id];
      if (!p || !ITEM_MAP[r.kind]) continue;
      if (r.action === "buy") {
        add(p, r.kind, 1);
        continue;
      }
      if ((p.inventory[r.kind] ?? 0) <= 0) continue;
      consume(p, r.kind);
      const def = ITEM_MAP[r.kind];
      if (def.type === "info") p.infoUses.push({ kind: r.kind, day: r.day, target: r.payload?.target, symbol: r.payload?.symbol });
      if (def.type === "attack") {
        const chosen = r.payload?.target;
        const target = chosen && chosen !== r.player_id && playerIds.includes(chosen) ? chosen : playerIds.find((x) => x !== r.player_id);
        if (!target) continue;
        const t = players[target];
        const days = r.kind === "fee" ? Array.from({ length: FEE_BOMB_DAYS }, (_, k) => r.day + 1 + k) : [r.day + 1];
        if ((t.inventory.shield ?? 0) > 0) {
          consume(t, "shield");
          effects.push({ from: r.player_id, to: target, kind: r.kind, days, blocked: true, usedDay: r.day, payload: r.payload });
        } else if ((t.inventory.mirror ?? 0) > 0) {
          consume(t, "mirror");
          effects.push({ from: r.player_id, to: r.player_id, kind: r.kind, days, blocked: false, reflected: true, by: target, usedDay: r.day, payload: r.payload });
        } else {
          effects.push({ from: r.player_id, to: target, kind: r.kind, days, blocked: false, usedDay: r.day, payload: r.payload });
        }
      }
    }
  }
  return { players, effects };
}
function activeEffects(state, playerId, day) {
  return state.effects.filter((e) => e.to === playerId && !e.blocked && e.days.includes(day));
}
function canBuy(p, kind, cash) {
  const def = ITEM_MAP[kind];
  if (!def || def.shopless) return "\uC0C1\uC810\uC5D0\uC11C \uC0B4 \uC218 \uC5C6\uB294 \uCE74\uB4DC\uC608\uC694";
  if (p.total >= HOLD_LIMIT) return `\uCE74\uB4DC\uB294 \uCD5C\uB300 ${HOLD_LIMIT}\uC7A5\uAE4C\uC9C0 \uAC00\uC9C8 \uC218 \uC788\uC5B4\uC694`;
  if ((p.used[kind] ?? 0) + (p.inventory[kind] ?? 0) >= USE_LIMIT) return `\uC774 \uCE74\uB4DC\uB294 \uD55C \uD310\uC5D0 ${USE_LIMIT}\uBC88\uAE4C\uC9C0\uB9CC \uC4F8 \uC218 \uC788\uC5B4\uC694`;
  if (cash < def.cost) return "\uD604\uAE08\uC774 \uBD80\uC871\uD574\uC694";
  return null;
}
function canUse(p, kind, day, totalDays, alreadyUsedToday) {
  const def = ITEM_MAP[kind];
  if (!def) return "\uC5C6\uB294 \uCE74\uB4DC\uC608\uC694";
  if ((p.inventory[kind] ?? 0) <= 0) return "\uC774 \uCE74\uB4DC\uAC00 \uC5C6\uC5B4\uC694";
  if (def.passive) return "\uAC16\uACE0 \uC788\uC73C\uBA74 \uC790\uB3D9\uC73C\uB85C \uBC1C\uB3D9\uB3FC\uC694";
  if (kind !== "bonus" && (p.used[kind] ?? 0) >= USE_LIMIT) return `\uD55C \uD310\uC5D0 ${USE_LIMIT}\uBC88\uAE4C\uC9C0\uB9CC \uC4F8 \uC218 \uC788\uC5B4\uC694`;
  if (alreadyUsedToday && kind !== "bonus") return "\uAC19\uC740 \uCE74\uB4DC\uB294 \uD558\uB8E8\uC5D0 \uD55C \uBC88\uB9CC \uC4F8 \uC218 \uC788\uC5B4\uC694";
  if ((def.type === "attack" || kind === "paper") && day >= totalDays - 1) return "\uB9C8\uC9C0\uB9C9 \uB0A0\uC5D0\uB294 \uC4F8 \uC218 \uC5C6\uC5B4\uC694";
  return null;
}

// src/game/news.ts
var COMPANY_GOOD = [
  "{name}, \uBD84\uAE30 \uC2E4\uC801 \uC5B4\uB2DD \uC11C\uD504\uB77C\uC774\uC988",
  "{name}, 1\uC870\uC6D0 \uADDC\uBAA8 \uACF5\uAE09 \uACC4\uC57D \uCCB4\uACB0",
  "\uC678\uAD6D\uC778, {name} \uC0AC\uD758\uC9F8 \uB300\uB7C9 \uC21C\uB9E4\uC218",
  "{name}, \uB300\uADDC\uBAA8 \uC790\uC0AC\uC8FC \uB9E4\uC785\xB7\uC18C\uAC01 \uBC1C\uD45C",
  '\uC99D\uAD8C\uAC00 "{name} \uBAA9\uD45C\uC8FC\uAC00 \uB300\uD3ED \uC0C1\uD5A5"',
  "{name}, \uAE5C\uC9DD \uBC30\uB2F9 \uD655\uB300 \uBC1C\uD45C"
];
var COMPANY_BAD = [
  "{name}, \uC2E4\uC801 \uC1FC\uD06C\u2026 \uC2DC\uC7A5 \uC608\uC0C1 \uD06C\uAC8C \uD558\uD68C",
  "{name} \uACBD\uC601\uC9C4 \uD6A1\uB839 \uC758\uD639 \uC81C\uAE30",
  "{name}, \uB300\uADDC\uBAA8 \uC720\uC0C1\uC99D\uC790 \uBC1C\uD45C",
  "\uAE30\uAD00, {name} \uC5F0\uC77C \uB300\uB7C9 \uB9E4\uB3C4",
  '\uC99D\uAD8C\uAC00 "{name} \uBAA9\uD45C\uC8FC\uAC00 \uD558\uD5A5"',
  "{name}, \uB300\uADDC\uBAA8 \uC18C\uC1A1 \uD328\uC18C"
];
var SECTOR_COMPANY_GOOD = {
  semi: ["{name}, \uAE00\uB85C\uBC8C AI \uAE30\uC5C5\uC5D0 \uCE69 \uB300\uB7C9 \uC218\uC8FC", "{name}, \uCC28\uC138\uB300 \uACF5\uC815 \uC218\uC728 \uC548\uC815\uD654 \uC131\uACF5"],
  it: ["{name}, \uCC28\uC138\uB300 AI \uC11C\uBE44\uC2A4 \uACF5\uAC1C\uC5D0 \uC0AC\uC6A9\uC790 \uD3ED\uC99D", "{name}, \uAE00\uB85C\uBC8C \uBE45\uD14C\uD06C\uC640 \uD30C\uD2B8\uB108\uC2ED"],
  battery: ["{name}, \uC720\uB7FD \uC644\uC131\uCC28\uC640 10\uB144 \uC7A5\uAE30\uACC4\uC57D", "{name}, \uC2E0\uD615 \uBC30\uD130\uB9AC \uC591\uC0B0 \uB3CC\uC785"],
  auto: ["{name}, \uC2E0\uCC28 \uC0AC\uC804\uACC4\uC57D \uC5ED\uB300 \uCD5C\uB2E4", "{name}, \uBBF8\uAD6D \uD310\uB9E4 \uC2E0\uAE30\uB85D"],
  bio: ["{name}, \uC2E0\uC57D \uC784\uC0C1 3\uC0C1 \uC131\uACF5", "{name}, FDA \uD488\uBAA9\uD5C8\uAC00 \uD68D\uB4DD"],
  energy: ["{name}, \uC815\uBD80 \uB300\uD615 \uBC1C\uC804\uC0AC\uC5C5 \uB2E8\uB3C5 \uC218\uC8FC", "{name}, \uD574\uC678 \uC720\uC804 \uC9C0\uBD84 \uD655\uBCF4"],
  air: ["{name}, \uC2E0\uADDC \uB178\uC120 \uC608\uC57D \uD3ED\uC8FC", "{name}, \uD654\uBB3C \uC6B4\uC784 \uAE09\uB4F1\uC73C\uB85C \uC2E4\uC801 \uAC1C\uC120"],
  ent: ["{name} \uC2E0\uC791, \uCD9C\uC2DC \uCCAB \uC8FC \uB9E4\uCD9C 1\uC704", "{name} \uC18C\uC18D \uADF8\uB8F9 \uBE4C\uBCF4\uB4DC 1\uC704"],
  food: ["{name}, \uD574\uC678 \uC218\uCD9C \uC2E0\uAE30\uB85D", "{name} \uC2E0\uC81C\uD488 \uD488\uC808 \uB300\uB780"],
  bank: ["{name}, \uC0AC\uC0C1 \uCD5C\uB300 \uC21C\uC774\uC775", "{name}, \uC8FC\uC8FC\uD658\uC6D0 \uD655\uB300 \uBC1C\uD45C"],
  build: ["{name}, \uD574\uC678 \uB300\uD615 \uC778\uD504\uB77C \uC218\uC8FC", "{name}, \uC2E0\uB3C4\uC2DC \uC0AC\uC5C5 \uC2DC\uD589\uC0AC \uC120\uC815"],
  crypto: ["{name}, \uB300\uD615 \uAC70\uB798\uC18C \uC81C\uD734 \uD655\uC815", "{name}, \uD574\uC678 \uC0AC\uC5C5 \uC778\uAC00 \uD68D\uB4DD"],
  us_tech: ["{name}, \uC2E0\uD615 AI \uAE30\uAE30 \uACF5\uAC1C\uC5D0 \uC608\uC57D \uD3ED\uC8FC", "{name}, \uC0AC\uC0C1 \uCD5C\uB300 \uBD84\uAE30 \uB9E4\uCD9C"],
  us_semi: ["{name}, \uBE45\uD14C\uD06C\uC640 AI \uCE69 \uB3C5\uC810 \uACF5\uAE09 \uACC4\uC57D", "{name}, \uCC28\uC138\uB300 GPU \uACF5\uAC1C"],
  us_ev: ["{name}, \uBD84\uAE30 \uC778\uB3C4\uB7C9 \uC0AC\uC0C1 \uCD5C\uB300", "{name}, \uC790\uC728\uC8FC\uD589 \uC815\uC2DD \uC2B9\uC778"],
  us_cons: ["{name}, \uD574\uC678 \uB9E4\uCD9C \uAE09\uC99D", "{name}, \uBC30\uB2F9 50\uB144 \uC5F0\uC18D \uC778\uC0C1"]
};
var SECTOR_COMPANY_BAD = {
  semi: ["{name}, \uB300\uD615 \uACE0\uAC1D\uC0AC \uC8FC\uBB38 \uCDE8\uC18C", "{name} \uACF5\uC7A5 \uC815\uC804\uC73C\uB85C \uC0DD\uC0B0 \uCC28\uC9C8"],
  it: ["{name}, \uC11C\uBE44\uC2A4 \uB300\uADDC\uBAA8 \uC7A5\uC560 \uBC1C\uC0DD", "{name}, \uAC1C\uC778\uC815\uBCF4 \uC720\uCD9C \uC0AC\uACE0"],
  battery: ["{name} \uBC30\uD130\uB9AC \uD654\uC7AC \uC0AC\uACE0\u2026 \uB9AC\uCF5C \uAC80\uD1A0", "{name}, \uD575\uC2EC \uACE0\uAC1D\uC0AC \uC774\uD0C8"],
  auto: ["{name}, \uB300\uADDC\uBAA8 \uB9AC\uCF5C \uACB0\uC815", "{name} \uB178\uC870 \uCD1D\uD30C\uC5C5 \uB3CC\uC785"],
  bio: ["{name}, \uC784\uC0C1 \uC2E4\uD328 \uACF5\uC2DC", "{name} \uC2E0\uC57D, \uBD80\uC791\uC6A9 \uB17C\uB780"],
  energy: ["{name} \uC815\uC81C\uC124\uBE44 \uD654\uC7AC", "{name}, \uD658\uACBD \uADDC\uC81C \uC704\uBC18 \uACFC\uC9D5\uAE08"],
  air: ["{name} \uC5EC\uAC1D\uAE30 \uD68C\uD56D \uC0AC\uACE0 \uC870\uC0AC", "{name}, \uC870\uC885\uC0AC \uD30C\uC5C5 \uC608\uACE0"],
  ent: ["{name} \uC2E0\uC791, \uD765\uD589 \uCC38\uD328", "{name} \uAC04\uD310 \uC544\uD2F0\uC2A4\uD2B8 \uB17C\uB780"],
  food: ["{name} \uC81C\uD488\uC11C \uC774\uBB3C\uC9C8 \uAC80\uCD9C", "{name}, \uC6D0\uC7AC\uB8CC \uAC00\uACA9 \uAE09\uB4F1\uC5D0 \uB9C8\uC9C4 \uC545\uD654"],
  bank: ["{name}, \uB300\uADDC\uBAA8 \uBD80\uC2E4\uB300\uCD9C \uC801\uBC1C", "{name} \uC804\uC0B0 \uC7A5\uC560\uB85C \uAC70\uB798 \uC911\uB2E8"],
  build: ["{name} \uACF5\uC0AC\uD604\uC7A5 \uBD95\uAD34 \uC0AC\uACE0", "{name}, \uBBF8\uBD84\uC591 \uAE09\uC99D\uC5D0 \uC720\uB3D9\uC131 \uC6B0\uB824"],
  crypto: ["{name} \uD574\uD0B9 \uD53C\uD574 \uBC1C\uC0DD", "{name}, \uADDC\uC81C \uB2F9\uAD6D \uC870\uC0AC \uCC29\uC218"],
  us_tech: ["{name}, \uBC18\uB3C5\uC810 \uC18C\uC1A1 \uD328\uC18C", "{name} \uC2E0\uC81C\uD488 \uD310\uB9E4 \uBD80\uC9C4"],
  us_semi: ["{name}, \uC911\uAD6D \uC218\uCD9C \uAE08\uC9C0 \uC9C1\uACA9\uD0C4", "{name} \uC0DD\uC0B0 \uCC28\uC9C8\uB85C \uCD9C\uD558 \uC9C0\uC5F0"],
  us_ev: ["{name}, \uB300\uADDC\uBAA8 \uB9AC\uCF5C", "{name} CEO \uB3CC\uBC1C \uBC1C\uC5B8 \uB17C\uB780"],
  us_cons: ["{name}, \uC6D0\uAC00 \uC0C1\uC2B9\uC5D0 \uC2E4\uC801 \uACBD\uACE0", "{name} \uB9E4\uC7A5 \uB9E4\uCD9C \uAC10\uC18C"]
};
var SECTOR_GOOD = {
  semi: ["\uBA54\uBAA8\uB9AC \uAC00\uACA9 3\uAC1C\uC6D4 \uC5F0\uC18D \uC0C1\uC2B9, \uBC18\uB3C4\uCCB4 \uC5C5\uD669 \uD68C\uBCF5", "\uC815\uBD80, \uBC18\uB3C4\uCCB4 \uC0B0\uC5C5\uC5D0 \uB300\uADDC\uBAA8 \uC138\uC81C \uC9C0\uC6D0"],
  it: ["AI \uBD90\uC5D0 \uD50C\uB7AB\uD3FC \uAE30\uC5C5 \uAD11\uACE0 \uB9E4\uCD9C \uAE09\uC99D", "\uC815\uBD80, \uB514\uC9C0\uD138 \uC0B0\uC5C5 \uADDC\uC81C \uC644\uD654"],
  battery: ["\uC804\uAE30\uCC28 \uBCF4\uC870\uAE08 \uD655\uB300 \uBC1C\uD45C", "\uAE00\uB85C\uBC8C \uC804\uAE30\uCC28 \uD310\uB9E4 \uC0AC\uC0C1 \uCD5C\uB300"],
  auto: ["\uBBF8\uAD6D, \uD55C\uAD6D\uC0B0 \uC790\uB3D9\uCC28 \uAD00\uC138 \uC778\uD558 \uD569\uC758", "\uC790\uB3D9\uCC28 \uC218\uCD9C \uC5ED\uB300 \uCD5C\uB300"],
  bio: ["\uC815\uBD80, \uBC14\uC774\uC624 \uC2E0\uC57D \uAC1C\uBC1C \uC9C0\uC6D0 \uD380\uB4DC \uC870\uC131", "\uBC14\uC774\uC624 \uAE30\uC220\uC218\uCD9C \uC787\uB530\uB77C"],
  energy: ["\uC815\uBD80, \uC2E0\uC7AC\uC0DD\uC5D0\uB108\uC9C0 \uD22C\uC790 \uD655\uB300", "\uACA8\uC6B8 \uD55C\uD30C\uB85C \uC5D0\uB108\uC9C0 \uC218\uC694 \uAE09\uC99D"],
  air: ["\uD574\uC678\uC5EC\uD589 \uC218\uC694 \uD3ED\uBC1C, \uD56D\uACF5\uAD8C \uB9E4\uC9C4 \uD589\uB82C", "\uC911\uAD6D \uB2E8\uCCB4\uAD00\uAD11 \uC804\uBA74 \uC7AC\uAC1C"],
  ent: ["K-\uCF58\uD150\uCE20 \uD574\uC678 \uC218\uCD9C \uC5ED\uB300 \uCD5C\uB300", "\uAC8C\uC784 \uC0B0\uC5C5 \uADDC\uC81C \uC644\uD654 \uBC1C\uD45C"],
  food: ["K-\uD478\uB4DC \uC5F4\uD48D, \uC2DD\uD488 \uC218\uCD9C \uC2E0\uAE30\uB85D", "\uBA85\uC808 \uC55E\uB450\uACE0 \uC18C\uBE44 \uC2EC\uB9AC \uD68C\uBCF5"],
  bank: ["\uC740\uD589\uAD8C \uBC30\uB2F9 \uD655\uB300 \uAE30\uB300\uAC10", "\uAE08\uC735\uB2F9\uAD6D, \uC740\uD589 \uC790\uBCF8\uADDC\uC81C \uC644\uD654"],
  build: ["\uC815\uBD80, \uB300\uADDC\uBAA8 \uC8FC\uD0DD \uACF5\uAE09 \uB300\uCC45 \uBC1C\uD45C", "\uBD80\uB3D9\uC0B0 \uAC70\uB798\uB7C9 \uBC18\uB4F1"],
  crypto: ["\uBE44\uD2B8\uCF54\uC778 \uC0AC\uC0C1 \uCD5C\uACE0\uAC00 \uACBD\uC2E0", "\uBBF8\uAD6D, \uCF54\uC778 \uD604\uBB3C ETF \uCD94\uAC00 \uC2B9\uC778"],
  us_tech: ["\uBBF8\uAD6D \uBE45\uD14C\uD06C, AI \uD22C\uC790 \uD655\uB300 \uACBD\uC7C1", "\uB098\uC2A4\uB2E5 \uAE30\uC220\uC8FC \uAC15\uC138"],
  us_semi: ["\uBBF8\uAD6D, \uBC18\uB3C4\uCCB4 \uBCF4\uC870\uAE08 \uB300\uD3ED \uD655\uB300", "AI \uB370\uC774\uD130\uC13C\uD130 \uD22C\uC790 \uBD90"],
  us_ev: ["\uBBF8\uAD6D, \uC804\uAE30\uCC28 \uC138\uC561\uACF5\uC81C \uD655\uB300", "\uBBF8\uAD6D \uC804\uAE30\uCC28 \uD310\uB9E4 \uAE09\uC99D"],
  us_cons: ["\uBBF8\uAD6D \uC18C\uBE44 \uC9C0\uD45C \uC608\uC0C1 \uC0C1\uD68C", "\uBBF8\uAD6D \uC5F0\uB9D0 \uC1FC\uD551 \uC2DC\uC98C \uC5ED\uB300 \uCD5C\uB300"]
};
var SECTOR_BAD = {
  semi: ["\uBC18\uB3C4\uCCB4 \uC7AC\uACE0 \uACFC\uC789 \uC6B0\uB824 \uD655\uC0B0", "\uBBF8\uAD6D, \uBC18\uB3C4\uCCB4 \uC218\uCD9C \uADDC\uC81C \uAC15\uD654"],
  it: ["\uD50C\uB7AB\uD3FC \uB3C5\uACFC\uC810 \uADDC\uC81C\uBC95 \uAD6D\uD68C \uD1B5\uACFC", "\uBE45\uD14C\uD06C \uC2E4\uC801 \uBD80\uC9C4\uC5D0 IT\uC8FC \uD22C\uC790\uC2EC\uB9AC \uC704\uCD95"],
  battery: ["\uC804\uAE30\uCC28 \uC218\uC694 \uB454\uD654 \uC6B0\uB824", "\uB9AC\uD2AC \uAC00\uACA9 \uD3ED\uB77D, \uBC30\uD130\uB9AC \uC5C5\uACC4 \uC7AC\uACE0\uD3C9\uAC00 \uC190\uC2E4"],
  auto: ["\uBBF8\uAD6D, \uC218\uC785\uCC28 \uAD00\uC138 \uC778\uC0C1 \uAC80\uD1A0", "\uC790\uB3D9\uCC28 \uBC18\uB3C4\uCCB4 \uACF5\uAE09\uB09C \uC7AC\uBC1C"],
  bio: ["\uBC14\uC774\uC624 \uC5C5\uACC4 \uC784\uC0C1 \uC2E4\uD328 \uC787\uB530\uB77C", "\uC815\uBD80, \uC57D\uAC00 \uC778\uD558 \uC815\uCC45 \uBC1C\uD45C"],
  energy: ["\uC815\uBD80, \uC815\uC720\uC0AC \uD6A1\uC7AC\uC138 \uB3C4\uC785 \uAC80\uD1A0", "\uCE5C\uD658\uACBD \uADDC\uC81C \uAC15\uD654\uB85C \uC815\uC720\uC5C5 \uBD80\uB2F4"],
  air: ["\uC2E0\uC885 \uAC10\uC5FC\uBCD1 \uD655\uC0B0 \uC6B0\uB824\uC5D0 \uC5EC\uD589 \uCDE8\uC18C \uAE09\uC99D", "\uD56D\uACF5 \uC548\uC804 \uADDC\uC81C \uAC15\uD654"],
  ent: ["\uC911\uAD6D, \uD55C\uAD6D \uCF58\uD150\uCE20 \uC218\uC785 \uC81C\uD55C", "\uAC8C\uC784 \uC167\uB2E4\uC6B4\uC81C \uBD80\uD65C \uB17C\uC758"],
  food: ["\uACE1\uBB3C \uAC00\uACA9 \uAE09\uB4F1, \uC2DD\uD488\uC5C5\uACC4 \uC6D0\uAC00 \uBD80\uB2F4", "\uC18C\uBE44 \uC2EC\uB9AC \uAE09\uB7AD"],
  bank: ["\uAC00\uACC4\uBD80\uCC44 \uBD80\uC2E4 \uC6B0\uB824 \uD655\uC0B0", "\uAE08\uC735\uB2F9\uAD6D, \uC740\uD589 \uC774\uC790\uC7A5\uC0AC \uC81C\uB3D9"],
  build: ["\uBBF8\uBD84\uC591 \uC8FC\uD0DD 10\uB144 \uB9CC\uC5D0 \uCD5C\uB300", "\uAC74\uC124\uC0AC \uC5F0\uC1C4 \uBD80\uB3C4 \uC6B0\uB824"],
  crypto: ["\uB300\uD615 \uCF54\uC778 \uAC70\uB798\uC18C \uD30C\uC0B0", "\uC815\uBD80, \uAC00\uC0C1\uC790\uC0B0 \uACFC\uC138 \uAC15\uD654"],
  us_tech: ["\uBBF8\uAD6D, \uBE45\uD14C\uD06C \uADDC\uC81C \uBC95\uC548 \uBC1C\uC758", "\uAE30\uC220\uC8FC \uAC70\uD488 \uB17C\uB780 \uD655\uC0B0"],
  us_semi: ["\uBBF8\xB7\uC911 \uBC18\uB3C4\uCCB4 \uAC08\uB4F1 \uACA9\uD654", "\uBBF8\uAD6D \uBC18\uB3C4\uCCB4 \uC7AC\uACE0 \uACFC\uC789 \uC6B0\uB824"],
  us_ev: ["\uBBF8\uAD6D, \uC804\uAE30\uCC28 \uBCF4\uC870\uAE08 \uCD95\uC18C", "\uC804\uAE30\uCC28 \uC218\uC694 \uB454\uD654 \uC6B0\uB824"],
  us_cons: ["\uBBF8\uAD6D \uC18C\uBE44 \uC2EC\uB9AC \uAE09\uB7AD", "\uBBF8\uAD6D \uC18C\uB9E4\uD310\uB9E4 \uBD80\uC9C4"]
};
var MACRO = {
  rateCut: ["\uD55C\uAD6D\uC740\uD589, \uAE30\uC900\uAE08\uB9AC {d}%p \uAE5C\uC9DD \uC778\uD558", "\uD55C\uAD6D\uC740\uD589, \uAE30\uC900\uAE08\uB9AC {d}%p \uC778\uD558 \uACB0\uC815"],
  rateHike: ["\uD55C\uAD6D\uC740\uD589, \uAE30\uC900\uAE08\uB9AC {d}%p \uC778\uC0C1", "\uBB3C\uAC00 \uC7A1\uAE30 \uB098\uC120 \uD55C\uAD6D\uC740\uD589, \uAE08\uB9AC {d}%p \uC778\uC0C1"],
  oilUp: ["\uC911\uB3D9 \uAE34\uC7A5 \uACE0\uC870, \uAD6D\uC81C \uC720\uAC00 {d}% \uAE09\uB4F1", "\uC0B0\uC720\uAD6D \uAC10\uC0B0 \uD569\uC758\uC5D0 \uC720\uAC00 {d}% \uC0C1\uC2B9"],
  oilDown: ["\uC0B0\uC720\uAD6D \uC99D\uC0B0 \uBC1C\uD45C, \uC720\uAC00 {d}% \uAE09\uB77D", "\uACBD\uAE30 \uB454\uD654 \uC6B0\uB824\uC5D0 \uC720\uAC00 {d}% \uD558\uB77D"],
  fxUp: ["\uC6D0\xB7\uB2EC\uB7EC \uD658\uC728 {d}% \uAE09\uB4F1\u2026 \uC6D0\uD654 \uC57D\uC138", "\uB2EC\uB7EC \uAC15\uC138\uC5D0 \uD658\uC728 {d}% \uC0C1\uC2B9"],
  fxDown: ["\uC6D0\xB7\uB2EC\uB7EC \uD658\uC728 {d}% \uD558\uB77D\u2026 \uC6D0\uD654 \uAC15\uC138", "\uC678\uAD6D\uC778 \uC790\uAE08 \uC720\uC785\uC5D0 \uD658\uC728 {d}% \uD558\uB77D"],
  good: ["\uC678\uAD6D\uC778 \uD22C\uC790\uC790 \uB300\uADDC\uBAA8 \uC21C\uB9E4\uC218 \uC804\uD658", "\uAD6D\uB0B4 \uACBD\uAE30 \uC9C0\uD45C \uC608\uC0C1 \uD06C\uAC8C \uC6C3\uB3CC\uC544", "\uC218\uCD9C 6\uAC1C\uC6D4 \uC5F0\uC18D \uC99D\uAC00"],
  bad: ["\uAD6D\uB0B4 \uACBD\uAE30 \uB454\uD654 \uC6B0\uB824 \uD655\uC0B0", "\uC678\uAD6D\uC778 \uC790\uAE08 \uB300\uAC70 \uC774\uD0C8", "\uC218\uCD9C 3\uAC1C\uC6D4 \uC5F0\uC18D \uAC10\uC18C"],
  fedHold: ['\uBBF8 \uC5F0\uC900, \uAE30\uC900\uAE08\uB9AC \uB3D9\uACB0\u2026 "\uB2F9\uBD84\uAC04 \uC9C0\uCF1C\uBCFC \uAC83"', "\uC5F0\uC900 \uAE08\uB9AC \uB3D9\uACB0, \uC2DC\uC7A5 \uC608\uC0C1 \uBD80\uD569"],
  rateHold: ["\uD55C\uAD6D\uC740\uD589, \uAE30\uC900\uAE08\uB9AC \uB3D9\uACB0", "\uAE08\uD1B5\uC704 \uB9CC\uC7A5\uC77C\uCE58 \uAE08\uB9AC \uB3D9\uACB0"],
  fedCut: ["\uBBF8 \uC5F0\uC900, \uAE30\uC900\uAE08\uB9AC {d}%p \uC778\uD558", '\uC5F0\uC900 \uC758\uC7A5 "\uC778\uD558 \uC0AC\uC774\uD074 \uC2DC\uC791"\u2026 \uAE08\uB9AC {d}%p \uC778\uD558'],
  fedHike: ["\uBBF8 \uC5F0\uC900, \uAE30\uC900\uAE08\uB9AC {d}%p \uC778\uC0C1", "\uBBF8\uAD6D \uBB3C\uAC00 \uC1FC\uD06C\uC5D0 \uC5F0\uC900 {d}%p \uC778\uC0C1"],
  usGood: ["\uBBF8\uAD6D \uC99D\uC2DC \uC0AC\uC0C1 \uCD5C\uACE0\uCE58 \uACBD\uC2E0", "\uBBF8\uAD6D \uACE0\uC6A9 \uC9C0\uD45C \uAE5C\uC9DD \uD638\uC870"],
  usBad: ["\uBBF8\uAD6D \uC99D\uC2DC \uAE09\uB77D, \uB098\uC2A4\uB2E5 3% \uD558\uB77D", "\uBBF8\uAD6D \uACBD\uAE30\uCE68\uCCB4 \uC6B0\uB824 \uD655\uC0B0"],
  crash: ["[\uAE34\uAE09] \uAE00\uB85C\uBC8C \uAE08\uC735\uC704\uAE30 \uACF5\uD3EC\u2026 \uC99D\uC2DC \uD3ED\uB77D", "[\uAE34\uAE09] \uB300\uD615 \uD22C\uC790\uC740\uD589 \uD30C\uC0B0 \uC18C\uC2DD"],
  rally: ["[\uC18D\uBCF4] \uBBF8\xB7\uC911 \uBB34\uC5ED\uBD84\uC7C1 \uC804\uACA9 \uD0C0\uACB0", "[\uC18D\uBCF4] \uC815\uBD80, 100\uC870\uC6D0 \uACBD\uAE30\uBD80\uC591\uCC45 \uBC1C\uD45C"]
};
var EARNINGS_GOOD = ["{name}, \uBD84\uAE30 \uC2E4\uC801 \uC5B4\uB2DD \uC11C\uD504\uB77C\uC774\uC988", "{name}, \uC0AC\uC0C1 \uCD5C\uB300 \uBD84\uAE30 \uC601\uC5C5\uC774\uC775", "{name}, \uC2E4\uC801 \uAC00\uC774\uB358\uC2A4 \uC0C1\uD5A5"];
var EARNINGS_BAD = ["{name}, \uC2E4\uC801 \uC1FC\uD06C\u2026 \uC2DC\uC7A5 \uC608\uC0C1 \uD06C\uAC8C \uD558\uD68C", "{name}, \uBD84\uAE30 \uC601\uC5C5\uC801\uC790 \uC804\uD658", "{name}, \uC5F0\uAC04 \uC2E4\uC801 \uC804\uB9DD \uD558\uD5A5"];
var RECAP_SECTOR_UP = ["{sector}\uC8FC \uC77C\uC81C\uD788 \uAC15\uC138\u2026 \uD3C9\uADE0 {p}% \uC0C1\uC2B9 \uB9C8\uAC10", "{sector} \uC5C5\uC885 \uD558\uB8E8 \uC0C8 {p}% \uAED1\uCDA9", "\uC678\uAD6D\uC778 {sector}\uC8FC \uC4F8\uC5B4 \uB2F4\uC544\u2026 \uC5C5\uC885 {p}%\u2191"];
var RECAP_SECTOR_DOWN = ["{sector}\uC8FC \uB3D9\uBC18 \uC57D\uC138\u2026 \uD3C9\uADE0 {p}% \uD558\uB77D \uB9C8\uAC10", "{sector} \uC5C5\uC885 {p}% \uAE09\uB77D, \uD22C\uC790\uC2EC\uB9AC \uC704\uCD95", "{sector}\uC8FC \uCC28\uC775 \uB9E4\uBB3C \uC3DF\uC544\uC838\u2026 \uC5C5\uC885 {p}%\u2193"];
var RECAP_STOCK_UP = ["{name} {p}% \uAE09\uB4F1 \uB9C8\uAC10\u2026 \uAC70\uB798\uB7C9 \uD3ED\uBC1C", "{name}, \uD558\uB8E8 \uB9CC\uC5D0 {p}% \uB6F0\uC5B4", "\uAC1C\uBBF8\uB4E4 \uBAB0\uB9B0 {name}, {p}% \uC0C1\uC2B9"];
var RECAP_STOCK_DOWN = ["{name} {p}% \uAE09\uB77D \uB9C8\uAC10", "{name}, \uD558\uB8E8 \uC0C8 {p}% \uBE60\uC838\u2026 \uC800\uAC00 \uB9E4\uC218 vs \uC190\uC808", "{name} {p}% \uD558\uB77D, 52\uC8FC \uC2E0\uC800\uAC00 \uADFC\uC811"];
var RECAP_LIMIT_UP = ["{name}, \uC0C1\uD55C\uAC00 \uC9C1\uD589", "{name} \uC0C1\uD55C\uAC00\u2026 \uB9E4\uC218 \uC794\uB7C9 \uC218\uBC31\uB9CC \uC8FC"];
var RECAP_LIMIT_DOWN = ["{name}, \uD558\uD55C\uAC00 \uCD94\uB77D", "{name} \uD558\uD55C\uAC00\u2026 \uD314\uB824\uB294 \uC0AC\uB78C\uB9CC \uC904 \uC11C"];
var RECAP_KR_UP = ["\uCF54\uC2A4\uD53C {p}% \uC0C1\uC2B9 \uB9C8\uAC10\u2026 \uC678\uAD6D\uC778\xB7\uAE30\uAD00 \uC30D\uB04C\uC774", "\uCF54\uC2A4\uD53C, {p}% \uC62C\uB77C \uD22C\uC790\uC2EC\uB9AC \uD68C\uBCF5"];
var RECAP_KR_DOWN = ["\uCF54\uC2A4\uD53C {p}% \uD558\uB77D \uB9C8\uAC10\u2026 \uAC1C\uC778\uB9CC \uC21C\uB9E4\uC218", "\uCF54\uC2A4\uD53C, {p}% \uBC00\uB824 \uD22C\uC790\uC2EC\uB9AC \uC704\uCD95"];

// src/game/stocks.ts
var SECTORS = [
  { id: "semi", name: "\uBC18\uB3C4\uCCB4", emoji: "\u{1F532}", region: "KR", beta: 1.2, rate: -0.06, fx: 0.5, oil: 0, vol: 0.012, links: { it: 0.4, auto: 0.2, battery: 0.15, us_semi: 0.2 } },
  { id: "it", name: "IT\xB7\uD50C\uB7AB\uD3FC", emoji: "\u{1F4BB}", region: "KR", beta: 1.1, rate: -0.12, fx: 0.1, oil: 0, vol: 0.011, links: { ent: 0.25, semi: 0.2, crypto: 0.15 } },
  { id: "battery", name: "2\uCC28\uC804\uC9C0", emoji: "\u{1F50B}", region: "KR", beta: 1.3, rate: -0.1, fx: 0.2, oil: 0.1, vol: 0.016, links: { auto: 0.4, semi: 0.1, us_ev: 0.2 } },
  { id: "auto", name: "\uC790\uB3D9\uCC28", emoji: "\u{1F697}", region: "KR", beta: 1, rate: -0.04, fx: 0.6, oil: -0.08, vol: 0.01, links: { battery: 0.35, semi: 0.1 } },
  { id: "bio", name: "\uBC14\uC774\uC624", emoji: "\u{1F9EC}", region: "KR", beta: 0.9, rate: -0.14, fx: 0, oil: 0, vol: 0.016, links: {} },
  { id: "energy", name: "\uC5D0\uB108\uC9C0\xB7\uC815\uC720", emoji: "\u{1F6E2}\uFE0F", region: "KR", beta: 0.8, rate: 0, fx: 0.1, oil: 0.5, vol: 0.011, links: { air: -0.3 } },
  { id: "air", name: "\uD56D\uACF5\xB7\uC5EC\uD589", emoji: "\u2708\uFE0F", region: "KR", beta: 1, rate: -0.03, fx: -0.6, oil: -0.4, vol: 0.012, links: { food: 0.1 } },
  { id: "ent", name: "\uAC8C\uC784\xB7\uC5D4\uD130", emoji: "\u{1F3AE}", region: "KR", beta: 1, rate: -0.06, fx: 0.1, oil: 0, vol: 0.014, links: { it: 0.15 } },
  { id: "food", name: "\uC2DD\uD488\xB7\uC720\uD1B5", emoji: "\u{1F6D2}", region: "KR", beta: 0.5, rate: -0.02, fx: -0.3, oil: -0.1, vol: 6e-3, links: {} },
  { id: "bank", name: "\uAE08\uC735", emoji: "\u{1F3E6}", region: "KR", beta: 0.8, rate: 0.1, fx: 0, oil: 0, vol: 8e-3, links: { build: 0.2 } },
  { id: "build", name: "\uAC74\uC124\xB7\uBD80\uB3D9\uC0B0", emoji: "\u{1F3D7}\uFE0F", region: "KR", beta: 0.9, rate: -0.1, fx: 0, oil: -0.05, vol: 0.011, links: { bank: 0.2 } },
  { id: "crypto", name: "\uBE14\uB85D\uCCB4\uC778", emoji: "\u{1FA99}", region: "KR", beta: 1.6, rate: -0.2, fx: 0, oil: 0, vol: 0.03, links: { it: 0.1 } },
  { id: "us_tech", name: "\uBBF8\uAD6D \uBE45\uD14C\uD06C", emoji: "\u{1F5FD}", region: "US", beta: 1.1, rate: -0.12, fx: 0, oil: 0, vol: 0.011, links: { it: 0.3, us_semi: 0.3 } },
  { id: "us_semi", name: "\uBBF8\uAD6D \uBC18\uB3C4\uCCB4", emoji: "\u{1F9E0}", region: "US", beta: 1.4, rate: -0.08, fx: 0, oil: 0, vol: 0.016, links: { semi: 0.45, us_tech: 0.2 } },
  { id: "us_ev", name: "\uBBF8\uAD6D \uC804\uAE30\uCC28", emoji: "\u26A1", region: "US", beta: 1.5, rate: -0.12, fx: 0, oil: 0.15, vol: 0.022, links: { battery: 0.4, auto: 0.1 } },
  { id: "us_cons", name: "\uBBF8\uAD6D \uC18C\uBE44\uC7AC", emoji: "\u{1F964}", region: "US", beta: 0.6, rate: -0.03, fx: 0, oil: -0.05, vol: 7e-3, links: {} },
  { id: "etf", name: "ETF", emoji: "\u{1F9FA}", region: "ETF", beta: 0, rate: 0, fx: 0, oil: 0, vol: 0, links: {} }
];
var SECTOR_MAP = Object.fromEntries(SECTORS.map((s) => [s.id, s]));
var STOCK_SECTORS = SECTORS.filter((s) => s.region !== "ETF");
var KR = (symbol, name, sector, basePrice, vol, drift, sectorBeta, desc) => ({
  symbol,
  name,
  sector,
  currency: "KRW",
  basePrice,
  vol,
  drift,
  sectorBeta,
  desc
});
var US = (symbol, name, sector, basePrice, vol, drift, sectorBeta, desc) => ({
  ...KR(symbol, name, sector, basePrice, vol, drift, sectorBeta, desc),
  currency: "USD"
});
var ETF = (symbol, name, etf, desc) => ({
  symbol,
  name,
  sector: "etf",
  currency: "KRW",
  basePrice: 1e4,
  vol: 0,
  drift: 0,
  sectorBeta: 0,
  desc,
  etf
});
var STOCKS = [
  KR("CORE", "\uCF54\uC5B4\uBC18\uB3C4\uCCB4", "semi", 88e3, 0.016, 15e-4, 1.1, "\uBA54\uBAA8\uB9AC \uBC18\uB3C4\uCCB4 \uC138\uACC4 2\uC704. \uC5C5\uD669\uC5D0 \uB530\uB77C \uD06C\uAC8C \uC6C0\uC9C1\uC774\uB294 \uB300\uC7A5\uC8FC"),
  KR("NANO", "\uB098\uB178\uCE69\uC2A4", "semi", 34e3, 0.024, 1e-3, 1, "AI \uC11C\uBC84\uC6A9 \uCE69 \uC124\uACC4 \uC804\uBB38. \uC131\uC7A5\uC131\uC774 \uB192\uC9C0\uB9CC \uBCC0\uB3D9\uC774 \uD07C"),
  KR("WAFR", "\uD55C\uACB0\uC18C\uC7AC", "semi", 12500, 0.02, 5e-4, 0.8, "\uBC18\uB3C4\uCCB4 \uC6E8\uC774\uD37C\xB7\uC18C\uC7AC \uACF5\uAE09\uC0AC. \uB300\uD615 \uACE0\uAC1D\uC0AC \uC8FC\uBB38\uC5D0 \uC88C\uC6B0\uB428"),
  KR("NEOT", "\uB124\uC624\uD14C\uD06C", "it", 52e3, 0.016, 12e-4, 1, "\uAD6D\uB0B4 1\uC704 \uAC80\uC0C9\xB7\uBA54\uC2E0\uC800 \uD50C\uB7AB\uD3FC. \uAD11\uACE0\uC640 \uCEE4\uBA38\uC2A4\uB85C \uB3C8\uC744 \uBC8E"),
  KR("CLOD", "\uAD6C\uB984\uD074\uB77C\uC6B0\uB4DC", "it", 27e3, 0.022, 15e-4, 1.1, "\uAE30\uC5C5\uC6A9 \uD074\uB77C\uC6B0\uB4DC\xB7AI \uC11C\uBE44\uC2A4. \uAE08\uB9AC\uC5D0 \uBBFC\uAC10\uD55C \uC131\uC7A5\uC8FC"),
  KR("PAYS", "\uD398\uC774\uB9C1\uD06C", "it", 18e3, 0.022, 5e-4, 0.9, "\uAC04\uD3B8\uACB0\uC81C\xB7\uD540\uD14C\uD06C \uC11C\uBE44\uC2A4. \uADDC\uC81C \uB274\uC2A4\uC5D0 \uCD9C\uB801\uC784"),
  KR("VOLT", "\uBCFC\uD2B8\uC5D0\uB108\uC9C0\uC194\uB8E8\uC158", "battery", 61e3, 0.022, 1e-3, 1.1, "\uC804\uAE30\uCC28 \uBC30\uD130\uB9AC \uC140 \uC81C\uC870\uC0AC. \uC644\uC131\uCC28 \uD310\uB9E4\uB7C9\uACFC \uD568\uAED8 \uC6C0\uC9C1\uC784"),
  KR("LITH", "\uB9AC\uD2AC\uCF54\uB9AC\uC544", "battery", 23e3, 0.03, 0, 1.2, "\uBC30\uD130\uB9AC \uC6D0\uB8CC(\uB9AC\uD2AC) \uAC00\uACF5. \uC6D0\uC790\uC7AC \uAC00\uACA9 \uB530\uB77C \uAE09\uB4F1\uB77D"),
  KR("HDMR", "\uD55C\uBE5B\uBAA8\uD130\uC2A4", "auto", 74e3, 0.014, 1e-3, 1, "\uAD6D\uB0B4 \uCD5C\uB300 \uC644\uC131\uCC28. \uC218\uCD9C \uBE44\uC911\uC774 \uCEE4\uC11C \uD658\uC728\uC774 \uC624\uB974\uBA74 \uC720\uB9AC"),
  KR("PART", "\uB300\uC131\uBD80\uD488", "auto", 15500, 0.018, 5e-4, 0.9, "\uC790\uB3D9\uCC28 \uBD80\uD488 \uB0A9\uD488\uC0AC. \uC644\uC131\uCC28 \uC2E4\uC801\uC744 \uB530\uB77C\uAC10"),
  KR("HBIO", "\uD55C\uBE5B\uBC14\uC774\uC624", "bio", 38e3, 0.03, 0, 0.9, "\uD56D\uC554 \uC2E0\uC57D \uAC1C\uBC1C\uC0AC. \uC784\uC0C1 \uACB0\uACFC \uD558\uB098\uB85C \uAE09\uB4F1\xB7\uAE09\uB77D"),
  KR("GENE", "\uC9C4\uBA54\uB514", "bio", 21e3, 0.034, 0, 0.8, "\uC720\uC804\uC790 \uCE58\uB8CC\uC81C \uBCA4\uCC98. \uACE0\uC704\uD5D8 \uACE0\uC218\uC775"),
  KR("CARE", "\uCF00\uC5B4\uC81C\uC57D", "bio", 47e3, 0.012, 8e-4, 0.6, "\uAC10\uAE30\uC57D\xB7\uC601\uC591\uC81C\uB85C \uAFB8\uC900\uD788 \uBC84\uB294 \uC804\uD1B5 \uC81C\uC57D\uC0AC"),
  KR("SUNE", "\uC36C\uC5D0\uB108\uC9C0", "energy", 21e3, 0.018, 8e-4, 0.9, "\uD0DC\uC591\uAD11\xB7\uD48D\uB825 \uBC1C\uC804. \uC815\uBD80 \uC815\uCC45 \uC218\uD61C\uC8FC"),
  KR("OILK", "K\uC815\uC720", "energy", 56e3, 0.014, 6e-4, 1.1, "\uC815\uC720\uC0AC. \uAD6D\uC81C \uC720\uAC00\uAC00 \uC624\uB974\uBA74 \uC774\uC775\uB3C4 \uB298\uC5B4\uB0A8"),
  KR("SKYA", "\uC2A4\uCE74\uC774\uD56D\uACF5", "air", 19e3, 0.018, 4e-4, 1.1, "\uB300\uD615 \uD56D\uACF5\uC0AC. \uC720\uAC00\xB7\uD658\uC728\uC774 \uC624\uB974\uBA74 \uBE44\uC6A9 \uBD80\uB2F4"),
  KR("TRVL", "\uC5EC\uD589\uAC00\uC790", "air", 9500, 0.022, 4e-4, 1, "\uC5EC\uD589 \uD50C\uB7AB\uD3FC. \uD574\uC678\uC5EC\uD589 \uC218\uC694\uC640 \uD658\uC728\uC5D0 \uBBFC\uAC10"),
  KR("PIXL", "\uD53D\uC140\uAC8C\uC784\uC988", "ent", 64e3, 0.022, 8e-4, 1, "\uBAA8\uBC14\uC77C RPG \uAC1C\uBC1C\uC0AC. \uC2E0\uC791 \uD765\uD589 \uC5EC\uBD80\uAC00 \uAD00\uAC74"),
  KR("STAR", "\uC2A4\uD0C0\uC5D4\uD130", "ent", 27e3, 0.024, 4e-4, 1, "K\uD31D \uAE30\uD68D\uC0AC. \uC18C\uC18D \uADF8\uB8F9\uC758 \uCEF4\uBC31\xB7\uB17C\uB780\uC5D0 \uB530\uB77C \uCD9C\uB801\uC784"),
  KR("MOVI", "\uC2DC\uB124\uB9C8\uC6D4\uB4DC", "ent", 11e3, 0.018, 3e-4, 0.8, "\uC601\uD654 \uC81C\uC791\xB7\uADF9\uC7A5 \uCCB4\uC778"),
  KR("MLKY", "\uBC00\uD0A4\uD478\uB4DC", "food", 15e3, 9e-3, 6e-4, 1, "\uC6B0\uC720\xB7\uACFC\uC790 \uC81C\uC870. \uACBD\uAE30\uC640 \uC0C1\uAD00\uC5C6\uC774 \uC548\uC815\uC801"),
  KR("MART", "\uD55C\uBE5B\uB9C8\uD2B8", "food", 33e3, 0.011, 5e-4, 1, "\uB300\uD615\uB9C8\uD2B8\xB7\uD3B8\uC758\uC810 \uCCB4\uC778. \uC18C\uBE44 \uACBD\uAE30\uC5D0 \uC601\uD5A5"),
  KR("RAMN", "\uBCF4\uAE00\uB77C\uBA74", "food", 41e3, 0.012, 8e-4, 0.9, "\uB77C\uBA74 \uC218\uCD9C 1\uC704. K-\uD478\uB4DC \uC778\uAE30 \uC218\uD61C"),
  KR("KBNK", "\uAD6D\uBBFC\uB4E0\uB4E0\uC740\uD589", "bank", 58e3, 0.01, 6e-4, 1, "\uC2DC\uC911 \uC740\uD589. \uAE08\uB9AC\uAC00 \uC624\uB974\uBA74 \uC774\uC790 \uC774\uC775 \uC99D\uAC00"),
  KR("SECU", "\uBBF8\uB798\uC99D\uAD8C", "bank", 9800, 0.016, 5e-4, 1.2, "\uC99D\uAD8C\uC0AC. \uC8FC\uC2DD\uC2DC\uC7A5\uC774 \uB728\uAC70\uC6B0\uBA74 \uC218\uC218\uB8CC \uC218\uC785 \uC99D\uAC00"),
  KR("BILD", "\uB300\uD55C\uAC74\uC124", "build", 31e3, 0.015, 3e-4, 1, "\uC544\uD30C\uD2B8\xB7\uC778\uD504\uB77C \uAC74\uC124. \uAE08\uB9AC \uC778\uD558\uC640 \uBD80\uB3D9\uC0B0 \uC815\uCC45 \uC218\uD61C"),
  KR("HOME", "\uC2A4\uB9C8\uD2B8\uD648\uB9AC\uCE20", "build", 5200, 0.01, 4e-4, 0.8, "\uC784\uB300 \uBD80\uB3D9\uC0B0 \uD22C\uC790\uD68C\uC0AC. \uAE08\uB9AC\uC5D0 \uBBFC\uAC10"),
  KR("BLOK", "\uBE14\uB85D\uCCB4\uC778\uB7A9", "crypto", 9e3, 0.04, -5e-4, 1, "\uCF54\uC778 \uAC70\uB798\uC18C \uC6B4\uC601\uC0AC. \uCF54\uC778 \uAC00\uACA9 \uB530\uB77C \uB864\uB7EC\uCF54\uC2A4\uD130"),
  KR("MINE", "\uCF54\uC778\uB9C8\uC774\uB2DD", "crypto", 4300, 0.05, -1e-3, 1.2, "\uAC00\uC0C1\uD654\uD3D0 \uCC44\uAD74 \uAE30\uC5C5. \uCD5C\uACE0 \uC704\uD5D8 \uC885\uBAA9"),
  US("NXRA", "\uB125\uC18C\uB77C", "us_tech", 185, 0.014, 12e-4, 1, "\uC138\uACC4 \uCD5C\uB300 \uC2A4\uB9C8\uD2B8\uD3F0\xB7\uC571 \uC0DD\uD0DC\uACC4 \uAE30\uC5C5. \uBBF8\uAD6D \uB300\uD45C \uC6B0\uB7C9\uC8FC"),
  US("QNTX", "\uD000\uD2F1\uC2A4", "us_tech", 410, 0.018, 15e-4, 1.1, "\uD074\uB77C\uC6B0\uB4DC\xB7AI \uC18C\uD504\uD2B8\uC6E8\uC5B4 \uACF5\uB8E1. \uBBF8\uAD6D \uAE08\uB9AC\uC5D0 \uBBFC\uAC10"),
  US("STRM", "\uC2A4\uD2B8\uB9BC\uB9AC", "us_tech", 95, 0.022, 8e-4, 1, "\uAE00\uB85C\uBC8C \uB3D9\uC601\uC0C1 \uC2A4\uD2B8\uB9AC\uBC0D. \uAD6C\uB3C5\uC790 \uC218 \uBC1C\uD45C\uC5D0 \uCD9C\uB801\uC784"),
  US("HYPR", "\uD558\uC774\uD398\uB9AC\uC628\uCE69\uC2A4", "us_semi", 120, 0.026, 2e-3, 1.1, "AI\uC6A9 GPU 1\uC704. \uD55C\uAD6D \uBC18\uB3C4\uCCB4 \uC5C5\uC885\uACFC \uD568\uAED8 \uC6C0\uC9C1\uC784"),
  US("ORBT", "\uC624\uB974\uBE57\uC138\uBBF8", "us_semi", 68, 0.022, 1e-3, 0.9, "\uBAA8\uBC14\uC77C\xB7\uC790\uB3D9\uCC28\uC6A9 \uCE69 \uC124\uACC4"),
  US("VOLA", "\uBCFC\uD0C0\uB77C\uBAA8\uD130\uC2A4", "us_ev", 240, 0.032, 5e-4, 1, "\uBBF8\uAD6D \uC804\uAE30\uCC28 1\uC704. \uD55C\uAD6D 2\uCC28\uC804\uC9C0\uC640 \uC5F0\uAD00\uC774 \uD07C"),
  US("MEGA", "\uBA54\uAC00\uB9C8\uD2B8US", "us_cons", 150, 0.01, 6e-4, 1, "\uBBF8\uAD6D \uCD5C\uB300 \uC720\uD1B5 \uCCB4\uC778. \uACBD\uAE30 \uBC29\uC5B4\uC8FC"),
  US("FIZZ", "\uD53C\uC988\uCF5C\uB77C", "us_cons", 62, 8e-3, 5e-4, 0.9, "\uC138\uACC4\uC801\uC778 \uC74C\uB8CC \uD68C\uC0AC. \uAFB8\uC900\uD55C \uBC30\uB2F9"),
  ETF("KIDX", "K\uC885\uD569\uC9C0\uC218 ETF", { track: { type: "index", region: "KR" }, lev: 1, group: "\uC9C0\uC218" }, "\uAD6D\uB0B4 \uC885\uD569\uC9C0\uC218\uB97C \uADF8\uB300\uB85C \uB530\uB77C\uAC00\uC694. \uAD6D\uB0B4 \uC2DC\uC7A5 \uC804\uCCB4\uC5D0 \uB098\uB220 \uD22C\uC790\uD558\uB294 \uD6A8\uACFC"),
  ETF("U500", "\uBBF8\uAD6D\uB300\uD615\uC8FC ETF", { track: { type: "index", region: "US" }, lev: 1, group: "\uC9C0\uC218" }, "\uBBF8\uAD6D \uB300\uD45C \uC885\uBAA9 \uC9C0\uC218\uB97C \uB530\uB77C\uAC00\uC694. \uB2EC\uB7EC\uB85C \uD22C\uC790\uD574\uC11C \uD658\uC728\uC774 \uC624\uB974\uBA74 \uCD94\uAC00 \uC774\uC775"),
  ETF("KLEV", "K\uB808\uBC84\uB9AC\uC9C0 2X", { track: { type: "index", region: "KR" }, lev: 2, group: "\uB808\uBC84\uB9AC\uC9C0\xB7\uC778\uBC84\uC2A4" }, "\uAD6D\uB0B4 \uC885\uD569\uC9C0\uC218 \uD558\uB8E8 \uC218\uC775\uB960\uC758 2\uBC30. \uC624\uB974\uBA74 2\uBC30\uB85C \uBC8C\uACE0, \uB0B4\uB9AC\uBA74 2\uBC30\uB85C \uC783\uC5B4\uC694"),
  ETF("KINV", "K\uC778\uBC84\uC2A4", { track: { type: "index", region: "KR" }, lev: -1, group: "\uB808\uBC84\uB9AC\uC9C0\xB7\uC778\uBC84\uC2A4" }, "\uAD6D\uB0B4 \uC885\uD569\uC9C0\uC218\uC640 \uBC18\uB300\uB85C \uC6C0\uC9C1\uC5EC\uC694. \uC2DC\uC7A5\uC774 \uB5A8\uC5B4\uC9C8 \uAC83 \uAC19\uC744 \uB54C"),
  ETF("UTEC", "\uBBF8\uAD6D\uD14C\uD06C 2X", { track: { type: "basket", symbols: ["NXRA", "QNTX", "STRM", "HYPR", "ORBT"] }, lev: 2, group: "\uB808\uBC84\uB9AC\uC9C0\xB7\uC778\uBC84\uC2A4" }, "\uBBF8\uAD6D \uBE45\uD14C\uD06C\xB7\uBC18\uB3C4\uCCB4 \uD558\uB8E8 \uC218\uC775\uB960\uC758 2\uBC30"),
  ETF("SEMI", "\uAE00\uB85C\uBC8C\uBC18\uB3C4\uCCB4 ETF", { track: { type: "basket", symbols: ["CORE", "NANO", "WAFR", "HYPR", "ORBT"] }, lev: 1, group: "\uD14C\uB9C8" }, "\uD55C\uAD6D\xB7\uBBF8\uAD6D \uBC18\uB3C4\uCCB4 \uD68C\uC0AC\uC5D0 \uD55C \uBC88\uC5D0 \uD22C\uC790"),
  ETF("BATT", "2\uCC28\uC804\uC9C0 ETF", { track: { type: "basket", symbols: ["VOLT", "LITH", "VOLA"] }, lev: 1, group: "\uD14C\uB9C8" }, "\uBC30\uD130\uB9AC\xB7\uC804\uAE30\uCC28 \uD68C\uC0AC \uBB36\uC74C"),
  ETF("DIVK", "\uACE0\uBC30\uB2F9 ETF", { track: { type: "basket", symbols: ["KBNK", "MLKY", "RAMN", "OILK", "FIZZ", "MEGA"] }, lev: 1, group: "\uD14C\uB9C8" }, "\uC740\uD589\xB7\uC2DD\uD488\xB7\uC815\uC720 \uAC19\uC740 \uAFB8\uC900\uD55C \uD68C\uC0AC \uBB36\uC74C. \uC798 \uC548 \uD754\uB4E4\uB824\uC694"),
  ETF("OILX", "\uC6D0\uC720\uC120\uBB3C ETF", { track: { type: "oil" }, lev: 1, group: "\uC6D0\uC790\uC7AC\xB7\uD658\uC728" }, "\uAD6D\uC81C \uC720\uAC00\uB97C \uB530\uB77C\uAC00\uC694. \uC911\uB3D9 \uB274\uC2A4\uC5D0 \uBBFC\uAC10"),
  ETF("USDX", "\uB2EC\uB7EC ETF", { track: { type: "fx" }, lev: 1, group: "\uC6D0\uC790\uC7AC\xB7\uD658\uC728" }, "\uC6D0/\uB2EC\uB7EC \uD658\uC728\uC744 \uB530\uB77C\uAC00\uC694. \uD658\uC728\uC774 \uC624\uB974\uBA74 \uC774\uC775")
];
var STOCK_MAP = Object.fromEntries(STOCKS.map((s) => [s.symbol, s]));
var COMPANIES = STOCKS.filter((s) => !s.etf);
function etfMembers(e) {
  if (e.track.type === "basket") return e.track.symbols;
  if (e.track.type === "index") {
    const region = e.track.region;
    return COMPANIES.filter((c) => SECTOR_MAP[c.sector].region === region).map((c) => c.symbol);
  }
  return [];
}
var CAP_WEIGHT = {
  CORE: 10,
  NANO: 3,
  WAFR: 1,
  NEOT: 4,
  CLOD: 1.5,
  PAYS: 1,
  VOLT: 4,
  LITH: 1.5,
  HDMR: 4,
  PART: 1,
  HBIO: 3,
  GENE: 1,
  CARE: 1,
  SUNE: 1,
  OILK: 2,
  SKYA: 1.5,
  TRVL: 0.5,
  PIXL: 1.5,
  STAR: 1,
  MOVI: 0.5,
  MLKY: 1,
  MART: 1,
  RAMN: 0.8,
  KBNK: 3,
  SECU: 1,
  BILD: 1,
  HOME: 0.6,
  BLOK: 0.5,
  MINE: 0.5,
  NXRA: 6,
  QNTX: 3,
  STRM: 2,
  HYPR: 5,
  ORBT: 1.5,
  VOLA: 3,
  MEGA: 2,
  FIZZ: 1.5
};
var COMPANY_LINKS = {
  HDMR: { PART: 0.6, VOLT: 0.3 },
  VOLT: { LITH: 0.5, HDMR: 0.15 },
  VOLA: { VOLT: 0.3, LITH: 0.25 },
  CORE: { WAFR: 0.5, NANO: 0.3 },
  HYPR: { CORE: 0.25, ORBT: 0.4, WAFR: 0.2 },
  NXRA: { NEOT: 0.15, HYPR: 0.15 },
  SKYA: { TRVL: 0.4 },
  KBNK: { SECU: 0.3 },
  BILD: { HOME: 0.3 },
  MINE: { BLOK: 0.4 },
  MART: { MLKY: 0.2, RAMN: 0.2 },
  PIXL: { STAR: 0.15 }
};

// src/game/market.ts
var INTRADAY_POINTS = 8;
var LIMIT_UP = 1.3;
var LIMIT_DOWN = 0.7;
var KR_INDEX_BASE = 2500;
var US_INDEX_BASE = 5e3;
var DIVIDEND_PAYERS = ["KBNK", "MLKY", "RAMN", "OILK", "HOME", "CARE", "MART", "FIZZ", "MEGA", "DIVK", "SECU"];
function roundPrice(p) {
  const unit = p >= 5e4 ? 100 : p >= 1e4 ? 50 : p >= 5e3 ? 10 : 5;
  return Math.max(unit, Math.round(p / unit) * unit);
}
var roundUsd = (p) => Math.max(0.01, Math.round(p * 100) / 100);
var round2 = (v) => Math.round(v * 100) / 100;
function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}
var ETFS = STOCKS.filter((s) => s.etf);
var MACRO_RELATED = {
  rate: ["KBNK", "BILD", "CLOD", "HBIO", "HOME", "BLOK"],
  fed: ["QNTX", "NXRA", "HYPR", "U500", "UTEC", "USDX"],
  oil: ["OILK", "OILX", "SKYA", "SUNE", "TRVL", "VOLA"],
  fx: ["USDX", "HDMR", "CORE", "SKYA", "U500", "MLKY"],
  kr: ["KIDX", "KLEV", "KINV", "SECU", "CORE", "NEOT"],
  us: ["U500", "UTEC", "NXRA", "HYPR", "MEGA", "SEMI"]
};
function etfsHolding(symbols) {
  return ETFS.filter((e) => e.etf.track.type === "basket" && etfMembers(e.etf).some((m) => symbols.includes(m))).map((e) => e.symbol);
}
function uniq(list, max = 6) {
  return [...new Set(list)].slice(0, max);
}
function relatedForCompany(s) {
  const peers = COMPANIES.filter((p) => p.sector === s.sector && p.symbol !== s.symbol).map((p) => p.symbol);
  const linked = Object.entries(SECTOR_MAP[s.sector].links).filter(([, w]) => w >= 0.2).flatMap(([id]) => COMPANIES.filter((c) => c.sector === id).slice(0, 1).map((c) => c.symbol));
  return uniq([s.symbol, ...peers.slice(0, 2), ...linked, ...etfsHolding([s.symbol])]);
}
function relatedForSector(id) {
  const own = COMPANIES.filter((c) => c.sector === id).map((c) => c.symbol);
  const linked = Object.entries(SECTOR_MAP[id].links).filter(([, w]) => w >= 0.2).flatMap(([sid]) => COMPANIES.filter((c) => c.sector === sid).slice(0, 1).map((c) => c.symbol));
  return uniq([...own, ...linked, ...etfsHolding(own)]);
}
function generateMarket(seed, totalDays, version = 1) {
  const rng = mulberry32(seed);
  const v2 = version >= 2;
  const rng2 = mulberry32((seed ^ 1597463007) >>> 0);
  let regime = 0;
  let prevUsRet = 0;
  let prevKrRet = 0;
  const news = [];
  let macro = {
    rate: pick(rng, [2.75, 3, 3.25, 3.5]),
    usRate: pick(rng, [3.75, 4, 4.25, 4.5, 4.75]),
    fx: Math.round(range(rng, 1280, 1420)),
    oil: Math.round(range(rng, 65, 95))
  };
  const macro0 = macro;
  const macroByDay = [];
  const baseUsd = {};
  const base = {};
  for (const s of COMPANIES) {
    if (s.currency === "USD") {
      baseUsd[s.symbol] = roundUsd(s.basePrice * range(rng, 0.85, 1.15));
      base[s.symbol] = roundPrice(baseUsd[s.symbol] * macro.fx);
    } else base[s.symbol] = roundPrice(s.basePrice * range(rng, 0.85, 1.15));
  }
  for (const e of ETFS) base[e.symbol] = roundPrice(e.basePrice * range(rng, 0.8, 1.6));
  const bars = Object.fromEntries(STOCKS.map((s) => [s.symbol, []]));
  const usd = Object.fromEntries(COMPANIES.filter((s) => s.currency === "USD").map((s) => [s.symbol, []]));
  const last = { ...base };
  const lastUsd = { ...baseUsd };
  const indexBars = [];
  const usIndexBars = [];
  let krLevel = KR_INDEX_BASE;
  let usLevel = US_INDEX_BASE;
  const { events, dividends } = planCalendar(seed, totalDays);
  const isEvent = (day, kind) => events.some((e) => e.day === day && e.kind === kind);
  for (let day = 0; day < totalDays; day++) {
    let companyNews2 = function(boost, earningsOnly = false) {
      {
        const s = pick(rng, COMPANIES);
        const sec = SECTOR_MAP[s.sector];
        const good = rng() < 0.5;
        const rumor = !earningsOnly && rng() < 0.25;
        const realGood = rumor ? rng() < 0.6 ? good : !good : good;
        let mag = boost * range(rng, 0.05, 0.14) * Math.sqrt(s.vol / 0.018) * (rumor ? 0.75 : 1) * (realGood ? 1 : -1);
        if (!rumor && rng() < 0.12) mag = -mag * 0.3;
        addStock(s.symbol, mag);
        if (v2) for (const [l, w] of Object.entries(COMPANY_LINKS[s.symbol] ?? {})) addStock(l, mag * w);
        for (const p of COMPANIES) if (p.sector === s.sector && p.symbol !== s.symbol) addStock(p.symbol, mag * 0.25);
        for (const [link, w] of Object.entries(sec.links)) addSec(link, mag * w * 0.3);
        const pool = earningsOnly ? good ? EARNINGS_GOOD : EARNINGS_BAD : [...good ? COMPANY_GOOD : COMPANY_BAD, ...(good ? SECTOR_COMPANY_GOOD : SECTOR_COMPANY_BAD)[s.sector] ?? []];
        news.push({
          day,
          kind: "company",
          symbol: s.symbol,
          sector: s.sector,
          headline: (rumor ? "[\uB8E8\uBA38] " : "") + fill(pick(rng, pool), { name: s.name }),
          rumor,
          tone: good ? "good" : "bad",
          realTone: realGood ? "good" : "bad",
          related: relatedForCompany(s)
        });
      }
    };
    var companyNews = companyNews2;
    const fomc = isEvent(day, "fomc");
    const bok = isEvent(day, "bok");
    const earnings = isEvent(day, "earnings");
    const expiry = isEvent(day, "expiry");
    let dRate = 0;
    let dUsRate = 0;
    let fxPct = gaussian(rng) * 0.35;
    let oilPct = gaussian(rng) * 1.3;
    let krSent = 0;
    let usSent = 0;
    const sectorShock = {};
    const stockShock = {};
    const addSec = (id, v) => sectorShock[id] = (sectorShock[id] ?? 0) + v;
    const addStock = (sym, v) => stockShock[sym] = (stockShock[sym] ?? 0) + v;
    const pushMacro = (macroType, headline, tone) => news.push({ day, kind: "macro", symbol: null, sector: null, macro: macroType, headline, rumor: false, tone, realTone: tone, related: MACRO_RELATED[macroType] });
    if (v2) {
      if (rng2() < 0.18) regime = rng2() < 0.4 ? 0 : rng2() < 0.5 ? 1 : -1;
      krSent += 35e-4 * regime;
      usSent += 35e-4 * regime;
      if (day > 0) {
        krSent += 0.35 * prevUsRet;
        if (Math.abs(prevUsRet) >= 0.01) {
          const up2 = prevUsRet > 0;
          news.push({
            day,
            kind: "macro",
            symbol: null,
            sector: null,
            macro: "us",
            headline: `\uB274\uC695\uC99D\uC2DC, \uAC04\uBC24 ${(Math.abs(prevUsRet) * 100).toFixed(1)}% ${up2 ? "\uC0C1\uC2B9" : "\uD558\uB77D"} \uB9C8\uAC10\u2026 \uAD6D\uB0B4 \uC99D\uC2DC ${up2 ? "\uD6C8\uD48D" : "\uBD80\uB2F4"}`,
            rumor: false,
            tone: up2 ? "good" : "bad",
            realTone: up2 ? "good" : "bad",
            related: MACRO_RELATED.us,
            label: "\uD574\uC678"
          });
        }
      }
    }
    const count = day === 0 ? 2 : 1 + (rng() < 0.55 ? 1 : 0) + (rng() < 0.25 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const r = rng();
      if (r < 0.04 && day > 2) {
        const crash = rng() < 0.6;
        const mag = crash ? -range(rng, 0.045, 0.075) : range(rng, 0.03, 0.05);
        krSent += mag;
        usSent += mag * 0.8;
        if (crash) fxPct += range(rng, 1, 2.5);
        pushMacro("kr", pick(rng, crash ? MACRO.crash : MACRO.rally), crash ? "bad" : "good");
      } else if (r < 0.27) {
        const t = rng();
        if (t < 0.18) {
          const cut = macro.rate > 1 && (macro.rate >= 5 || rng() < 0.55);
          const d = rng() < 0.75 ? 0.25 : 0.5;
          dRate += cut ? -d : d;
          fxPct += cut ? 0.5 : -0.5;
          pushMacro("rate", fill(pick(rng, cut ? MACRO.rateCut : MACRO.rateHike), { d: d.toFixed(2) }), cut ? "good" : "bad");
        } else if (t < 0.34) {
          const cut = macro.usRate > 1 && (macro.usRate >= 5.5 || rng() < 0.55);
          const d = rng() < 0.75 ? 0.25 : 0.5;
          dUsRate += cut ? -d : d;
          fxPct += cut ? -range(rng, 0.6, 1.4) : range(rng, 0.6, 1.4);
          pushMacro("fed", fill(pick(rng, cut ? MACRO.fedCut : MACRO.fedHike), { d: d.toFixed(2) }), cut ? "good" : "bad");
        } else if (t < 0.52) {
          const up2 = rng() < 0.5;
          const d = range(rng, 5, 12);
          oilPct += up2 ? d : -d;
          pushMacro("oil", fill(pick(rng, up2 ? MACRO.oilUp : MACRO.oilDown), { d: d.toFixed(0) }), up2 ? "bad" : "good");
        } else if (t < 0.68) {
          const up2 = rng() < 0.5;
          const d = range(rng, 1.2, 2.8);
          fxPct += up2 ? d : -d;
          pushMacro("fx", fill(pick(rng, up2 ? MACRO.fxUp : MACRO.fxDown), { d: d.toFixed(1) }), up2 ? "bad" : "good");
        } else if (t < 0.84) {
          const good = rng() < 0.5;
          krSent += (good ? 1 : -1) * range(rng, 0.012, 0.028);
          pushMacro("kr", pick(rng, good ? MACRO.good : MACRO.bad), good ? "good" : "bad");
        } else {
          const good = rng() < 0.5;
          const m = (good ? 1 : -1) * range(rng, 0.012, 0.028);
          usSent += m;
          krSent += m * (v2 ? 0.15 : 0.4);
          pushMacro("us", pick(rng, good ? MACRO.usGood : MACRO.usBad), good ? "good" : "bad");
        }
      } else if (r < 0.5) {
        const sec = pick(rng, STOCK_SECTORS);
        const good = rng() < 0.5;
        const rumor = rng() < 0.2;
        const realGood = rumor ? rng() < 0.6 ? good : !good : good;
        const mag = range(rng, 0.025, 0.06) * (rumor ? 0.8 : 1) * (realGood ? 1 : -1);
        addSec(sec.id, mag);
        for (const [link, w] of Object.entries(sec.links)) addSec(link, mag * w);
        news.push({
          day,
          kind: "sector",
          symbol: null,
          sector: sec.id,
          headline: (rumor ? "[\uB8E8\uBA38] " : "") + pick(rng, (good ? SECTOR_GOOD : SECTOR_BAD)[sec.id]),
          rumor,
          tone: good ? "good" : "bad",
          realTone: realGood ? "good" : "bad",
          related: relatedForSector(sec.id)
        });
      } else {
        companyNews2(1);
      }
    }
    if (earnings) {
      companyNews2(1.35, true);
      companyNews2(1.35, true);
    }
    if (fomc) {
      const t = rng();
      if (t < 0.3) {
        usSent += (rng() < 0.5 ? 1 : -1) * range(rng, 4e-3, 0.012);
        pushMacro("fed", pick(rng, MACRO.fedHold), "good");
      } else {
        const cut = macro.usRate > 1 && (macro.usRate >= 5.5 || t < 0.65);
        const d = rng() < 0.6 ? 0.25 : 0.5;
        dUsRate += cut ? -d : d;
        usSent += (cut ? 1 : -1) * range(rng, 8e-3, 0.02);
        fxPct += cut ? -range(rng, 0.8, 1.8) : range(rng, 0.8, 1.8);
        pushMacro("fed", fill(pick(rng, cut ? MACRO.fedCut : MACRO.fedHike), { d: d.toFixed(2) }), cut ? "good" : "bad");
      }
    }
    if (bok) {
      const t = rng();
      if (t < 0.3) pushMacro("rate", pick(rng, MACRO.rateHold), "good");
      else {
        const cut = macro.rate > 1 && (macro.rate >= 5 || t < 0.65);
        const d = rng() < 0.6 ? 0.25 : 0.5;
        dRate += cut ? -d : d;
        krSent += (cut ? 1 : -1) * range(rng, 6e-3, 0.015);
        fxPct += cut ? 0.6 : -0.6;
        pushMacro("rate", fill(pick(rng, cut ? MACRO.rateCut : MACRO.rateHike), { d: d.toFixed(2) }), cut ? "good" : "bad");
      }
    }
    const prevMacro = macro;
    macro = {
      rate: round2(Math.min(6, Math.max(0.5, macro.rate + dRate))),
      usRate: round2(Math.min(7, Math.max(0.25, macro.usRate + dUsRate))),
      fx: Math.round(macro.fx * (1 + fxPct / 100)),
      oil: Math.round(macro.oil * (1 + oilPct / 100) * 10) / 10
    };
    macroByDay.push(macro);
    const fxRet = Math.log(macro.fx / prevMacro.fx);
    const oilRet = Math.log(macro.oil / prevMacro.oil);
    const global = gaussian(rng);
    const nm = (expiry ? 1.9 : 1) * (v2 && prevKrRet < -0.02 ? 1.4 : 1);
    const krNoise = 3e-4 + nm * (55e-4 * global + 6e-3 * gaussian(rng));
    const usNoise = 4e-4 + nm * (65e-4 * global + 5e-3 * gaussian(rng));
    const sectorRet = {};
    for (const sec of STOCK_SECTORS) {
      const isUS = sec.region === "US";
      const known = sec.beta * (isUS ? usSent : krSent) + sec.rate * (isUS ? dUsRate : dRate + 0.3 * dUsRate) + sec.fx * fxPct / 100 + sec.oil * oilPct / 100 + (sectorShock[sec.id] ?? 0);
      const noise = sec.beta * (isUS ? usNoise : krNoise) + sec.vol * gaussian(rng);
      sectorRet[sec.id] = { s: known, n: noise };
    }
    const rOpenK = {};
    const rDayK = {};
    let krO = 0, krC = 0, krN = 0, usO = 0, usC = 0, usN = 0;
    for (const s of COMPANIES) {
      const sr = sectorRet[s.sector];
      const S = s.sectorBeta * sr.s + (stockShock[s.symbol] ?? 0);
      const N = s.sectorBeta * sr.n + s.drift + s.vol * gaussian(rng);
      const g = range(rng, 0.3, 0.7);
      const rOpen = g * S + 0.3 * N;
      const rDay = (1 - g) * S + 0.7 * N;
      const vol = s.vol + SECTOR_MAP[s.sector].vol;
      if (s.currency === "USD") {
        const prev = lastUsd[s.symbol];
        const lim = (p) => Math.min(prev * 1.5, Math.max(prev * 0.5, p));
        const open = roundUsd(lim(prev * Math.exp(rOpen)));
        const close = roundUsd(lim(open * Math.exp(rDay)));
        const path = intradayPath(rng, open, close, vol, false).map(roundUsd);
        usd[s.symbol].push({ open, close, high: Math.max(...path), low: Math.min(...path), path });
        lastUsd[s.symbol] = close;
        const kPath = path.map((p) => roundPrice(p * macro.fx));
        const kb = { open: kPath[0], close: kPath[kPath.length - 1], high: Math.max(...kPath), low: Math.min(...kPath), path: kPath };
        bars[s.symbol].push(kb);
        const wu = v2 ? CAP_WEIGHT[s.symbol] ?? 1 : 1;
        usO += wu * Math.log(open / prev);
        usC += wu * Math.log(close / prev);
        usN += wu;
      } else {
        const prev = last[s.symbol];
        const lim = (p) => Math.min(prev * LIMIT_UP, Math.max(prev * LIMIT_DOWN, Math.max(s.basePrice * 0.05, p)));
        const open = roundPrice(lim(prev * Math.exp(rOpen)));
        const close = roundPrice(lim(open * Math.exp(rDay)));
        const path = intradayPath(rng, open, close, vol).map((p, i, a) => i === 0 || i === a.length - 1 ? p : roundPrice(lim(p)));
        bars[s.symbol].push({ open, close, high: Math.max(...path), low: Math.min(...path), path });
        const w = v2 ? CAP_WEIGHT[s.symbol] ?? 1 : 1;
        krO += w * Math.log(open / prev);
        krC += w * Math.log(close / prev);
        krN += w;
      }
      const b = bars[s.symbol][day];
      rOpenK[s.symbol] = Math.log(b.open / last[s.symbol]);
      rDayK[s.symbol] = Math.log(b.close / b.open);
      last[s.symbol] = b.close;
    }
    const io = krLevel * Math.exp(krO / krN);
    const ic = krLevel * Math.exp(krC / krN);
    const ip = intradayPath(rng, io, ic, 6e-3, false).map(round2);
    indexBars.push({ open: round2(io), close: round2(ic), high: Math.max(...ip), low: Math.min(...ip), path: ip });
    krLevel = ic;
    const uo = usLevel * Math.exp(usO / usN);
    const uc = usLevel * Math.exp(usC / usN);
    const up = intradayPath(rng, uo, uc, 6e-3, false).map(round2);
    usIndexBars.push({ open: round2(uo), close: round2(uc), high: Math.max(...up), low: Math.min(...up), path: up });
    prevUsRet = Math.log(uc / usLevel);
    prevKrRet = Math.log(ic / (indexBars.length > 1 ? indexBars[indexBars.length - 2].close : KR_INDEX_BASE));
    usLevel = uc;
    for (const e of ETFS) {
      const def = e.etf;
      let ro = 0;
      let rd = 0;
      if (def.track.type === "oil") {
        ro = 0.6 * oilRet;
        rd = 0.4 * oilRet + 4e-3 * gaussian(rng);
      } else if (def.track.type === "fx") {
        ro = fxRet;
        rd = 15e-4 * gaussian(rng);
      } else {
        const members = etfMembers(def);
        ro = members.reduce((a, m) => a + rOpenK[m], 0) / members.length;
        rd = members.reduce((a, m) => a + rDayK[m], 0) / members.length;
      }
      const prev = last[e.symbol];
      const open = roundPrice(Math.max(100, prev * Math.exp(def.lev * ro)));
      const close = roundPrice(Math.max(100, open * Math.exp(def.lev * rd)));
      const path = intradayPath(rng, open, close, 4e-3 * Math.abs(def.lev));
      bars[e.symbol].push({ open, close, high: Math.max(...path), low: Math.min(...path), path });
      last[e.symbol] = close;
    }
  }
  for (const dv of dividends) dv.perShare = Math.max(1, Math.round(bars[dv.symbol][dv.day].close * dv.yieldPct / 100));
  decorateNews(seed, totalDays, news, bars, indexBars);
  return { seed, totalDays, version, base, bars, usd, baseUsd, index: indexBars, usIndex: usIndexBars, macro: macroByDay, macro0, news, events, dividends };
}
function planCalendar(seed, totalDays) {
  const r = mulberry32((seed ^ 1540483477) >>> 0);
  const events = [];
  const dividends = [];
  const taken = /* @__PURE__ */ new Set();
  const free = (lo, hi) => {
    for (let k = 0; k < 40; k++) {
      const d = lo + Math.floor(r() * (hi - lo + 1));
      if (d >= 0 && d < totalDays && !taken.has(d)) {
        taken.add(d);
        return d;
      }
    }
    return -1;
  };
  const add = (day, kind, title, desc) => day >= 0 && events.push({ day, kind, title, desc });
  const last = totalDays - 2;
  add(free(2, last), "fomc", "\u{1F1FA}\u{1F1F8} \uBBF8 \uC5F0\uC900 \uAE08\uB9AC \uACB0\uC815", "\uBBF8\uAD6D \uAE08\uB9AC\uAC00 \uBC14\uB014 \uC218 \uC788\uB294 \uB0A0. \uBBF8\uAD6D \uC8FC\uC2DD\uACFC \uD658\uC728\uC774 \uD06C\uAC8C \uC6C0\uC9C1\uC5EC\uC694.");
  add(free(2, last), "bok", "\u{1F1F0}\u{1F1F7} \uD55C\uAD6D\uC740\uD589 \uAE08\uD1B5\uC704", "\uD55C\uAD6D \uAE30\uC900\uAE08\uB9AC \uACB0\uC815\uC77C. \uC740\uD589\xB7\uAC74\uC124\xB7\uC131\uC7A5\uC8FC\uAC00 \uD06C\uAC8C \uBC18\uC751\uD574\uC694.");
  const windows = totalDays >= 20 ? 2 : 1;
  for (let w = 0; w < windows; w++) {
    const start = free(1 + Math.floor(w * totalDays / windows), Math.min(last - 2, Math.floor((w + 1) * totalDays / windows) - 3));
    if (start < 0) continue;
    for (let k = 0; k < 3; k++) {
      taken.add(start + k);
      add(start + k, "earnings", `\uC2E4\uC801 \uBC1C\uD45C \uC8FC\uAC04 (${k + 1}/3)`, "\uAE30\uC5C5 \uC2E4\uC801 \uB274\uC2A4\uAC00 \uC3DF\uC544\uC9C0\uACE0 \uC8FC\uAC00 \uBCC0\uB3D9\uC774 \uCEE4\uC838\uC694.");
    }
  }
  if (totalDays >= 20) add(free(5, last), "expiry", "\uC635\uC158 \uB9CC\uAE30\uC77C", "\uD3C9\uC18C\uBCF4\uB2E4 \uC8FC\uAC00\uAC00 \uD06C\uAC8C \uCD9C\uB801\uC774\uB294 \uB0A0\uC774\uC5D0\uC694.");
  const divDays = totalDays >= 20 ? 2 : 1;
  for (let k = 0; k < divDays; k++) {
    const day = free(3 + Math.floor(k * totalDays / divDays), Math.min(last, Math.floor((k + 1) * totalDays / divDays)));
    if (day < 0) continue;
    const payers = [...DIVIDEND_PAYERS].sort(() => r() - 0.5).slice(0, 4 + Math.floor(r() * 3));
    for (const symbol of payers) dividends.push({ day, symbol, yieldPct: Math.round((1.5 + r() * 2.5) * 10) / 10, perShare: 0 });
    add(day, "dividend", "\uBC30\uB2F9 \uAE30\uC900\uC77C", "\uC774\uB0A0 \uC7A5 \uB9C8\uAC10 \uB54C \uAC00\uC9C0\uACE0 \uC788\uC73C\uBA74 \uBC30\uB2F9\uAE08\uC744 \uBC1B\uC544\uC694.");
  }
  events.sort((a, b) => a.day - b.day);
  return { events, dividends };
}
function intradayPath(rng, open, close, vol, round = true) {
  const k = INTRADAY_POINTS;
  const lo = Math.log(open);
  const lc = Math.log(close);
  const steps = [0];
  for (let i = 1; i < k; i++) steps.push(steps[i - 1] + gaussian(rng) * vol * 0.35);
  const out = [];
  for (let i = 0; i < k; i++) {
    const t = i / (k - 1);
    const bridge2 = steps[i] - t * steps[k - 1];
    const v = Math.exp(lo + t * (lc - lo) + bridge2);
    out.push(i === 0 ? open : i === k - 1 ? close : round ? roundPrice(v) : v);
  }
  return out;
}
function decorateNews(seed, totalDays, news, bars, indexBars) {
  const rng = mulberry32((seed ^ 1852143475) >>> 0);
  for (const n of news) {
    if (n.rumor) continue;
    if (n.kind === "macro" && !n.headline.startsWith("[") && rng() < 0.35) n.label = "\uC18D\uBCF4";
    else if (n.kind === "company" && rng() < 0.25) n.label = "\uB2E8\uB3C5";
  }
  const extra = [];
  const dayRet = (b, day, base) => b[day].close / (day > 0 ? b[day - 1].close : base) - 1;
  const p1 = (x) => (Math.abs(x) * 100).toFixed(1);
  for (let day = 1; day < totalDays; day++) {
    const y = day - 1;
    let bestSec = null;
    for (const sec of STOCK_SECTORS) {
      const ss = COMPANIES.filter((c) => c.sector === sec.id);
      if (!ss.length) continue;
      const r = ss.reduce((a, c) => a + dayRet(bars[c.symbol], y, bars[c.symbol][0].open), 0) / ss.length;
      if (!bestSec || Math.abs(r) > Math.abs(bestSec.r)) bestSec = { id: sec.id, r };
    }
    if (bestSec && Math.abs(bestSec.r) >= 0.02 && rng() < 0.7) {
      const up = bestSec.r > 0;
      extra.push({
        day,
        kind: "sector",
        symbol: null,
        sector: bestSec.id,
        headline: fill(pick(rng, up ? RECAP_SECTOR_UP : RECAP_SECTOR_DOWN), { sector: SECTOR_MAP[bestSec.id].name, p: p1(bestSec.r) }),
        rumor: false,
        tone: up ? "good" : "bad",
        realTone: up ? "good" : "bad",
        related: relatedForSector(bestSec.id),
        label: "\uC2DC\uD669"
      });
    }
    let mover = null;
    for (const c of COMPANIES) {
      const r = dayRet(bars[c.symbol], y, bars[c.symbol][0].open);
      if (!mover || Math.abs(r) > Math.abs(mover.r)) mover = { s: c, r };
    }
    if (mover && Math.abs(mover.r) >= 0.07) {
      const up = mover.r > 0;
      const limit = Math.abs(mover.r) >= LIMIT_UP - 1 - 5e-3;
      const pool = limit ? up ? RECAP_LIMIT_UP : RECAP_LIMIT_DOWN : up ? RECAP_STOCK_UP : RECAP_STOCK_DOWN;
      extra.push({
        day,
        kind: "company",
        symbol: mover.s.symbol,
        sector: mover.s.sector,
        headline: fill(pick(rng, pool), { name: mover.s.name, p: p1(mover.r) }),
        rumor: false,
        tone: up ? "good" : "bad",
        realTone: up ? "good" : "bad",
        related: relatedForCompany(mover.s),
        label: "\uD2B9\uC9D5\uC8FC"
      });
    }
    const ir = indexBars[y].close / (y > 0 ? indexBars[y - 1].close : KR_INDEX_BASE) - 1;
    if (Math.abs(ir) >= 0.01 && rng() < 0.5) {
      const up = ir > 0;
      extra.push({ day, kind: "macro", symbol: null, sector: null, macro: "kr", headline: fill(pick(rng, up ? RECAP_KR_UP : RECAP_KR_DOWN), { p: p1(ir) }), rumor: false, tone: up ? "good" : "bad", realTone: up ? "good" : "bad", related: MACRO_RELATED.kr, label: "\uC2DC\uD669" });
    }
    if (rng() < 0.35) {
      const s = pick(rng, COMPANIES);
      const good = rng() < 0.5;
      const pool = [...good ? COMPANY_GOOD : COMPANY_BAD, ...(good ? SECTOR_COMPANY_GOOD : SECTOR_COMPANY_BAD)[s.sector] ?? []];
      extra.push({
        day,
        kind: "company",
        symbol: s.symbol,
        sector: s.sector,
        headline: fill(pick(rng, pool), { name: s.name }),
        rumor: false,
        tone: good ? "good" : "bad",
        realTone: good ? "good" : "bad",
        related: relatedForCompany(s),
        label: rng() < 0.25 ? "\uB2E8\uB3C5" : void 0,
        fake: true
      });
    }
  }
  news.push(...extra);
  news.sort((a, b) => a.day - b.day);
  for (let day = 0; day < totalDays; day++) {
    const pool = news.filter((n) => n.day === day && n.kind === "company" && n.label !== "\uC2DC\uD669" && n.label !== "\uD2B9\uC9D5\uC8FC");
    const count = (rng() < 0.55 ? 1 : 0) + (rng() < 0.2 ? 1 : 0);
    for (let i = 0; i < count && pool.length; i++) {
      const n = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      n.at = Math.round(range(rng, 0.2, 0.8) * 1e3) / 1e3;
      n.label = "\uC18D\uBCF4";
    }
  }
}

// src/game/portfolio.ts
var START_CASH = 1e7;
var FEE_RATE = 1e-3;
function buyCost(qty, price, fee = FEE_RATE) {
  return Math.ceil(qty * price * (1 + fee));
}
function sellProceeds(qty, price, fee = FEE_RATE) {
  return Math.floor(qty * price * (1 - fee));
}
function maxBuyQty(cash, price, fee = FEE_RATE) {
  let q = Math.floor(cash / (price * (1 + fee)));
  while (q > 0 && buyCost(q, price, fee) > cash) q--;
  return Math.max(0, q);
}
function computePortfolio(trades, spends = [], upToDay = Infinity, dividends = []) {
  let cash = START_CASH;
  const holdings = {};
  const closed = [];
  let itemSpend = 0;
  let dividendIncome = 0;
  const dividendLog = [];
  for (const s of spends) {
    if (s.day > upToDay) continue;
    cash -= s.cost;
    itemSpend += s.cost;
  }
  const sorted = [...trades].sort((a, b) => a.day - b.day || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const divs = dividends.filter((d) => d.perShare > 0 && d.day <= upToDay).sort((a, b) => a.day - b.day);
  let di = 0;
  const payUntil = (day) => {
    while (di < divs.length && divs[di].day <= day) {
      const d = divs[di++];
      const qty = holdings[d.symbol]?.qty ?? 0;
      if (qty > 0) {
        const amount = qty * d.perShare;
        cash += amount;
        dividendIncome += amount;
        dividendLog.push({ day: d.day, symbol: d.symbol, qty, amount });
      }
    }
  };
  for (const t of sorted) {
    if (t.day > upToDay) break;
    payUntil(t.day - 1);
    const h = holdings[t.symbol] ?? { qty: 0, avgCost: 0 };
    if (t.side === "buy") {
      const cost = buyCost(t.qty, t.price, t.fee);
      cash -= cost;
      h.avgCost = (h.avgCost * h.qty + cost) / (h.qty + t.qty);
      h.qty += t.qty;
    } else {
      const q = Math.min(t.qty, h.qty);
      if (q <= 0) continue;
      const proceeds = sellProceeds(q, t.price, t.fee);
      cash += proceeds;
      const pnl = proceeds - h.avgCost * q;
      closed.push({ symbol: t.symbol, day: t.day, qty: q, pnl, pnlPct: pnl / (h.avgCost * q) });
      h.qty -= q;
      if (h.qty === 0) h.avgCost = 0;
    }
    holdings[t.symbol] = h;
  }
  payUntil(Number.isFinite(upToDay) ? upToDay : Number.MAX_SAFE_INTEGER);
  for (const k of Object.keys(holdings)) if (holdings[k].qty === 0) delete holdings[k];
  return { cash, holdings, closed, itemSpend, dividendIncome, dividendLog };
}
function equityWith(p, prices) {
  let eq = p.cash;
  for (const [sym, h] of Object.entries(p.holdings)) eq += h.qty * prices[sym];
  return eq;
}
function equityHistory(trades, spends, m, upToDay = m.totalDays - 1) {
  const out = [START_CASH];
  for (let d = 0; d <= upToDay; d++) {
    const closes = {};
    for (const s of STOCKS) closes[s.symbol] = m.bars[s.symbol][d].close;
    out.push(equityWith(computePortfolio(trades, spends, d, m.dividends), closes));
  }
  return out;
}

// src/game/achievements.ts
var BADGES = [
  { id: "comeback", emoji: "\u{1F525}", name: "\uB300\uC5ED\uC804\uADF9", desc: "\uC911\uBC18\uAE4C\uC9C0 1\uB4F1\uC774 \uC544\uB2C8\uB2E4\uAC00 \uC5ED\uC804 \uC6B0\uC2B9", rarity: 3 },
  { id: "limit_up", emoji: "\u{1F680}", name: "\uC0C1\uD55C\uAC00 \uC0AC\uB0E5\uAFBC", desc: "\uAC00\uC9C4 \uC885\uBAA9\uC774 \uD558\uB8E8\uC5D0 +29% \uB118\uAC8C(\uC0C1\uD55C\uAC00) \uC624\uB984", rarity: 3 },
  { id: "zen", emoji: "\u{1F422}", name: "\uC874\uBC84\uC758 \uBBF8\uD559", desc: "\uAC70\uB798 5\uD68C \uC774\uD558\uB85C \uC2B9\uB9AC (\uC5F0\uC2B5: \uD50C\uB7EC\uC2A4 \uC218\uC775)", rarity: 3 },
  { id: "crash_winner", emoji: "\u{1F43B}", name: "\uD3ED\uB77D\uC7A5\uC758 \uC2B9\uC790", desc: "\uC9C0\uC218\uAC00 3% \uB118\uAC8C \uBE60\uC9C4 \uB0A0 \uC778\uBC84\uC2A4 ETF\uB97C \uB4E4\uACE0 \uC788\uC5C8\uC74C", rarity: 2 },
  { id: "diamond", emoji: "\u{1F48E}", name: "\uB2E4\uC774\uC544\uBAAC\uB4DC \uD578\uB4DC", desc: "\uD55C \uC885\uBAA9\uC744 7\uC77C \uC774\uC0C1 \uACC4\uC18D \uBCF4\uC720", rarity: 2 },
  { id: "bottom", emoji: "\u{1F3AF}", name: "\uC800\uC810 \uB9E4\uC218\uC758 \uC2E0", desc: "\uADF8 \uC885\uBAA9\uC758 \uAC8C\uC784 \uC911 \uCD5C\uC800\uAC00 3% \uC548\uC5D0\uC11C \uB9E4\uC218", rarity: 2 },
  { id: "big_win", emoji: "\u{1F3B0}", name: "\uD55C \uBC29", desc: "\uD55C \uC885\uBAA9\uC73C\uB85C 100\uB9CC\uC6D0 \uB118\uAC8C \uC218\uC775", rarity: 2 },
  { id: "shield", emoji: "\u{1F6E1}\uFE0F", name: "\uCCA0\uBCBD \uBC29\uC5B4", desc: "\uBC29\uD328\uB85C \uC0C1\uB300\uC758 \uBC29\uD574 \uCE74\uB4DC\uB97C \uB9C9\uC74C", rarity: 2 },
  { id: "winner", emoji: "\u{1F3C6}", name: "\uD22C\uC790\uC655", desc: "\uB300\uACB0\uC5D0\uC11C 1\uB4F1", rarity: 1 },
  { id: "beat_market", emoji: "\u{1F4C8}", name: "\uC2DC\uC7A5\uC744 \uC774\uAE34 \uC790", desc: "\uC885\uD569\uC9C0\uC218\uBCF4\uB2E4 \uB192\uC740 \uC218\uC775\uB960", rarity: 1 },
  { id: "dividend", emoji: "\u{1F4B0}", name: "\uBC30\uB2F9 \uBD80\uC790", desc: "\uBC30\uB2F9\uAE08\uC744 10\uB9CC\uC6D0 \uB118\uAC8C \uBC1B\uC74C", rarity: 1 },
  { id: "global", emoji: "\u{1F30E}", name: "\uAE00\uB85C\uBC8C \uD22C\uC790\uC790", desc: "\uAD6D\uB0B4\xB7\uBBF8\uAD6D \uC8FC\uC2DD\uC744 \uB3D9\uC2DC\uC5D0 \uBCF4\uC720", rarity: 1 },
  { id: "limit_order", emoji: "\u23F3", name: "\uC608\uC57D\uC758 \uB2EC\uC778", desc: "\uC9C0\uC815\uAC00 \uC8FC\uBB38\uC774 3\uBC88 \uC774\uC0C1 \uCCB4\uACB0", rarity: 1 },
  { id: "card_master", emoji: "\u{1F0CF}", name: "\uCE74\uB4DC \uB9C8\uC2A4\uD130", desc: "\uCC2C\uC2A4 \uCE74\uB4DC\uB97C 4\uC7A5 \uC774\uC0C1 \uC0AC\uC6A9", rarity: 1 },
  { id: "trader", emoji: "\u26A1", name: "\uB2E8\uD0C0\uC655", desc: "\uAC70\uB798 20\uD68C \uC774\uC0C1", rarity: 1 }
];
var BADGE_MAP = Object.fromEntries(BADGES.map((b) => [b.id, b]));
function computeAchievements(inp) {
  const { market: m } = inp;
  const last = m.totalDays - 1;
  const solo = inp.players.length < 2;
  const items = deriveItems(inp.seed, inp.players.map((p) => p.id), inp.items, last, m.totalDays, solo);
  const hist = Object.fromEntries(inp.players.map((p) => [p.id, equityHistory(p.trades, p.spends, m)]));
  const finalEq = (id) => hist[id][hist[id].length - 1];
  const indexRet = m.index[last].close / KR_INDEX_BASE - 1;
  const ids = inp.players.map((p) => p.id);
  const byFinal = [...ids].sort((x, y) => finalEq(y) - finalEq(x));
  const winner = !solo && finalEq(byFinal[0]) !== finalEq(byFinal[1]) ? byFinal[0] : null;
  const minPrice = {};
  for (const [sym, bars] of Object.entries(m.bars)) minPrice[sym] = Math.min(...bars.map((b) => Math.min(b.low, b.open, b.close)));
  const out = {};
  for (const p of inp.players) {
    const got = /* @__PURE__ */ new Set();
    const ret = finalEq(p.id) / START_CASH - 1;
    if (winner === p.id) got.add("winner");
    if (ret > indexRet) got.add("beat_market");
    if (p.trades.length >= 20) got.add("trader");
    if (p.filledOrders >= 3) got.add("limit_order");
    if (solo && ret > 0 && p.trades.length <= 5 && p.trades.length > 0 || winner === p.id && p.trades.length <= 5) got.add("zen");
    if (!solo && winner === p.id) {
      const mid = Math.floor(m.totalDays / 2);
      if (ids.some((x) => x !== p.id && hist[x][mid] > hist[p.id][mid])) got.add("comeback");
    }
    const used = Object.values(items.players[p.id]?.used ?? {}).reduce((a, n) => a + (n ?? 0), 0);
    if (used >= 4) got.add("card_master");
    if (items.effects.some((e) => e.to === p.id && e.blocked)) got.add("shield");
    if (p.trades.some((t) => t.side === "buy" && t.price <= minPrice[t.symbol] * 1.03)) got.add("bottom");
    const pfEnd = computePortfolio(p.trades, p.spends, Infinity, m.dividends);
    if (pfEnd.dividendIncome >= 1e5) got.add("dividend");
    const bigClosed = pfEnd.closed.some((c) => c.pnl >= 1e6);
    const bigOpen = Object.entries(pfEnd.holdings).some(([s, h]) => h.qty * (m.bars[s][last].close - h.avgCost) >= 1e6);
    if (bigClosed || bigOpen) got.add("big_win");
    const streak = {};
    for (let d = 0; d <= last; d++) {
      const hold = computePortfolio(p.trades, p.spends, d).holdings;
      const syms = Object.keys(hold);
      for (const s of Object.keys(streak)) if (!hold[s]) streak[s] = 0;
      for (const s of syms) {
        streak[s] = (streak[s] ?? 0) + 1;
        if (streak[s] >= 7) got.add("diamond");
        const prev = d === 0 ? m.base[s] : m.bars[s][d - 1].close;
        if (!STOCK_MAP[s].etf && m.bars[s][d].close / prev - 1 >= 0.29) got.add("limit_up");
      }
      const idxPrev = d === 0 ? KR_INDEX_BASE : m.index[d - 1].close;
      if (hold.KINV && m.index[d].close / idxPrev - 1 <= -0.03) got.add("crash_winner");
      const hasUS = syms.some((s) => STOCK_MAP[s].currency === "USD");
      const hasKR = syms.some((s) => STOCK_MAP[s].currency === "KRW" && !STOCK_MAP[s].etf);
      if (hasUS && hasKR) got.add("global");
    }
    out[p.id] = BADGES.filter((b) => got.has(b.id)).map((b) => b.id);
  }
  return out;
}

// src/game/intraday.ts
var TICK_MS = 5e3;
function ticksPerDay(turnSeconds) {
  return Math.max(1, Math.round(turnSeconds * 1e3 / TICK_MS));
}
function releaseTick(at, n) {
  return Math.min(n, Math.max(1, Math.ceil(at * n)));
}
function hash2(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function warp(f, at) {
  if (at === null) return f;
  return f < at ? 0.15 * f / at : 0.15 + 0.85 * (f - at) / (1 - at);
}
var cache = /* @__PURE__ */ new Map();
function cached(key, make) {
  const hit = cache.get(key);
  if (hit) return hit;
  const v = make();
  if (cache.size > 8e3) cache.clear();
  cache.set(key, v);
  return v;
}
function bridge(seedKey, n, amp) {
  const rng = mulberry32(hash2(seedKey));
  const w = [0];
  for (let j = 1; j <= n; j++) w.push(w[j - 1] + gaussian(rng));
  const scale = amp / Math.sqrt(n);
  return w.map((v, j) => (v - j / n * w[n]) * scale);
}
function marketFlow(m, region, day, n) {
  return cached(`mf:${m.seed}:${m.totalDays}:${region}:${day}:${n}`, () => {
    const kr = bridge(`${m.seed}:mf:KR:${day}:${n}`, n, 0.01);
    if (region === "KR") return kr;
    const us = bridge(`${m.seed}:mf:US:${day}:${n}`, n, 0.01);
    return us.map((v, j) => 0.85 * v + 0.3 * kr[j]);
  });
}
function sectorFlow(m, sector, day, n) {
  return cached(`sf:${m.seed}:${m.totalDays}:${sector}:${day}:${n}`, () => bridge(`${m.seed}:sf:${sector}:${day}:${n}`, n, 9e-3));
}
function dayTicks(m, symbol, day, n, cur = "krw") {
  return cached(`${m.seed}:${m.totalDays}:${m.version ?? 1}:${symbol}:${day}:${n}:${cur}`, () => {
    const def = STOCK_MAP[symbol];
    const bar = (cur === "usd" ? m.usd[symbol] : m.bars[symbol])?.[day];
    if (!bar || !def) throw new Error("no bar");
    const round = cur === "usd" ? roundUsd : def.etf ? (v) => Math.max(5, Math.round(v / 5) * 5) : roundPrice;
    if (def.etf && (def.etf.track.type === "basket" || def.etf.track.type === "index")) {
      const members = etfMembers(def.etf);
      const mt = members.map((sym) => dayTicks(m, sym, day, n));
      const out = [];
      for (let j = 0; j <= n; j++) {
        if (j === 0) out.push(bar.open);
        else if (j === n) out.push(bar.close);
        else {
          const r = mt.reduce((a, t) => a + Math.log(t[j] / t[0]), 0) / mt.length;
          out.push(round(Math.max(100, bar.open * Math.exp(def.etf.lev * r))));
        }
      }
      return out;
    }
    const sec = SECTOR_MAP[def.sector];
    const flow = def.etf || !sec ? null : {
      mk: marketFlow(m, sec.region === "US" ? "US" : "KR", day, n),
      sf: sectorFlow(m, def.sector, day, n),
      beta: sec.beta * def.sectorBeta,
      sb: def.sectorBeta
    };
    return fineTicks(bar, n, mulberry32(hash2(`${m.seed}:${symbol}:${day}:${n}`)), releaseOf(m, symbol, day), round, flow);
  });
}
function indexTicks(m, which, day, n) {
  return cached(`idx:${m.seed}:${m.totalDays}:${m.version ?? 1}:${which}:${day}:${n}`, () => {
    const bars = which === "kr" ? m.index : m.usIndex;
    const bar = bars[day];
    const prevLevel = day === 0 ? which === "kr" ? KR_INDEX_BASE : US_INDEX_BASE : bars[day - 1].close;
    const v2 = (m.version ?? 1) >= 2;
    const comps = COMPANIES.filter((c) => which === "kr" ? c.currency === "KRW" : c.currency === "USD");
    const series = comps.map((c) => {
      const cur = which === "us" ? "usd" : "krw";
      const src = which === "us" ? m.usd[c.symbol] : m.bars[c.symbol];
      const prev = day === 0 ? which === "us" ? m.baseUsd[c.symbol] : m.base[c.symbol] : src[day - 1].close;
      return { t: dayTicks(m, c.symbol, day, n, cur), prev, w: v2 ? CAP_WEIGHT[c.symbol] ?? 1 : 1 };
    });
    const W = series.reduce((a, s) => a + s.w, 0);
    const out = [];
    for (let j = 0; j <= n; j++) {
      if (j === 0) out.push(bar.open);
      else if (j === n) out.push(bar.close);
      else out.push(Math.round(prevLevel * Math.exp(series.reduce((a, s) => a + s.w * Math.log(s.t[j] / s.prev), 0) / W) * 100) / 100);
    }
    return out;
  });
}
function releaseOf(m, symbol, day) {
  let at = null;
  for (const n of m.news) if (n.day === day && n.symbol === symbol && n.at != null && !n.fake && (at === null || n.at < at)) at = n.at;
  return at;
}
function fineTicks(bar, n, rng, at, round, flow) {
  const lo = Math.log(bar.open);
  const lc = Math.log(bar.close);
  const w = [0];
  for (let j = 1; j <= n; j++) w.push(w[j - 1] + gaussian(rng));
  const idioAmp = Math.log(bar.high / bar.low) * (flow ? 0.35 : 0.6) / Math.sqrt(n);
  const trend = [];
  const dev = [];
  for (let j = 0; j <= n; j++) {
    trend.push(lo + warp(j / n, at) * (lc - lo));
    const common = flow ? flow.beta * flow.mk[j] + flow.sb * flow.sf[j] : 0;
    dev.push(common + (w[j] - j / n * w[n]) * idioAmp);
  }
  const hi = Math.log(bar.high);
  const lw = Math.log(bar.low);
  let scale = 1;
  for (let j = 1; j < n; j++) {
    if (dev[j] > 0 && trend[j] + dev[j] > hi) scale = Math.min(scale, Math.max(0, (hi - trend[j]) / dev[j]));
    if (dev[j] < 0 && trend[j] + dev[j] < lw) scale = Math.min(scale, Math.max(0, (lw - trend[j]) / dev[j]));
  }
  const out = [];
  for (let j = 0; j <= n; j++) {
    if (j === 0) out.push(bar.open);
    else if (j === n) out.push(bar.close);
    else out.push(Math.min(bar.high, Math.max(bar.low, round(Math.exp(trend[j] + scale * dev[j])))));
  }
  return out;
}

// src/engine/engine.ts
function dayClock(r, now) {
  const n = ticksPerDay(r.turn_seconds > 0 ? r.turn_seconds : 180);
  const base = r.day_deadline ?? r.deadline;
  if (base == null) return { n, tick: 0, startAt: now, endAt: now + n * TICK_MS };
  const startAt = base - n * TICK_MS;
  const tick = Math.min(n, Math.max(0, Math.floor((now - startAt) / TICK_MS)));
  return { n, tick, startAt, endAt: base };
}
function livePrice(d, m, symbol, now, cur = "krw") {
  const { n, tick } = dayClock(d.room, now);
  return dayTicks(m, symbol, d.room.day, n, cur)[tick];
}
function livePriceMap(d, m, now) {
  const out = {};
  for (const s of STOCKS) out[s.symbol] = livePrice(d, m, s.symbol, now);
  return out;
}
var GameError = class extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
};
function josa(word, a, b) {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 44032;
  const batchim = code >= 0 && code < 11172 && code % 28 !== 0;
  return word + (batchim ? a : b);
}
var MAX_QTY = 1e6;
function cleanSymbol(v) {
  if (typeof v === "string" && STOCK_MAP[v]) return v;
  throw new GameError("\uC5C6\uB294 \uC885\uBAA9\uC774\uC5D0\uC694.");
}
function cleanKind(v) {
  if (typeof v === "string" && ITEMS.some((i) => i.kind === v)) return v;
  throw new GameError("\uC5C6\uB294 \uCE74\uB4DC\uC608\uC694.");
}
var marketCache = /* @__PURE__ */ new Map();
var CURRENT_RULES_VERSION = 2;
function marketFor(seed, days, version = 1) {
  const key = `${seed}:${days}:${version}`;
  let m = marketCache.get(key);
  if (!m) {
    m = generateMarket(seed, days, version);
    marketCache.set(key, m);
    if (marketCache.size > 50) marketCache.delete(marketCache.keys().next().value);
  }
  return m;
}
function priceMap(m, day, closed) {
  const out = {};
  for (const s of STOCKS) {
    const b = m.bars[s.symbol][Math.min(day, m.totalDays - 1)];
    out[s.symbol] = closed ? b.close : b.open;
  }
  return out;
}
function fakeNews(e, i) {
  const sym = e.payload?.symbol && STOCK_MAP[e.payload.symbol] && !STOCK_MAP[e.payload.symbol].etf ? e.payload.symbol : COMPANIES[0].symbol;
  const tone = e.payload?.tone === "bad" ? "bad" : "good";
  const pool = tone === "good" ? COMPANY_GOOD : COMPANY_BAD;
  const s = STOCK_MAP[sym];
  return {
    day: e.days[0],
    kind: "company",
    symbol: sym,
    sector: s.sector,
    headline: pool[(e.usedDay + i) % pool.length].replace("{name}", s.name),
    rumor: false,
    tone,
    realTone: tone,
    related: relatedForCompany(s),
    fake: true
  };
}
function isFakeNews(n) {
  return !!n.fake || n.rumor && n.tone !== n.realTone;
}
function publicNews(n, today, rumorCheck) {
  const { fake: _f, verdict: _v, ...rest } = n;
  const fake = isFakeNews(n);
  if (n.day >= today) return rumorCheck && n.day === today ? { ...rest, realTone: rest.tone, verdict: fake ? "false" : "true" } : { ...rest, realTone: rest.tone };
  return fake || n.rumor ? { ...rest, verdict: fake ? "false" : "true" } : rest;
}
function newsOrder(a, b) {
  return a.day - b.day || hash(a.headline) - hash(b.headline);
}
function sliceMarket(m, day, finished, opts) {
  const strip = (b) => ({ open: b.open, close: b.close, high: b.high, low: b.low, path: [] });
  if (finished) {
    return {
      ...m,
      bars: Object.fromEntries(Object.entries(m.bars).map(([k, v]) => [k, v.map(strip)])),
      usd: Object.fromEntries(Object.entries(m.usd).map(([k, v]) => [k, v.map(strip)])),
      index: m.index.map(strip),
      usIndex: m.usIndex.map(strip),
      seed: 0,
      news: m.news.map((n) => publicNews(n, Infinity, false)).sort(newsOrder)
    };
  }
  const dividends = m.dividends.map((d) => d.day < day ? d : { ...d, perShare: 0 });
  const cut = (arr) => {
    const o = arr[day].open;
    return [...arr.slice(0, day).map(strip), { open: o, close: o, high: o, low: o, path: [] }];
  };
  const released = (n) => n.day < day || n.at == null || (opts.tick ?? 0) >= releaseTick(n.at, opts.n ?? 1);
  const news = [...m.news.filter((n) => n.day <= day), ...opts.fakes].filter(released).filter((n) => !(opts.blackout && n.day === day)).map((n) => publicNews(n, day, opts.rumorCheck)).sort(newsOrder);
  return {
    seed: 0,
    totalDays: m.totalDays,
    base: m.base,
    baseUsd: m.baseUsd,
    bars: Object.fromEntries(Object.entries(m.bars).map(([k, v]) => [k, cut(v)])),
    usd: Object.fromEntries(Object.entries(m.usd).map(([k, v]) => [k, cut(v)])),
    index: cut(m.index),
    usIndex: cut(m.usIndex),
    macro: m.macro.slice(0, day + 1),
    macro0: m.macro0,
    news,
    events: m.events,
    dividends
  };
}
function paidDividends(d) {
  const m = marketFor(d.room.seed, d.room.total_days, d.room.version ?? 1);
  const finished = d.room.status === "finished" || d.room.day >= d.room.total_days;
  return finished ? m.dividends : m.dividends.filter((x) => x.day < d.room.day);
}
function sortedPlayers(d) {
  return [...d.players].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
function itemsOf(d) {
  const day = Math.min(d.room.day, d.room.total_days - 1);
  return deriveItems(d.room.seed, sortedPlayers(d).map((p) => p.id), d.items, day, d.room.total_days, d.players.length < 2);
}
function spendsOf(d, pid) {
  return spendsFromRows(d.items.filter((r) => r.player_id === pid));
}
function portfolioOf(d, pid) {
  return computePortfolio(
    d.trades.filter((t) => t.player_id === pid),
    spendsOf(d, pid),
    Infinity,
    paidDividends(d)
  );
}
function buildView(d, meId, now, clientMarketKey) {
  const r = d.room;
  const players = sortedPlayers(d);
  const base = {
    room: { id: r.id, code: r.code, status: r.status, day: r.day, totalDays: r.total_days, turnSeconds: r.turn_seconds, deadline: r.deadline, countdown: isCountdown(r), hostId: r.host_id, title: r.title ?? "\uC8FC\uC2DD \uB300\uACB0", maxPlayers: r.max_players ?? 2, isPrivate: !!r.is_private },
    serverNow: now,
    meId,
    players: players.map((p) => ({ id: p.id, nickname: p.nickname, mode: p.mode, ready: p.ready, endedDay: p.ended_day, equity: START_CASH, tradeCount: 0 })),
    market: null,
    live: null,
    marketKey: "waiting",
    myTrades: [],
    myOrders: [],
    myItemRows: [],
    myItems: { inventory: {}, used: {}, infoUses: [], grants: [], total: 0 },
    effectsToday: [],
    notices: [],
    reveals: { tomorrow: null, bestSector: null, rumorCheck: false, spy: null, scout: null, blackout: false },
    final: null
  };
  if (r.status === "waiting") return base;
  const finished = r.status === "finished" || r.day >= r.total_days;
  const day = Math.min(r.day, r.total_days - 1);
  const m = marketFor(r.seed, r.total_days, r.version ?? 1);
  const open = r.status === "playing" && !finished;
  const clock = dayClock(r, now);
  const prices = open ? livePriceMap(d, m, now) : priceMap(m, day, finished);
  const items = itemsOf(d);
  const mine = items.players[meId] ?? base.myItems;
  base.players = players.map((p) => {
    const pf = portfolioOf(d, p.id);
    return { ...base.players.find((x) => x.id === p.id), equity: Math.round(equityWith(pf, prices)), tradeCount: d.trades.filter((t) => t.player_id === p.id).length };
  });
  base.myTrades = d.trades.filter((t) => t.player_id === meId);
  base.myOrders = d.orders.filter((o) => o.player_id === meId);
  base.myItemRows = d.items.filter((r2) => r2.player_id === meId);
  base.myItems = mine;
  base.effectsToday = finished ? [] : activeEffects(items, meId, r.day).map((e) => e.kind);
  const nick = (id) => players.find((p) => p.id === id)?.nickname ?? "\uC0C1\uB300";
  items.effects.forEach((e, i) => {
    const key = `${e.from}-${e.kind}-${e.usedDay}-${i}`;
    const name = `${ITEM_MAP[e.kind].emoji} ${ITEM_MAP[e.kind].name}`;
    if (e.reflected) {
      if (e.by === meId) base.notices.push({ key, text: `\uBC18\uC0AC \uAC70\uC6B8\uC774 ${nick(e.from)}\uC758 ${josa(name, "\uC744", "\uB97C")} \uB418\uB3CC\uB824 \uBCF4\uB0C8\uC5B4\uC694!`, kind: "ok" });
      else if (e.from === meId) base.notices.push({ key, text: `${nick(e.by ?? "")}\uC758 \uBC18\uC0AC \uAC70\uC6B8\uC5D0 \uD295\uACA8\uC11C \uB0B4 ${josa(name, "\uC774", "\uAC00")} \uB098\uC5D0\uAC8C \uB3CC\uC544\uC654\uC5B4\uC694!`, kind: "warn" });
      return;
    }
    if (e.to === meId) {
      if (e.blocked) base.notices.push({ key, text: `\uBC29\uD328\uAC00 ${nick(e.from)}\uC758 ${josa(name, "\uC744", "\uB97C")} \uB9C9\uC558\uC5B4\uC694!`, kind: "ok" });
      else if (e.kind !== "fake") base.notices.push({ key, text: `${josa(nick(e.from), "\uC774", "\uAC00")} \uB098\uC5D0\uAC8C ${name} \uCE74\uB4DC\uB97C \uC37C\uC5B4\uC694! \uB2E4\uC74C \uB0A0\uBD80\uD130 \uC801\uC6A9\uB3FC\uC694`, kind: "warn" });
    } else if (e.from === meId && e.blocked) base.notices.push({ key, text: `${nick(e.to)}\uC758 \uBC29\uD328\uC5D0 ${josa(name, "\uC774", "\uAC00")} \uB9C9\uD614\uC5B4\uC694`, kind: "warn" });
  });
  const todayInfo = finished ? [] : mine.infoUses.filter((u) => u.day === r.day).map((u) => u.kind);
  const rumorCheck = todayInfo.includes("detector");
  if (!finished) {
    if (todayInfo.includes("paper") && r.day + 1 < r.total_days) {
      base.reveals.tomorrow = m.news.filter((n) => n.day === r.day + 1).map((n) => publicNews(n, r.day + 1, false)).sort(newsOrder);
    }
    if (todayInfo.includes("analyst")) {
      let best = STOCK_SECTORS[0].id;
      let bestR = -Infinity;
      for (const sec of STOCK_SECTORS) {
        const ss = COMPANIES.filter((s) => s.sector === sec.id);
        const avg = ss.reduce((a, s) => a + m.bars[s.symbol][r.day].close / m.bars[s.symbol][r.day].open - 1, 0) / ss.length;
        if (avg > bestR) {
          bestR = avg;
          best = sec.id;
        }
      }
      base.reveals.bestSector = best;
    }
    if (todayInfo.includes("scout")) {
      const use = [...mine.infoUses].reverse().find((u) => u.kind === "scout" && u.day === r.day);
      const sym = use?.symbol && m.bars[use.symbol] ? use.symbol : null;
      if (sym) {
        const b = m.bars[sym][r.day];
        const truth = b.close >= b.open;
        const rng = mulberry32((r.seed ^ hash(sym)) + r.day * 131);
        base.reveals.scout = { symbol: sym, up: rng() < SCOUT_ACCURACY ? truth : !truth };
      }
    }
    if (todayInfo.includes("spy")) {
      const spyUse = [...mine.infoUses].reverse().find((u) => u.kind === "spy" && u.day === r.day);
      const opp = players.find((p) => p.id === spyUse?.target && p.id !== meId) ?? players.find((p) => p.id !== meId);
      if (opp) {
        const pf = portfolioOf(d, opp.id);
        base.reveals.spy = { nickname: opp.nickname, cash: pf.cash, holdings: pf.holdings };
      }
    }
  }
  base.reveals.rumorCheck = rumorCheck;
  const fakes = finished ? [] : items.effects.filter((e) => e.to === meId && !e.blocked && e.kind === "fake" && e.days[0] <= r.day).map(fakeNews);
  const blackout = !finished && base.effectsToday.includes("blackout");
  base.reveals.blackout = blackout;
  const releasedNow = open ? m.news.filter((x) => x.day === day && x.at != null && clock.tick >= releaseTick(x.at, clock.n)).length : 0;
  const marketKey = `${r.status}:${r.day}:${rumorCheck ? 1 : 0}:${fakes.length}:${blackout ? 1 : 0}:${releasedNow}`;
  base.marketKey = marketKey;
  if (clientMarketKey !== marketKey) base.market = sliceMarket(m, day, finished, { rumorCheck, fakes, blackout, tick: open ? clock.tick : 0, n: clock.n });
  if (open) {
    const upto = (arr) => arr.slice(0, clock.tick + 1);
    const krw = {};
    const usd = {};
    for (const s of STOCKS) {
      krw[s.symbol] = upto(dayTicks(m, s.symbol, day, clock.n));
      if (m.usd[s.symbol]) usd[s.symbol] = upto(dayTicks(m, s.symbol, day, clock.n, "usd"));
    }
    base.live = { day, tick: clock.tick, n: clock.n, startAt: clock.startAt, endAt: clock.endAt, tickMs: TICK_MS, krw, usd, index: upto(indexTicks(m, "kr", day, clock.n)), usIndex: upto(indexTicks(m, "us", day, clock.n)) };
  }
  if (finished) {
    base.final = { seed: r.seed, trades: d.trades, items: d.items, players: players.map((p) => ({ id: p.id, nickname: p.nickname })), badges: finalResults(d).badges };
  }
  return base;
}
function requirePlaying(d, meId, now) {
  const r = d.room;
  if (r.status !== "playing" || r.day >= r.total_days) throw new GameError("\uC9C0\uAE08\uC740 \uAC8C\uC784 \uC911\uC774 \uC544\uB2C8\uC5D0\uC694.", 409);
  const me = d.players.find((p) => p.id === meId);
  if (!me) throw new GameError("\uC774 \uBC29\uC758 \uD50C\uB808\uC774\uC5B4\uAC00 \uC544\uB2C8\uC5D0\uC694.", 403);
  if (me.ended_day >= r.day) throw new GameError("\uC624\uB298\uC740 \uC774\uBBF8 \uC7A5 \uB9C8\uAC10\uC744 \uB20C\uB800\uC5B4\uC694.", 409);
  if (r.deadline !== null && now >= r.deadline) throw new GameError("\uC624\uB298 \uC2DC\uAC04\uC774 \uB2E4 \uB410\uC5B4\uC694.", 409);
  return me;
}
function validateTrade(d, meId, now, input) {
  requirePlaying(d, meId, now);
  const symbol = cleanSymbol(input.symbol);
  const side = input.side === "buy" || input.side === "sell" ? input.side : null;
  if (!side) throw new GameError("\uC0AC\uAE30/\uD314\uAE30\uB97C \uACE8\uB77C \uC8FC\uC138\uC694.");
  const qty = input.qty;
  if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new GameError("\uC218\uB7C9\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  const items = itemsOf(d);
  const fx = activeEffects(items, meId, d.room.day);
  if (fx.some((e) => e.kind === "freeze")) throw new GameError("\uAC70\uB798 \uC815\uC9C0 \uCE74\uB4DC \uB54C\uBB38\uC5D0 \uC624\uB298\uC740 \uAC70\uB798\uD560 \uC218 \uC5C6\uC5B4\uC694.", 409);
  const fee = fx.some((e) => e.kind === "fee") ? FEE_BOMB_RATE : FEE_RATE;
  const m = marketFor(d.room.seed, d.room.total_days, d.room.version ?? 1);
  const price = livePrice(d, m, symbol, now);
  const pf = portfolioOf(d, meId);
  if (side === "buy" && buyCost(qty, price, fee) > pf.cash) throw new GameError("\uD604\uAE08\uC774 \uBD80\uC871\uD574\uC694.");
  if (side === "sell" && (pf.holdings[symbol]?.qty ?? 0) < qty) throw new GameError("\uAC00\uC9C4 \uC218\uB7C9\uC774 \uBD80\uC871\uD574\uC694.");
  return { player_id: meId, day: d.room.day, symbol, side, qty, price, fee };
}
function validateBuyItem(d, meId, now, input) {
  requirePlaying(d, meId, now);
  const kind = cleanKind(input.kind);
  const solo = d.players.length < 2;
  if (solo && ITEM_MAP[kind].multiOnly) throw new GameError("\uC774 \uCE74\uB4DC\uB294 \uB458\uC774\uC11C \uD560 \uB54C\uB9CC \uC4F8 \uC218 \uC788\uC5B4\uC694.");
  const mine = itemsOf(d).players[meId];
  const why = canBuy(mine, kind, portfolioOf(d, meId).cash);
  if (why) throw new GameError(why);
  return { player_id: meId, day: d.room.day, kind, action: "buy", cost: ITEM_MAP[kind].cost, payload: null };
}
function validateUseItem(d, meId, now, input) {
  requirePlaying(d, meId, now);
  const kind = cleanKind(input.kind);
  const solo = d.players.length < 2;
  if (solo && ITEM_MAP[kind].multiOnly) throw new GameError("\uC774 \uCE74\uB4DC\uB294 \uB458\uC774\uC11C \uD560 \uB54C\uB9CC \uC4F8 \uC218 \uC788\uC5B4\uC694.");
  const mine = itemsOf(d).players[meId];
  const usedToday2 = d.items.some((r) => r.player_id === meId && r.action === "use" && r.kind === kind && r.day === d.room.day);
  const why = canUse(mine, kind, d.room.day, d.room.total_days, usedToday2);
  if (why) throw new GameError(why);
  let payload = null;
  if (ITEM_MAP[kind].type === "attack" || kind === "spy") {
    const others = d.players.filter((p) => p.id !== meId);
    const t = input.payload?.target;
    const target = typeof t === "string" ? others.find((p) => p.id === t) : others.length === 1 ? others[0] : void 0;
    if (!target) throw new GameError("\uCE74\uB4DC\uB97C \uC4F8 \uC0C1\uB300\uB97C \uACE8\uB77C \uC8FC\uC138\uC694.");
    payload = { target: target.id };
  }
  if (kind === "scout") {
    const p = input.payload ?? {};
    payload = { symbol: cleanSymbol(p.symbol) };
  }
  if (kind === "fake") {
    const p = input.payload ?? {};
    const symbol = cleanSymbol(p.symbol);
    if (STOCK_MAP[symbol].etf) throw new GameError("\uAC00\uC9DC \uB274\uC2A4\uB294 \uD68C\uC0AC\uC5D0\uB9CC \uC4F8 \uC218 \uC788\uC5B4\uC694.");
    if (p.tone !== "good" && p.tone !== "bad") throw new GameError("\uD638\uC7AC/\uC545\uC7AC\uB97C \uACE8\uB77C \uC8FC\uC138\uC694.");
    payload = { ...payload, symbol, tone: p.tone };
  }
  return { player_id: meId, day: d.room.day, kind, action: "use", cost: 0, payload };
}
function isCountdown(r) {
  return r.deadline !== null && r.day_deadline != null && r.deadline < r.day_deadline;
}
function nextRoomState(d, now) {
  const r = d.room;
  if (r.status !== "playing") return null;
  const allEnded = d.players.length > 0 && d.players.every((p) => p.ended_day >= r.day);
  const timeUp = r.deadline !== null && now >= r.deadline;
  if (!allEnded && !timeUp) return null;
  const day = r.day + 1;
  const status = day >= r.total_days ? "finished" : "playing";
  const deadline = status === "playing" && r.turn_seconds > 0 ? now + (r.turn_seconds + 4) * 1e3 : null;
  return { day, status, deadline, day_deadline: deadline };
}
function finalResults(d) {
  const m = marketFor(d.room.seed, d.room.total_days, d.room.version ?? 1);
  const prices = priceMap(m, d.room.total_days - 1, true);
  const players = sortedPlayers(d);
  const badges = computeAchievements({
    market: m,
    seed: d.room.seed,
    items: d.items,
    players: players.map((p) => ({
      id: p.id,
      trades: d.trades.filter((t) => t.player_id === p.id),
      spends: spendsOf(d, p.id),
      filledOrders: d.orders.filter((o) => o.player_id === p.id && o.status === "filled").length
    }))
  });
  const results = players.map((p) => {
    const equity = Math.round(equityWith(portfolioOf(d, p.id), prices));
    return { nickname: p.nickname, equity, ret: equity / START_CASH - 1, badges: badges[p.id] ?? [] };
  });
  const ranked = [...results].sort((a, b) => b.equity - a.equity);
  const winner = ranked.length >= 2 && ranked[0].equity !== ranked[1].equity ? ranked[0].nickname : null;
  return { results: ranked, winner, badges };
}

// sim/harness.ts
var TURN_SECONDS = 180;
var N_TICKS = ticksPerDay(TURN_SECONDS);
var CHECKPOINTS = [0, 6, 12, 18, 24, 30, N_TICKS - 1];
var BASE_T = 18e11;
function playGame(seed, days, bots, opts = {}) {
  const ids = bots.map((_, i) => `p${i}`);
  const startAt = (day) => BASE_T + day * 1e9;
  const deadline = (day) => startAt(day) + N_TICKS * TICK_MS;
  const d = {
    room: { id: "sim", code: "SIM000", seed, status: "playing", total_days: days, turn_seconds: TURN_SECONDS, day: 0, deadline: deadline(0), day_deadline: deadline(0), host_id: ids[0], version: CURRENT_RULES_VERSION, max_players: bots.length },
    players: ids.map((id, i) => ({ id, room_id: "sim", nickname: id, mode: "pro", ready: true, ended_day: -1, created_at: String(i), version: 0 })),
    trades: [],
    items: [],
    orders: []
  };
  const full = marketFor(seed, days, CURRENT_RULES_VERSION);
  const markets = {};
  const keys = {};
  const rngs = ids.map((id, i) => mulberry32(seed * 31 + i * 7919 >>> 0));
  const eqByDay = [];
  let seq = 0;
  for (let day = 0; day < days; day++) {
    d.room.deadline = deadline(day);
    d.room.day_deadline = deadline(day);
    const order = ids.map((_, i) => i);
    const orng = mulberry32((seed ^ day * 2654435761) >>> 0);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(orng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const tick of CHECKPOINTS) {
      seq = 0;
      for (const pi of order) {
        const me = ids[pi];
        let now = startAt(day) + tick * TICK_MS + 1;
        const getView = () => {
          const v = buildView(d, me, now, keys[me]);
          if (v.market) markets[me] = v.market;
          keys[me] = v.marketKey;
          return v;
        };
        const stamp = () => new Date(now + seq++ % 4e3).toISOString();
        const ctx = {
          me,
          day,
          tick,
          n: N_TICKS,
          totalDays: days,
          nPlayers: ids.length,
          view: getView(),
          market: markets[me],
          rng: rngs[pi],
          isLast: tick === CHECKPOINTS[CHECKPOINTS.length - 1],
          cash: () => portfolioOf(d, me).cash,
          holdings: () => portfolioOf(d, me).holdings,
          price: (sym) => {
            const arr = ctx.view.live.krw[sym];
            return arr[arr.length - 1];
          },
          feeRate: () => ctx.view.effectsToday.includes("fee") ? 0.01 : FEE_RATE,
          trade: (symbol, side, qty) => {
            if (qty < 1) return false;
            try {
              d.trades.push({ ...validateTrade(d, me, now, { symbol, side, qty }), created_at: stamp() });
              return true;
            } catch (e) {
              if (e instanceof GameError) return false;
              throw e;
            }
          },
          buyCash: (sym, krw) => {
            const q = maxBuyQty(Math.min(krw, ctx.cash()), ctx.price(sym), ctx.feeRate());
            return ctx.trade(sym, "buy", q);
          },
          sellAll: (sym) => {
            const h = ctx.holdings();
            for (const [s, x] of Object.entries(h)) if (!sym || s === sym) ctx.trade(s, "sell", x.qty);
          },
          buyCard: (kind) => {
            try {
              d.items.push({ ...validateBuyItem(d, me, now, { kind }), created_at: stamp() });
              return true;
            } catch (e) {
              if (e instanceof GameError) return false;
              throw e;
            }
          },
          useCard: (kind, payload) => {
            try {
              d.items.push({ ...validateUseItem(d, me, now, { kind, payload }), created_at: stamp() });
              return true;
            } catch (e) {
              if (e instanceof GameError) return false;
              throw e;
            }
          },
          refresh: () => {
            now += 1;
            ctx.view = getView();
            ctx.market = markets[me];
          },
          others: () => ctx.view.players.filter((p) => p.id !== me).map((p) => ({ id: p.id, equity: p.equity })).sort((a, b) => b.equity - a.equity)
        };
        bots[pi].act(ctx);
      }
    }
    const closes = {};
    for (const s of STOCKS) closes[s.symbol] = full.bars[s.symbol][day].close;
    eqByDay.push(ids.map((id) => equityWith(portfolioOf(d, id), closes)));
    for (const p of d.players) p.ended_day = day;
    const next = nextRoomState(d, deadline(day) + 1);
    if (!next) throw new Error("day did not advance");
    d.room = { ...d.room, ...next };
  }
  const fin = finalResults(d);
  const final = {};
  for (const r of fin.results) final[r.nickname] = r.equity;
  const best = Math.max(...Object.values(final));
  const winners = ids.filter((id) => final[id] === best);
  const winShare = {};
  for (const id of ids) winShare[id] = winners.includes(id) ? 1 / winners.length : 0;
  const st = deriveItems(seed, ids, d.items, days - 1, days, ids.length < 2);
  void opts;
  return {
    seed,
    days,
    ids,
    bots: bots.map((b) => b.name),
    final,
    eqByDay,
    effects: st.effects,
    buys: d.items.filter((r) => r.action === "buy").map((r) => ({ pid: r.player_id, kind: r.kind, day: r.day, cost: r.cost })),
    uses: d.items.filter((r) => r.action === "use").map((r) => ({ pid: r.player_id, kind: r.kind, day: r.day })),
    winShare
  };
}

// sim/bots.ts
var has = (c, k) => (c.view.myItems.inventory[k] ?? 0) > 0;
var usedToday = (c, k) => c.view.myItemRows.some((r) => r.action === "use" && r.kind === k && r.day === c.day);
function useBonus(c) {
  if (c.tick === 0 && has(c, "bonus")) c.useCard("bonus");
}
var cashBot = () => ({ name: "cash", act: (c) => useBonus(c) });
var holdBot = (sym = "KIDX", name = "hold") => ({
  name,
  act: (c) => {
    useBonus(c);
    if (c.tick === 0 && c.cash() > 2e5) c.buyCash(sym, c.cash());
  }
});
var randomBot = () => ({
  name: "random",
  act: (c) => {
    useBonus(c);
    if (c.tick !== 0 && c.tick !== 18) return;
    const h = Object.keys(c.holdings());
    if (h.length && c.rng() < 0.5) c.sellAll(h[Math.floor(c.rng() * h.length)]);
    if (c.rng() < 0.6) c.buyCash(STOCKS[Math.floor(c.rng() * STOCKS.length)].symbol, c.cash() * 0.35);
  }
});
function scoreNews(news, o) {
  const s = {};
  const add = (k, v) => s[k] = (s[k] ?? 0) + v;
  for (const n of news) {
    if (o.verdict && n.verdict === "false") continue;
    if (o.skipRecap && (n.label === "\uC2DC\uD669" || n.label === "\uD2B9\uC9D5\uC8FC")) continue;
    const w = n.rumor && !(o.verdict && n.verdict === "true") ? o.rumorW : 1;
    const dir = (n.tone === "good" ? 1 : -1) * w;
    if (n.kind === "company" && n.symbol && !STOCK_MAP[n.symbol].etf) {
      add(n.symbol, dir);
      for (const p of COMPANIES) if (p.sector === n.sector && p.symbol !== n.symbol) add(p.symbol, 0.25 * dir);
    } else if (n.kind === "sector" && n.sector) {
      for (const p of COMPANIES) if (p.sector === n.sector) add(p.symbol, 0.6 * dir);
    } else if (n.kind === "macro" && (n.macro === "kr" || n.macro === "us")) {
      add("KIDX", (n.macro === "kr" ? 0.6 : 0.4) * dir);
    }
  }
  return s;
}
var ATTACKS = ["freeze", "blackout", "fake", "fee"];
function newsBot(o) {
  const opt = {
    news: { verdict: true, skipRecap: false, rumorW: 1 },
    threshold: 0.9,
    maxPicks: 3,
    useInfo: false,
    buyInfo: [],
    attack: [],
    useFreeAttacks: false,
    buyDefense: [],
    feeAware: true,
    reserve: 2e6,
    ...o
  };
  let overnight = /* @__PURE__ */ new Set();
  let analystSector = null;
  let scoutBan = /* @__PURE__ */ new Set();
  const pickTarget = (c, how) => {
    const o2 = c.others();
    if (!o2.length) return void 0;
    if (!how || how === "leader") return o2[0].id;
    if (how === "last") return o2[o2.length - 1].id;
    return how;
  };
  const tryUse = (c, kind, target) => {
    if (!has(c, kind) || usedToday(c, kind)) return false;
    const def = ITEM_MAP[kind];
    let payload;
    if (def.type === "attack" || kind === "spy") payload = { target };
    if (kind === "fake") {
      const co = COMPANIES[Math.floor(c.rng() * COMPANIES.length)];
      payload = { target, symbol: co.symbol, tone: "good" };
    }
    if (kind === "scout") {
      const sc = scores(c);
      const top = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
      if (!top || top[1] < opt.threshold) return false;
      payload = { symbol: top[0] };
    }
    const ok = c.useCard(kind, payload);
    if (ok) c.refresh();
    return ok;
  };
  function scores(c) {
    const today = c.market.news.filter((n) => n.day === c.day);
    const s = scoreNews(today, opt.news);
    if (analystSector) {
      for (const p of COMPANIES) if (p.sector === analystSector) s[p.symbol] = (s[p.symbol] ?? 0) + 1;
    }
    for (const b of scoutBan) s[b] = -1;
    return s;
  }
  return {
    name: opt.name,
    act(c) {
      useBonus(c);
      const lastDay = c.day >= c.totalDays - 1;
      if (c.tick === 0) {
        analystSector = null;
        scoutBan = /* @__PURE__ */ new Set();
        if (opt.plan && opt.plan.days.includes(c.day)) {
          if (!has(c, opt.plan.kind)) c.buyCard(opt.plan.kind);
          tryUse(c, opt.plan.kind, pickTarget(c, opt.plan.target));
        }
        for (const k of opt.buyDefense) if (!has(c, k) && c.cash() > opt.reserve + ITEM_MAP[k].cost) c.buyCard(k);
        if (!lastDay && c.nPlayers > 1) {
          const target = pickTarget(c, "leader");
          const usable = opt.useFreeAttacks || opt.attack.length ? ATTACKS : [];
          let used = false;
          for (const k of usable) if (!used && has(c, k)) used = tryUse(c, k, target);
          if (!used)
            for (const k of opt.attack) {
              if (c.cash() < opt.reserve + ITEM_MAP[k].cost) continue;
              if (c.buyCard(k)) {
                tryUse(c, k, target);
                break;
              }
            }
        }
        if (opt.useInfo) {
          const todays = c.market.news.filter((n) => n.day === c.day);
          const companyN = todays.filter((n) => n.kind === "company").length;
          for (const k of opt.buyInfo) {
            if (has(c, k)) continue;
            if (k === "detector" && companyN < 2) continue;
            if (k === "paper" && lastDay) continue;
            if (c.cash() < ITEM_MAP[k].cost + 1e6) continue;
            c.buyCard(k);
          }
          if (has(c, "detector") && companyN >= 2) tryUse(c, "detector");
          if (has(c, "analyst")) {
            tryUse(c, "analyst");
          }
          if (has(c, "paper") && !lastDay && c.day < c.totalDays - 1) tryUse(c, "paper");
          if (has(c, "scout")) {
            if (tryUse(c, "scout")) {
              const r = c.view.reveals.scout;
              if (r && !r.up) scoutBan.add(r.symbol);
            }
          }
        }
        if (c.view.reveals.bestSector) analystSector = c.view.reveals.bestSector;
      }
      if (c.view.effectsToday.includes("freeze")) return;
      const fee = c.feeRate();
      const thr = opt.feeAware && fee > 2e-3 ? opt.threshold * 2.2 : opt.threshold;
      const s = scores(c);
      const h = c.holdings();
      for (const [sym, x] of Object.entries(h)) if ((s[sym] ?? 0) < 0) c.trade(sym, "sell", x.qty);
      if (!c.isLast) {
        const picks = Object.entries(s).filter(([sym, v]) => v >= thr && STOCK_MAP[sym] && !h[sym]).sort((a, b) => b[1] - a[1]).slice(0, Math.max(0, opt.maxPicks - Object.keys(c.holdings()).length));
        if (picks.length) {
          const per = c.cash() * 0.98 / picks.length;
          for (const [sym] of picks) c.buyCash(sym, per);
        }
        return;
      }
      const tmr = c.view.reveals.tomorrow;
      overnight = /* @__PURE__ */ new Set();
      if (tmr && !lastDay) {
        const ts = scoreNews(tmr, { ...opt.news, verdict: false });
        const picks = Object.entries(ts).filter(([, v]) => v >= opt.threshold).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
        for (const [sym, x] of Object.entries(c.holdings())) if (!picks.includes(sym)) c.trade(sym, "sell", x.qty);
        const held = c.holdings();
        const need = picks.filter((p) => !held[p]);
        for (const p of need) c.buyCash(p, c.cash() * 0.98 / need.length);
        overnight = new Set(picks);
        return;
      }
      c.sellAll();
    }
  };
}
var ARCHETYPES = {
  cash: cashBot,
  hold: () => holdBot("KIDX", "hold"),
  lev: () => holdBot("KLEV", "lev"),
  random: randomBot,
  news: () => newsBot({ name: "news", news: { verdict: false, skipRecap: false, rumorW: 1 } }),
  smart: () => newsBot({ name: "smart", news: { verdict: true, skipRecap: true, rumorW: 0.4 }, useInfo: true, buyInfo: ["detector", "paper", "analyst"] }),
  aggro: () => newsBot({ name: "aggro", news: { verdict: true, skipRecap: true, rumorW: 0.4 }, useInfo: true, attack: ["fee", "freeze", "blackout", "fake"], useFreeAttacks: true })
};

// sim/smoke.ts
var t0 = Date.now();
var names = Object.keys(ARCHETYPES);
for (let s = 1; s <= 3; s++) {
  const g = playGame(1e3 + s, 20, names.map((n) => ARCHETYPES[n]()));
  console.log(s, names.map((n, i) => `${n}:${(g.final[`p${i}`] / 1e6).toFixed(2)}`).join(" "), "buys", g.buys.map((b) => `${g.bots[+b.pid.slice(1)]}:${b.kind}`).join(","));
  console.log("  effects", g.effects.map((e) => `${e.kind} ${e.from}->${e.to}${e.blocked ? " blocked" : ""}${e.reflected ? " refl" : ""}`).join("; "));
}
console.log("ms/game", (Date.now() - t0) / 3);
