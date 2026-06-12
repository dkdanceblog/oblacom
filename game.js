
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const SFX = {
  like: new Audio('assets/like.mp3'),
  slippers: new Audio('assets/slippers.mp3'),
  storm: new Audio('assets/storm.mp3')
};

SFX.like.volume = 0.05;
SFX.slippers.volume = 0.07;
SFX.storm.volume = 0.05;

for (const s of Object.values(SFX)) {
  s.preload = 'auto';
  s.load();
}

let audioUnlocked = false;

function unlockSfx() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  // Мобильные браузеры иногда не дают SFX, пока каждый звук не был "разбужен"
  // внутри пользовательского клика.
  for (const s of Object.values(SFX)) {
    try {
      const oldVolume = s.volume;
      s.volume = 0;
      const p = s.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          s.pause();
          s.currentTime = 0;
          s.volume = oldVolume;
        }).catch(() => {
          s.volume = oldVolume;
        });
      } else {
        s.pause();
        s.currentTime = 0;
        s.volume = oldVolume;
      }
    } catch (e) {}
  }
}

function playSfx(sound) {
  try {
    if (!sound || !sound.src) return;
    const clone = sound.cloneNode();
    clone.volume = sound.volume;
    clone.preload = 'auto';
    const p = clone.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) {}
}





