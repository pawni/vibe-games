import {
  WIDTH, HEIGHT, AIM, SCENES, BONUS, UPGRADES, clamp, createRound,
  simulate, aimAt, applyChanges, volleyStats, enemyAim,
} from "./engine.mjs";
import { render, repaintTerrain } from "./art.mjs";

const $ = selector => document.querySelector(selector);
const field = $("#field");
const angleControl = $("#angle");
const powerControl = $("#power");
const fire = $("#fire");
const status = $("#status");
const turn = $("#turn");
const result = $("#result");
const guide = $("#guide");
const soundButton = $("#sound");
const STORAGE = "ridgebreak-campaign-v1";
const initialProgress = () => ({ round: 1, upgrades: { foundation: 0, volley: 0, keep: 0 }, victory: false, complete: false });
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let progress = initialProgress();
let soundEnabled = false;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE));
  if (saved?.round >= 1 && saved.round <= SCENES.length && UPGRADES.every(upgrade =>
    Number.isInteger(saved.upgrades?.[upgrade.key]) && saved.upgrades[upgrade.key] >= 0 && saved.upgrades[upgrade.key] <= SCENES.length)) {
    progress = saved;
  }
  soundEnabled = localStorage.getItem("ridgebreak-sound") === "true";
} catch {}
soundButton.setAttribute("aria-pressed", soundEnabled);

let world;
let phase = "player";
let angle = 35;
let power = 76;
let enemyAngle = 34;
let turnNumber = 0;
let preview;
let animation;
let active;
let nextTurnAt = 0;
let particles = [];
let labels = [];
let aimDrag;
let audio;
let latestSound = 0;

