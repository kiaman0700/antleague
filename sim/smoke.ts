import { playGame } from './harness.js';
import { ARCHETYPES } from './bots.js';

const t0 = Date.now();
const names = Object.keys(ARCHETYPES);
for (let s = 1; s <= 3; s++) {
  const g = playGame(1000 + s, 20, names.map((n) => ARCHETYPES[n]()));
  console.log(s, names.map((n, i) => `${n}:${(g.final[`p${i}`] / 1e6).toFixed(2)}`).join(' '), 'buys', g.buys.map((b) => `${g.bots[+b.pid.slice(1)]}:${b.kind}`).join(','));
  console.log('  effects', g.effects.map((e) => `${e.kind} ${e.from}->${e.to}${e.blocked ? ' blocked' : ''}${e.reflected ? ' refl' : ''}`).join('; '));
}
console.log('ms/game', (Date.now() - t0) / 3);