const bgMusic = new Audio('assets/audio.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.10;

let musicStarted = false;
function startMusic() {
  unlockSfx();
  if (musicStarted) return;
  musicStarted = true;
  bgMusic.play().catch(() => {
    musicStarted = false;
  });
}


const W = canvas.width;
const H = canvas.height;

const TARGET_FRAME_MS = 1000 / 60;

// Нормализация скорости: физика не зависит от 60/90/120 Гц.
// Управление отдельно сглаживается по целевой позиции пальца.
let lastFrameTime = 0;
let loopStarted = false;

const PAUSE_BTN = { x: W - 86, y: 82, w: 56, h: 56 };

const ASSET_PATHS = {
  bg: 'assets/background.png',
  start: 'assets/start.png',
  ending: 'assets/ending.png',
  like: 'assets/like.png',
  slippers: 'assets/slippers.png',

  cloud1: 'assets/oblako usual.png',
  cloud2: 'assets/oblako usual 2.png',
  spring: 'assets/prushina oblako.png',
  storm: 'assets/oblako black.png',

  front: 'assets/solova player aset.png',
  side: 'assets/solova player aset sboku.png',
  back: 'assets/solova player aset szadi.png'
};

const img = {};
let loaded = 0;
const total = Object.keys(ASSET_PATHS).length;

for (const [key, src] of Object.entries(ASSET_PATHS)) {
  img[key] = new Image();
  img[key].src = encodeURI(src);
  img[key].onload = () => {
    loaded++;
    if (loaded === total) init();
  };
  img[key].onerror = () => {
    console.warn('Не загрузился ассет:', src);
    loaded++;
    if (loaded === total) init();
  };
}

let state = 'loading';
let keys = {};
let platforms = [];
let pickups = [];
let slippers = [];
let letters = [];
let particles = [];
let bolts = [];
let milestoneText = null;
let boostReadyFlash = 0;
let touchStartX = null;
let touchTargetX = null;
let isTouching = false;
let lastTouchX = null;

let score = 0;
let likes = 0;
let record = Number(localStorage.getItem('oblacom_record') || 0);
let cameraY = 0;
let highest = 0;

const PLAYER_BOX_W = 96;
const PLAYER_BOX_H = 96;
const CLOUD_W = 160;
const CLOUD_H = 80;
const LIKE_SIZE = 48;

const START_Y = 990;
const FINISH_SCORE = 200000;

const player = {
  x: W / 2 - PLAYER_BOX_W / 2,
  y: START_Y,
  w: PLAYER_BOX_W,
  h: PLAYER_BOX_H,
  vx: 0,
  vy: -12,
  facing: 1,
  prevY: START_Y,
  onStorm: null
};

function rnd(a, b) {
  return a + Math.random() * (b - a);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function zoneByHeight(h) {
  if (h < 500) return 0;
  if (h < 1200) return 1;
  return 2;
}

function milestoneForScore(s) {
  return Math.floor(s / 100000) * 100000;
}

function showMilestone(m) {
  if (m <= 0) return;
  milestoneText = { text: 'ЦВЕТНЫЕ БЕРЕГА ВСЁ БЛИЖЕ', life: 115 };
  burst(W / 2, H * 0.28 + cameraY, '#fff2ff', 26);
}

function activateLikeBonus() {
  if (likes > 0 && likes % 10 === 0) {
    boostReadyFlash = 90;
    player.vy = Math.min(player.vy, -21); // каждые 10 лайков = только супер-прыжок
    burst(player.x + player.w / 2, player.y + player.h / 2, '#ff6bb7', 22);
  }
}

function init() {
  state = 'menu';
  if (loopStarted) return;
  loopStarted = true;
  requestAnimationFrame(loop);
}

function makePlatform(x, y, type = 'normal') {
  return {
    x, y,
    w: CLOUD_W,
    h: CLOUD_H,
    type,
    alpha: 1,
    touchedAt: null,
    falling: false,
    fallVy: 0,
    variant: Math.random() < 0.5 ? 1 : 2
  };
}

function reset() {
  state = 'play';
  lastFrameTime = 0;
  isTouching = false;
  touchTargetX = null;

  score = 0;
  likes = 0;
  highest = 0;
  player.lastScoreMilestone = 0;
  cameraY = 0;

  platforms = [];
  pickups = [];
  slippers = [];
  letters = [];
  particles = [];
  bolts = [];

  player.x = W / 2 - PLAYER_BOX_W / 2;
  player.y = START_Y;
  player.prevY = START_Y;
  player.vx = 0;
  player.vy = -14;
  player.facing = 1;
  player.onStorm = null;

  // Стартовое облако: игрок гарантированно начинает НА нём, не падает сразу
  platforms.push(makePlatform(W / 2 - CLOUD_W / 2, START_Y + 88, 'normal'));

  // Первые несколько платформ безопасные, дальше уже рандом
  let y = START_Y + 88;
  for (let i = 1; i < 10; i++) {
    y -= i < 4 ? 76 : rnd(82, 102);
    spawnPlatform(y, i < 4);
  }
}

function spawnPlatform(y, safe = false) {
  const z = zoneByHeight(highest);

  let types;
  if (safe || z === 0) {
    types = ['normal', 'normal', 'normal', 'normal', 'spring'];
  } else if (z === 1) {
    types = ['normal', 'normal', 'normal', 'spring', 'storm'];
  } else {
    types = ['normal', 'normal', 'spring', 'storm'];
  }

  const type = types[Math.floor(Math.random() * types.length)];

  let margin = 24;
  let maxDx = z === 0 ? 150 : z === 1 ? 185 : 215;

  let x;
  const last = platforms[platforms.length - 1];

  if (last) {
    x = last.x + rnd(-maxDx, maxDx);
    x = clamp(x, margin, W - CLOUD_W - margin);

    // если после clamp получилось почти то же место — чуть сдвигаем, но не слишком далеко
    if (Math.abs(x - last.x) < 55) {
      x += last.x < W / 2 ? rnd(70, 130) : -rnd(70, 130);
      x = clamp(x, margin, W - CLOUD_W - margin);
    }
  } else {
    x = rnd(margin, W - CLOUD_W - margin);
  }

  const p = makePlatform(x, y, type);

  // На высокой зоне платформы становятся чуть уже, но не настолько, чтобы ломать маршрут
  if (z >= 2 && Math.random() < 0.35) {
    p.w = 145;
  }

  platforms.push(p);

  // Лайки немного сбоку, но не слишком далеко, чтобы не провоцировать невозможные прыжки
  if (type !== 'storm' && Math.random() < (z === 0 ? 0.35 : 0.55)) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const riskyOffset = z === 0 ? 0 : side * rnd(24, 58);
    pickups.push({
      x: clamp(p.x + p.w / 2 - LIKE_SIZE / 2 + riskyOffset, 8, W - LIKE_SIZE - 8),
      y: p.y - 42,
      w: LIKE_SIZE,
      h: LIKE_SIZE,
      got: false,
      float: rnd(0, Math.PI * 2)
    });
  }
  // Редкий бонус: тапочки. Подобрал — очень высокий прыжок.
  if (!safe && type !== 'storm' && Math.random() < 0.055) {
    slippers.push({
      x: clamp(p.x + p.w / 2 - 24, 8, W - 56),
      y: p.y - 54,
      w: 48,
      h: 48,
      got: false,
      float: rnd(0, Math.PI * 2)
    });
  }

}

function ensurePlatforms() {
  let top = Math.min(...platforms.map(p => p.y));
  while (top > cameraY - 140) {
    top -= zoneByHeight(highest) >= 2 ? rnd(92, 116) : zoneByHeight(highest) === 1 ? rnd(86, 108) : rnd(76, 96);
    spawnPlatform(top, false);
  }

  platforms = platforms.filter(p => p.y < cameraY + H + 180 && p.alpha > 0.02);
  pickups = pickups.filter(o => o.y < cameraY + H + 180 && !o.got);
  slippers = slippers.filter(o => o.y < cameraY + H + 180 && !o.got);
}

function hitPlatform(pl) {
  const oldFeet = player.prevY + player.h;
  const newFeet = player.y + player.h;

  const playerLeft = player.x + player.w * 0.22;
  const playerRight = player.x + player.w * 0.78;

  const cloudTop = pl.y + 18;
  const cloudLeft = pl.x + 14;
  const cloudRight = pl.x + pl.w - 14;

  return (
    player.vy > 0 &&
    oldFeet <= cloudTop &&
    newFeet >= cloudTop &&
    playerRight > cloudLeft &&
    playerLeft < cloudRight &&
    !pl.falling
  );
}

function update(dt = 1) {
  if (state !== 'play') return;

  player.prevY = player.y;

  const left = keys.ArrowLeft || keys.KeyA;
  const right = keys.ArrowRight || keys.KeyD;

  if (isTouching && touchTargetX !== null) {
    // Как в первых версиях: палец задаёт позицию.
    // Но теперь не рывок, а плавное приближение к цели.
    const center = player.x + player.w / 2;
    const diff = touchTargetX - center;
    const desiredVx = clamp(diff * 0.035, -7.8, 7.8);
    const follow = 1 - Math.pow(0.78, dt);
    player.vx += (desiredVx - player.vx) * follow;
  } else {
    if (left) player.vx -= 0.9 * dt;
    if (right) player.vx += 0.9 * dt;
    player.vx *= Math.pow(0.88, dt);
    player.vx = clamp(player.vx, -10.5, 10.5);
  }

  player.x += player.vx * dt;
  player.vy += 0.45 * dt;
  player.y += player.vy * dt;

  if (player.vx > 0.15) player.facing = 1;
  if (player.vx < -0.15) player.facing = -1;

  // Без бесконечного вылета за края: упёрлась в край — остаётся в поле
  if (player.x < 0) {
    player.x = 0;
    player.vx *= -0.15;
  }
  if (player.x + player.w > W) {
    player.x = W - player.w;
    player.vx *= -0.15;
  }

  for (const pl of platforms) {
    if (hitPlatform(pl)) {
      if (pl.type === 'spring') {
        player.vy = -18.5;
        burst(player.x + player.w / 2, pl.y, '#fff4ff', 12);
      } else {
        player.vy = -14.2;
        burst(player.x + player.w / 2, pl.y, '#ffffff', 8);
      }

      if (pl.type === 'storm' && pl.touchedAt === null) {
        // Чёрная туча работает как платформа: игрок отскакивает,
        // а уже сама туча падает вниз и оставляет молнию.
        player.y = pl.y - player.h - 2;
        player.vy = -15.2;

        playSfx(SFX.storm);
        pl.touchedAt = performance.now();
        pl.falling = true;
        pl.fallVy = 1.8;
        player.onStorm = pl;

        // Молния появляется ниже тучи, не прямо в точке отскока,
        // чтобы игрок не "исчезал" сразу после касания.
        bolts.push({
          x: pl.x + pl.w / 2,
          y: pl.y + pl.h + 18,
          life: 180,
          warning: 38
        });

        burst(pl.x + pl.w / 2, pl.y + 30, '#333655', 18);
      }
    }
  }

  // Чёрная туча падает сразу после первого касания
  for (const pl of platforms) {
    if (pl.falling) {
      pl.fallVy += 0.32 * dt;
      pl.y += pl.fallVy * dt;
      pl.alpha -= 0.014 * dt;
    }
  }

  for (const b of bolts) {
    b.life -= dt;
    if (b.warning > 0) b.warning -= dt;

    if (b.warning <= 0) {
      const sx = b.x - 12;
      const sy = b.y - cameraY;
      const px = player.x + player.w / 2;
      const py = player.y + player.h / 2 - cameraY;

      if (px > sx - 18 && px < sx + 42 && py > sy && py < sy + 330) {
        state = 'over';
      }
    }
  }
  bolts = bolts.filter(b => b.life > 0);

  if (boostReadyFlash > 0) boostReadyFlash--;

  for (const o of pickups) {
    o.float += 0.08 * dt;
    const oy = o.y + Math.sin(o.float) * 5;

    if (
      player.x + player.w > o.x &&
      player.x < o.x + o.w &&
      player.y + player.h > oy &&
      player.y < oy + o.h
    ) {
      o.got = true;
      playSfx(SFX.like);
      likes++;
      score += 250;
      activateLikeBonus();
      burst(o.x + o.w / 2, oy + o.h / 2, '#ff6bb7', 12);
    }
  }


  for (const s of slippers) {
    s.float += 0.06 * dt;
    const sy = s.y + Math.sin(s.float) * 5;

    if (
      player.x + player.w > s.x &&
      player.x < s.x + s.w &&
      player.y + player.h > sy &&
      player.y < sy + s.h
    ) {
      s.got = true;
      player.vy = -26;
      playSfx(SFX.slippers);
      score += 1000;
      burst(s.x + s.w / 2, sy + s.h / 2, '#ffe84a', 28);
    }
  }


  for (const pt of particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += 0.08 * dt;
    pt.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);

  // Камера: как только героиня поднимается выше 38% экрана — камера едет вверх
  const targetCamera = player.y - H * 0.38;
  if (targetCamera < cameraY) cameraY = targetCamera;

  highest = Math.max(highest, Math.floor((START_Y - player.y) / 3));
  score = Math.max(score, highest * 10 + likes * 250);

  const scoreMilestone = milestoneForScore(score);
  if (scoreMilestone > (player.lastScoreMilestone || 0)) {
    player.lastScoreMilestone = scoreMilestone;
    showMilestone(scoreMilestone);
  }

  if (milestoneText) {
    milestoneText.life -= dt;
    if (milestoneText.life <= 0) milestoneText = null;
  }

  if (score > record) {
    record = score;
    localStorage.setItem('oblacom_record', record);
  }

  ensurePlatforms();

  if (score >= FINISH_SCORE) {
    state = 'final';
  }

  if (player.y - cameraY > H + 40) {
    state = 'over';
  }
}

function burst(x, y, color, n = 8) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: rnd(-2, 2),
      vy: rnd(-3, 0),
      life: rnd(18, 32),
      color
    });
  }
}

