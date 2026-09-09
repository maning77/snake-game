/* =============================================================
 * 贪吃蛇 v1 - C 语言控制台版（Windows）
 *
 * 完整翻译自 JavaScript 版（v3.1）的核心玩法，并补齐：
 *   - 20×20 棋盘，单字符 + ANSI 颜色渲染（Win10+ 终端自动启用 Win10 console API）
 *   - 方向键 / WASD 控制，禁止直接反向
 *   - 随机食物生成（避开蛇身）
 *   - 吃食物蛇身增长并 +10 分
 *   - 撞墙 / 撞自身判定游戏结束
 *   - 暂停（P / 空格）
 *   - 简单 / 普通 / 困难 三档难度，影响初始速度与提速节奏
 *   - 最高分本地持久化（snake_best.txt）
 *   - 难度选择与静音偏好本地持久化（snake_diff.txt / snake_muted.txt）
 *   - 吃到食物时的粒子爆裂特效
 *   - Beep 音效（吃食物 / 升级 / 失败 / 暂停），可静音（M 键切换）
 *   - 失败覆盖层显示分数 / 最高分，一键重开
 *
 * 编译（MinGW / TDM-GCC / VS cl 都可）：
 *   gcc snake.c -o snake.exe
 * 或双击运行 build.bat
 *
 * 运行：双击 snake.exe 或 run.bat
 * ============================================================= */

#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <conio.h>
#include <windows.h>

/* ---------------------- 配置 ---------------------- */
#define GRID 20
/* 多预留一格防止蛇身填满棋盘时移动时越界 */
#define MAX_SNAKE (GRID * GRID + 1)
#define FRAME_MS 16           /* 渲染帧率：约 60FPS */
#define PARTICLES_PER_EAT 18  /* 一次吃到食物的粒子数 */
#define PARTICLE_TTL  8       /* 粒子动画帧数 */

/* ---------------------- 难度 ---------------------- */
typedef struct {
    int  base;      /* 初始 ms/步 */
    int  step;      /* 每提速一次减 ms */
    int  minv;      /* 最小 ms/步 */
    int  speedup;   /* 每多少分提速一档 */
    const char *label;
} Difficulty;

static const Difficulty DIFFS[] = {
    { 190,  6,  90, 60, "简单" },
    { 150,  8,  60, 50, "普通" },
    { 110, 12,  45, 35, "困难" },
};
#define NUM_DIFFS ((int)(sizeof(DIFFS)/sizeof(DIFFS[0])))
#define DEFAULT_DIFF 1   /* 普通 */

/* 方向 0=上 1=右 2=下 3=左 */
static const int DX[4] = { 0, 1, 0, -1 };
static const int DY[4] = { -1, 0, 1, 0 };

/* ---------------------- 颜色 ---------------------- */
enum {
    COL_RESET = 7,
    COL_WALL = 11,       /* 亮蓝 */
    COL_HEAD = 10,       /* 亮绿 */
    COL_BODY = 2,        /* 深绿 */
    COL_FOOD = 12,       /* 亮红 */
    COL_TEXT = 15,       /* 亮白 */
    COL_DIM = 8,         /* 灰 */
    COL_WARN = 14,       /* 黄 */
    COL_BG_PANEL = 240,  /* 灰背景 */
};

/* ---------------------- 类型 ---------------------- */
typedef struct {
    int x, y;
} Cell;

typedef struct {
    int       x, y;
    int       ttl;
    int       color;
} Particle;

typedef struct {
    int state;            /* 0=菜单 1=游戏中 2=暂停 3=结束 */
    int diff;
    Cell snake[MAX_SNAKE];
    int  snake_len;
    int  dir, next_dir;
    int  food_x, food_y;
    int  score, best;
    int  speed_level;
    int  interval;        /* 当前 ms/步 */
    DWORD last_step_time; /* 上次推进的时间戳（ms） */
    int  muted;
    int  ai_mode;       /* AI 自动玩模式（0=手动 1=自动玩） */
    Particle particles[64];
    int  particle_n;
} Game;

static Game G;

/* ---------------------- 控制台工具 ---------------------- */
static HANDLE H_OUT;
static CONSOLE_SCREEN_BUFFER_INFO H_INFO;

static void conio_init(void) {
    H_OUT = GetStdHandle(STD_OUTPUT_HANDLE);
    GetConsoleScreenBufferInfo(H_OUT, &H_INFO);
    /* 隐藏光标 */
    CONSOLE_CURSOR_INFO ci = { 100, FALSE };
    SetConsoleCursorInfo(H_OUT, &ci);
    srand((unsigned)time(NULL));
}

