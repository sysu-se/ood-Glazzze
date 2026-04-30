# EVOLUTION

## Homework 2 设计演进说明

本文档基于当前代码实现，按作业要求统一说明 Hint 与 Explore 的对象设计、状态协作与 history 演进。

### 1. 如何实现提示功能？

提示能力由领域对象提供，UI 只消费 store 导出的状态与命令。

- `Sudoku` 负责规则计算：
  - `getCandidates(row, col)` 计算候选集合。
  - `getNextHint()` 给出可直接确定的下一步（唯一候选）。
  - `getCellHint(row, col)` 返回结构化提示（模式、候选、原因）。
- `Game` 负责会话编排：
  - `getCandidates` / `getNextHint` / `getCellHint` 透传给当前 `Sudoku`。
- `gameStore` 负责将提示能力映射为 UI 可用交互：
  - 暴露 `computedCandidates`、`nextHint`、`requestHint`、`setHintLevel`、`explanation`。
  - 统一 Hint 入口按提示等级执行不同策略。

当前提示采用三层规则分级：

- **L1 观察级**：只指出值得关注的位置，并在侧边栏给出原因。
- **L2 候选级**：显示候选并解释排除依据（行/列/宫）。
- **L3 决策级**：对任意选中的空格使用完整局面求解给出确定数字；若未选中空格，则选择第一个空格给出确定值；解释文本强调这是决策级求解，不重复 L2 的候选排除说明。

此外，提示解释由本地 AI Agent 模块生成自然语言文本，展示在右侧固定侧边栏中，形成“规则计算 + 解释呈现”的闭环。

### 2. 提示功能更属于 `Sudoku` 还是 `Game`？为什么？

提示的**规则本体**属于 `Sudoku`，提示的**会话编排**属于 `Game`。

- `Sudoku` 负责“为什么可填/不可填”的约束推导。
- `Game` 负责“当前这一局如何使用提示”的上下文管理。
- `gameStore` 负责把领域能力转为 UI 状态，不在组件层做规则计算。

这种分工可以保证规则集中、接口清晰、可测试性好。

### 3. 如何实现探索模式？

探索模式实现为显式的会话对象 `ExploreSession`，每个探索分支由 `ExploreBranch` 表达。`Game` 不再直接拼接探索状态字段，而是把分支创建、切换、快照保存、失败路径记忆等行为委托给探索会话对象。

核心能力如下：

- 进入/退出探索：`startExplore()` / `cancelExplore()`。
- 回到探索起点：`backtrackExplore()`。
- 分支创建与切换：`createExploreBranch(label)`、`switchExploreBranch(id)`、`listExploreBranches()`。
- 分支内独立时间线：`exploreUndo()` / `exploreRedo()` 只影响当前分支。
- 冲突检测与失败记忆：通过 `Sudoku.validate()` 与失败盘面指纹标记状态。
- 提交探索：`commitExplore()` 仅在当前盘面合法时允许。
- UI 使用独立左侧探索侧边栏集中展示进入/退出、分支列表（用树形结构展示）、新建分支、切换分支、回到起点、提交与放弃。

因此，探索模式不是 UI 临时变量，而是由 `ExploreSession` 建模的领域会话状态；`Game` 只负责把当前棋盘与 history 交给会话对象协调。

### 4. 主局面与探索局面的关系是什么？

当前实现采用“快照隔离 + 分支恢复”的关系模型。

- 进入探索时，`ExploreSession` 保存起点快照：`startSudoku`、`startHistory`、`startIndex`。
- 探索中的每个 `ExploreBranch` 都保存独立的盘面与历史快照。
- 切换分支时，恢复该分支快照到当前 `Game`。
- 提交探索时，保留当前分支结果并退出探索。
- 放弃探索时，恢复起点快照并退出探索。

所以主局面与探索局面不是共享可变对象，而是通过快照切换保证隔离，避免引用污染。

### 5. 你的 history 结构在本次作业中是否发生了变化？

发生了“会话层”的演进，但主 history 语义保持稳定。

- 主 history 仍是线性日志：`history + currentIndex`。
- 探索会话引入分支级快照与指针，支持分支内独立 undo/redo。
- 普通 `undo()` / `redo()` 在探索模式下会委托到探索内撤销/重做，不能越过 `startIndex` 影响探索前的主局面。
- 这不是把全局 history 改成 DAG；而是在 explore 会话层实现“局部树状行为”。
- 序列化时会保存 explore 会话及分支信息，恢复后可继续探索。

结论：主历史结构未推翻，探索通过会话元数据扩展出分支能力。

### 6. Homework 1 中的哪些设计，在 Homework 2 中暴露出了局限？

主要有三点：

