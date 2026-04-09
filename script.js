const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const hpEl = document.getElementById("hp");
const bestEl = document.getElementById("best");
const overlayEl = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const KEY_FIRE = [" ", "Spacebar", "Space"];
const PLAYER_SIZE = { w: 46, h: 54 };

const state = {
  running: false,
  score: 0,
  bestScore: Number(localStorage.getItem("air-war-best-score") || 0),
  lastTime: 0,
  enemyTimer: 0,
  fireTimer: 0,
  powerTimer: 0,
  stars: [],
  bullets: [],
  enemies: [],
  powers: [],
  explosions: [],
  pressed: new Set(),
  pointerDown: false,
  pointerOffsetX: 0,
  pointerOffsetY: 0,
};

const player = {
  x: WIDTH / 2 - PLAYER_SIZE.w / 2,
  y: HEIGHT - 100,
  w: PLAYER_SIZE.w,
  h: PLAYER_SIZE.h,
  speed: 320,
  hp: 3,
  fireCooldown: 180,
  doubleShot: false,
  hitFlash: 0,
};

init();

function init() {
  buildStars();
  bindEvents();
  updateHud();
  showOverlay("飞机大战", "开始游戏");
  requestAnimationFrame(gameLoop);
}

function bindEvents() {
  startBtn.addEventListener("click", startGame);

  window.addEventListener("keydown", (e) => {
    if (KEY_FIRE.includes(e.key)) {
      e.preventDefault();
    }
    state.pressed.add(e.key);
  });

  window.addEventListener("keyup", (e) => {
    state.pressed.delete(e.key);
  });

  const handlePointerDown = (event) => {
    if (!state.running) return;
    state.pointerDown = true;
    const point = pointerPos(event);
    state.pointerOffsetX = point.x - player.x;
    state.pointerOffsetY = point.y - player.y;
  };

  const handlePointerMove = (event) => {
    if (!state.running || !state.pointerDown) return;
    const point = pointerPos(event);
    player.x = clamp(point.x - state.pointerOffsetX, 0, WIDTH - player.w);
    player.y = clamp(point.y - state.pointerOffsetY, 0, HEIGHT - player.h);
  };

  const handlePointerUp = () => {
    state.pointerDown = false;
  };

  canvas.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", handlePointerUp);
}

function startGame() {
  state.running = true;
  state.score = 0;
  state.enemyTimer = 0;
  state.fireTimer = 0;
  state.powerTimer = 0;
  state.bullets = [];
  state.enemies = [];
  state.powers = [];
  state.explosions = [];
  player.x = WIDTH / 2 - player.w / 2;
  player.y = HEIGHT - 100;
  player.hp = 3;
  player.doubleShot = false;
  player.hitFlash = 0;
  hideOverlay();
  updateHud();
}

function gameOver() {
  state.running = false;
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem("air-war-best-score", String(state.bestScore));
  }
  updateHud();
  showOverlay(`游戏结束\n得分: ${state.score}`, "重新开始");
}

function gameLoop(timestamp) {
  const rawDelta = timestamp - state.lastTime;
  const delta = Math.min(40, Number.isFinite(rawDelta) ? rawDelta : 16);
  state.lastTime = timestamp;

  update(delta);
  render();
  requestAnimationFrame(gameLoop);
}

function update(delta) {
  animateStars(delta);
  updateExplosions(delta);

  if (!state.running) return;

  updateInput(delta);
  updateFire(delta);
  spawnEnemies(delta);
  spawnPowerup(delta);
  updateBullets(delta);
  updateEnemies(delta);
  updatePowers(delta);
  resolveCollisions();

  if (player.hitFlash > 0) {
    player.hitFlash = Math.max(0, player.hitFlash - delta);
  }

  updateHud();
}