function drawBg() {
  if (!img.bg.complete) {
    ctx.fillStyle = '#111d64';
    ctx.fillRect(0, 0, W, H);
    return;
  }

  // cover-crop для 720×1280 в 420×720, без растягивания
  const scale = Math.max(W / img.bg.width, H / img.bg.height);
  const sw = W / scale;
  const sh = H / scale;
  const sx = (img.bg.width - sw) / 2;
  const sy = (img.bg.height - sh) / 2;
  ctx.drawImage(img.bg, sx, sy, sw, sh, 0, 0, W, H);

  const z = zoneByHeight(highest);
  if (z === 1) {
    ctx.fillStyle = 'rgba(30, 20, 80, 0.10)';
    ctx.fillRect(0, 0, W, H);
  } else if (z >= 2) {
    ctx.fillStyle = 'rgba(12, 8, 55, 0.20)';
    ctx.fillRect(0, 0, W, H);
  }
}

function drawPlatform(pl) {
  let asset = img.cloud1;

  if (pl.type === 'normal') asset = pl.variant === 1 ? img.cloud1 : img.cloud2;
  if (pl.type === 'spring') asset = img.spring;
  if (pl.type === 'storm') asset = img.storm;

  ctx.save();
  ctx.globalAlpha = pl.alpha;

  if (asset.complete) {
    ctx.drawImage(asset, pl.x, pl.y - cameraY, CLOUD_W, CLOUD_H);
  }

  ctx.restore();
}

