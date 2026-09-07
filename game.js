/* ============================================
 * 贪吃蛇 v3 - 体验升级
 * 在 v2 基础上新增：
 *   - Web Audio 音效系统（吃食物 / 升级 / 失败 / 暂停），可静音
 *   - 难度选择：简单 / 普通 / 困难，影响速度与提速节奏
 *   - 吃到食物时的粒子爆裂特效
 *   - 偏好（难度、是否静音）本地持久化
 * ============================================ */

(() => {
  "use strict";

  // ---- 配置 ----
  const GRID = 20;
  const CELL = 20;

  // 难度档位：基础间隔 / 每档提速 / 最快间隔 / 每多少分提速一档
  const DIFFICULTIES = {
    easy:   { base: 190, step: 6,  min: 90,  speedupEvery: 60, label: "简单" },
    normal: { base: 150, step: 8,  min: 60,  speedupEvery: 50, label: "普通" },
    hard:   { base: 110, step: 12, min: 45,  speedupEvery: 35, label: "困难" },
  };
  const DEFAULT_DIFF = "normal";

  const BEST_KEY = "snake_best_score_v3";
  const DIFF_KEY = "snake_difficulty_v3";
  const MUTE_KEY = "snake_muted_v3";

  // ---- DOM ----
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlayEl = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlaySub = document.getElementById("overlay-sub");
  const resumeBtn = document.getElementById("resume-btn");
  const restartBtn = document.getElementById("restart-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const boardWrap = document.getElementById("board-wrap");
  const muteBtn = document.getElementById("mute-btn");

  // ---- 游戏状态 ----
  let state = "idle";
  let snake = [];
  let food = null;
  let dir = { x: 1, y: 0 };
  let nextDir = { x: 1, y: 0 };
  let score = 0;
  let best = 0;
  let lastStep = 0;
  let lastSpeedupLevel = 0;
  let rafId = null;
  let particles = [];
  let difficulty = DEFAULT_DIFF;
  let muted = false;
  let audioCtx = null;

  // ---- 偏好读取 ----
  try {
    best = Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (_) { best = 0; }
  try {
    const d = localStorage.getItem(DIFF_KEY);
    if (d && DIFFICULTIES[d]) difficulty = d;
  } catch (_) { /* ignore */ }
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch (_) { /* ignore */ }
  bestEl.textContent = best;
  updateDifficultyUI();
  updateMuteUI();

  // ---- 工具：当前帧间隔 ----
  function currentInterval() {
    const cfg = DIFFICULTIES[difficulty];
    const level = Math.floor(score / cfg.speedupEvery);
    return Math.max(cfg.min, cfg.base - level * cfg.step);
  }

  // ---- 初始化蛇身 ----
  function initSnake() {
    const mid = Math.floor(GRID / 2);
    snake = [
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
      { x: mid - 3, y: mid },
    ];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    lastSpeedupLevel = 0;
    particles = [];
    scoreEl.textContent = 0;
  }

  // ---- 随机生成食物 ----
  function spawnFood() {
    const free = [];
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
      }
    }
    food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  // ---- 粒子系统 ----
  function spawnParticles(cx, cy, count = 10) {
    const palette = ["#ff6b6b", "#f59e0b", "#34d399", "#fbbf24", "#f87171"];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.4;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.6, // 略偏上飘散
        life: 1,
        decay: 0.018 + Math.random() * 0.02,
        size: 2 + Math.random() * 2.4,
        color: palette[Math.floor(Math.random() * palette.length)],
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06; // 模拟重力
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ---- 音效（懒初始化 AudioContext） ----
  function ensureAudio() {
    if (audioCtx) return audioCtx;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
      return audioCtx;
    } catch (_) {
      return null;
    }
  }

  function playTone({ freq = 440, freqEnd = null, dur = 0.12, type = "sine", volume = 0.18 }) {
    if (muted) return;
    const ac = ensureAudio();
    if (!ac) return;
    if (ac.state === "suspended") ac.resume().catch(() => {});
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    if (freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, freqEnd),
        ac.currentTime + dur
      );
    }
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ac.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + dur + 0.02);
  }

  const SFX = {
    eat:    () => playTone({ freq: 520, freqEnd: 880, dur: 0.09, type: "square", volume: 0.12 }),
    level:  () => playTone({ freq: 660, freqEnd: 1320, dur: 0.18, type: "triangle", volume: 0.16 }),
    over:   () => playTone({ freq: 330, freqEnd: 90,  dur: 0.45, type: "sawtooth", volume: 0.18 }),
    pause:  () => playTone({ freq: 440, freqEnd: 220, dur: 0.10, type: "sine", volume: 0.10 }),
    win:    () => {
      playTone({ freq: 523, dur: 0.10, type: "triangle", volume: 0.16 });
      setTimeout(() => playTone({ freq: 659, dur: 0.10, type: "triangle", volume: 0.16 }), 110);
      setTimeout(() => playTone({ freq: 784, dur: 0.22, type: "triangle", volume: 0.16 }), 220);
    },
  };

  // ---- 绘制 ----
  function draw(ts) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 网格
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(canvas.width, i * CELL);
      ctx.stroke();
    }

    // 食物
    if (food) {
      const pulse = 1 + 0.12 * Math.sin(ts / 220);
      const fx = food.x * CELL + CELL / 2;
      const fy = food.y * CELL + CELL / 2;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(0, 0, CELL / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.arc(-3, -3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#8d6e2b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -CELL / 2 + 1);
      ctx.lineTo(2, -CELL / 2 - 3);
      ctx.stroke();
      ctx.restore();
    }

    // 蛇身
    for (let i = snake.length - 1; i >= 0; i--) {
      const seg = snake[i];
      const t = snake.length > 1 ? i / (snake.length - 1) : 0;
      const g = Math.round(213 - 90 * t);
      const r = Math.round(123 - 55 * t);
      ctx.fillStyle =
        state === "over" && i % 2 === 0
          ? "#b33939"
          : `rgb(${r}, ${g}, ${Math.round(115 - 60 * t)})`;
      ctx.beginPath();
      ctx.roundRect(seg.x * CELL + 1.2, seg.y * CELL + 1.2, CELL - 2.4, CELL - 2.4, 5);
      ctx.fill();
    }

    // 蛇头眼睛
    const head = snake[0];
    const hcx = head.x * CELL + CELL / 2;
    const hcy = head.y * CELL + CELL / 2;
    const perp = { x: dir.y, y: -dir.x };
    const eyeOff = 4;
    const sideOff = 3.4;
    ctx.fillStyle = "#ffffff";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(
        hcx + dir.x * eyeOff + perp.x * side * sideOff,
        hcy + dir.y * eyeOff + perp.y * side * sideOff,
        2.6, 0, Math.PI * 2
      );
      ctx.fill();
    }
    ctx.fillStyle = "#111827";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(
        hcx + dir.x * (eyeOff + 1.6) + perp.x * side * sideOff,
        hcy + dir.y * (eyeOff + 1.6) + perp.y * side * sideOff,
        1.2, 0, Math.PI * 2
      );
      ctx.fill();
    }

    // 粒子（在蛇身上层，确保可见）
    drawParticles();
  }

  // ---- 逻辑步进 ----
  function step() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID) {
      return gameOver(false);
    }
    const eating = food && head.x === food.x && head.y === food.y;
    const bodyToCheck = eating ? snake : snake.slice(0, -1);
    if (bodyToCheck.some((s) => s.x === head.x && s.y === head.y)) {
      return gameOver(false);
    }

    snake.unshift(head);
    if (eating) {
      score += 10;
      scoreEl.textContent = score;
      // 粒子爆发
      spawnParticles(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, 12);
      // 升级音效
      const cfg = DIFFICULTIES[difficulty];
      const newLevel = Math.floor(score / cfg.speedupEvery);
      if (newLevel > lastSpeedupLevel) {
        lastSpeedupLevel = newLevel;
        SFX.level();
      } else {
        SFX.eat();
      }
      // 刷新最高分
      if (score > best) {
        best = score;
        bestEl.textContent = best;
        try { localStorage.setItem(BEST_KEY, String(best)); } catch (_) {}
      }
      spawnFood();
      if (!food) return gameOver(true);
    } else {
      snake.pop();
    }
  }

  // ---- 覆盖层 ----
  function showOverlay(title, sub, { showResume = false } = {}) {
    overlayTitle.textContent = title;
    overlaySub.textContent = sub;
    resumeBtn.classList.toggle("hidden", !showResume);
    overlayEl.classList.remove("hidden");
  }
  function hideOverlay() {
    overlayEl.classList.add("hidden");
  }

  function gameOver(win) {
    state = "over";
    if (win) {
      SFX.win();
      showOverlay("🎉 恭喜获胜", `你填满了整个 ${GRID} × ${GRID} 棋盘！`);
    } else {
      SFX.over();
      showOverlay("💀 游戏结束", `本局得分 ${score}${score >= best && score > 0 ? " · 新纪录！" : ""}`);
    }
  }

  function startGame() {
    initSnake();
    spawnFood();
    state = "running";
    hideOverlay();
    lastStep = performance.now();
  }

  function setPaused(paused) {
    if (state !== "running" && state !== "paused") return;
    if (paused) {
      state = "paused";
      SFX.pause();
      showOverlay("⏸ 已暂停", "按空格 / P 或点击下方按钮继续", { showResume: true });
    } else {
      state = "running";
      hideOverlay();
      lastStep = performance.now();
    }
  }
  function togglePause() {
    setPaused(state === "running");
  }

  function loop(ts) {
    if (state === "running" && ts - lastStep >= currentInterval()) {
      step();
      lastStep = ts;
    }
    if (state === "running") updateParticles();
    draw(ts);
    rafId = requestAnimationFrame(loop);
  }

  function setDirection(d) {
    if (!d) return;
    if (state !== "running") return;
    if (d.x === -dir.x && d.y === -dir.y) return;
    nextDir = d;
  }

  // ---- 难度切换 ----
  function setDifficulty(d) {
    if (!DIFFICULTIES[d]) return;
    difficulty = d;
    try { localStorage.setItem(DIFF_KEY, d); } catch (_) {}
    updateDifficultyUI();
  }
  function updateDifficultyUI() {
    document.querySelectorAll(".diff-btn").forEach((btn) => {
      const isActive = btn.dataset.diff === difficulty;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-checked", isActive ? "true" : "false");
    });
  }

  // ---- 静音切换 ----
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (_) {}
    updateMuteUI();
    if (!muted) SFX.eat(); // 解除静音时给个反馈音
  }
  function updateMuteUI() {
    muteBtn.textContent = muted ? "🔇" : "🔊";
    muteBtn.title = muted ? "已静音，点击取消静音" : "已开启音效，点击静音";
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
  }

  // ---- 键盘 ----
  document.addEventListener("keydown", (e) => {
    const map = {
      ArrowUp:    { x: 0, y: -1 },
      KeyW:       { x: 0, y: -1 },
      ArrowDown:  { x: 0, y: 1 },
      KeyS:       { x: 0, y: 1 },
      ArrowLeft:  { x: -1, y: 0 },
      KeyA:       { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      KeyD:       { x: 1, y: 0 },
    };
    if (e.code in map) {
      e.preventDefault();
      setDirection(map[e.code]);
      return;
    }
    if (e.code === "Space" || e.code === "KeyP") {
      e.preventDefault();
      if (state === "running" || state === "paused") togglePause();
    }
    if ((e.code === "Enter" || e.code === "Space") && state === "over") {
      e.preventDefault();
      startGame();
    }
    if (e.code === "KeyM") {
      e.preventDefault();
      toggleMute();
    }
  });

  // ---- 按钮 ----
  restartBtn.addEventListener("click", startGame);
  resumeBtn.addEventListener("click", () => setPaused(false));
  pauseBtn.addEventListener("click", togglePause);
  muteBtn.addEventListener("click", toggleMute);

  document.querySelectorAll(".diff-btn").forEach((btn) => {
    btn.addEventListener("click", () => setDifficulty(btn.dataset.diff));
  });

  document.querySelectorAll("[data-dir]").forEach((el) => {
    const [dx, dy] = el.dataset.dir.split(",").map(Number);
    const onPress = (e) => {
      e.preventDefault();
      setDirection({ x: dx, y: dy });
    };
    el.addEventListener("pointerdown", onPress);
    el.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  });

  // 棋盘滑动控制
  let swipeStart = null;
  boardWrap.addEventListener(
    "touchstart",
    (e) => { swipeStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; },
    { passive: true }
  );
  boardWrap.addEventListener(
    "touchmove",
    (e) => {
      if (!swipeStart) return;
      const t = e.touches[0];
      const dx = t.clientX - swipeStart.x;
      const dy = t.clientY - swipeStart.y;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      e.preventDefault();
      if (Math.abs(dx) > Math.abs(dy)) setDirection({ x: Math.sign(dx), y: 0 });
      else setDirection({ x: 0, y: Math.sign(dy) });
      swipeStart = { x: t.clientX, y: t.clientY };
    },
    { passive: false }
  );
  boardWrap.addEventListener("touchend", () => (swipeStart = null));

  // ---- 启动 ----
  startGame();
  rafId = requestAnimationFrame(loop);
})();