function updateInput(delta) {
  const dt = delta / 1000;
  const left = state.pressed.has("ArrowLeft") || state.pressed.has("a") || state.pressed.has("A");
  const right = state.pressed.has("ArrowRight") || state.pressed.has("d") || state.pressed.has("D");
  const up = state.pressed.has("ArrowUp") || state.pressed.has("w") || state.pressed.has("W");
  const down = state.pressed.has("ArrowDown") || state.pressed.has("s") || state.pressed.has("S");

  if (left) player.x -= player.speed * dt;
  if (right) player.x += player.speed * dt;
  if (up) player.y -= player.speed * dt;
  if (down) player.y += player.speed * dt;

  player.x = clamp(player.x, 0, WIDTH - player.w);
  player.y = clamp(player.y, 0, HEIGHT - player.h);
}

function updateFire(delta) {
  state.fireTimer += delta;
  const autoFire = state.pressed.has("k") || state.pressed.has("K") || KEY_FIRE.some((k) => state.pressed.has(k));
  if (!autoFire || state.fireTimer < player.fireCooldown) return;

  state.fireTimer = 0;
  const baseY = player.y - 8;
  if (player.doubleShot) {
    state.bullets.push(
      { x: player.x + 12, y: baseY, w: 6, h: 16, speed: 520, damage: 1 },
      { x: player.x + player.w - 18, y: baseY, w: 6, h: 16, speed: 520, damage: 1 }
    );
  } else {
    state.bullets.push({ x: player.x + player.w / 2 - 3, y: baseY, w: 6, h: 16, speed: 500, damage: 1 });
  }
}

function spawnEnemies(delta) {
  state.enemyTimer += delta;
  const level = Math.floor(state.score / 25);
  const interval = clamp(920 - level * 40, 380, 920);
  if (state.enemyTimer < interval) return;
  state.enemyTimer = 0;

  const heavyChance = Math.min(0.4, 0.12 + level * 0.03);
  const heavy = Math.random() < heavyChance;
  if (heavy) {
    const w = 62;
    const h = 74;
    const x = rand(0, WIDTH - w);
    state.enemies.push({
      kind: "heavy",
      x,
      y: -h,
      w,
      h,
      hp: 4 + Math.floor(level / 3),
      speed: 120 + level * 6,
      score: 8,
    });
  } else {
    const w = 44;
    const h = 52;
    const x = rand(0, WIDTH - w);
    state.enemies.push({
      kind: "light",
      x,
      y: -h,
      w,
      h,
      hp: 1,
      speed: 180 + level * 10,
      score: 3,
    });
  }
}

function spawnPowerup(delta) {
  state.powerTimer += delta;
  if (state.powerTimer < 9000) return;
  state.powerTimer = 0;

  const type = Math.random() < 0.65 ? "double" : "heal";
  const x = rand(24, WIDTH - 24);
  state.powers.push({
    type,
    x,
    y: -24,
    r: 14,
    speed: 125,
  });
}

function updateBullets(delta) {
  const dt = delta / 1000;
  for (const bullet of state.bullets) {
    bullet.y -= bullet.speed * dt;
  }
  state.bullets = state.bullets.filter((b) => b.y + b.h > 0);
}

function updateEnemies(delta) {
  const dt = delta / 1000;
  for (const enemy of state.enemies) {
    enemy.y += enemy.speed * dt;
  }

  const remain = [];
  for (const enemy of state.enemies) {
    if (enemy.y > HEIGHT + enemy.h) {
      hurtPlayer();
      continue;
    }
    remain.push(enemy);
  }
  state.enemies = remain;
}

function updatePowers(delta) {
  const dt = delta / 1000;
  for (const power of state.powers) {
    power.y += power.speed * dt;
  }
  state.powers = state.powers.filter((p) => p.y - p.r < HEIGHT + 18);
}