function drawPlayer() {
  let asset = img.front;

  if (player.vy < -6) asset = img.back;
  else if (Math.abs(player.vx) > 0.65 || player.vy > 2) asset = img.side;

  const screenX = player.x;
  const screenY = player.y - cameraY;

  if (!asset.complete) return;

  ctx.save();

  // Главное исправление: side/back 130×287, поэтому НЕ растягиваем их в 96×96.
  // Вписываем в бокс 96×96 с сохранением пропорций.
  const fit = Math.min(PLAYER_BOX_W / asset.width, PLAYER_BOX_H / asset.height);
  const dw = asset.width * fit;
  const dh = asset.height * fit;
  const dx = screenX + (PLAYER_BOX_W - dw) / 2;
  const dy = screenY + (PLAYER_BOX_H - dh) / 2;

  if (player.facing < 0 && asset === img.side) {
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(asset, 0, 0, dw, dh);
  } else {
    ctx.drawImage(asset, dx, dy, dw, dh);
  }

  ctx.restore();
}

function drawLike(o) {
  const y = o.y - cameraY + Math.sin(o.float) * 5;
  if (img.like.complete) {
    ctx.drawImage(img.like, o.x, y, o.w, o.h);
  }
}



function drawSlippers(s) {
  const y = s.y - cameraY + Math.sin(s.float) * 5;
  if (img.slippers && img.slippers.complete) {
    ctx.drawImage(img.slippers, s.x, y, s.w, s.h);
  }
}

