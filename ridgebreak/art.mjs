import { WIDTH, HEIGHT, GROUND, CELL, COLS, BONUS, ridgeTop } from "./engine.mjs";

const canvas = document.querySelector("#field");
const ctx = canvas.getContext("2d");
const rockLayer = document.createElement("canvas");
rockLayer.width = WIDTH;
rockLayer.height = HEIGHT;
const rocks = rockLayer.getContext("2d");
const stoneColors = ["#69728a", "#555e75", "#656b82", "#4b5369", "#3c465d", "#353c50"];
const noise = n => ((Math.sin(n * 78.233) * 43758.5453) % 1 + 1) % 1;
const palette = [
  { light: "#8ea4b6", mid: "#4c657b", shadow: "#293b51", banner: "#72b1e3", darkBanner: "#315c83" },
  { light: "#b59a94", mid: "#79585a", shadow: "#442f3a", banner: "#e68168", darkBanner: "#813d3d" },
];
function polygon(g, coords, fill, stroke) {
  g.beginPath();
  coords.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
  g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.stroke();
  }
}
function line(g, coords, stroke, width = 1) {
  g.beginPath();
  coords.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
  g.strokeStyle = stroke;
  g.lineWidth = width;
  g.stroke();
}
function circle(g, x, y, r, fill) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI*2);
  g.fillStyle = fill;
  g.fill();
}
function pine(x,y,size,fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x-1,y-size*.13,2,size*.16);
  polygon(ctx, [[x,y-size],[x+size*.18,y-size*.6],[x+size*.1,y-size*.63],[x+size*.29,y-size*.32],[x+size*.18,y-size*.36],[x+size*.39,y-size*.1],[x-size*.39,y-size*.1],[x-size*.18,y-size*.36],[x-size*.29,y-size*.32],[x-size*.1,y-size*.63],[x-size*.18,y-size*.6]], fill);
}
function ground() {
  const edge = [[0,378],[28,380],[72,392],[263,394],[295,390],[341,398],[400,404],[595,408],[830,401],[880,389],[925,394],[1127,393],[1168,382],[1200,377]];
  for (let i=0; i<30; i++) {
    const x = i < 15 ? noise(i+1)*335 : 870+noise(i+1)*330;
    pine(x, 398, 14+noise(i+38)*39, i%3 ? "#242f46" : "#2e3a51");
  }
  const grade = ctx.createLinearGradient(0,375,0,440);
  grade.addColorStop(0,"#354053");
  grade.addColorStop(1,"#111926");
  polygon(ctx, [...edge,[WIDTH,HEIGHT],[0,HEIGHT]], grade);
  line(ctx,edge,"#63728b6e",1.4);
  for (let i=0;i<68;i++) {
    const x = noise(i*53+17)*WIDTH;
    const y = 403+noise(i*17+6)*30;
    line(ctx,[[x,y],[x+5+noise(i+16)*25,y-1]],"#8394ae26");
  }
}
export function repaintTerrain(world) {
  rocks.clearRect(0,0,WIDTH,HEIGHT);
  for (let i=0;i<world.terrain.length;i++) {
    if (!world.terrain[i]) continue;
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * CELL, y = row * CELL;
    const depth = y-ridgeTop(x+5,world.round);
    const band = Math.floor((depth + 10*Math.sin(x/38) + 5*Math.sin(x/13))/22);
    const color = stoneColors[Math.max(0, Math.min(5, band < 5 ? Math.max(0,band) : 4 + (band % 2)))];
    rocks.fillStyle = color;
    rocks.fillRect(x,y,CELL,CELL);
    if (noise(i+1) > .61) {
      rocks.fillStyle = noise(i+5) > .6 ? "#a1acc948" : "#141c2b60";
      rocks.fillRect(x + noise(i+7)*5,y+noise(i+9)*7,2+noise(i+11)*4,1);
    }
    if (band % 3 === 0) line(rocks,[[x,y+4],[x+4,y+5],[x+10,y+2]],"#c2a38724");
    if (!world.terrain[i-COLS]) line(rocks,[[x,y+.6],[x+10,y+.6]], depth < 12 ? "#a5a9a9b0" : "#f4b9908b",1.2);
    if (!world.terrain[i+1]) line(rocks,[[x+9.4,y],[x+9.4,y+10]],"#a6a9b060",1);
    if (!world.terrain[i-1]) line(rocks,[[x+.6,y],[x+.6,y+10]],"#a6a9b060",1);
  }
}
function masonry(piece, colors) {
  const {x,y,w,h,max,health,kind} = piece;
  const roof = kind !== "base";
  const lightlyDamaged = health < max * .67;
  const grade = ctx.createLinearGradient(x,y,x+w,y);
  grade.addColorStop(0,colors.shadow);
  grade.addColorStop(.30,colors.mid);
  grade.addColorStop(.78,colors.mid);
  grade.addColorStop(1,colors.shadow);
  ctx.fillStyle = grade;
  ctx.fillRect(x,y+6,w,h-6);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x,y+6,w,h-6);
  ctx.clip();
  for (let row=0; row<h/10; row++) {
    for (let col=-1; col<w/14; col++) {
      const xx = x+14*col+(row%2)*7, yy = y+7+row*10;
      ctx.fillStyle = noise(row*57+col*11+x) > .55 ? "#e9d6cc18" : "#1719272c";
      ctx.fillRect(xx+1,yy+1,12,8);
      line(ctx,[[xx+2,yy+1],[xx+11,yy+1]],"#ecddcc29",.7);
    }
  }
  ctx.restore();
  line(ctx,[[x,y+h-1],[x,y+7],[x+w,y+7],[x+w,y+h-1]],colors.shadow,1.7);
  line(ctx,[[x+1,y+9],[x+1,y+h-2]],"#eaded756",1);
  if (roof) {
    const towers = kind === "keep" ? 4 : 3;
    const unit = (w+6)/towers;
    ctx.fillStyle = colors.light;
    ctx.fillRect(x-3,y+6,w+6,6);
    for (let i=0;i<towers;i++) {
      const lx=x-3+i*unit;
      ctx.fillStyle = colors.mid;
      ctx.fillRect(lx,y,unit*.62,9);
      line(ctx,[[lx,y+7],[lx,y],[lx+unit*.62,y]],colors.light,1.35);
    }
    line(ctx,[[x-3,y+12],[x+w+3,y+12]],colors.shadow,2);
  }
  if (kind === "keep" || kind === "tower") {
    const windows = kind === "keep" ? [w*.28,w*.72] : [w*.5];
    for (const wx of windows) {
      const wy=y+24;
      polygon(ctx, [[x+wx-4,wy+13],[x+wx-4,wy+4],[x+wx,wy],[x+wx+4,wy+4],[x+wx+4,wy+13]], "#172033",colors.shadow);
      line(ctx,[[x+wx+3,wy+6],[x+wx+3,wy+12]],"#ffbd6799",1);
    }
  }
  if (kind === "keep") {
    const cx=x+w*.5, cy=y+44;
    polygon(ctx,[[cx-8,cy],[cx+8,cy],[cx+8,cy+23],[cx,cy+29],[cx-8,cy+23]],colors.darkBanner,colors.banner);
    polygon(ctx,[[cx,cy+5],[cx+4,cy+12],[cx,cy+18],[cx-4,cy+12]],colors.banner);
    ctx.beginPath();
    ctx.moveTo(cx-10,y+h);
    ctx.lineTo(cx-10,y+h-17);
    ctx.quadraticCurveTo(cx,y+h-32,cx+10,y+h-17);
    ctx.lineTo(cx+10,y+h);
    ctx.fillStyle = colors.shadow;
    ctx.fill();
    ctx.strokeStyle = colors.light;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (lightlyDamaged) {
    line(ctx,[[x+w*.84,y+9],[x+w*.63,y+24],[x+w*.72,y+35],[x+w*.45,y+45],[x+w*.51,y+56],[x+w*.25,y+63]],"#211d27",2.5);
    if (health < max*.30) line(ctx,[[x+w*.66,y+28],[x+w*.44,y+24],[x+w*.40,y+19],[x+w*.20,y+18]],"#211d27",2.2);
  }
}
function flag(piece,side,clock) {
  const {x,y,w} = piece;
  const colors = palette[side];
  const cx=x+w*.5, cy=y-35, dir=side===0?-1:1;
  const wave=Math.sin(clock/170+x)*3;
  line(ctx,[[cx,y+5],[cx,cy-3]],"#ab9c88",2);
  circle(ctx,cx,cy-4,2,"#e5c291");
  polygon(ctx,[[cx,cy],[cx+dir*14,cy+2+wave],[cx+dir*35,cy+2-wave],[cx+dir*28,cy+9-wave],[cx+dir*36,cy+16-wave],[cx+dir*14,cy+17+wave],[cx,cy+14]],colors.darkBanner,colors.banner);
}
function sceneryDetail(world) {
  for (const x of [363,408,453,530,565,642,676,731,780,821]) {
    const y = Math.round(ridgeTop(x,world.round)/CELL)*CELL;
    const index = Math.floor((y+3)/CELL)*COLS+Math.floor(x/CELL);
    if (!world.terrain[index] && !world.terrain[index+COLS]) continue;
    const size = 10+noise(x)*19;
    pine(x,y+4,size,"#344356");
  }
}
function launcher(side,angle) {
  const x = side ? 928 : 272, direction = side ? -1 : 1;
  ctx.save();
  ctx.translate(x,362);
  ctx.scale(direction,1);
  polygon(ctx,[[-25,31],[-18,18],[-4,8],[15,11],[20,31]],"#433842","#8d7965");
  ctx.save();
  ctx.rotate(-angle*Math.PI/180);
  ctx.fillStyle="#303641";
  ctx.fillRect(-11,-5,34,13);
  ctx.fillStyle="#8a96a2";
  ctx.fillRect(-8,-5,27,3);
  ctx.fillStyle="#b69e7f";
  ctx.fillRect(16,-7,5,17);
  ctx.restore();
  for (const wheel of [-15,12]) {
    circle(ctx,wheel,23,8,"#201e28");
    circle(ctx,wheel,23,5,"#846e5b");
    circle(ctx,wheel,23,2,"#3e3438");
  }
  ctx.restore();
}
function bonusMark(bonus,clock) {
  const info = BONUS[bonus.kind];
  const pulse = 1.2 * Math.sin(clock/220+bonus.x);
  ctx.save();
  ctx.translate(bonus.x,bonus.y);
  ctx.shadowColor = info.color;
  ctx.shadowBlur = 14+pulse*3;
  polygon(ctx,[[0,-21-pulse],[21+pulse,0],[0,21+pulse],[-21-pulse,0]],"#202235",info.color);
  ctx.shadowBlur=0;
  polygon(ctx,[[0,-16],[16,0],[0,16],[-16,0]],"#23243b",info.color+"55");
  ctx.fillStyle=info.color;
  ctx.font=bonus.kind==="gate"?"800 16px system-ui":"800 19px system-ui";
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.fillText(info.symbol,0,1);
  ctx.restore();
}
function drawPreview(preview) {
  if (!preview?.length) return;
  for (let i=3; i<preview.length; i+=4) {
    const p = preview[i];
    circle(ctx,p.x,p.y,i%12===3?2.1:1.5,"#fce0a4d0");
  }
  const last = preview.at(-1);
  ctx.beginPath();
  ctx.arc(last.x,last.y,6,0,Math.PI*2);
  ctx.strokeStyle="#ffcf88";
  ctx.lineWidth=1.2;
  ctx.stroke();
}
function drawShot(active) {
  if (!active) return;
  const { trail, point, heavy, side } = active;
  const color = heavy ? "#c2eeff" : side ? "#ffa387" : "#ffe4a9";
  ctx.save();
  ctx.shadowBlur=12;
  ctx.shadowColor=color;
  for (let i=Math.max(0,point-10);i<point;i++) {
    const size=2.9-(point-i)/5;
    circle(ctx,trail[i].x,trail[i].y,size,color+"80");
  }
  circle(ctx,trail[point].x,trail[point].y,heavy?5:4,color);
  ctx.restore();
}
export function render(world, clock, preview, active, particles, labels, angle, enemyAngle) {
  ctx.clearRect(0,0,WIDTH,HEIGHT);
  ground();
  ctx.drawImage(rockLayer,0,0);
  sceneryDetail(world);
  for (const [side, pieces] of world.castles.entries()) {
    for (const piece of pieces) {
      if (piece.health) masonry(piece,palette[side]);
      else if (piece.kind !== "tower") {
        polygon(ctx,[[piece.x,GROUND],[piece.x+5,GROUND-6],[piece.x+12,GROUND-4],[piece.x+21,GROUND-10],[piece.x+29,GROUND-5],[piece.x+piece.w,GROUND]],palette[side].shadow);
      }
    }
    const rear = pieces.find(piece => piece.id === "rear-top" && piece.health);
    if (rear) flag(rear,side,clock);
  }
  launcher(0,angle);
  launcher(1,enemyAngle);
  drawPreview(preview);
  for (const bonus of world.bonuses) if (!bonus.used) bonusMark(bonus,clock);
  drawShot(active);
  for (const p of particles) {
    const life=1-(clock-p.time)/p.duration;
    const age=(clock-p.time)/1000;
    ctx.globalAlpha=life;
    const x=p.x+age*p.vx, y=p.y+age*p.vy+95*age*age;
    polygon(ctx, [[x-p.r,y],[x,y-p.r],[x+p.r,y],[x,y+p.r]],p.color);
  }
  ctx.globalAlpha=1;
  for (const label of labels) {
    const age=(clock-label.time)/label.duration;
    ctx.globalAlpha=Math.min(1,(1-age)*2);
    ctx.font="800 14px system-ui";
    ctx.textAlign="center";
    ctx.strokeStyle="#171522";
    ctx.lineWidth=3;
    ctx.strokeText(label.text,label.x,label.y-25*age);
    ctx.fillStyle=label.color;
    ctx.fillText(label.text,label.x,label.y-25*age);
  }
  ctx.globalAlpha=1;
}
