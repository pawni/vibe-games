(() => {
  const {ROUTE,TYPES,stats} = BriarEngine;
  const W = 900;
  const H = 510;
  const image = new Image();
  let dirty = true;
  image.onload = () => { dirty = true; };
  image.src = 'glade.webp';
  const terrain = document.createElement('canvas');
  terrain.width = W;
  terrain.height = H;
  const bg = terrain.getContext('2d');
  const palette = {
    thorn:['#f7f3a2','#a5c94c','#5f8b37','#344b29','#e1f2a4'],
    ember:['#ffe3a5','#eb8a58','#ad4c38','#542d2e','#ffe9b6'],
    frost:['#ebffff','#7ed8e7','#4287b5','#304f70','#d7fbfb']
  };
  function random(seed) {
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }
  function ellipse(ctx,x,y,rx,ry,color,stroke,width=1) {
    ctx.beginPath();
    ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }
  function path(ctx,d,color,stroke,width=1.5) {
    const p = new Path2D(d);
    if (color) { ctx.fillStyle=color; ctx.fill(p); }
    if (stroke) { ctx.strokeStyle=stroke; ctx.lineWidth=width; ctx.stroke(p); }
  }
  function line(ctx,points,color,width) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.strokeStyle=color;
    ctx.lineWidth=width;
    ctx.stroke();
  }
  function gradient(ctx,y1,y2,colorA,colorB) {
    const grad = ctx.createLinearGradient(0,y1,0,y2);
    grad.addColorStop(0,colorA);
    grad.addColorStop(1,colorB);
    return grad;
  }

  function createTerrain() {
    const rng = random(2141);
    bg.lineJoin='round';
    bg.lineCap='round';
    bg.fillStyle='#67873c';
    bg.fillRect(0,0,W,H);
    if (image.complete && image.naturalWidth) {
      const scale = Math.max(W/image.width,H/image.height);
      const w = image.width*scale;
      const h = image.height*scale;
      bg.drawImage(image,(W-w)/2,(H-h)/2,w,h);
      bg.fillStyle='#435d2430';
      bg.fillRect(0,0,W,H);
    }
    for (let y=0; y<H; y+=47) {
      for (let x=0; x<W; x+=47) {
        bg.fillStyle = ((x+y)/47)%2 ? '#edf4a916' : '#17331d11';
        bg.fillRect(x,y,47,47);
      }
    }

    const trail = ROUTE.map(([x,y]) => [x,y]);
    line(bg,trail.map(([x,y])=>[x,y+4]),'#2e4328b5',65);
    line(bg,trail,'#638044',66);
    line(bg,trail,'#7f623d',56);
    line(bg,trail,'#ac8650',51);
    line(bg,trail,'#d2ad63',46);
    line(bg,trail,'#dfba75',39);
    line(bg,trail,'#ebc885',27);
    const routeDistance = (x,y) => {
      let min = Infinity;
      for (let i=1; i<ROUTE.length; i++) {
        const [ax,ay] = ROUTE[i-1];
        const [bx,by] = ROUTE[i];
        const t = Math.min(1,Math.max(0,((x-ax)*(bx-ax)+(y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)));
        min = Math.min(min,Math.hypot(x-ax-(bx-ax)*t,y-ay-(by-ay)*t));
      }
      return min;
    };
    for (let i=0;i<2800;i++) {
      const x=rng()*W, y=rng()*H;
      const distance=routeDistance(x,y);
      const r=rng();
      if (distance<26) {
        ellipse(bg,x,y,.5+r*(distance>20?2.8:1.2),.35+r*.65,r>.53?'#8f5f3538':'#fff0ad75');
      } else if (distance<37 && r>.48) {
        line(bg,[[x-2,y],[x,y-2-r*4],[x+1,y],[x+4,y-4]],r>.75?'#c0c76c90':'#38542a90',1.4);
      }
    }
    const signs = [[79,137,0],[240,248,Math.PI/2],[391,345,0],[562,245,-Math.PI/2],[672,136,0],[746,282,Math.PI/2],[845,377,0]];
    for (const [x,y,angle] of signs) {
      bg.save();
      bg.translate(x,y);
      bg.rotate(angle);
      path(bg,'M -4 -7 L 3 0 L -4 7 M 3 -7 L 10 0 L 3 7',null,'#93663782',2.8);
      bg.restore();
    }
    for (const [x,y] of [[26,137],[875,377]]) {
      bg.save();
      bg.translate(x,y);
      for (const dy of [-29,29]) {
        ellipse(bg,0,dy+2,10,5,'#30402a85');
        path(bg,`M -7 ${dy+2} L -7 ${dy-13} L 0 ${dy-19} L 7 ${dy-13} L 7 ${dy+2} Z`,'#6e775a','#36402e',2);
        path(bg,`M -6 ${dy-13} L 0 ${dy-18} L 6 ${dy-13} L 0 ${dy-10} Z`,'#a9ad7d');
        ellipse(bg,0,dy-11,3,3,'#efdfa1');
      }
      bg.restore();
    }
    const vignette = bg.createRadialGradient(450,235,152,450,255,535);
    vignette.addColorStop(0,'#10211700');
    vignette.addColorStop(1,'#101c15a3');
    bg.fillStyle=vignette;
    bg.fillRect(0,0,W,H);
    dirty=false;
  }

  function leaf(c, angle, x,y,scale,p) {
    c.save();
    c.translate(x,y);
    c.rotate(angle);
    c.scale(scale,scale);
    path(c,'M 0 14 Q -20 2 -5 -26 Q 12 -17 13 -3 Q 12 8 0 14 Z',gradient(c,-26,14,p[0],p[2]),p[3],2.2);
    path(c,'M 0 9 Q 1 -4 -3 -18 M 1 0 L 7 -6',null,p[3]+'89',1.2);
    c.restore();
  }

  function guardian(c,type,x,y,scale,frame=0) {
    const p=palette[type];
    c.save();
    c.translate(x,y+Math.sin(frame)*1.25);
    c.scale(scale,scale);
    c.lineJoin='round';
    c.lineCap='round';
    ellipse(c,-14,12,9,5,p[2],p[3],2);
    ellipse(c,14,12,9,5,p[2],p[3],2);
    if (type==='thorn') {
      leaf(c,-.75,-14,-8,1,p);
      leaf(c,.76,13,-10,1.06,p);
      leaf(c,.12,0,-17,1,p);
      path(c,'M -27 -7 Q -26 -20 -14 -22 L 0 -18 L 13 -23 Q 26 -19 28 -7 Q 31 8 18 13 Q 0 20 -18 13 Q -30 9 -27 -7 Z',gradient(c,-22,17,p[1],p[2]),p[3],2.5);
      path(c,'M -23 -4 Q -22 -13 -13 -13 Q -5 -13 0 -6 Q 8 -15 17 -13 Q 25 -11 25 -2 Q 25 11 3 13 Q -21 12 -23 -4 Z',gradient(c,-12,15,p[0],p[1]));
      path(c,'M -5 -17 L 0 -26 L 7 -18 L 2 -11 Z',p[2],p[3],1.5);
    } else if (type==='ember') {
      path(c,'M -20 -13 Q -31 -5 -25 8 Q -17 20 2 16 Q 26 17 26 2 Q 28 -11 17 -15 Z',gradient(c,-12,17,p[4],'#d98b64'),p[3],2.5);
      path(c,'M -32 -10 Q -35 -21 -20 -32 Q -5 -44 12 -38 Q 30 -32 34 -16 Q 38 -7 23 -8 Q 2 -5 -13 -9 Q -27 -4 -32 -10 Z',gradient(c,-39,-6,p[1],p[2]),p[3],2.6);
      ellipse(c,-13,-24,6,4,p[0]);
      ellipse(c,6,-32,4,3,p[0]);
      ellipse(c,19,-19,6,4,p[0]);
      ellipse(c,-24,-15,3,2,p[0]);
    } else {
      leaf(c,-.86,-14,-7,.9,p);
      leaf(c,.9,13,-7,.9,p);
      leaf(c,.12,0,-17,1.05,p);
      path(c,'M -22 -18 Q -12 -28 -3 -17 Q 2 -24 10 -22 Q 24 -18 23 -8 L 28 3 Q 27 14 13 15 Q 1 21 -10 15 Q -29 15 -27 3 Z',gradient(c,-22,17,p[4],p[1]),p[3],2.5);
      path(c,'M -5 -23 L 1 -31 L 7 -22 L 1 -15 Z',p[0],p[2],1.3);
    }
    for (const side of [-1,1]) {
      ellipse(c,side*10,-.5,5.8,7.2,type==='ember'?'#512f2b':'#263335');
      ellipse(c,side*10-1.4,-2.6,2,2.45,'#fffbe7');
      ellipse(c,side*18,6,3.1,1.6,type==='frost'?'#8999d5':'#e28b65a8');
    }
    path(c,'M -3 7 Q 0 10 3 7',null,p[3],1.6);
    c.restore();
  }

  function plate(c,x,y,ring,selected) {
    ellipse(c,x,y+11,36,17,'#18251c69');
    ellipse(c,x,y+8,31,13,'#3a4731','#263623',3);
    ellipse(c,x,y+4,30,12,'#657047','#273d2b',2);
    ellipse(c,x,y+3,24,8,'#51613b',ring,1.25);
    if (selected) {
      c.save();
      c.shadowColor=ring;
      c.shadowBlur=9;
      ellipse(c,x,y+6,37,17,'#d6f48c22',ring,2.8);
      c.restore();
    }
  }

  function cage(c,unit,selected,clock) {
    const {x,y,type}=unit;
    plate(c,x,y,'#9ae3ff',selected);
    c.save();
    c.translate(x,y-7);
    c.lineJoin='round';
    const glow=c.createRadialGradient(0,-15,0,0,-15,41);
    glow.addColorStop(0,'#c7f5ffa0');
    glow.addColorStop(1,'#84d9ff00');
    ellipse(c,0,-13,40,42,glow);
    path(c,'M -26 -28 L -18 -41 L 18 -41 L 26 -28 L 25 9 L 16 16 L -16 16 L -25 9 Z',gradient(c,-44,14,'#548dbdc9','#254a66e8'),'#213e59',4);
    guardian(c,type,0,-1,.61,clock);
    path(c,'M -26 -28 L -18 -41 L 18 -41 L 26 -28 L 25 9 L 16 16 L -16 16 L -25 9 Z',null,'#bbf1ff',2);
    path(c,'M -26 -27 L 26 -27 M -24 8 L 24 8 M -15 -40 L -16 14 M 15 -40 L 16 14',null,'#91cde9',3);
    path(c,'M -11 -45 L -5 -52 L 1 -46 L 7 -53 L 12 -45 L 8 -36 L -7 -36 Z','#ead384','#514731',2);
    ellipse(c,0,-36,4,5,'#ffe9a5','#78603b',1.3);
    c.fillStyle='#192f3c';
    c.fillRect(-19,22,38,5);
    c.fillStyle=unit.cageHp<30?'#f49878':'#a9e6f6';
    c.fillRect(-18,23,36*Math.max(0,unit.cageHp/unit.cageMaxHp),3);
    c.restore();
  }

  function active(c,unit,selected,clock) {
    const {x,y,type,tier}=unit;
    const ring=TYPES[type].color;
    plate(c,x,y,ring,selected);
    guardian(c,type,x,y-12,Math.min(1.15,.96+.055*(tier-1)),clock+unit.id);
    const bx=x+24, by=y+5;
    ellipse(c,bx,by,9.5,9.5,tier>1?'#ded189':'#263d2a','#e1edad',1.4);
    c.fillStyle=tier>1?'#34351d':'#f0f1cd';
    c.font='bold 11px system-ui, sans-serif';
    c.textAlign='center';
    c.textBaseline='middle';
    c.fillText(String(tier),bx,by+.25);
    if (unit.styles.length) ellipse(c,x-23,y-28,4,4,'#ffe695','#745635',1.5);
  }

  function mob(c,m,clock) {
    const flip=Math.cos(m.angle)<-.2?-1:1;
    const scale=m.kind==='brute'?1.31:m.kind==='runner'?.83:1;
    c.save();
    c.translate(m.x,m.y);
    c.scale(scale*flip,scale);
    const bob=Math.sin(clock*3+m.id)*1.8;
    ellipse(c,0,6,17,8,'#382e2b60');
    c.translate(0,bob);
    const leg=Math.sin(clock*3+m.id)*4;
    path(c,`M -16 -2 L -22 ${5+leg} M -7 3 L -11 ${9-leg} M 8 3 L 9 ${9+leg} M 16 -2 L 21 ${5-leg}`,null,'#3b293b',4);
    path(c,'M -18 -5 Q -22 -13 -12 -17 L -11 -24 L -4 -18 L 1 -21 L 6 -16 Q 14 -20 19 -14 Q 24 -5 17 3 Q 7 8 -5 4 Q -16 5 -18 -5 Z',gradient(c,-22,7,m.kind==='brute'?'#9b6b68':'#8d6596','#473447'),'#342739',2.2);
    path(c,'M -15 -9 Q -14 -15 -7 -15 M -8 -5 L -4 -8',null,'#c48aa180',2);
    ellipse(c,11,-9,3.8,3.3,'#ffb361');
    ellipse(c,17,-9,2.5,2.8,'#ffcc78');
    ellipse(c,12,-8.8,1.05,2,'#4f3039');
    c.restore();
    if (m.hp<m.maxHp) {
      c.fillStyle='#3b2d2b';
      c.fillRect(m.x-14,m.y-31*scale,28,4);
      c.fillStyle=m.slow?'#a6efdf':'#edaa75';
      c.fillRect(m.x-13,m.y-31*scale+1,26*m.hp/m.maxHp,2);
    }
  }

  function draw(ctx,run,selectedId,clock,placement,reducedMotion) {
    if (dirty) createTerrain();
    ctx.drawImage(terrain,0,0);
    const selected=run.units.find(unit=>unit.id===selectedId && unit.state==='active');
    if (selected) {
      const {range}=stats(selected);
      ctx.save();
      ctx.setLineDash([5,7]);
      ellipse(ctx,selected.x,selected.y,range,range,'#ddf69c13','#e8f7b67a',1.5);
      ctx.restore();
    }
    if (placement) {
      const [x,y] = BriarEngine.SLOTS[placement.slot];
      const {range} = stats(placement.unit);
      ctx.save();
      ctx.setLineDash([6,5]);
      ellipse(ctx,x,y,range,range,'#e7fa9b29','#f5ffbedb',1.8);
      ctx.restore();
    }
    for (const unit of run.units) {
      if (!unit.spin || unit.state !== 'active') continue;
      const {x,y,spin} = unit;
      const {range} = stats(unit);
      const color = TYPES[unit.type].color;
      if (reducedMotion) {
        ellipse(ctx,x,y,range,range,'#ffffff00',color+'70',2);
        continue;
      }
      const angle = spin.angle;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x,y);
      ctx.arc(x,y,range,angle-.26,angle+.22);
      ctx.closePath();
      ctx.fillStyle = color+'35';
      ctx.fill();
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x,y,range,angle-.46,angle+.2);
      ctx.stroke();
      const edgeX = x+Math.cos(angle)*range;
      const edgeY = y+Math.sin(angle)*range;
      line(ctx,[[x,y],[edgeX,edgeY]],color+'99',2);
      ellipse(ctx,edgeX,edgeY,3.4,3.4,'#fff5ce');
      ctx.restore();
    }
    const objects = [
      ...run.units.filter(unit=>unit.state!=='destroyed').map(unit=>({y:unit.y,paint:()=>unit.state==='active'?active(ctx,unit,unit.id===selectedId,clock):cage(ctx,unit,unit.id===selectedId,clock)})),
      ...run.enemies.map(enemy=>({y:enemy.y,paint:()=>mob(ctx,enemy,clock)}))
    ];
    objects.sort((a,b)=>a.y-b.y);
    for (const object of objects) object.paint();
    for (const effect of run.effects) {
      const elapsed=1-effect.life/effect.max;
      ctx.save();
      if (effect.kind==='bolt') {
        const t=Math.min(1,elapsed*1.7);
        const x=effect.x+(effect.toX-effect.x)*t;
        const y=effect.y+(effect.toY-effect.y)*t;
        ctx.globalAlpha=1-elapsed*.8;
        ctx.lineCap='round';
        line(ctx,[[x-(effect.toX-effect.x)*.15,y-(effect.toY-effect.y)*.15],[x,y]],effect.color,2);
        ctx.shadowColor=effect.color;
        ctx.shadowBlur=11;
        ellipse(ctx,x,y,4,4,effect.color);
        ellipse(ctx,x,y,1.8,1.8,'#fffbd6');
      } else {
        ctx.globalAlpha=1-elapsed;
        ellipse(ctx,effect.x,effect.y,8+elapsed*47,6+elapsed*31,'#ffffff00',effect.color,3);
        for (let i=0;i<8;i++) {
          const angle=i*Math.PI/4+.2;
          ellipse(ctx,effect.x+Math.cos(angle)*elapsed*53,effect.y+Math.sin(angle)*elapsed*38,3,2,effect.color);
        }
      }
      ctx.restore();
    }
  }

  function portrait(canvas,type) {
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,80,80);
    ellipse(ctx,40,63,27,9,'#293b26b9');
    guardian(ctx,type,40,50,1.04);
  }
  window.BriarArt={draw,portrait};
})();