function drawFog() {
  ctx.save();
  // Очень спокойный, медленный туман
  const t = performance.now() * 0.000008;

  for (let i = 0; i < 5; i++) {
    const y = H * 0.26 + i * 100 + Math.sin(t * 25 + i) * 4;
    const x = ((t * 2600 + i * 130) % (W + 240)) - 160;

    const g = ctx.createLinearGradient(0, y - 32, 0, y + 42);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,245,255,0.055)');
    g.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 190, 24, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 150, y + 6, 170, 22, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 300, y - 3, 185, 23, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}


function drawBolts() {
  ctx.save();
  for (const b of bolts) {
    const x = b.x;
    const y = b.y - cameraY;

    if (b.warning > 0) {
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#ff78d7';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 310);
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }

    ctx.globalAlpha = Math.min(0.9, b.life / 60);
    ctx.strokeStyle = '#ffd34a';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 14, y + 70);
    ctx.lineTo(x + 10, y + 125);
    ctx.lineTo(x - 6, y + 190);
    ctx.lineTo(x + 16, y + 255);
    ctx.stroke();

    ctx.globalAlpha = Math.min(0.35, b.life / 110);
    ctx.strokeStyle = '#ff6bd6';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 285);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMilestone() {
  if (!milestoneText) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.globalAlpha = Math.min(1, milestoneText.life / 25);
  ctx.fillStyle = 'rgba(9,15,54,.72)';
  ctx.fillRect(50, 260, W - 100, 82);
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.strokeRect(50, 260, W - 100, 82);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(milestoneText.text, W / 2, 311);
  ctx.restore();
}


function drawPauseButton() {
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = 'rgba(9,15,54,.70)';
  ctx.fillRect(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.w, PAUSE_BTN.h);
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.w, PAUSE_BTN.h);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(PAUSE_BTN.x + 17, PAUSE_BTN.y + 13, 8, 30);
  ctx.fillRect(PAUSE_BTN.x + 32, PAUSE_BTN.y + 13, 8, 30);
  ctx.restore();
}

