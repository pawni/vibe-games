(function (root) {
  const ROUTE = [[-32,137],[193,137],[224,146],[240,173],[240,311],[249,333],[274,345],[526,345],[550,335],[562,311],[562,171],[573,148],[600,136],[711,136],[735,149],[746,176],[746,344],[757,366],[784,377],[928,377]];
  const SLOTS = [[137,216],[315,406],[468,262],[646,217],[317,212],[640,318],[813,269],[461,413],[108,71],[330,76],[472,75],[634,74],[811,74],[130,310],[135,408],[316,291],[408,174],[490,174],[644,419],[837,453],[196,457],[392,248],[831,192],[823,342]];
  const TYPES = {
    thorn: {name:'Thornling', damage:9, period:.83, range:105, color:'#cce98a'},
    ember: {name:'Embercap', damage:15, period:1.2, range:96, color:'#ffc38b'},
    frost: {name:'Frostbell', damage:8, period:1.02, range:114, color:'#a3eaf4'}
  };
  const PATHS = [
    {name:'Quickbloom', safe:{rate:1.52}, risk:{rate:2.02}},
    {name:'Ironbark', safe:{damage:1.52}, risk:{damage:2.02}},
    {name:'Wildheart', safe:{damage:1.23,rate:1.23}, risk:{damage:1.43,rate:1.43}},
    {name:'Farreach', safe:{radius:1.23}, risk:{radius:1.42}}
  ];
  const THREAT_INTERVAL = 18;
  const TURN = Math.PI * 2;
  const MAX_HEALTH = 12;
  const GROWTH_INTERVAL = 12;
  const EMPTY_SLOT_ORDER = [4,5,6,7,13,15,16,17,9,10,18,11,20,8,12,14,19,0,1,2,3,21,22,23];
  const CAGE_TYPES = ['thorn','frost','ember','thorn','ember','frost','thorn','thorn','ember','frost','ember','thorn'];
  let length = 0;
  const segments = ROUTE.slice(1).map(([x,y], i) => {
    const [fromX,fromY] = ROUTE[i];
    const distance = Math.hypot(x-fromX,y-fromY);
    const segment = {fromX,fromY,x,y,distance,start:length};
    length += distance;
    return segment;
  });
  function at(distance) {
    const segment = segments.find(item => distance <= item.start + item.distance) || segments.at(-1);
    const ratio = (distance - segment.start) / segment.distance;
    return {x:segment.fromX + (segment.x-segment.fromX)*ratio, y:segment.fromY + (segment.y-segment.fromY)*ratio, angle:Math.atan2(segment.y-segment.fromY,segment.x-segment.fromX)};
  }

  function create(random = Math.random) {
    let nextId = 1;
    let cageCount = 0;
    const run = {
      phase:'ready', threat:1, health:MAX_HEALTH, rescued:0, kills:0, lost:0, merges:0, spawned:0,
      time:0, battleTime:0, spawnTimer:0, units:[], enemies:[], effects:[], notices:[], offers:[], random
    };
    function add(type, slot, state) {
      const [x,y] = SLOTS[slot];
      const unit = {id:nextId++, type, slot, x,y, state, tier:1, age:0, cooldown:.12 + (slot%4)*.13,
        cageHp:59, cageMaxHp:59, seal:26, damage:1, rate:1, radius:1, styles:[]};
      run.units.push(unit);
      return unit;
    }
    run.provision = (count) => {
      for (const slot of EMPTY_SLOT_ORDER) {
        if (!count) break;
        if (run.units.some(unit => unit.slot === slot)) continue;
        const unit = add(CAGE_TYPES[cageCount % CAGE_TYPES.length],slot,'caged');
        cageCount++;
        unit.cageHp = unit.cageMaxHp = 56 + run.threat * 3;
        unit.seal = 23 + run.threat * 2.5;
        count--;
      }
    };
    run.spawn = () => {
      const index = run.spawned++;
      const kind = run.threat >= 4 && index % 6 === 4 ? 'brute' : run.threat >= 2 && index % 4 === 2 ? 'runner' : 'scout';
      const difficulty = run.threat-1;
      const health = (25 + 7*difficulty + 3*difficulty**2) * (kind === 'brute' ? 1.85 : kind === 'runner' ? .8 : 1);
      const speed = (50 + 3.1*difficulty) * (kind === 'brute' ? .72 : kind === 'runner' ? 1.37 : 1);
      run.enemies.push({id:nextId++, kind, hp:health, maxHp:health, speed, distance:0, bite:0, slow:0, ...at(0)});
    };
    add('thorn',0,'active');
    add('thorn',1,'active');
    add('ember',2,'active');
    add('frost',3,'active');
    run.provision(3);
    return run;
  }

  function stats(unit) {
    const type = TYPES[unit.type];
    const growth = Math.floor(unit.age/GROWTH_INTERVAL);
    return {
      damage:type.damage * 1.92**(unit.tier-1) * (1 + growth*.075) * unit.damage,
      rate:1/type.period * 1.065**(unit.tier-1) * unit.rate,
      range:(type.range + 9*(unit.tier-1)) * unit.radius,
      growth
    };
  }

  function place(run,unit,slot) {
    if (run.phase === 'lost' || unit?.state !== 'active' || !run.units.includes(unit) ||
      !Number.isInteger(slot) || !SLOTS[slot] || run.units.some(other => other.slot === slot)) return false;
    const [x,y] = SLOTS[slot];
    Object.assign(unit,{slot,x,y});
    return true;
  }

  function compatible(a,b) {
    return Boolean(a && b && a.id !== b.id && a.state === 'active' && b.state === 'active' &&
      a.type === b.type && a.tier === b.tier && a.styles.join() === b.styles.join());
  }

  function merge(run, source, target) {
    if (!compatible(source,target) || !run.units.includes(source) || !run.units.includes(target) ||
      run.offers.some(offer => [source.id,target.id].includes(offer.unitId)) || run.phase === 'lost') return false;
    target.tier++;
    target.age = Math.max(target.age,source.age);
    if (!target.spin) target.cooldown = Math.min(target.cooldown,source.cooldown);
    run.units = run.units.filter(unit => unit !== source);
    run.merges++;
    run.notices.push(TYPES[target.type].name + ' merged to tier ' + target.tier + '.');
    run.effects.push({kind:'bloom',x:target.x,y:target.y,color:TYPES[target.type].color,life:.6,max:.6});
    if (run.merges % 3 === 0) {
      const safeIndex = Math.floor(run.random()*PATHS.length);
      const riskIndex = (safeIndex + 1 + Math.floor(run.random()*(PATHS.length-1))) % PATHS.length;
      run.offers.push({unitId:target.id, choices:[
        {...PATHS[safeIndex],chance:88,boost:PATHS[safeIndex].safe,key:safeIndex*2},
        {...PATHS[riskIndex],chance:58,boost:PATHS[riskIndex].risk,key:riskIndex*2+1}
      ]});
    }
    return true;
  }

  function upgrade(run,index) {
    const offer = run.offers[0];
    const option = offer?.choices[index];
    const unit = run.units.find(item => item.id === offer?.unitId);
    if (!option || !unit) return null;
    run.offers.shift();
    const success = run.random() < option.chance / 100;
    if (success) {
      for (const [stat,multiplier] of Object.entries(option.boost)) unit[stat] *= multiplier;
      unit.styles.push(option.key);
      unit.styles.sort((a,b) => a-b);
      run.effects.push({kind:'bloom',x:unit.x,y:unit.y,color:'#fae69c',life:1,max:1});
    }
    return {success,name:option.name,unit};
  }

  function start(run) {
    if (run.phase !== 'ready') return false;
    run.phase = 'battle';
    run.spawnTimer = .15;
    return true;
  }

  function step(run,dt) {
    run.time += dt;
    for (const effect of run.effects) effect.life -= dt;
    run.effects = run.effects.filter(effect => effect.life > 0);
    if (run.phase !== 'battle') return;
    run.battleTime += dt;
    const threat = 1 + Math.floor(run.battleTime / THREAT_INTERVAL);
    if (threat > run.threat) {
      run.threat = threat;
      run.units = run.units.filter(unit => unit.state !== 'destroyed');
      run.provision(threat % 3 === 0 ? 3 : 2);
    }
    run.spawnTimer -= dt;
    if (run.spawnTimer <= 0) {
      run.spawn();
      run.spawnTimer += Math.max(.46, 1.23 - .063*run.threat);
    }

    const active = run.units.filter(unit => unit.state === 'active');
    const trapped = run.units.filter(unit => unit.state === 'caged');
    for (const unit of active) {
      unit.age += dt;
      unit.cooldown -= dt;
      if (!unit.spin && unit.cooldown > 0) continue;
      const values = stats(unit);
      const inRange = other => (unit.x-other.x)**2 + (unit.y-other.y)**2 <= values.range**2;
      const enemies = run.enemies.filter(enemy => enemy.hp > 0 && inRange(enemy));
      const cages = trapped.filter(cage => cage.state === 'caged' && inRange(cage));
      if (!unit.spin) {
        if (!enemies.length && !cages.length) continue;
        unit.cooldown = 1 / values.rate;
        unit.spin = {angle:0,duration:.73 / values.rate,seen:new Set()};
      }
      const spin = unit.spin;
      const previous = spin.angle;
      spin.angle = Math.min(TURN,previous + TURN*dt/spin.duration);
      const hit = target => {
        if (spin.seen.has(target.id)) return false;
        const angle = Math.atan2(target.y-unit.y,target.x-unit.x);
        const ahead = (angle-previous+2*TURN) % TURN;
        if (ahead > spin.angle-previous+.22 && ahead < TURN-.22) return false;
        spin.seen.add(target.id);
        return true;
      };
      for (const cage of cages) {
        if (!hit(cage)) continue;
        cage.seal -= 8 + values.damage*.52;
        if (cage.seal <= 0) {
          cage.state = 'active';
          run.rescued++;
          run.notices.push(TYPES[cage.type].name + ' rescued.');
          run.effects.push({kind:'bloom',x:cage.x,y:cage.y,color:'#d7fb94',life:.6,max:.6});
        }
      }
      for (const enemy of enemies) {
        if (!hit(enemy)) continue;
        enemy.hp -= values.damage;
        if (unit.type === 'frost') enemy.slow = 1.05;
        if (enemy.hp <= 0) {
          run.kills++;
          run.effects.push({kind:'bloom',x:enemy.x,y:enemy.y,color:'#e0a17b',life:.31,max:.31});
        }
      }
      if (spin.angle === TURN) unit.spin = undefined;
    }

    for (const enemy of run.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.bite -= dt;
      const victim = trapped.find(cage => cage.state === 'caged' && Math.hypot(cage.x-enemy.x,cage.y-enemy.y) <= 83);
      if (victim && enemy.bite <= 0) {
        enemy.bite = .7;
        victim.cageHp -= (12 + run.threat*3) * (enemy.kind === 'brute' ? 1.8 : 1);
        run.effects.push({kind:'bolt',x:enemy.x,y:enemy.y-9,toX:victim.x,toY:victim.y-10,color:'#ff9679',life:.23,max:.23});
        if (victim.cageHp <= 0) {
          victim.state = 'destroyed';
          run.lost++;
          run.notices.push('A trapped ' + TYPES[victim.type].name + ' was lost.');
          run.effects.push({kind:'bloom',x:victim.x,y:victim.y,color:'#f1917d',life:.53,max:.53});
        }
      }
      enemy.slow = Math.max(0,enemy.slow-dt);
      enemy.distance += enemy.speed * (enemy.slow > 0 ? .68 : 1) * dt;
      Object.assign(enemy,at(enemy.distance));
      if (enemy.distance >= length) {
        run.health = Math.max(0,run.health - (enemy.kind === 'brute' ? 2 : 1));
        enemy.hp = 0;
      }
    }
    run.enemies = run.enemies.filter(enemy => enemy.hp > 0);

    if (!run.health) run.phase = 'lost';
  }

  const api = {ROUTE,SLOTS,TYPES,PATHS,MAX_HEALTH,GROWTH_INTERVAL,THREAT_INTERVAL,at,create,stats,place,compatible,merge,upgrade,start,step};
  if (typeof module !== 'undefined') module.exports = api;
  else root.BriarEngine = api;
})(globalThis);