static void gotoxy(int x, int y) {
    COORD c = { (SHORT)x, (SHORT)y };
    SetConsoleCursorPosition(H_OUT, c);
}

static void color(int attr) {
    SetConsoleTextAttribute(H_OUT, (WORD)attr);
}

static void cls(void) {
    CONSOLE_SCREEN_BUFFER_INFO cs;
    GetConsoleScreenBufferInfo(H_OUT, &cs);
    DWORD cells = cs.dwSize.X * cs.dwSize.Y;
    COORD origin = { 0, 0 };
    DWORD written;
    FillConsoleOutputCharacterA(H_OUT, ' ', cells, origin, &written);
    FillConsoleOutputAttribute(H_OUT, cs.wAttributes, cells, origin, &written);
    SetConsoleCursorPosition(H_OUT, origin);
}

/* ---------------------- 持久化 ---------------------- */
static void load_best(int *best) {
    FILE *fp = fopen("snake_best.txt", "r");
    if (fp) { fscanf(fp, "%d", best); fclose(fp); }
}
static void save_best(int best) {
    FILE *fp = fopen("snake_best.txt", "w");
    if (fp) { fprintf(fp, "%d\n", best); fclose(fp); }
}
static void load_int(const char *name, int *out, int defv) {
    FILE *fp = fopen(name, "r");
    if (fp) { fscanf(fp, "%d", out); fclose(fp); }
    else *out = defv;
}
static void save_int(const char *name, int v) {
    FILE *fp = fopen(name, "w");
    if (fp) { fprintf(fp, "%d\n", v); fclose(fp); }
}

/* ---------------------- 音效 ---------------------- */
static void beep(int freq, int ms) {
    if (G.muted) return;
    Beep(freq, ms);
}
static void snd_eat(void)    { beep(880, 60); }
static void snd_speedup(void){ beep(1320, 80); beep(1760, 60); }
static void snd_over(void)   { beep(220, 300); beep(180, 400); }
static void snd_pause(void)  { beep(440, 80); }

/* ---------------------- 游戏逻辑 ---------------------- */
static void reset_game(void) {
    G.snake_len = 3;
    /* 蛇身：横排，蛇头在中段 */
    int sx = GRID / 2 - 1, sy = GRID / 2;
    for (int i = 0; i < 3; i++) {
        G.snake[i].x = sx + (2 - i);
        G.snake[i].y = sy;
    }
    G.dir = 1; G.next_dir = 1;
    G.score = 0;
    G.speed_level = 0;
    G.interval = DIFFS[G.diff].base;
    G.last_step_time = GetTickCount();
    G.particle_n = 0;
}

static int cell_occupied_by_snake(int x, int y) {
    for (int i = 0; i < G.snake_len; i++)
        if (G.snake[i].x == x && G.snake[i].y == y) return 1;
    return 0;
}

static void place_food(void) {
    int free_cells = GRID * GRID - G.snake_len;
    if (free_cells <= 0) return;
    int target = rand() % free_cells;
    int idx = 0;
    for (int y = 0; y < GRID; y++) {
        for (int x = 0; x < GRID; x++) {
            if (cell_occupied_by_snake(x, y)) continue;
            if (idx == target) {
                G.food_x = x; G.food_y = y;
                return;
            }
            idx++;
        }
    }
}

static void spawn_particles(int x, int y) {
    int n = PARTICLES_PER_EAT;
    if (n > 64 - G.particle_n) n = 64 - G.particle_n;
    for (int i = 0; i < n; i++) {
        Particle *p = &G.particles[G.particle_n + i];
        p->x = x; p->y = y;
        p->ttl = PARTICLE_TTL;
        p->color = (rand() % 2) ? COL_FOOD : COL_WARN;
    }
    G.particle_n += n;
}

static void tick_particles(void) {
    int w = 0;
    for (int i = 0; i < G.particle_n; i++) {
        Particle *p = &G.particles[i];
        if (p->ttl > 0) {
            /* 简单扩散 */
            int dx = (rand() % 3) - 1;
            int dy = (rand() % 3) - 1;
            int nx = p->x + dx, ny = p->y + dy;
            if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID) {
                p->x = nx; p->y = ny;
            }
            p->ttl--;
            if (p->ttl > 0) G.particles[w++] = *p;
        }
    }
    G.particle_n = w;
}