function drawPause() {
  drawGame();

  ctx.save();
  ctx.fillStyle = 'rgba(10,10,40,.78)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '56px monospace';
  ctx.fillText('ПАУЗА', W / 2, H * 0.38);

  const bw = 360;
  const bh = 82;
  const bx = W / 2 - bw / 2;
  const by1 = H * 0.47;
  const by2 = by1 + 112;

  ctx.fillStyle = '#ec64b9';
  ctx.fillRect(bx, by1, bw, bh);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.strokeRect(bx, by1, bw, bh);
  ctx.fillStyle = '#fff';
  ctx.font = '34px monospace';
  ctx.fillText('ПРОДОЛЖИТЬ', W / 2, by1 + 53);

  ctx.fillStyle = 'rgba(9,15,54,.85)';
  ctx.fillRect(bx, by2, bw, bh);
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(bx, by2, bw, bh);
  ctx.fillStyle = '#fff';
  ctx.fillText('ЗАНОВО', W / 2, by2 + 53);

  ctx.restore();
}

function pauseHit(x, y) {
  return x >= PAUSE_BTN.x && x <= PAUSE_BTN.x + PAUSE_BTN.w &&
         y >= PAUSE_BTN.y && y <= PAUSE_BTN.y + PAUSE_BTN.h;
}

function pauseMenuHit(x, y) {
  const bw = 360;
  const bh = 82;
  const bx = W / 2 - bw / 2;
  const by1 = H * 0.47;
  const by2 = by1 + 112;

  if (x >= bx && x <= bx + bw && y >= by1 && y <= by1 + bh) return 'continue';
  if (x >= bx && x <= bx + bw && y >= by2 && y <= by2 + bh) return 'restart';
  return null;
}

function drawHud() {
  ctx.fillStyle = 'rgba(9,15,54,.86)';
  ctx.fillRect(0, 0, W, 70);

  ctx.fillStyle = '#fff';
  ctx.font = '30px monospace';
  ctx.fillText('обла.ком jump', 24, 42);
  ctx.fillText(String(score), W / 2 - 35, 42);

  if (img.like.complete) ctx.drawImage(img.like, W - 96, 12, 44, 44);
  ctx.fillText('x' + likes, W - 48, 43);

  ctx.fillStyle = 'rgba(9,15,54,.86)';
  ctx.fillRect(0, H - 58, W, 58);

  ctx.fillStyle = '#fff';
  ctx.font = '22px monospace';
  ctx.fillText('ВЫСОТА ' + highest + ' М', 24, H - 22);
  ctx.fillText('РЕКОРД ' + record, W - 210, H - 22);
}

function drawGame() {
  drawBg();

  for (const pl of platforms) drawPlatform(pl);
  for (const o of pickups) if (!o.got) drawLike(o);
  for (const s of slippers) if (!s.got) drawSlippers(s);
  drawBolts();

  drawPlayer();
  drawFog();

  for (const pt of particles) {
    ctx.globalAlpha = pt.life / 32;
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x, pt.y - cameraY, 4, 4);
    ctx.globalAlpha = 1;
  }

  drawMilestone();
  drawHud();
  drawPauseButton();
}

function drawMenu() {
  if (img.start && img.start.complete) {
    ctx.drawImage(img.start, 0, 0, W, H);
  } else {
    drawBg();
  }

  // Накладываем только кнопку «ИГРАТЬ»
  ctx.textAlign = 'center';

  const bw = 390;
  const bh = 86;
  const bx = W / 2 - bw / 2;
  const by = H * 0.665;

  ctx.fillStyle = '#ec64b9';
  ctx.fillRect(bx, by, bw, bh);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(bx, by, bw, bh);

  ctx.fillStyle = '#ffffff';
  ctx.font = '44px monospace';
  ctx.fillText('ИГРАТЬ', W / 2, by + 57);

  ctx.textAlign = 'left';
}

