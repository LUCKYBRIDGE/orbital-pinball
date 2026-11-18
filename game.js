const elements = Object.fromEntries(
  [...document.querySelectorAll("[id]")].map(element => [element.id, element])
);
const canvas = elements.table;
const ctx = canvas.getContext("2d");
const width = canvas.width;
const height = canvas.height;
const radius = 8;
const lime = "#ddf47e";
const orange = "#ff805c";
const cream = "#fff1c8";

const bumpers = [
  { x: 125, y: 226, r: 35, color: orange, points: 150, hit: 0 },
  { x: 239, y: 160, r: 44, color: lime, points: 250, hit: 0 },
  { x: 330, y: 251, r: 34, color: orange, points: 150, hit: 0 }
];

const rim = [
  [27, 529], [27, 175], [47, 112], [91, 67], [149, 42], [237, 33],
  [333, 45], [397, 73], [440, 116], [452, 164], [452, 629]
];
const rails = [
  [408, 186, 408, 626],
  [27, 529, 123, 609], [408, 529, 315, 609]
];
const slings = [
  [52, 421, 119, 522, 54, 489],
  [382, 421, 315, 522, 380, 489]
];
const walls = [
  ...rim.slice(1).map(([x, y], i) => [...rim[i], x, y, 0.84]),
  ...rails.map(rail => [...rail, 0.78]),
  ...slings.flatMap(([x, y, u, v, m, n]) => [
    [x, y, u, v, 1.23], [u, v, m, n, 0.84], [m, n, x, y, 0.84]
  ])
];
const posts = [[73, 339], [362, 357], [135, 466], [300, 466]];
const flippers = [
  { x: 139, y: 566, sign: 1, rest: 0.30, up: -0.52, angle: 0.30, input: "left" },
  { x: 299, y: 566, sign: -1, rest: Math.PI - 0.30, up: Math.PI + 0.52, angle: Math.PI - 0.30, input: "right" }
];
const flipperLength = 58;
const keys = new Set();
const pointers = new Map();
const lit = new Set();
const particles = [];
const stars = Array.from({ length: 115 }, (_, i) => ({
  x: 26 + (i * 73.31) % 420,
  y: 32 + (i * 109.27) % 592,
  r: 0.65 + (i % 4) * 0.25,
  alpha: 0.16 + (i % 5) * 0.075
}));

let phase = "idle";
let beforePause = "ready";
let ball;
let score = 0;
let remaining = 3;
let record = readRecord();
let charge = 0;
let muted = true;
let audio;
let bonusTime = 0;

function readRecord() {
  try { return Math.max(0, Number(localStorage.getItem("orbital-record")) || 0); }
  catch { return 0; }
}

function addScore(points) {
  score += points;
  if (score > record) {
    record = score;
    try { localStorage.setItem("orbital-record", String(record)); } catch { /* Storage is optional. */ }
  }
  updateHud();
}

function updateHud() {
  elements.score.textContent = score.toLocaleString("ko-KR");
  elements.best.textContent = record.toLocaleString("ko-KR");
  elements.balls.textContent = Array.from({ length: 3 }, (_, i) => i < remaining ? "●" : "○").join(" ");
  elements.balls.setAttribute("aria-label", String(remaining));
  elements.mission.textContent = bonusTime > 0 ? "궤도 보너스 달성 · +1,000점" : "궤도 보너스 · 범퍼 " + lit.size + " / 3";
}

function overlay(title, message, label) {
  elements.heading.textContent = title;
  elements.message.textContent = message;
  elements.start.textContent = label;
  elements.cover.hidden = false;
}

function loadBall() {
  ball = { x: 430, y: 580, vx: 0, vy: 0, inLane: true, stuckTime: 0 };
  charge = 0;
  phase = "ready";
}

function startGame() {
  if (phase === "paused") {
    togglePause();
    return;
  }
  score = 0;
  remaining = 3;
  lit.clear();
  bonusTime = 0;
  particles.length = 0;
  bumpers.forEach(bumper => { bumper.hit = 0; });
  loadBall();
  updateHud();
  elements.cover.hidden = true;
  elements.pause.disabled = false;
  canvas.focus({ preventScroll: true });
}

function launchBall() {
  if (phase !== "ready") return;
  phase = "playing";
  ball.vy = -(745 + charge * 325);
  tone(280, 630, 0.13);
}