static void step_game(void) {
    G.dir = G.next_dir;
    int nx = G.snake[0].x + DX[G.dir];
    int ny = G.snake[0].y + DY[G.dir];
    /* 撞墙 */
    if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) {
        G.state = 3; snd_over(); return;
    }
    /* 撞自身（尾端会移动，所以最后一节不算） */
    for (int i = 0; i < G.snake_len - 1; i++) {
        if (G.snake[i].x == nx && G.snake[i].y == ny) {
            G.state = 3; snd_over(); return;
        }
    }
    /* 移动 */
    for (int i = G.snake_len; i > 0; i--) {
        G.snake[i] = G.snake[i - 1];
    }
    G.snake[0].x = nx;
    G.snake[0].y = ny;

    if (nx == G.food_x && ny == G.food_y) {
        G.score += 10;
        G.snake_len++;
        snd_eat();
        spawn_particles(nx, ny);
        /* 提速 */
        Difficulty *d = &DIFFS[G.diff];
        int levels = G.score / d->speedup;
        if (levels > G.speed_level) {
            G.speed_level = levels;
            G.interval = d->base - levels * d->step;
            if (G.interval < d->minv) G.interval = d->minv;
            snd_speedup();
        }
        if (G.score > G.best) {
            G.best = G.score;
            save_best(G.best);
        }
        place_food();
    }
}

static void apply_interval(void) {
    G.interval = DIFFS[G.diff].base - G.speed_level * DIFFS[G.diff].step;
    if (G.interval < DIFFS[G.diff].minv)
        G.interval = DIFFS[G.diff].minv;
}

/* ---------------------- 渲染 ---------------------- */
static void draw_frame(void) {
    int ox = 4, oy = 3;  /* 棋盘左上角偏移 */
    /* 顶墙 */
    gotoxy(ox, oy);
    color(COL_WALL);
    putchar('+');
    for (int i = 0; i < GRID; i++) printf("--");
    printf("+\n");
    /* 棋盘行 */
    for (int y = 0; y < GRID; y++) {
        gotoxy(ox, oy + 1 + y);
        color(COL_WALL);
        putchar('|');
        color(COL_RESET);
        for (int x = 0; x < GRID; x++) {
            int drawn = 0;
            /* 蛇头 */
            if (G.snake[0].x == x && G.snake[0].y == y) {
                color(COL_HEAD); putchar('@'); drawn = 1;
            } else {
                /* 蛇身 */
                for (int i = 1; i < G.snake_len && !drawn; i++) {
                    if (G.snake[i].x == x && G.snake[i].y == y) {
                        color(COL_BODY); putchar('o'); drawn = 1;
                    }
                }
                /* 食物 */
                if (!drawn && G.food_x == x && G.food_y == y) {
                    color(COL_FOOD); putchar('*'); drawn = 1;
                }
                /* 粒子 */
                for (int k = 0; k < G.particle_n && !drawn; k++) {
                    if (G.particles[k].x == x && G.particles[k].y == y) {
                        color(G.particles[k].color);
                        putchar('*'); drawn = 1;
                    }
                }
                if (!drawn) {
                    color(COL_RESET); putchar(' ');
                }
            }
        }
        color(COL_WALL); putchar('|'); putchar('\n');
    }
    /* 底墙 */
    gotoxy(ox, oy + 1 + GRID);
    color(COL_WALL);
    putchar('+');
    for (int i = 0; i < GRID; i++) printf("--");
    printf("+\n");

    /* 状态栏 */
    gotoxy(ox, oy + 3 + GRID);
    color(COL_TEXT);
    printf("得分: %-5d  最高: %-5d  速度: %3dms  难度: %s  AI: %s",
           G.score, G.best, G.interval, DIFFS[G.diff].label,
           G.ai_mode ? "ON" : "OFF");
    gotoxy(ox, oy + 4 + GRID);
    color(COL_DIM);
    printf("[方向/WASD 移动] [P 暂停] [M 静音] [K AI切换] [ESC 退出]");
}

