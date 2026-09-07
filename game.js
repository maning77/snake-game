/* ============================================
 * 贪吃蛇 v2 - 增强版
 * 在 v1 基础上新增：
 *   - 最高分本地记录（localStorage）
 *   - 空格 / P 随时暂停，暂停与结束覆盖层
 *   - 每得 50 分自动提速（速度随局内递增）
 *   - 移动端触控方向键 + 棋盘滑动操作
 *   - WASD 键位、平滑 requestAnimationFrame 循环
 *   - 蛇头眼睛、苹果呼吸动效等视觉优化
 * ============================================ */

(() => {
  "use strict";

  // ---- 配置常量 ----
  const GRID = 20; // 网格 20 x 20
  const CELL = 20; // 每格像素
  const BASE_INTERVAL = 150; // 初始帧间隔 ms
  const MIN_INTERVAL = 60; // 最快帧间隔 ms
  const SPEEDUP_EVERY = 50; // 每增加多少分提速一档
  const SPEEDUP_STEP = 8; // 每档提速 ms
  const BEST_KEY = "snake_best_score_v2";

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

  // ---- 游戏状态机：idle | running | paused | over ----
  let state = "idle";
  let snake = [];
  let food = null;
  let dir = { x: 1, y: 0 };
  let nextDir = { x: 1, y: 0 };
  let score = 0;
  let best = 0;
  let lastStep = 0;
  let rafId = null;
  let growthPending = 0; // 等待增长的节数

  // 读取本地最高分
  try {
    best = Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (_) {
    best = 0;
  }
  bestEl.textContent = best;

  // ---- 工具：当前帧间隔（随分数提速） ----
  function currentInterval() {
    const level = Math.floor(score / SPEEDUP_EVERY);
    return Math.max(MIN_INTERVAL, BASE_INTERVAL - level * SPEEDUP_STEP);
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
    growthPending = 0;
    scoreEl.textContent = 0;
  }

  // ---- 随机生成食物（避开蛇身） ----
  function spawnFood() {
    const free = [];
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        if (!snake.some((s) => s.x === x && s.y === y)) {
          free.push({ x, y });
        }
      }
    }
    food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  // ---- 绘制（ts 用于动效） ----
  function draw(ts) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 网格线
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

    // 食物：会"呼吸"的小苹果
    if (food) {
      const pulse = 1 + 0.12 * Math.sin(ts / 220);
      const fx = food.x * CELL + CELL / 2;
      const fy = food.y * CELL + CELL / 2;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(pulse, pulse);
      // 果肉
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(0, 0, CELL / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      // 高光
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.arc(-3, -3, 3, 0, Math.PI * 2);
      ctx.fill();
      // 果柄
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
      // 头部亮绿 → 尾部深绿渐变
      const g = Math.round(213 - 90 * t);
      const r = Math.round(123 - 55 * t);
      ctx.fillStyle =
        state === "over" && i % 2 === 0
          ? "#b33939" // 失败时红白闪烁
          : `rgb(${r}, ${g}, ${Math.round(115 - 60 * t)})`;
      ctx.beginPath();
      ctx.roundRect(seg.x * CELL + 1.2, seg.y * CELL + 1.2, CELL - 2.4, CELL - 2.4, 5);
      ctx.fill();
    }

    // 蛇头眼睛（跟随方向）
    const head = snake[0];
    const hcx = head.x * CELL + CELL / 2;
    const hcy = head.y * CELL + CELL / 2;
    const perp = { x: dir.y, y: -dir.x }; // 垂直方向
    const eyeOff = 4;
    const sideOff = 3.4;
    ctx.fillStyle = "#ffffff";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(
        hcx + dir.x * eyeOff + perp.x * side * sideOff,
        hcy + dir.y * eyeOff + perp.y * side * sideOff,
        2.6,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    // 瞳孔
    ctx.fillStyle = "#111827";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(
        hcx + dir.x * (eyeOff + 1.6) + perp.x * side * sideOff,
        hcy + dir.y * (eyeOff + 1.6) + perp.y * side * sideOff,
        1.2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  // ---- 逻辑步进 ----
  function step() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // 撞墙
    if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID) {
      return gameOver(false);
    }

    // 撞自身（吃到食物时尾部不移除，需整体检测）
    const eating = food && head.x === food.x && head.y === food.y;
    const bodyToCheck = eating ? snake : snake.slice(0, -1);
    if (bodyToCheck.some((s) => s.x === head.x && s.y === head.y)) {
      return gameOver(false);
    }

    snake.unshift(head);
    if (eating) {
      score += 10;
      scoreEl.textContent = score;
      // 刷新最高分
      if (score > best) {
        best = score;
        bestEl.textContent = best;
        try {
          localStorage.setItem(BEST_KEY, String(best));
        } catch (_) {
          /* 忽略隐私模式写入失败 */
        }
      }
      spawnFood();
      if (!food) return gameOver(true); // 填满棋盘，胜利
    } else {
      snake.pop();
    }
  }

  // ---- 覆盖层显示/隐藏 ----
  function showOverlay(title, sub, { showResume = false } = {}) {
    overlayTitle.textContent = title;
    overlaySub.textContent = sub;
    resumeBtn.classList.toggle("hidden", !showResume);
    overlayEl.classList.remove("hidden");
  }

  function hideOverlay() {
    overlayEl.classList.add("hidden");
  }

  // ---- 结束 ----
  function gameOver(win) {
    state = "over";
    if (win) {
      showOverlay("🎉 恭喜获胜", `你填满了整个 ${GRID} × ${GRID} 棋盘！`);
    } else {
      showOverlay("💀 游戏结束", `本局得分 ${score}${score >= best && score > 0 ? " · 新纪录！" : ""}`);
    }
  }

  // ---- 开始 / 重开 ----
  function startGame() {
    initSnake();
    spawnFood();
    state = "running";
    hideOverlay();
    lastStep = performance.now();
  }

  // ---- 暂停 / 继续 ----
  function setPaused(paused) {
    if (state !== "running" && state !== "paused") return;
    if (paused) {
      state = "paused";
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

  // ---- 主循环（requestAnimationFrame 驱动） ----
  function loop(ts) {
    if (state === "running" && ts - lastStep >= currentInterval()) {
      step();
      lastStep = ts;
    }
    draw(ts);
    rafId = requestAnimationFrame(loop);
  }

  // ---- 方向设置（防反向） ----
  function setDirection(d) {
    if (!d) return;
    if (state !== "running") return;
    if (d.x === -dir.x && d.y === -dir.y) return; // 禁止 180° 掉头
    nextDir = d;
  }

  // ---- 键盘控制 ----
  document.addEventListener("keydown", (e) => {
    const map = {
      ArrowUp: { x: 0, y: -1 },
      KeyW: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      KeyS: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      KeyA: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      KeyD: { x: 1, y: 0 },
    };
    if (e.code in map) {
      e.preventDefault();
      setDirection(map[e.code]);
      return;
    }
    // 暂停 / 继续
    if (e.code === "Space" || e.code === "KeyP") {
      e.preventDefault();
      if (state === "running" || state === "paused") togglePause();
    }
    // 结束后回车重开
    if ((e.code === "Enter" || e.code === "Space") && state === "over") {
      e.preventDefault();
      startGame();
    }
  });

  // ---- 按钮 ----
  restartBtn.addEventListener("click", startGame);
  resumeBtn.addEventListener("click", () => setPaused(false));
  pauseBtn.addEventListener("click", togglePause);

  // 触控方向键
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
    (e) => {
      const t = e.touches[0];
      swipeStart = { x: t.clientX, y: t.clientY };
    },
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
      if (Math.abs(dx) > Math.abs(dy)) {
        setDirection({ x: Math.sign(dx), y: 0 });
      } else {
        setDirection({ x: 0, y: Math.sign(dy) });
      }
      swipeStart = { x: t.clientX, y: t.clientY };
    },
    { passive: false }
  );
  boardWrap.addEventListener("touchend", () => (swipeStart = null));

  // ---- 启动 ----
  startGame();
  rafId = requestAnimationFrame(loop);
})();