function tone(kind) {
  if (!soundEnabled || !audio || audio.state !== "running") return;
  const now = audio.currentTime;
  if (kind === "rock" && now - latestSound < .09) return;
  latestSound = now;
  const sounds = { fire: [198,68,.22,.15], castle: [110,43,.22,.16], rock: [95,56,.1,.05], bonus: [330,660,.21,.13], win: [360,540,.45,.14] };
  const [start,end,duration,volume] = sounds[kind];
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = kind === "bonus" || kind === "win" ? "sine" : "triangle";
  oscillator.frequency.setValueAtTime(start,now);
  oscillator.frequency.exponentialRampToValueAtTime(end,now+duration);
  gain.gain.setValueAtTime(volume,now);
  gain.gain.exponentialRampToValueAtTime(.001,now+duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now+duration);
}
function resumeAudio() {
  if (!soundEnabled) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  audio ??= new Audio();
  if (audio.state === "suspended") audio.resume().catch(() => {});
}
function persist() {
  try { localStorage.setItem(STORAGE, JSON.stringify(progress)); } catch {}
}
function refreshHud() {
  for (const [side, name] of [[0,"player"],[1,"enemy"]]) {
    const health = $(`#${name}-health`);
    const pieces = world.castles[side];
    const total = pieces.reduce((sum, piece) => sum+piece.max,0);
    const percent = pieces.reduce((sum, piece) => sum+piece.health,0)/total*100;
    health.setAttribute("aria-valuenow", Math.ceil(percent));
    [...health.children].forEach((bar, i) => {
      bar.style.setProperty("--life", `${clamp((percent-i*25)*4,0,100)}%`);
    });
  }
  for (const bonus of world.bonuses) $(`#legend-${bonus.kind} .used`).hidden = !bonus.used;
}
function setPhase(next, message) {
  phase = next;
  fire.disabled = phase !== "player";
  angleControl.disabled = fire.disabled;
  powerControl.disabled = fire.disabled;
  const text = { player: "YOUR TURN", firing: "VOLLEY AWAY", enemy: "ENEMY TURN", won: "VICTORY", lost: "DEFEAT" };
  turn.lastChild.textContent = " " + text[phase];
  turn.classList.toggle("enemy", phase === "enemy" || phase === "lost");
  status.textContent = message;
}
function updateAim(newAngle, newPower) {
  angle = clamp(Math.round(newAngle), ...AIM.angle);
  power = clamp(Math.round(newPower), ...AIM.power);
  angleControl.value = angle;
  powerControl.value = power;
  $("#angle-label").textContent = `${angle}°`;
  $("#power-label").textContent = `${power}%`;
  angleControl.style.setProperty("--fill", `${(angle-AIM.angle[0])/(AIM.angle[1]-AIM.angle[0])*100}%`);
  powerControl.style.setProperty("--fill", `${(power-AIM.power[0])/(AIM.power[1]-AIM.power[0])*100}%`);
  const stats = volleyStats(world.round, 0, progress.upgrades);
  preview = simulate(world,0,angle,power,1,stats.impact).traces[0].trail;
}
function loadRound() {
  world = createRound(progress.round, progress.upgrades);
  turnNumber = 0;
  enemyAngle = 34;
  active = animation = undefined;
  nextTurnAt = 0;
  particles = [];
  labels = [];
  const scene = SCENES[progress.round-1];
  $("#arena").textContent = scene.name;
  $("#enemy-name").textContent = scene.enemy;
  $("#round").textContent = String(progress.round).padStart(2,"0");
  repaintTerrain(world);
  refreshHud();
  setPhase("player", "Aim for a cache or carve a path through the ridge.");
  updateAim(35,76);
  if (progress.victory || progress.complete) restoreVictory();
}
function burst(x,y,color,amount,clock) {
  if (reducedMotion.matches) return;
  for (let i=0;i<amount;i++) particles.push({
    x,y,color,time:clock,r:1+Math.random()*3,duration:260+Math.random()*360,
    vx:(Math.random()-.5)*145,vy:-25-Math.random()*125,
  });
}
function animateChanges(point,clock) {
  if (!point.changes.length) return;
  applyChanges(world,point.changes);
  let terrain = false;
  let hud = false;
  let hitCastle = false;
  for (const change of point.changes) {
    if (change.type === "terrain") terrain = true;
    if (change.type === "bonus") {
      const bonus = world.bonuses[change.index];
      const info = BONUS[bonus.kind];
      status.textContent = `${info.name} activated.`;
      tone("bonus");
      burst(bonus.x,bonus.y,info.color,28,clock);
      labels.push({ x:bonus.x,y:bonus.y-12,text:info.name,color:info.color,time:clock,duration:850 });
      hud = true;
    }
    if (change.type === "castle") {
      const piece = world.castles[change.side].find(item => item.id === change.id);
      const color = change.side ? "#f2a58e" : "#a9cce7";
      burst(piece.x+piece.w/2, piece.y+piece.h*.45,color,change.health ? 7 : 22,clock);
      labels.push({ x:piece.x+piece.w/2,y:piece.y+6,text:change.health ? `−${change.damage}` : "COLLAPSED",color,time:clock,duration:760 });
      hud = true;
      hitCastle = true;
    }
  }
  if (terrain) {
    repaintTerrain(world);
    if (!hitCastle) {
      tone("rock");
      burst(point.x,point.y,"#a6a7b4",2,clock);
    }
  }
  if (hitCastle) tone("castle");
  if (hud) refreshHud();
}
function beginVolley(side, a, p, clock) {
  const stats = volleyStats(world.round,side,progress.upgrades);
  const outcome = simulate(world,side,a,p,stats.count,stats.impact);
  animation = { outcome, side, shot:0, point:-1, time:clock };
  setPhase(side ? "enemy" : "firing", side ? `${SCENES[world.round-1].enemy} returns fire.` : "Your volley is in flight.");
  tone("fire");
  burst(side ? 932 : 268,350,side ? "#ffa387" : "#ffe4a9",13,clock);
}
function resolveVolley(side, outcome, clock) {
  active = undefined;
  animation = undefined;
  if (outcome.destroyed) {
    setPhase(side ? "lost" : "won", side ? "Ironwatch has fallen." : "The enemy castle has fallen.");
    if (!side) {
      progress.victory = true;
      persist();
      tone("win");
    }
    showResult(!side);
    return;
  }
  const reports = [];
  if (outcome.groundDamage) reports.push("ridge damaged");
  if (outcome.castleDamage) reports.push(`${outcome.castleDamage} castle damage`);
  const summary = reports.length ? `Volley resolved · ${reports.join(" · ")}.` : "The volley missed.";
  if (!side) {
    setPhase("enemy", summary);
    nextTurnAt = clock+460;
    return;
  }
  updateAim(angle,power);
  setPhase("player", summary);
}
function animateVolley(clock) {
  const { outcome, side, shot, time } = animation;
  if (clock < time) return;
  const trace = outcome.traces[shot];
  const interval = reducedMotion.matches ? .35 : 3.6;
  const point = Math.min(trace.trail.length-1,Math.floor((clock-time)/interval));
  while (animation.point < point) animateChanges(trace.trail[++animation.point],clock);
  if (point >= 0) active = { trail:trace.trail, point, heavy:trace.heavy, side };
  if (point < trace.trail.length-1) return;
  if (shot === outcome.traces.length-1) {
    resolveVolley(side,outcome,clock);
    return;
  }
  animation.shot++;
  animation.point = -1;
  animation.time = clock + (reducedMotion.matches ? 0 : 45);
}
function frame(clock) {
  if (animation) animateVolley(clock);
  if (nextTurnAt && clock >= nextTurnAt) {
    nextTurnAt = 0;
    const stats = volleyStats(world.round,1,progress.upgrades);
    const aim = enemyAim(world,stats,++turnNumber);
    enemyAngle = aim.angle;
    beginVolley(1,aim.angle,aim.power,clock);
  }
  particles = particles.filter(item => clock-item.time < item.duration);
  labels = labels.filter(item => clock-item.time < item.duration);
  render(world,clock,phase === "player" ? preview : null,active,particles,labels,angle,enemyAngle);
  requestAnimationFrame(frame);
}
function showResult(won) {
  if (guide.open) guide.close();
  $("#result-kicker").textContent = won ? (progress.complete ? "CAMPAIGN COMPLETE" : "BATTLE WON") : "BATTLE LOST";
  $("#result-title").textContent = won ? (progress.complete ? "The ridge is yours" : "Castle destroyed") : "Ironwatch has fallen";
  $("#result-text").textContent = won
    ? (progress.complete ? "You brought down all six strongholds." : "Choose one permanent upgrade for Ironwatch.")
    : "Retry with a fully repaired castle and all your earned upgrades.";
  const retry = $("#retry");
  retry.hidden = won && !progress.complete;
  retry.textContent = progress.complete ? "New campaign" : "Retry round";
  const options = $("#upgrade-options");
  options.replaceChildren();
  if (won && !progress.complete) for (const upgrade of UPGRADES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "upgrade";
    const name = document.createElement("strong");
    name.textContent = upgrade.name;
    const description = document.createElement("span");
    description.textContent = upgrade.effect;
    button.append(name,description);
    button.onclick = () => {
      progress.upgrades[upgrade.key]++;
      progress.victory = false;
      if (progress.round === SCENES.length) {
        progress.complete = true;
        persist();
        showResult(true);
        return;
      }
      progress.round++;
      persist();
      result.close();
      loadRound();
      fire.focus();
    };
    options.append(button);
  }
  if (!result.open) result.showModal();
  if (retry.hidden) options.firstElementChild?.focus();
  else retry.focus();
}
function restoreVictory() {
  for (const piece of world.castles[1]) piece.health = 0;
  refreshHud();
  setPhase("won","The enemy castle has fallen.");
  showResult(true);
}
function playerFire() {
  if (phase !== "player" || guide.open || result.open) return;
  aimDrag = undefined;
  resumeAudio();
  beginVolley(0,angle,power,performance.now());
}
function fieldPoint(event) {
  const bounds = field.getBoundingClientRect();
  return { x:(event.clientX-bounds.left)*WIDTH/bounds.width, y:(event.clientY-bounds.top)*HEIGHT/bounds.height };
}
field.addEventListener("pointerdown", event => {
  if (phase !== "player" || !event.isPrimary || event.button !== 0) return;
  aimDrag = { id:event.pointerId, x:event.clientX, y:event.clientY, angle, power, moved:false };
  field.setPointerCapture(event.pointerId);
});
field.addEventListener("pointermove", event => {
  if (aimDrag?.id !== event.pointerId) return;
  const deltaX = event.clientX-aimDrag.x;
  const deltaY = event.clientY-aimDrag.y;
  if (Math.hypot(deltaX,deltaY)>5) aimDrag.moved = true;
  if (aimDrag.moved) updateAim(aimDrag.angle-deltaY*.2,aimDrag.power+deltaX*.2);
});
field.addEventListener("pointerup", event => {
  if (aimDrag?.id !== event.pointerId) return;
  if (aimDrag.moved) {
    playerFire();
  } else {
    const { x, y } = fieldPoint(event);
    const bonus = world.bonuses.find(item => !item.used && Math.hypot(x-item.x,y-item.y)<29);
    const aim = aimAt(bonus?.x ?? x,bonus?.y ?? y,angle,power);
    updateAim(aim.angle,aim.power);
  }
  aimDrag = undefined;
});
field.addEventListener("pointercancel", () => { aimDrag = undefined; });
angleControl.addEventListener("input", () => updateAim(Number(angleControl.value),power));
powerControl.addEventListener("input", () => updateAim(angle,Number(powerControl.value)));
fire.addEventListener("click",playerFire);
document.addEventListener("keydown", event => {
  if (event.code !== "Space" || event.repeat || event.target.closest("button, input, a, dialog") || phase !== "player") return;
  event.preventDefault();
  playerFire();
});
$("#help").onclick = () => guide.showModal();
$("#close-guide").onclick = $("#guide-done").onclick = () => guide.close();
soundButton.onclick = () => {
  soundEnabled = !soundEnabled;
  soundButton.setAttribute("aria-pressed",soundEnabled);
  try { localStorage.setItem("ridgebreak-sound",String(soundEnabled)); } catch {}
  resumeAudio();
};
result.addEventListener("cancel",event => event.preventDefault());
$("#retry").onclick = () => {
  if (progress.complete) {
    progress = initialProgress();
    persist();
  }
  result.close();
  loadRound();
  fire.focus();
};
loadRound();
requestAnimationFrame(frame);
