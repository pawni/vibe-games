export const WIDTH = 1200;
export const HEIGHT = 440;
export const GROUND = 394;
export const CELL = 10;
export const COLS = 120;
export const ROWS = 40;
export const AIM = { angle: [15, 56], power: [48, 100] };
export const SCENES = [
  { name: "Moonfall Pass", enemy: "Ashenhold" },
  { name: "Ember Crest", enemy: "Cinderwatch" },
  { name: "Hollow Ridge", enemy: "Dusk Bastion" },
  { name: "Crown Divide", enemy: "Obsidian Keep" },
  { name: "Frostmark", enemy: "Winterhold" },
  { name: "Kingsfall", enemy: "The Last Crown" },
];
export const BONUS = {
  blast: { symbol: "✦", color: "#ffae72", name: "Blast Cache" },
  stone: { symbol: "◆", color: "#a5e2fb", name: "Stone Pocket" },
  gate: { symbol: "×2", color: "#dbbaff", name: "Multiplier Gate" },
};
export const UPGRADES = [
  { key: "foundation", name: "Reinforced Foundations", effect: "+25 durability for each tower foundation." },
  { key: "volley", name: "Split Volley", effect: "+1 projectile in every volley." },
  { key: "keep", name: "Deeper Keep", effect: "+40 durability for your keep." },
];
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const points = [[332,394],[372,377],[415,335],[444,288],[483,257],[520,230],[559,199],[592,181],[622,188],[650,212],[680,216],[712,249],[748,278],[777,333],[814,364],[863,394]];
export function ridgeTop(x, round) {
  const i = points.findIndex(point => point[0] > x);
  if (i < 1) return GROUND;
  const [left, right] = [points[i-1], points[i]];
  const amount = (x - left[0]) / (right[0] - left[0]);
  const variation = Math.sin((x - 330) / 535 * Math.PI) * Math.sin(x / 63 + round) * Math.min(31, 6 * (round - 1));
  return left[1] + amount * (right[1] - left[1]) + variation;
}
function castle(side, round, upgrades) {
  const enemy = side === 1;
  const difficulty = enemy ? round - 1 : 0;
  const stagger = enemy && round >= 3 ? 11 + (round % 3) * 3 : 0;
  const base = [
    ["rear", 79, 330, 43, 64, 37, "base"],
    ["rear-top", 79, 264 - stagger, 43, 66 + stagger, 30, "tower", "rear"],
    ["keep", 124, 288 + stagger, 63, 106 - stagger, 64, "keep"],
    ["wall", 188, 350, 37, 44, 34, "wall"],
    ["front", 225, 344, 40, 50, 37, "base"],
    ["front-top", 225, 291 + stagger, 40, 53 - stagger, 27, "tower", "front"],
  ];
  return base.map(([id, localX, y, w, h, baseHealth, kind, support]) => {
    const baseBonus = kind === "base" && (!enemy || round < 4) ? upgrades.foundation * 25 : 0;
    const keepBonus = kind === "keep" ? upgrades.keep * 40 : 0;
    const max = baseHealth + baseBonus + keepBonus + difficulty * (kind === "keep" ? 11 : 5);
    return { id, x: enemy ? WIDTH-localX-w : localX, y, w, h, max, health: max, kind, support: difficulty >= 3 ? undefined : support };
  });
}
export function createRound(round, upgrades) {
  const terrain = new Uint8Array(COLS * ROWS);
  for (let col = 0; col < COLS; col++) {
    const x = (col + .5) * CELL;
    const top = ridgeTop(x, round);
    for (let row = 0; row < ROWS; row++) {
      const y = (row + .5) * CELL;
      if (y < top || y > GROUND) continue;
      terrain[row * COLS + col] = clamp(2 + Math.floor((y-top)/60) + (round >= 3 ? 1 : 0) + ((row + col * 2) % 4 === 0 ? 1 : 0), 2, 8);
    }
  }
  const jitter = round === 1 ? 0 : Math.round(Math.sin(round * 1.8) * 24);
  return {
    round, terrain,
    castles: [castle(0, round, upgrades), castle(1, round, { foundation: 0, keep: 0 })],
    bonuses: [
      { kind: "stone", x: 490 + jitter, y: 272 - jitter * .3 },
      { kind: "gate", x: 601 + jitter, y: 213 - jitter * .35 },
      { kind: "blast", x: 707 - jitter, y: 273 + jitter * .35 },
    ].map(bonus => ({ ...bonus, used: false })),
  };
}
export function trajectory(side, angle, power, step, spread = 0) {
  const t = step / 680;
  return {
    x: side === 0 ? 268 + step : 932 - step,
    y: 350 - (220 + angle * 8.4) * t + (293 + (100 - power) * 8.3) * t * t + spread * Math.min(1, t * 2.6),
  };
}
export function aimAt(x, y, angle, power) {
  const step = clamp(x - 268, 74, 856);
  let best = Infinity;
  let answer = { angle, power };
  for (let a = AIM.angle[0]; a <= AIM.angle[1]; a++) {
    for (let p = AIM.power[0]; p <= AIM.power[1]; p++) {
      const distance = Math.abs(trajectory(0, a, p, step).y - y);
      const score = distance + .12 * Math.abs(a - angle) + .14 * Math.abs(p - power);
      if (score >= best) continue;
      best = score;
      answer = { angle: a, power: p };
    }
  }
  return answer;
}
export function simulate(world, side, angle, power, count, impact) {
  const terrain = world.terrain.slice();
  const bonuses = world.bonuses.map(item => ({ ...item }));
  const targets = world.castles[1-side].map(piece => ({ ...piece }));
  const traces = [];
  let groundDamage = 0;
  let castleDamage = 0;
  let gateOpen = false;
  const queue = Array.from({ length: count }, (_, i) => ({
    start: 0, spread: (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 7, impact, heavy: false,
  }));
  for (let index = 0; index < queue.length; index++) {
    const shot = queue[index];
    const trail = [];
    traces.push({ trail, heavy: shot.heavy });
    let strength = shot.impact;
    let multiplied = false;
    let visited = -1;
    for (let step = shot.start; step < 900 && strength > 0; step += 4) {
      const { x, y } = trajectory(side, angle, power, step, shot.spread);
      if (x < 0 || x >= WIDTH || y >= GROUND || y < -200) break;
      const changes = [];
      trail.push({ x, y, changes });
      for (let b = 0; b < bonuses.length; b++) {
        const bonus = bonuses[b];
        if (Math.hypot(x - bonus.x, y - bonus.y) > 20) continue;
        if (bonus.kind === "gate" && (!bonus.used || gateOpen) && !multiplied) {
          strength *= 2;
          multiplied = true;
          if (!gateOpen) changes.push({ type: "bonus", index: b });
          gateOpen = true;
          bonus.used = true;
          continue;
        }
        if (bonus.used) continue;
        bonus.used = true;
        changes.push({ type: "bonus", index: b });
        if (bonus.kind === "stone") {
          queue.splice(index + 1, 0, ...[-9, 7].map(offset => ({
            start: step, spread: shot.spread + offset, impact: Math.max(43, impact + 14), heavy: true,
          })));
        }
        if (bonus.kind === "blast") {
          const radius = 61;
          for (let row = Math.max(0, Math.floor((bonus.y-radius)/CELL)); row < Math.min(ROWS, (bonus.y+radius)/CELL); row++) {
            for (let col = Math.floor((bonus.x-radius)/CELL); col < (bonus.x+radius)/CELL; col++) {
              const cell = row * COLS + col;
              if (!terrain[cell] || Math.hypot((col + .5)*CELL-bonus.x, (row + .5)*CELL-bonus.y) > radius) continue;
              groundDamage += terrain[cell];
              terrain[cell] = 0;
              changes.push({ type: "terrain", cell, health: 0 });
            }
          }
        }
      }
      if (y >= 0) {
        const col = Math.floor(x / CELL);
        const row = Math.floor(y / CELL);
        const cell = row * COLS + col;
        if (cell !== visited && terrain[cell]) {
          const absorbed = Math.min(strength, terrain[cell]);
          strength -= absorbed;
          terrain[cell] -= absorbed;
          groundDamage += absorbed;
          changes.push({ type: "terrain", cell, health: terrain[cell] });
        }
        visited = cell;
      }
      if (!strength) continue;
      const piece = targets.find(item => item.health && x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h);
      if (!piece) continue;
      const dealt = Math.min(strength, piece.health);
      strength -= dealt;
      castleDamage += dealt;
      piece.health -= dealt;
      changes.push({ type: "castle", side: 1-side, id: piece.id, health: piece.health, damage: dealt });
      if (piece.health) continue;
      for (const supported of targets.filter(item => item.health && item.support === piece.id)) {
        castleDamage += supported.health;
        changes.push({ type: "castle", side: 1-side, id: supported.id, health: 0, damage: supported.health });
        supported.health = 0;
      }
    }
  }
  return { traces, groundDamage, castleDamage, destroyed: targets.every(piece => !piece.health) };
}
export function applyChanges(world, changes) {
  for (const event of changes) {
    if (event.type === "terrain") world.terrain[event.cell] = event.health;
    if (event.type === "bonus") world.bonuses[event.index].used = true;
    if (event.type === "castle") world.castles[event.side].find(piece => piece.id === event.id).health = event.health;
  }
}
export function volleyStats(round, side, upgrades) {
  return side === 0
    ? { count: 3 + upgrades.volley, impact: 43 }
    : { count: 2 + Math.floor((round - 1) / 2), impact: 23 + round * 2 };
}
export function enemyAim(world, stats, turn) {
  const options = [];
  const increment = world.round < 3 ? 5 : 3;
  for (let angle = 17; angle <= 56; angle += increment) {
    for (let power = 50; power <= 100; power += increment) {
      const result = simulate(world, 1, angle, power, stats.count, stats.impact);
      const claimed = result.traces.reduce((sum, shot) => sum + shot.trail.reduce((total, point) =>
        total + point.changes.filter(event => event.type === "bonus").length, 0), 0);
      const score = result.castleDamage * (world.round < 3 ? 2 : 3) + result.groundDamage * .38 + claimed * 13;
      options.push({ angle, power, score });
    }
  }
  options.sort((a, b) => b.score - a.score);
  const variation = world.round === 1 ? 9 : world.round === 2 ? 5 : 3;
  return options[(turn * 7 + world.round) % variation];
}