static void draw_menu(void) {
    cls();
    color(COL_HEAD);
    gotoxy(20, 4); printf("=========================================");
    gotoxy(20, 5); printf("         贪 吃 蛇  -  C 语 言 版         ");
    gotoxy(20, 6); printf("=========================================");
    color(COL_TEXT);
    gotoxy(20, 8);  printf("请选择难度 (默认 普通)：");
    for (int i = 0; i < NUM_DIFFS; i++) {
        gotoxy(20, 10 + i);
        if (i == G.diff) { color(COL_WARN); printf("> "); }
        else { color(COL_DIM); printf("  "); }
        printf("[%d] %s  起步 %dms / 提速 +%dms / 提速阈值 %d 分",
               i + 1, DIFFS[i].label, DIFFS[i].base, DIFFS[i].step, DIFFS[i].speedup);
    }
    color(COL_TEXT);
    gotoxy(20, 15); printf("操作：方向键/WASD 移动   P 暂停   M 静音   K AI自动玩   ESC 退出");
    color(COL_DIM);
    gotoxy(20, 17); printf("提示：按数字键 1/2/3 选难度，回车开始当前难度（默认普通）。");
}

static void draw_overlay(const char *title, const char *sub, int pause_mode) {
    /* 右侧状态块 */
    int bx = GRID + 8, by = 5;
    gotoxy(bx, by);
    color(COL_WARN); printf("=== %s ===", title);
    gotoxy(bx, by + 2); color(COL_TEXT);
    printf("得分  : %d", G.score);
    gotoxy(bx, by + 3); color(COL_TEXT);
    printf("最高分: %d", G.best);
    gotoxy(bx, by + 4); color(COL_TEXT);
    printf("难度  : %s", DIFFS[G.diff].label);
    gotoxy(bx, by + 5); color(COL_TEXT);
    printf("长度  : %d", G.snake_len);
    if (pause_mode) {
        gotoxy(bx, by + 7); color(COL_DIM);
        printf("[P / 空格] 继续");
        gotoxy(bx, by + 8); color(COL_DIM);
        printf("[R]       重新开始");
        gotoxy(bx, by + 9); color(COL_DIM);
        printf("[ESC]     退出");
    } else {
        gotoxy(bx, by + 7); color(COL_DIM);
        printf("[回车 / R] 重新开始");
        gotoxy(bx, by + 8); color(COL_DIM);
        printf("[M]       切换静音");
        gotoxy(bx, by + 9); color(COL_DIM);
        printf("[ESC]     退出");
    }
    (void)sub;
}

/* ---------------------- 输入 ---------------------- */
static int read_key_blocking(void) {
    return _getch();
}

static int read_key_arrow(int ch) {
    /* 方向键第一个码是 0xE0 或 0x00 */
    if (ch == 0xE0 || ch == 0x00) {
        int k = _getch();
        switch (k) {
            case 0x48: return 'w'; /* up */
            case 0x50: return 's'; /* down */
            case 0x4B: return 'a'; /* left */
            case 0x4D: return 'd'; /* right */
        }
        return 0;
    }
    return ch;
}

/* AI 自动选方向：贪心算法，找离食物最近且不撞墙、不撞自身又非反方向的方向 */
static int ai_pick_direction(void) {
    int hx = G.snake[0].x, hy = G.snake[0].y;
    int fx = G.food_x,    fy = G.food_y;
    int back = opposite(G.dir);
    int best_dir = -1, best_score = -99999;
    /* 第一轮：选安全且最接近食物的方向 */
    for (int d = 0; d < 4; d++) {
        if (d == back && G.snake_len > 1) continue;
        int nx = hx + DX[d], ny = hy + DY[d];
        if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
        int hit = 0;
        for (int i = 0; i < G.snake_len - 1; i++) {
            if (G.snake[i].x == nx && G.snake[i].y == ny) { hit = 1; break; }
        }
        if (hit) continue;
        int dist = abs(nx - fx) + abs(ny - fy);
        /* 鼓励往中间走，远离墙边增加存活机会 */
        int safety = 0;
        if (nx == 0 || nx == GRID - 1) safety -= 3;
        if (ny == 0 || ny == GRID - 1) safety -= 3;
        int score = -dist + safety;
        if (score > best_score) { best_score = score; best_dir = d; }
    }
    if (best_dir >= 0) return best_dir;
    /* 兜底：任意安全方向都行（避免游戏卡死） */
    for (int d = 0; d < 4; d++) {
        if (d == back && G.snake_len > 1) continue;
        int nx = hx + DX[d], ny = hy + DY[d];
        if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
        int hit = 0;
        for (int i = 0; i < G.snake_len - 1; i++) {
            if (G.snake[i].x == nx && G.snake[i].y == ny) { hit = 1; break; }
        }
        if (hit) continue;
        return d;
    }
    return -1;
}

static int opposite(int d) { return (d + 2) % 4; }