function drain() {
  remaining -= 1;
  updateHud();
  tone(180, 60, 0.3);
  if (remaining > 0) {
    loadBall();
    return;
  }
  phase = "over";
  ball = null;
  elements.pause.disabled = true;
  overlay("게임 오버", score.toLocaleString("ko-KR") + "점 · 최고 기록 " + record.toLocaleString("ko-KR") + "점", "다시 플레이");
}

function togglePause() {
  if (phase === "paused") {
    phase = beforePause;
    elements.cover.hidden = true;
    elements.pause.textContent = "일시정지";
    canvas.focus({ preventScroll: true });
    return;
  }
  if (phase !== "ready" && phase !== "playing") return;
  beforePause = phase;
  phase = "paused";
  clearInputs();
  elements.pause.textContent = "계속";
  overlay("일시정지", "준비되면 게임을 계속하세요.", "계속하기");
}

function tone(from, to, seconds) {
  if (muted || !audio || audio.state !== "running") return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(from, now);
  oscillator.frequency.exponentialRampToValueAtTime(to, now + seconds);
  gain.gain.setValueAtTime(0.09, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start();
  oscillator.stop(now + seconds);
}

function hitBumper(bumper) {
  if (bumper.hit > 0.12) return;
  bumper.hit = 0.23;
  lit.add(bumper);
  const completed = lit.size === bumpers.length;
  if (completed) {
    lit.clear();
    bonusTime = 2;
  }
  addScore(bumper.points + (completed ? 1000 : 0));
  tone(completed ? 430 : 190 + bumper.points, completed ? 920 : 160 + bumper.points, 0.14);
  particles.push({ x: bumper.x, y: bumper.y - bumper.r, text: "+" + bumper.points, life: 0.75 });
  if (completed) particles.push({ x: 217, y: 370, text: "+1,000", life: 1.05 });
}

function intersect(x, y, extraRadius, bounce, surfaceX = 0, surfaceY = 0) {
  const dx = ball.x - x;
  const dy = ball.y - y;
  const distance = Math.hypot(dx, dy);
  const separation = radius + extraRadius;
  if (distance >= separation) return false;
  const nx = distance > 0 ? dx / distance : 0;
  const ny = distance > 0 ? dy / distance : -1;
  ball.x = x + nx * separation;
  ball.y = y + ny * separation;
  const approach = (ball.vx - surfaceX) * nx + (ball.vy - surfaceY) * ny;
  if (approach >= 0) return false;
  ball.vx -= (1 + bounce) * approach * nx;
  ball.vy -= (1 + bounce) * approach * ny;
  return true;
}

function segment(x, y, u, v, thickness, bounce, angularSpeed = 0) {
  const dx = u - x;
  const dy = v - y;
  const t = Math.max(0, Math.min(1, ((ball.x - x) * dx + (ball.y - y) * dy) / (dx * dx + dy * dy)));
  return intersect(x + dx * t, y + dy * t, thickness, bounce, -dy * t * angularSpeed, dx * t * angularSpeed);
}

function isDown(action) {
  return keys.has(action) || [...pointers.values()].includes(action);
}

function advance(dt) {
  if (phase === "paused") return;
  if (bonusTime > 0) {
    bonusTime -= dt;
    if (bonusTime <= 0) updateHud();
  }
  for (const bumper of bumpers) bumper.hit = Math.max(0, bumper.hit - dt);
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].life -= dt;
    particles[i].y -= 36 * dt;
    if (particles[i].life <= 0) particles.splice(i, 1);
  }

  for (const f of flippers) {
    const target = isDown(f.input) ? f.up : f.rest;
    const change = Math.sign(target - f.angle) * Math.min(Math.abs(target - f.angle), 25 * dt);
    f.angle += change;
    f.angularSpeed = change / dt;
  }

  if (phase === "ready") {
    if (isDown("launch")) charge = Math.min(1, charge + dt * 1.25);
    ball.y = 580 + 24 * charge;
    return;
  }
  if (phase !== "playing") return;

  if (ball.inLane) {
    // The plunger lane bends into the top of the playfield.
    ball.y += ball.vy * dt;
    if (ball.y < 173) ball.x -= 325 * dt;
    if (ball.y < 101) {
      ball.inLane = false;
      ball.x = 388;
      ball.vx = -275 - 115 * charge;
      ball.vy = -155 - 110 * charge;
    }
    return;
  }

  ball.vy += 803 * dt;
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > 1080) {
    ball.vx *= 1080 / speed;
    ball.vy *= 1080 / speed;
  }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  for (const [x, y, u, v, bounce] of walls) segment(x, y, u, v, 4, bounce);
  for (const [x, y] of posts) intersect(x, y, 7, 0.88);
  for (const bumper of bumpers) {
    if (intersect(bumper.x, bumper.y, bumper.r, 1.15)) {
      const speedAfterHit = Math.hypot(ball.vx, ball.vy);
      if (speedAfterHit < 270) {
        const angle = Math.atan2(ball.y - bumper.y, ball.x - bumper.x);
        ball.vx += Math.cos(angle) * 175;
        ball.vy += Math.sin(angle) * 175;
      }
      hitBumper(bumper);
    }
  }
  for (const f of flippers) {
    const u = f.x + Math.cos(f.angle) * flipperLength;
    const v = f.y + Math.sin(f.angle) * flipperLength;
    if (segment(f.x, f.y, u, v, 10, 0.73, f.angularSpeed) && isDown(f.input)
        && ball.y < f.y + 7 && f.angularSpeed * f.sign < 0) {
      ball.vy = Math.min(ball.vy, -455);
      ball.vx += f.sign * 90;
      tone(130, 85, 0.06);
    }
  }
  // Free a ball that comes to rest between two colliders.
  ball.stuckTime = Math.hypot(ball.vx, ball.vy) < 25 ? ball.stuckTime + dt : 0;
  if (ball.stuckTime > 0.7) {
    ball.vx = ball.x < 219 ? 205 : -205;
    ball.vy = -315;
    ball.stuckTime = 0;
  }
  if (ball.y > height + 10 || ball.x < -20 || ball.x > width + 20) drain();
}