function resolveCollisions() {
  for (const bullet of state.bullets) {
    for (const enemy of state.enemies) {
      if (!overlap(bullet, enemy)) continue;
      enemy.hp -= bullet.damage;
      bullet.used = true;
      if (enemy.hp <= 0) {
        enemy.dead = true;
        state.score += enemy.score;
        createExplosion(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, {
          count: enemy.kind === "heavy" ? 28 : 16,
          sizeMin: enemy.kind === "heavy" ? 3 : 2,
          sizeMax: enemy.kind === "heavy" ? 8 : 5,
          speedMin: enemy.kind === "heavy" ? 70 : 55,
          speedMax: enemy.kind === "heavy" ? 290 : 220,
          lifeMin: enemy.kind === "heavy" ? 420 : 300,
          lifeMax: enemy.kind === "heavy" ? 760 : 560,
          colors: enemy.kind === "heavy" ? ["#ffd2a0", "#ff9d6b", "#ff6f4d"] : ["#ffd7ea", "#ff8eb2", "#ff6c8b"],
        });
      }
      break;
    }
  }

  state.bullets = state.bullets.filter((b) => !b.used);
  state.enemies = state.enemies.filter((e) => !e.dead);

  for (const enemy of state.enemies) {
    if (overlap(player, enemy)) {
      enemy.dead = true;
      createExplosion(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, {
        count: enemy.kind === "heavy" ? 22 : 14,
        sizeMin: 2,
        sizeMax: 7,
        speedMin: 70,
        speedMax: 250,
        lifeMin: 260,
        lifeMax: 520,
        colors: ["#ffe3b8", "#ff9d6b", "#f95272"],
      });
      hurtPlayer();
    }
  }
  state.enemies = state.enemies.filter((e) => !e.dead);

  for (const power of state.powers) {
    if (!circleRectOverlap(power, player)) continue;
    power.used = true;
    if (power.type === "heal") {
      player.hp = Math.min(5, player.hp + 1);
      createExplosion(power.x, power.y, {
        count: 10,
        sizeMin: 2,
        sizeMax: 4,
        speedMin: 45,
        speedMax: 150,
        lifeMin: 220,
        lifeMax: 420,
        colors: ["#79e6b2", "#bff6de", "#dfffee"],
      });
    } else {
      player.doubleShot = true;
      player.fireCooldown = 120;
      createExplosion(power.x, power.y, {
        count: 12,
        sizeMin: 2,
        sizeMax: 5,
        speedMin: 50,
        speedMax: 170,
        lifeMin: 240,
        lifeMax: 450,
        colors: ["#b998ff", "#d9c7ff", "#f1ebff"],
      });
      setTimeout(() => {
        player.doubleShot = false;
        player.fireCooldown = 180;
      }, 7000);
    }
  }
  state.powers = state.powers.filter((p) => !p.used);
}

function hurtPlayer() {
  player.hp -= 1;
  player.hitFlash = 180;
  createExplosion(player.x + player.w / 2, player.y + player.h / 2, {
    count: 20,
    sizeMin: 2,
    sizeMax: 7,
    speedMin: 80,
    speedMax: 300,
    lifeMin: 260,
    lifeMax: 520,
    colors: ["#ffb3b3", "#ff8e8e", "#ff6b6b", "#ffdca8"],
  });
  if (player.hp <= 0) {
    player.hp = 0;
    gameOver();
  }
}

function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawStars();
  drawPlayer();
  drawBullets();
  drawEnemies();
  drawPowers();
  drawExplosions();
}

function buildStars() {
  state.stars = [];
  for (let i = 0; i < 90; i += 1) {
    state.stars.push({
      x: rand(0, WIDTH),
      y: rand(0, HEIGHT),
      r: rand(0.7, 2.4),
      speed: rand(30, 130),
      alpha: rand(0.25, 0.95),
    });
  }
}

function animateStars(delta) {
  const dt = delta / 1000;
  for (const star of state.stars) {
    star.y += star.speed * dt;
    if (star.y > HEIGHT + 2) {
      star.y = -2;
      star.x = rand(0, WIDTH);
    }
  }
}

