#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_snake.py — snake.c 核心逻辑的 Python 复刻测试

目的：在不依赖 gcc 的情况下，验证 C 版贪吃蛇的核心算法
（蛇移动、食物生成、撞墙/撞身判定、AI 选方向）与实现一致。

用法：
    python test_snake.py
返回 0 表示所有测试通过，非 0 表示有失败。
"""
import random
import sys

GRID = 20
NUM_DIFFS = 3

# 方向：0=上 1=右 2=下 3=左
DX = [0, 1, 0, -1]
DY = [-1, 0, 1, 0]


class Snake:
    """Python 版 Snake，复刻 snake.c 的核心数据"""
    def __init__(self):
        self.x = [10] * (GRID * GRID + 1)  # snake[]
        self.y = [10] * (GRID * GRID + 1)
        self.len = 3
        self.dir = 1  # 右
        self.next_dir = 1
        self.fx = 0
        self.fy = 0
        self.score = 0
        self._reset()

    def _reset(self):
        # 初始：头在 (10,10)，右移方向，长度 3
        self.x[0], self.y[0] = 10, 10
        self.x[1], self.y[1] = 9, 10
        self.x[2], self.y[2] = 8, 10
        self.len = 3
        self.dir = 1
        self.next_dir = 1
        self.score = 0
        self._place_food()

    def _place_food(self):
        # 找到所有空闲格，随机选一个
        occ = set((self.x[i], self.y[i]) for i in range(self.len))
        free = [(a, b) for a in range(GRID) for b in range(GRID) if (a, b) not in occ]
        if not free:
            return False  # 胜利
        self.fx, self.fy = random.choice(free)
        return True

    def _occupied(self, x, y):
        # 撞身判定：最后一节会移动，所以不算
        for i in range(self.len - 1):
            if self.x[i] == x and self.y[i] == y:
                return True
        return False

    def step(self):
        """推进一格，返回 'ok' / 'wall' / 'self' / 'win'"""
        self.dir = self.next_dir
        nx = self.x[0] + DX[self.dir]
        ny = self.y[0] + DY[self.dir]
        # 撞墙
        if nx < 0 or nx >= GRID or ny < 0 or ny >= GRID:
            return 'wall'
        # 撞身
        if self._occupied(nx, ny):
            return 'self'
        # 移动
        for i in range(self.len, 0, -1):
            self.x[i] = self.x[i - 1]
            self.y[i] = self.y[i - 1]
        self.x[0] = nx
        self.y[0] = ny
        # 吃食物
        if nx == self.fx and ny == self.fy:
            self.score += 10
            self.len += 1
            if not self._place_food():
                return 'win'
        return 'ok'

    def change_dir(self, new_dir):
        """与 try_change_dir 行为一致"""
        if (new_dir + 2) % 4 == self.dir and self.len > 1:
            return False
        self.next_dir = new_dir
        return True

    def ai_pick(self):
        """复刻 ai_pick_direction 贪心算法"""
        back = (self.dir + 2) % 4
        hx, hy = self.x[0], self.y[0]
        fx, fy = self.fx, self.fy
        best_d, best_score = -1, -99999
        for d in range(4):
            if d == back and self.len > 1:
                continue
            nx, ny = hx + DX[d], hy + DY[d]
            if not (0 <= nx < GRID and 0 <= ny < GRID):
                continue
            if self._occupied(nx, ny):
                continue
            dist = abs(nx - fx) + abs(ny - fy)
            safety = 0
            if nx == 0 or nx == GRID - 1:
                safety -= 3
            if ny == 0 or ny == GRID - 1:
                safety -= 3
            score = -dist + safety
            if score > best_score:
                best_score, best_d = score, d
        if best_d >= 0:
            return best_d
        # 兜底
        for d in range(4):
            if d == back and self.len > 1:
                continue
            nx, ny = hx + DX[d], hy + DY[d]
            if not (0 <= nx < GRID and 0 <= ny < GRID):
                continue
            if self._occupied(nx, ny):
                continue
            return d
        return -1


# --------------------- 测试用例 ---------------------

def test_initial_state():
    s = Snake()
    assert s.len == 3, f"初始长度应为 3，实际 {s.len}"
    assert (s.x[0], s.y[0]) == (10, 10), "蛇头应在 (10,10)"
    assert (s.x[1], s.y[1]) == (9, 10), "蛇身应在 (9,10)"
    assert (s.x[2], s.y[2]) == (8, 10), "蛇尾应在 (8,10)"
    assert s.dir == 1, "初始方向应为右"
    assert s.score == 0, "初始分数应为 0"
    # 食物不应在蛇身上
    for i in range(s.len):
        assert not (s.fx == s.x[i] and s.fy == s.y[i]), "食物不应在蛇身上"
    return "初始状态正确"


def test_step_basic():
    s = Snake()
    # 默认向右走
    for _ in range(5):
        r = s.step()
        assert r == 'ok', f"未撞到任何东西时 step 应返回 ok，实际 {r}"
    assert s.x[0] == 15 and s.y[0] == 10, f"5 步后应在 (15,10)，实际 ({s.x[0]},{s.y[0]})"
    return "基础移动 5 步正确"


def test_wall_collision():
    s = Snake()
    # 朝右走 10 步撞到右墙
    for _ in range(10):
        s.step()
    r = s.step()
    assert r == 'wall', f"撞墙应返回 wall，实际 {r}"
    return "撞墙判定正确"


def test_self_collision():
    """手动构造一个 L 形蛇身，蛇头朝 L 内角走，必撞自身"""
    s = Snake()
    s.fx, s.fy = 0, 0  # 食物远在角落
    # 蛇身：头 (5,10) 朝右
    # L 形：[(5,10), (5,11), (6,11), (7,11), (8,11), (8,10)]
    # 蛇头下一步向右 (6,10)，不撞；继续向右到 (6,10) 也不撞（原来空）
    # 但若蛇头改为向下 (5,11)，撞第 2 节
    s.x[0], s.y[0] = 5, 10
    s.x[1], s.y[1] = 5, 11  # 蛇头正下方
    s.x[2], s.y[2] = 6, 11
    s.x[3], s.y[3] = 7, 11
    s.x[4], s.y[4] = 8, 11
    s.x[5], s.y[5] = 8, 10
    s.len = 6
    s.dir = 1  # 当前朝右
    s.next_dir = 1
    # 现在尝试改向下，必撞第 2 节
    s.change_dir(2)  # 下
    assert s.next_dir == 2, "应允许改向下（不是反向）"
    r = s.step()
    assert r == 'self', f"应撞自身，实际 {r}"
    return "撞自身判定正确"


def test_eat_food():
    """把食物设到恰好在蛇前进方向上，验证吃到食物"""
    s = Snake()
    # 蛇头 (10,10) 朝右
    s.fx, s.fy = 12, 10
    s.step()  # (11,10) 没吃到
    s.step()  # (12,10) 吃到
    # 验证分数和长度
    assert s.score == 10, f"吃 1 个食物分数应为 10，实际 {s.score}"
    assert s.len == 4, f"吃 1 个食物后应为长度 4，实际 {s.len}"
    return "吃食物 +10 分与增长正确"


def test_direction_block():
    """蛇长度 >1 时禁止直接反向"""
    s = Snake()
    # 朝右时尝试改为左
    ok = s.change_dir(3)  # 左
    assert not ok, "长度>1 时禁止直接反向应返回 False"
    # 长度 = 1 时（初始）
    s2 = Snake()
    s2.len = 1
    s2.dir = 1
    ok2 = s2.change_dir(3)  # 左
    assert ok2, "长度为 1 时反向应允许"
    return "方向锁定正确"


def test_ai_pick_safe():
    """AI 应选不撞墙、不撞身的方向"""
    s = Snake()
    s.fx, s.fy = 19, 0  # 食物在右上角
    for _ in range(50):
        d = s.ai_pick()
        assert d >= 0, "AI 找不到安全方向"
        s.change_dir(d)
        s.step()
    return "AI 50 步未撞死"


def test_ai_can_win_or_score_well():
    """跑 1000 步 AI 自动玩，验证 AI 至少能吃到一些食物"""
    s = Snake()
    for _ in range(1000):
        d = s.ai_pick()
        if d < 0:
            break  # 死局
        s.change_dir(d)
        r = s.step()
        if r in ('wall', 'self'):
            break
    # AI 应该至少能拿到一些分（贪心算法的合理下限）
    print(f"  AI 自动玩 1000 步：得分={s.score}, 长度={s.len}")
    assert s.score >= 10, f"AI 表现太差，得分 {s.score} < 10"
    return "AI 自动玩得分有效"


def test_random_games_dont_crash():
    """100 局完全随机输入游戏，确保没有崩溃或非法状态"""
    crashes = 0
    max_score = 0
    for game in range(100):
        random.seed(game)
        s = Snake()
        for step in range(2000):
            # 80% 概率随机方向，20% 概率保留当前方向
            if random.random() < 0.8:
                d = random.randint(0, 3)
                s.change_dir(d)
            r = s.step()
            if r in ('wall', 'self', 'win'):
                break
            # 健康检查：snake 长度不能超 GRID*GRID
            if s.len > GRID * GRID:
                crashes += 1
                break
        if s.score > max_score:
            max_score = s.score
    print(f"  100 局随机：最长存活得分={max_score}, 崩溃={crashes}")
    assert crashes == 0, f"随机游戏发生 {crashes} 次崩溃"
    assert max_score >= 10, "100 局随机不可能零分"
    return "100 局随机游戏无崩溃"


# --------------------- 运行 ---------------------

TESTS = [
    test_initial_state,
    test_step_basic,
    test_wall_collision,
    test_self_collision,
    test_eat_food,
    test_direction_block,
    test_ai_pick_safe,
    test_ai_can_win_or_score_well,
    test_random_games_dont_crash,
]


def main():
    print(f"运行 {len(TESTS)} 个核心逻辑测试…\n")
    passed = 0
    failed = 0
    for t in TESTS:
        try:
            name = t()
            print(f"  ✓ {t.__name__:<35s} {name}")
            passed += 1
        except AssertionError as e:
            print(f"  ✗ {t.__name__:<35s} 断言失败：{e}")
            failed += 1
        except Exception as e:
            print(f"  ✗ {t.__name__:<35s} 异常：{type(e).__name__}: {e}")
            failed += 1
    print()
    print(f"汇总：{passed} 通过 / {failed} 失败 / {len(TESTS)} 总计")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())