function path(points, stroke, weight, fill) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  if (fill) {
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = weight;
  ctx.stroke();
}

function circle(x, y, r, fill, stroke, weight = 1) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = weight;
    ctx.stroke();
  }
}

function label(text, x, y, size, color, weight = 700) {
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = weight + " " + size + "px ui-monospace, monospace";
  ctx.fillText(text, x, y);
}

function drawBackdrop() {
  const gradient = ctx.createRadialGradient(220, 285, 12, 220, 285, 390);
  gradient.addColorStop(0, "#434b2f");
  gradient.addColorStop(1, "#22291b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  for (const star of stars) {
    ctx.globalAlpha = star.alpha;
    circle(star.x, star.y, star.r, cream);
  }
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(212, 306);
  ctx.rotate(-0.37);
  for (const scale of [1, 1.13, 1.27]) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 162 * scale, 72 * scale, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#c3d28145";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
  circle(214, 316, 42, "#d87a55", "#ffbd82", 2);
  ctx.save();
  ctx.beginPath();
  ctx.arc(214, 316, 41, 0, Math.PI * 2);
  ctx.clip();
  for (let x = 160; x < 282; x += 11) {
    path([[x - 40, 368], [x + 40, 259]], "#f5a676", 3);
  }
  ctx.restore();

  label("O R B I T A L", 216, 409, 25, cream, 900);
  label("P I N B A L L", 217, 440, 11, "#cfdaa9");
  for (let i = 0; i < 3; i++) circle(201 + 16 * i, 474, 3, i < lit.size || bonusTime > 0 ? lime : "#6d7651");

  path(rim, "#131a12", 20);
  path(rim, "#9ca86a", 8);
  path(rim, "#f2e7af", 2);
  for (const [x, y, u, v] of rails) {
    path([[x, y], [u, v]], "#141b13", 13);
    path([[x, y], [u, v]], "#a3ad70", 5);
  }
  for (const [x, y, u, v, m, n] of slings) {
    path([[x, y], [u, v], [m, n]], "#f2a57b", 3, "#6b4532");
    path([[x + (x < 200 ? 7 : -7), y + 23], [u + (u < 200 ? -13 : 13), v - 22]], orange, 3);
  }
  for (const [x, y] of posts) {
    circle(x, y, 10, "#20281b");
    circle(x, y, 6, "#f2e3b7", "#9fa96d", 2);
  }

  path([[419, 624], [442, 624]], "#9fa96d", 3);
  path([[419, 610], [442, 610]], charge > 0.1 ? lime : "#6f7851", 3);
  label("↑", 430, 548, 19, lime);
}