function drawStars() {
  for (const star of state.stars) {
    ctx.beginPath();
    ctx.fillStyle = `rgba(220, 235, 255, ${star.alpha})`;
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer() {
  const x = player.x;
  const y = player.y;
  const mid = x + player.w / 2;
  const flash = player.hitFlash > 0 ? "#ff8e8e" : "#7bd4ff";

  ctx.fillStyle = flash;
  ctx.beginPath();
  ctx.moveTo(mid, y);
  ctx.lineTo(x + player.w, y + player.h);
  ctx.lineTo(x, y + player.h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#d8f3ff";
  ctx.fillRect(mid - 4, y + 10, 8, 18);

  ctx.fillStyle = "#4ca9db";
  ctx.fillRect(x + 3, y + player.h - 11, 12, 7);
  ctx.fillRect(x + player.w - 15, y + player.h - 11, 12, 7);
}

function drawBullets() {
  ctx.fillStyle = "#ffe7a3";
  for (const bullet of state.bullets) {
    ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h);
  }
}

function drawEnemies() {
  for (const enemy of state.enemies) {
    if (enemy.kind === "heavy") {
      ctx.fillStyle = "#ff9d6b";
      ctx.fillRect(enemy.x, enemy.y, enemy.w, enemy.h);
      ctx.fillStyle = "#872d15";
      ctx.fillRect(enemy.x + 8, enemy.y + 14, enemy.w - 16, 12);
    } else {
      ctx.fillStyle = "#ff6c8b";
      ctx.beginPath();
      ctx.moveTo(enemy.x + enemy.w / 2, enemy.y);
      ctx.lineTo(enemy.x + enemy.w, enemy.y + enemy.h);
      ctx.lineTo(enemy.x, enemy.y + enemy.h);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawPowers() {
  for (const power of state.powers) {
    ctx.beginPath();
    ctx.fillStyle = power.type === "heal" ? "#79e6b2" : "#b998ff";
    ctx.arc(power.x, power.y, power.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#10213f";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(power.type === "heal" ? "+" : "2x", power.x, power.y + 0.5);
  }
}

function createExplosion(x, y, options) {
  const {
    count = 14,
    sizeMin = 2,
    sizeMax = 5,
    speedMin = 60,
    speedMax = 240,
    lifeMin = 260,
    lifeMax = 560,
    colors = ["#ffe7a3", "#ff9f7a", "#ff5d70"],
  } = options || {};

  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(speedMin, speedMax);
    const life = rand(lifeMin, lifeMax);
    state.explosions.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: rand(sizeMin, sizeMax),
      drag: rand(0.88, 0.96),
      gravity: rand(18, 50),
      life,
      maxLife: life,
      color: colors[Math.floor(rand(0, colors.length))],
    });
  }
}

function updateExplosions(delta) {
  const dt = delta / 1000;
  for (const particle of state.explosions) {
    particle.life -= delta;
    particle.vx *= particle.drag;
    particle.vy = particle.vy * particle.drag + particle.gravity * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.size *= 0.995;
  }
  state.explosions = state.explosions.filter((particle) => particle.life > 0 && particle.size > 0.25);
}

function drawExplosions() {
  for (const particle of state.explosions) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = hexToRgba(particle.color, alpha);
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function updateHud() {
  scoreEl.textContent = String(state.score);
  hpEl.textContent = String(player.hp);
  bestEl.textContent = String(state.bestScore);
}

function showOverlay(title, btnText) {
  const lines = title.split("\n");
  overlayEl.querySelector("h1").innerHTML = lines.map((line) => escapeHtml(line)).join("<br />");
  startBtn.textContent = btnText;
  overlayEl.classList.add("visible");
}

function hideOverlay() {
  overlayEl.classList.remove("visible");
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleRectOverlap(circle, rect) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.h);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy <= circle.r * circle.r;
}

function pointerPos(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = WIDTH / rect.width;
  const scaleY = HEIGHT / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function hexToRgba(hex, alpha) {
  const raw = hex.replace("#", "");
  const value = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
  const int = Number.parseInt(value, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