static int try_change_dir(int new_dir) {
    if (new_dir < 0 || new_dir > 3) return 0;
    /* 当前已经在蛇身上的真实方向（step 后才生效），新方向不能是其反向 */
    if (new_dir == opposite(G.dir) && G.snake_len > 1) return 0;
    G.next_dir = new_dir;
    return 1;
}

/* ---------------------- 主流程 ---------------------- */
static void do_menu(void) {
    draw_menu();
    while (G.state == 0) {
        if (_kbhit()) {
            int ch = read_key_arrow(read_key_blocking());
            if (ch == '1' || ch == '2' || ch == '3') {
                G.diff = ch - '1';
                save_int("snake_diff.txt", G.diff);
            } else if (ch == '\r' || ch == ' ') {
                G.state = 1;
                break;
            } else if (ch == 27) {  /* ESC */
                G.state = 99;
                return;
            }
            draw_menu();
        }
        Sleep(50);
    }
}

static void do_game(void) {
    reset_game();
    apply_interval();
    place_food();
    cls();
    draw_frame();
    while (G.state == 1) {
        DWORD now = GetTickCount();
        /* AI 自动选方向（在推进前） */
        if (G.ai_mode) {
            int d = ai_pick_direction();
            if (d >= 0) try_change_dir(d);
        }
        /* 推进 */
        if (now - G.last_step_time >= (DWORD)G.interval) {
            step_game();
            G.last_step_time = now;
            tick_particles();
        }
        /* 输入 */
        while (_kbhit()) {
            int ch = read_key_arrow(read_key_blocking());
            if (ch == 27) { G.state = 99; break; }
            else if (ch == 'p' || ch == 'P' || ch == ' ') { G.state = 2; snd_pause(); break; }
            else if (ch == 'm' || ch == 'M') { G.muted = !G.muted; save_int("snake_muted.txt", G.muted); }
            else if (ch == 'k' || ch == 'K') { G.ai_mode = !G.ai_mode; }
            else if (ch == 'w' || ch == 'W' || ch == 0x48) try_change_dir(0);
            else if (ch == 'd' || ch == 'D' || ch == 0x4D) try_change_dir(1);
            else if (ch == 's' || ch == 'S' || ch == 0x50) try_change_dir(2);
            else if (ch == 'a' || ch == 'A' || ch == 0x4B) try_change_dir(3);
        }
        if (G.state != 1) break;
        /* 渲染 */
        draw_frame();
        Sleep(FRAME_MS);
    }
}

static void do_pause(void) {
    draw_overlay("已 暂 停", "", 1);
    while (G.state == 2) {
        if (_kbhit()) {
            int ch = read_key_arrow(read_key_blocking());
            if (ch == 'p' || ch == 'P' || ch == ' ') { G.state = 1; G.last_step_time = GetTickCount(); cls(); draw_frame(); break; }
            else if (ch == 'r' || ch == 'R' || ch == '\r') { reset_game(); apply_interval(); place_food(); G.state = 1; G.last_step_time = GetTickCount(); cls(); draw_frame(); break; }
            else if (ch == 27) { G.state = 99; break; }
        }
        Sleep(50);
    }
}

static void do_over(void) {
    draw_overlay("游 戏 结 束", "", 0);
    while (G.state == 3) {
        if (_kbhit()) {
            int ch = read_key_arrow(read_key_blocking());
            if (ch == 'r' || ch == 'R' || ch == '\r') { reset_game(); apply_interval(); place_food(); G.state = 1; G.last_step_time = GetTickCount(); cls(); draw_frame(); break; }
            else if (ch == 'm' || ch == 'M') { G.muted = !G.muted; save_int("snake_muted.txt", G.muted); }
            else if (ch == 27) { G.state = 99; break; }
        }
        Sleep(50);
    }
}

int main(void) {
    conio_init();
    memset(&G, 0, sizeof(G));
    load_best(&G.best);
    load_int("snake_diff.txt",  &G.diff,  DEFAULT_DIFF);
    load_int("snake_muted.txt", &G.muted, 0);
    if (G.diff < 0 || G.diff >= NUM_DIFFS) G.diff = DEFAULT_DIFF;

    while (G.state != 99) {
        switch (G.state) {
            case 0:  do_menu(); break;
            case 1:  do_game(); break;
            case 2:  do_pause(); break;
            case 3:  do_over();  break;
            default: G.state = 99; break;
        }
    }
    color(COL_RESET);
    gotoxy(0, 0);
    return 0;
}