function draw() {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawBackdrop();

  for (const bumper of bumpers) {
    const { x, y, r, color, points, hit } = bumper;
    circle(x + 2, y + 5, r + 6, "#171d15");
    circle(x, y, r + 3, "#373f28", color, 3);
    circle(x, y, r - 5, hit > 0 ? cream : color, "#252c1d", 2);
    circle(x, y, r - 11, null, "#2a311f", 1);
    label(String(points), x, y, 18, "#232918", 900);
    if (lit.has(bumper) || bonusTime > 0) circle(x, y - r + 7, 3, "#fff8d0");
  }

  for (const f of flippers) {
    const x = f.x + Math.cos(f.angle) * flipperLength;
    const y = f.y + Math.sin(f.angle) * flipperLength;
    path([[f.x, f.y + 3], [x, y + 3]], "#151a13", 26);
    path([[f.x, f.y], [x, y]], isDown(f.input) ? lime : orange, 20);
    path([[f.x, f.y - 3], [x, y - 3]], "#fff0c4", 2);
    circle(f.x, f.y, 5, "#414831", cream, 1);
  }

  if (ball) {
    const { x, y } = ball;
    circle(x + 2.5, y + 3.5, radius + 1, "#1118");
    const silver = ctx.createRadialGradient(x - 3, y - 4, 0, x, y, radius);
    silver.addColorStop(0, "#ffffff");
    silver.addColorStop(0.52, "#e9ebda");
    silver.addColorStop(1, "#888e75");
    circle(x, y, radius, silver);
  }
  for (const particle of particles) {
    ctx.globalAlpha = Math.min(1, particle.life * 3);
    label(particle.text, particle.x, particle.y, 17, cream, 900);
  }
  ctx.globalAlpha = 1;
}

function syncButtons() {
  for (const action of ["left", "right", "launch"]) {
    elements[action].dataset.down = String(isDown(action));
  }
}

function clearInputs() {
  keys.clear();
  pointers.clear();
  charge = 0;
  syncButtons();
}

function release(action) {
  if (action === "launch" && !isDown(action)) launchBall();
  syncButtons();
}

const bindings = { ArrowLeft: "left", ArrowRight: "right", Space: "launch" };
document.addEventListener("keydown", event => {
  if (event.code === "KeyP" && !event.repeat) togglePause();
  const action = bindings[event.code];
  if (!action || (action === "launch" && event.target instanceof HTMLButtonElement)) return;
  event.preventDefault();
  if (phase !== "ready" && phase !== "playing") return;
  keys.add(action);
  syncButtons();
});
document.addEventListener("keyup", event => {
  const action = bindings[event.code];
  if (!keys.delete(action)) return;
  event.preventDefault();
  release(action);
});
for (const action of ["left", "right", "launch"]) {
  const button = elements[action];
  button.addEventListener("pointerdown", event => {
    if (phase !== "ready" && phase !== "playing") return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, action);
    syncButtons();
  });
  button.addEventListener("pointerup", event => {
    if (pointers.delete(event.pointerId)) release(action);
  });
  for (const type of ["pointercancel", "lostpointercapture"]) {
    button.addEventListener(type, event => {
      if (!pointers.delete(event.pointerId)) return;
      if (action === "launch") charge = 0;
      syncButtons();
    });
  }
  button.addEventListener("click", event => {
    if (event.detail === 0 && action === "launch") launchBall();
  });
}
elements.start.addEventListener("click", startGame);
elements.pause.addEventListener("click", togglePause);
elements.sound.addEventListener("click", async () => {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  muted = !muted;
  elements.sound.textContent = muted ? "소리 켜기" : "소리 끄기";
  elements.sound.setAttribute("aria-pressed", String(!muted));
  if (!muted) {
    audio ??= new Audio();
    try { await audio.resume(); } catch { return; }
    tone(300, 580, 0.12);
  }
});
window.addEventListener("blur", () => {
  clearInputs();
  if (phase === "playing") togglePause();
});

updateHud();
let lastTime;
let carry = 0;
const step = 1 / 240;
function frame(time) {
  carry += Math.min(0.05, (time - (lastTime ?? time)) / 1000);
  lastTime = time;
  while (carry >= step) {
    advance(step);
    carry -= step;
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