function drawOver() {
  drawGame();

  ctx.fillStyle = 'rgba(10,10,40,.76)';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.textAlign = 'center';

  ctx.fillStyle = '#ffffff';
  ctx.font = '38px monospace';
  ctx.fillText('Тебя окутали', W / 2, 430);
  ctx.fillText('пушистые снега', W / 2, 480);

  ctx.font = '28px monospace';
  ctx.fillStyle = '#dfe8ff';
  ctx.fillText('счёт: ' + score, W / 2, 535);

  const bw = 280;
  const bh = 72;
  const bx = W / 2 - bw / 2;
  const by = 595;

  ctx.fillStyle = '#ec64b9';
  ctx.fillRect(bx, by, bw, bh);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(bx, by, bw, bh);

  ctx.fillStyle = '#ffffff';
  ctx.font = '30px monospace';
  ctx.fillText('ЕЩЁ РАЗ', W / 2, by + 47);

  ctx.restore();
}

function drawFinal() {
  if (img.ending && img.ending.complete) {
    ctx.drawImage(img.ending, 0, 0, W, H);
  } else {
    drawBg();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '34px monospace';
    ctx.fillText('ТЫ НАКОНЕЦ-ТО', W / 2, H * 0.43);
    ctx.fillText('ЗА ОБЛАКОМ', W / 2, H * 0.48);
    ctx.textAlign = 'left';
  }
}

function drawLoading() {
  ctx.fillStyle = '#111d64';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.font = '24px monospace';
  ctx.fillText('загрузка...', 120, 340);
}

function loop(timestamp = 0) {
  requestAnimationFrame(loop);

  if (!lastFrameTime) lastFrameTime = timestamp;

  let delta = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

  // 1 = один кадр на 60 FPS.
  // Ограничиваем только экстремальные скачки после сворачивания.
  let dt = clamp(delta / TARGET_FRAME_MS, 0.25, 1.35);

  update(dt);

  if (state === 'loading') drawLoading();
  if (state === 'menu') drawMenu();
  if (state === 'play') drawGame();
  if (state === 'over') drawOver();
  if (state === 'pause') drawPause();
  if (state === 'final') drawFinal();
}

window.addEventListener('keydown', e => {
  startMusic();
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();

  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (state === 'play') {
      state = 'pause';
      bgMusic.pause();
      return;
    }
    if (state === 'pause') {
      state = 'play';
      if (musicStarted) bgMusic.play().catch(() => {});
      return;
    }
  }

  keys[e.code] = true;

  if ((e.code === 'Space' || e.code === 'Enter') && state === 'final') {
    state = 'menu';
    return;
  }

  if (
    (state === 'menu' || state === 'over') &&
    (e.code === 'Space' || e.code === 'Enter')
  ) {
    reset();
  }
});

window.addEventListener('keyup', e => {
  keys[e.code] = false;
});

canvas.addEventListener('pointerdown', e => {
  startMusic();

  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * W;
  const y = (e.clientY - r.top) / r.height * H;

  if (state === 'pause') {
    const action = pauseMenuHit(x, y);
    if (action === 'continue') {
      state = 'play';
      lastFrameTime = 0;
      if (musicStarted) bgMusic.play().catch(() => {});
      return;
    }
    if (action === 'restart') {
      reset();
      lastFrameTime = 0;
      if (musicStarted) bgMusic.play().catch(() => {});
      return;
    }
    return;
  }

  if (state === 'play' && pauseHit(x, y)) {
    state = 'pause';
    lastFrameTime = 0;
    bgMusic.pause();
    return;
  }

  if (state === 'final') {
    state = 'menu';
    return;
  }

  if (state === 'menu' || state === 'over') reset();

  isTouching = true;
  touchStartX = e.clientX;
  lastTouchX = e.clientX;
  touchTargetX = x;

  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', e => {
  if (state !== 'play' || !isTouching) return;

  const r = canvas.getBoundingClientRect();
  touchTargetX = (e.clientX - r.left) / r.width * W;
  lastTouchX = e.clientX;
});

canvas.addEventListener('pointerup', () => {
  isTouching = false;
  touchStartX = null;
  lastTouchX = null;
  touchTargetX = null;
});

canvas.addEventListener('pointercancel', () => {
  isTouching = false;
  touchStartX = null;
  lastTouchX = null;
  touchTargetX = null;
});
