(() => {
  const E = BriarEngine;
  const $ = id => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const dialog = $('dialog');
  const overlay = $('units');
  let run = E.create();
  let selectedId = run.units[0].id;
  let speed = 1;
  let paused = false;
  let drag;
  let previewSlot;
  let skipClick = false;
  let snapshots = {};
  let controlsSnapshot = '';
  let announcementTimer;
  let accumulator = 0;
  let previous = performance.now();
  const nodes = new Map();
  const pads = new Map();

  const number = n => String(n).padStart(2,'0');
  const format = n => n % 1 === 0 ? String(n) : n.toFixed(1);
  const selection = () => run.units.find(unit => unit.id === selectedId);
  const selectable = unit => unit.state !== 'destroyed';
  const fightOver = () => run.phase === 'lost';
  const waiting = unit => run.offers.some(offer => offer.unitId === unit?.id);
  const canMerge = (a,b) => !fightOver() && E.compatible(a,b) && !waiting(a) && !waiting(b);
  const placementUnit = () => {
    const unit = drag?.moved ? drag.unit : selection();
    return !fightOver() && unit?.state === 'active' ? unit : null;
  };

  function say(message) {
    $('announcement').textContent = message;
    clearTimeout(announcementTimer);
    announcementTimer = setTimeout(() => { $('announcement').textContent = ''; }, 5400);
  }

  function info(unit) {
    if (!unit) return '<div class="tower-card"><p>Select a guardian on the battlefield to see its stats.</p></div>';
    const type = E.TYPES[unit.type];
    const trapped = unit.state === 'caged';
    const stats = E.stats(unit);
    const match = run.units.find(other => canMerge(unit,other));
    const names = unit.styles.map(key => E.PATHS[Math.floor(key/2)].name);
    const sub = trapped ? 'Trapped guardian' : 'Tier ' + unit.tier + (names.length ? ' · ' + names.join(', ') : ' · Active');
    const label = trapped ? 'Waiting for rescue' : waiting(unit) ? 'Ascension pending' : 'Merge matching tower';
    const detail = trapped ?
      '<dl><div><dt>Cage health</dt><dd>' + Math.ceil(unit.cageHp) + '</dd></div><div><dt>Seal remaining</dt><dd>' + Math.ceil(unit.seal) + '</dd></div></dl><p class="growth">Attack circles that cover this cage chip away at its seal.</p>' :
      '<dl><div><dt>Damage</dt><dd>' + format(stats.damage) + '</dd></div><div><dt>Attacks / sec</dt><dd>' + stats.rate.toFixed(2) + '</dd></div></dl><p class="growth">Radius ' + Math.round(stats.range) + ' · Growth +' + (stats.growth*7.5).toLocaleString() + '% damage</p>';
    return '<div class="tower-card"><div class="tower-id"><canvas class="portrait" width="80" height="80" aria-hidden="true"></canvas><div><h3>' + type.name + '</h3><p>' + sub + '</p></div></div>' + detail +
      '<button id="merge" class="secondary merge" ' + (!match ? 'disabled' : 'data-match="' + match.id + '"') + '>' + label + '</button>' +
      (!trapped && !fightOver() ? '<p class="move-hint">Tap an open tile or drag this tower to move it.</p>' : '') + '</div>';
  }

  function renderDetails() {
    const unit = selection();
    const html = info(unit);
    if (html !== snapshots.detail) {
      const wasFocused = document.activeElement?.id === 'merge';
      snapshots.detail = html;
      $('tower-details').innerHTML = html;
      const portrait = $('tower-details').querySelector('canvas');
      if (portrait) BriarArt.portrait(portrait,unit.type);
      const mergeButton = $('merge');
      if (mergeButton && !mergeButton.disabled && wasFocused) mergeButton.focus();
    }
  }

  function renderUnits() {
    const visible = run.units.filter(selectable);
    const ids = new Set(visible.map(unit => unit.id));
    for (const [id,node] of nodes) {
      if (ids.has(id)) continue;
      node.remove();
      nodes.delete(id);
    }
    const current = selection();
    for (const unit of visible) {
      let node = nodes.get(unit.id);
      if (!node) {
        node = document.createElement('button');
        node.className = 'unit';
        node.dataset.id = unit.id;
        overlay.append(node);
        nodes.set(unit.id,node);
      }
      position(node,unit.x,unit.y);
      const label = E.TYPES[unit.type].name + (unit.state === 'caged' ? ', trapped' : ', tier ' + unit.tier);
      node.setAttribute('aria-label',label);
      node.title = label;
      node.setAttribute('aria-pressed',String(current?.id === unit.id));
      node.classList.toggle('merge-target',drag?.moved && canMerge(drag.unit,unit));
    }
  }

  function position(node,x,y) {
    node.style.left = 100*x/900 + '%';
    node.style.top = 100*y/510 + '%';
  }

  function renderPads() {
    const unit = placementUnit();
    const occupied = new Set(run.units.map(item => item.slot));
    E.SLOTS.forEach(([x,y],slot) => {
      let pad = pads.get(slot);
      if (!unit || occupied.has(slot)) {
        if (!pad) return;
        pad.remove();
        pads.delete(slot);
        if (previewSlot === slot) previewSlot = undefined;
        return;
      }
      if (pad) return;
      pad = document.createElement('button');
      pad.className = 'placement';
      pad.dataset.slot = slot;
      pad.textContent = '+';
      pad.setAttribute('aria-label','Move to open tile ' + (slot+1));
      position(pad,x,y);
      pad.addEventListener('pointerenter',event => { if (event.pointerType === 'mouse') previewSlot = slot; });
      pad.addEventListener('pointerleave',() => { if (previewSlot === slot) previewSlot = undefined; });
      pad.addEventListener('focus',() => { previewSlot = slot; });
      pad.addEventListener('blur',() => { if (previewSlot === slot) previewSlot = undefined; });
      overlay.append(pad);
      pads.set(slot,pad);
    });
  }

  function renderControls() {
    const key = [run.threat,run.phase,run.health,run.rescued,run.kills,run.merges,run.offers.length,paused,speed].join();
    if (key === controlsSnapshot) return;
    controlsSnapshot = key;
    const inBattle = run.phase === 'battle';
    const phase = fightOver() ? 'Grove fallen' : inBattle ? (paused ? 'Paused' : 'In battle') : 'Preparation';
    $('threat').textContent = number(run.threat);
    $('health').innerHTML = run.health + ' <em>/ ' + E.MAX_HEALTH + '</em>';
    $('rescued').textContent = run.rescued;
    $('kills').textContent = run.kills;
    $('status-badge').classList.toggle('live',inBattle && !paused);
    $('status-badge').querySelector('span').textContent = phase;
    $('field-state').textContent = fightOver() ? phase.toUpperCase() : !inBattle ? 'SWARM INCOMING' : paused ? 'BATTLE PAUSED' : 'SWARM ADVANCING';
    $('run-heading').textContent = fightOver() ? phase : 'Survive the swarm';
    $('run-copy').textContent = fightOver() ? 'The swarm reached the heart of the grove.' :
      inBattle ? 'Move towers to cover the trail and rescue captives as the swarm grows.' :
      'Place your towers and hold the trail against a continuous swarm.';
    $('start').innerHTML = fightOver() ? 'Play again' : inBattle && !paused ?
      '<span aria-hidden="true">Ⅱ</span> Pause' : '<span aria-hidden="true">▶</span> ' + (paused ? 'Resume' : 'Start run');
    $('speed').textContent = speed + '×';
    $('speed').setAttribute('aria-label','Game speed ' + speed + '×. Click to change.');
    const pips = run.offers.length ? 3 : run.merges % 3;
    $('merge-caption').textContent = run.offers.length ? 'Ascension ready' : pips + ' / 3 merges';
    [...$('pips').children].forEach((pip,index) => pip.classList.toggle('filled',index < pips));
    $('forge-hint').textContent = run.offers.length ? 'Pick one of two upgrades. Each has a chance to fail.' : 'Every 3 merges unlock a choice of special upgrades.';
    $('offer').hidden = !run.offers.length || fightOver();
  }

  function sync() {
    if (!selection() || !selectable(selection())) selectedId = run.units.find(unit => unit.state === 'active')?.id;
    renderUnits();
    renderPads();
    renderDetails();
    renderControls();
  }

  function show(html) {
    $('dialog-inner').innerHTML = html;
    if (!dialog.open) dialog.showModal();
  }

  function showOffer() {
    const offer = run.offers[0];
    const tower = run.units.find(unit => unit.id === offer?.unitId);
    if (!tower || fightOver()) return;
    const cards = offer.choices.map((option,index) => {
      const labels = {damage:'damage',rate:'attack speed',radius:'attack radius'};
      const values = Object.entries(option.boost).map(([stat,multiplier]) => '+' + Math.round((multiplier-1)*100) + '% ' + labels[stat]).join(' · ');
      return '<button class="offer-choice ' + (index ? 'risk' : '') + '" data-action="upgrade" data-index="' + index + '"><small>' +
        (index ? 'Riskier roll' : 'Safer roll') + '</small><strong>' + option.name + '</strong><span>' + values + '</span><strong>' + option.chance + '% success</strong></button>';
    }).join('');
    show('<h2 id="dialog-title">Ascend ' + E.TYPES[tower.type].name + '</h2><p>Choose a special upgrade for your tier ' + tower.tier + ' guardian. A failed roll uses this attempt and leaves its current stats intact.</p><div class="offer-list">' + cards + '</div><div class="dialog-actions"><button class="secondary" data-action="close" autofocus>Decide later</button></div>');
  }

  function doMerge(source,target) {
    const prior = run.offers.length;
    if (!E.merge(run,source,target)) return;
    selectedId = target.id;
    flushNotices();
    sync();
    if (run.offers.length > prior) showOffer();
  }

  function flushNotices() {
    if (run.notices.length) say(run.notices.splice(0).join(' '));
  }

  function doPlace(unit,slot) {
    if (!E.place(run,unit,slot)) return false;
    selectedId = unit.id;
    say(E.TYPES[unit.type].name + ' moved.');
    sync();
    nodes.get(unit.id)?.focus({preventScroll:true});
    return true;
  }

  function restart() {
    run = E.create();
    selectedId = run.units[0].id;
    paused = false;
    speed = 1;
    accumulator = 0;
    drag = undefined;
    previewSlot = undefined;
    skipClick = false;
    say('A new run has begun.');
    sync();
  }

  function showEnd() {
    const seconds = Math.floor(run.battleTime);
    const time = Math.floor(seconds/60) + ':' + number(seconds%60);
    show('<h2 id="dialog-title">The grove has fallen</h2><p>You survived ' + time + ' and reached threat level ' + run.threat + '.' +
      '</p><p>' + run.rescued + ' rescued · ' + run.kills + ' slain · ' + run.merges + ' merges</p><div class="dialog-actions"><button class="secondary" data-action="close">View battlefield</button><button class="primary" data-action="restart">Play again</button></div>');
  }

  $('tower-details').addEventListener('click',event => {
    const button = event.target.closest('#merge');
    if (!button?.dataset.match) return;
    const target = selection();
    doMerge(run.units.find(unit => unit.id === Number(button.dataset.match)),target);
  });

  function targetFrom(element) {
    const id = Number(element?.closest('.unit')?.dataset.id);
    return run.units.find(unit => unit.id === id);
  }

  overlay.addEventListener('click',event => {
    if (skipClick && event.detail) return;
    const pad = event.target.closest('.placement');
    if (pad) {
      doPlace(selection(),Number(pad.dataset.slot));
      return;
    }
    const target = targetFrom(event.target);
    if (!target) return;
    const previousSelection = selection();
    if (canMerge(previousSelection,target)) doMerge(previousSelection,target);
    else {
      selectedId = target.id;
      sync();
    }
  });

  overlay.addEventListener('pointerdown',event => {
    if (event.button !== 0 || !event.isPrimary) return;
    const unit = targetFrom(event.target);
    if (unit?.state === 'active') drag = {unit,x:event.clientX,y:event.clientY,pointer:event.pointerId,moved:false};
  });
  window.addEventListener('pointermove',event => {
    if (!drag || drag.moved || event.pointerId !== drag.pointer || Math.hypot(event.clientX-drag.x,event.clientY-drag.y) < 7) return;
    drag.moved = true;
    renderUnits();
    renderPads();
  });
  window.addEventListener('pointerup',event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const {unit,moved} = drag;
    drag = undefined;
    if (!moved) return;
    const element = document.elementFromPoint(event.clientX,event.clientY);
    const target = targetFrom(element);
    const pad = element?.closest('.placement');
    if (canMerge(unit,target)) doMerge(unit,target);
    else if (!pad || !doPlace(unit,Number(pad.dataset.slot))) {
      selectedId = unit.id;
      sync();
      if (target && target !== unit) say('Merge matching active towers with the same tier and upgrades.');
    }
    skipClick = true;
    setTimeout(() => { skipClick = false; },0);
  });
  window.addEventListener('pointercancel',() => { drag = undefined; renderUnits(); renderPads(); });

  $('start').addEventListener('click',() => {
    if (fightOver()) restart();
    else if (run.phase === 'battle') paused = !paused;
    else if (E.start(run)) say('The swarm is advancing.');
    sync();
  });
  $('speed').addEventListener('click',() => { speed = speed % 3 + 1; renderControls(); });
  $('offer').addEventListener('click',showOffer);
  $('reset').addEventListener('click',() => {
    show('<h2 id="dialog-title">Restart this run?</h2><p>Your run progress, rescued towers and upgrades will be reset.</p><div class="dialog-actions"><button class="secondary" data-action="close" autofocus>Keep playing</button><button class="primary" data-action="restart">Restart run</button></div>');
  });
  $('help').addEventListener('click',() => {
    show('<h2 id="dialog-title">How to play</h2><ol><li><strong>Place your guardians.</strong> Select a tower and tap an open tile, or drag the tower there at any time. A spinning attack moves with its tower.</li><li><strong>Survive the swarm.</strong> Start once and enemies keep coming. Each spin can hit enemies and cages it sweeps across. Enemies can destroy trapped guardians or damage the grove if they reach it.</li><li><strong>Merge matches.</strong> Tap or drag a guardian onto another with the same type, tier and upgrades. You can also use the workshop button. The merged guardian stays in the target’s spot.</li><li><strong>Grow and ascend.</strong> Active guardians gain damage every 12 seconds of combat. Every third merge offers two upgrades from four paths: speed, damage, both, or a wider attack radius.</li></ol><div class="dialog-actions"><button class="primary" data-action="close">Back to the grove</button></div>');
  });

  $('dialog-inner').addEventListener('click',event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'restart') restart();
    if (button.dataset.action === 'upgrade') {
      const result = E.upgrade(run,Number(button.dataset.index));
      if (result) {
        selectedId = result.unit.id;
        say(result.success ? result.name + ' succeeded.' : result.name + ' failed. Your merged tower kept its stats.');
        sync();
      }
    }
    dialog.close();
  });

  function frame(now) {
    const dt = Math.min(.1, (now-previous)/1000);
    previous = now;
    if (!paused && !dialog.open) {
      const phase = run.phase;
      const signature = [run.threat,run.rescued,run.lost,run.kills,run.health].join();
      accumulator += dt*(phase === 'battle' ? speed : 1);
      while (accumulator >= 1/60 && run.phase === phase) {
        E.step(run,1/60);
        accumulator -= 1/60;
      }
      if (phase !== run.phase) accumulator = 0;
      if (phase !== run.phase || signature !== [run.threat,run.rescued,run.lost,run.kills,run.health].join()) sync();
      else if (phase === 'battle') renderDetails();
      flushNotices();
      if (phase === 'battle' && fightOver()) showEnd();
    }
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const unit = placementUnit();
    const placement = unit && pads.has(previewSlot) ? {unit,slot:previewSlot} : null;
    BriarArt.draw(ctx,run,drag?.moved ? drag.unit.id : selectedId,reducedMotion ? 0 : run.time*3,placement,reducedMotion);
    requestAnimationFrame(frame);
  }
  sync();
  requestAnimationFrame(frame);
})();