1. 提示若停留在 UI 层，会导致规则与状态不一致。
2. 只有线性流程时，难以表达探索起点、回滚与失败路径记忆。
3. 仅序列化主局面不足以恢复“探索中”状态。

为解决这些问题，本次将提示与探索都提升到领域对象与会话层。

### 7. 如果重做一次 Homework 1，你会如何修改原设计？

会提前做以下设计预留：

1. 在 `Game` 中预留模式/会话状态机扩展点。
2. 在 `Sudoku` 中从一开始定义候选、下一步、单元格提示接口。
3. 在序列化协议中预留 `session/meta` 扩展位。
4. 明确规则层（Sudoku）与编排层（Game/Store）边界，并分层测试。

---

## 评分项对照

| 评分项 | 对应实现 | 对应测试 |
| --- | --- | --- |
| 提示功能正确性 | `Sudoku.getCandidates()` / `getCellHint()` / `getNextHint()`，`hintService.buildHintAction()`，`gameStore.requestHint()` | `02-sudoku-basic.test.js`，`09-hints-and-explore-boundaries.test.js` |
| 探索模式正确性 | `Game.startExplore()` / `commitExplore()` / `cancelExplore()` / `backtrackExplore()`，左侧探索侧边栏 | `07-game-explore.test.js`，`08-game-explore-branches.test.js` |
| 状态与对象协作设计 | `Sudoku` 负责规则，`Game` 负责游戏时间线，`ExploreSession` / `ExploreBranch` 负责探索状态，`hintService` 负责提示策略 | `01-contract.test.js`，`09-hints-and-explore-boundaries.test.js` |
| history 演进合理性 | 操作日志 `history + currentIndex`，探索内 undo/redo 受 `startIndex` 限制，分支保存独立快照 | `04-game-undo-redo.test.js`，`05-serialization.test.js`，`09-hints-and-explore-boundaries.test.js` |
| 代码质量 | 控件拆分为 `HintControls`、左侧 `ExploreSidebar`，提示策略从 `gameStore` 下沉到 `hintService` | 全量 Vitest 与生产构建 |
| 文档质量 | 本文档解释 Hint、Explore、history 演进、局限与评分项映射 | `EVOLUTION.md` |

## 加分项对照

| 加分项 | 对应实现 |
| --- | --- |
| 树状探索分支 | `ExploreSession.listBranches()` 返回 `depth`，左侧侧边栏按层级缩进展示分支 |
| 探索过程独立 Undo / Redo | `Game.exploreUndo()` / `exploreRedo()`，普通 undo/redo 在探索中委托到探索边界内 |
| 提示功能具有解释能力 | `agent.js` 与 `hintService` 生成 L1/L2/L3 解释文本 |
| 更优雅的状态建模 | `ExploreSession` / `ExploreBranch` 显式建模探索状态 |
| 较完整测试 | 9 个测试文件覆盖基础领域、store、序列化、探索、分支、提示与冲突边界 |
| AI Agent 求解或解释 | 本地 Agent 解释候选逻辑，L3 使用求解器并验证结果后填入 |

---

## 当前实现范围说明

### 已完成

- 提示领域化：候选、下一步、单元格提示与原因说明。
- 三层规则提示（L1/L2/L3）与统一 Hint 入口，提示策略集中在 `hintService`。
- L3 决策级在填入前检查当前局面无冲突，并校验求解器结果满足当前行/列/宫约束。
- 固定侧边栏展示提示等级与 AI 解释文本。
- 探索模式完整闭环：进入、回溯、提交、放弃、冲突检测、失败记忆。
- `ExploreSession` / `ExploreBranch` 显式建模探索状态。
- 树状探索分支与分支内独立 undo/redo，并在左侧探索侧边栏中提供树状缩进的分支管理、新建分支、切换分支与当前分支标记。
- 探索会话序列化/反序列化恢复。
- 相关测试覆盖基础领域行为、探索、分支恢复、提示等级、解释文本入口与探索边界。

### 当前局限与改进方向

- 当前分支结构是树状快照，不支持不同分支之间的合并策略；如果后续扩展为真正的搜索树，可增加分支比较与合并规则。
- L3 提示会在可求解时直接填入答案，适合作为“决策级提示”，但严格教学场景下可以进一步限制为只使用可解释的唯一候选规则。
- AI Agent 当前是本地解释器，负责把领域规则转为自然语言；若要接入外部 LLM，需要增加可控的上下文裁剪和结果校验，避免生成与棋盘不一致的解释。

### 未实现（本次不要求）

- 多层嵌套探索会话。
- DAG 分支合并策略。
- 高级数独求解策略库（例如 X-Wing、Swordfish 等）。
