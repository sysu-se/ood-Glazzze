# EVOLUTION

## Homework 2 设计演进说明

本文档按作业要求的 7 个问题逐条回答，基于当前仓库中的实现状态。

### 1. 你如何实现提示功能？

我把提示能力下沉到了领域对象，而不是在 UI 里临时拼接：

- 在 `Sudoku` 中新增了：
  - `getCandidates(row, col)`：基于当前盘面计算某格候选数集合。
  - `getNextHint()`：扫描盘面，返回第一个可直接确定（候选数唯一）的下一步提示。
- 在 `Game` 中新增透传接口：
  - `getCandidates(row, col)`
  - `getNextHint()`
- 在 `gameStore.applyHint` 中，不再依赖预先求解的整盘答案，而是调用领域对象候选逻辑，只在候选唯一时自动填入。

可以直接总结为：

- 提示能力主要属于 `Sudoku`，因为候选数和下一步提示都是基于当前棋盘约束推导出来的，具体实现就在 `src/domain/sudoku.js` 的 `getCandidates()` 和 `getNextHint()`。
- `Game` 不重复计算提示，而是作为当前局面的协调者，直接把查询转发给当前的 `Sudoku` 实例，见 `src/domain/game.js` 的 `getCandidates()` 和 `getNextHint()`。
- `gameStore` 只是把领域对象暴露成 UI 可订阅的状态，不在组件里临时拼接提示逻辑，见 `src/stores/gameStore.js` 的 `computedCandidates`、`nextHint`，以及返回给 UI 的 store 导出。
- UI 层只负责消费这些状态并触发动作，不直接计算候选或下一步，相关入口在 `src/components/Controls/ActionBar/Actions.svelte` 和 `src/components/Board/index.svelte`。

这样做满足了“提示必须通过领域对象接口提供”的要求，并且让提示逻辑在测试中可直接验证。

### 2. 你认为提示功能更属于 `Sudoku` 还是 `Game`？为什么？

我认为：

- **核心求解约束属于 `Sudoku`**：候选数判断、合法性判断本质是盘面规则。
- **会话协调属于 `Game`**：`Game` 负责把提示能力暴露给 UI/Store，并与历史、状态管理协作。

因此采用“`Sudoku` 负责计算，`Game` 负责编排与对外接口”的分工。这样可以保证领域规则集中，外层调用简单。

换句话说，这套设计里，提示不是 UI 技巧，也不是 `Game` 自己重新求解整盘，而是 `Sudoku` 先算出结果，`Game` 只负责把当前局面的提示能力统一出口给上层使用。

### 3. 你如何实现探索模式？

我将 Explore 建模为 `Game` 内的“临时探索会话”（`exploreSession`），并提供以下最小闭环能力：

- 进入探索：`startExplore()`
- 探索中状态查询：`getExploreStatus()` / `isExploring()`
- 冲突检测：探索中每次 `guess` 后检查 `Sudoku.validate()`
- 失败路径记忆：用盘面指纹记录失败局面，重复到达时标记 `revisited-failed`
- 回溯到探索起点：`backtrackExplore()`
- 提交探索：`commitExplore()`（仅在当前盘面无冲突时允许）
- 放弃探索：`cancelExplore()`（恢复到探索起点并退出探索）

这套实现覆盖了作业要求中的“进入探索、冲突识别、回溯、提交/放弃”。

### 4. 主局面与探索局面的关系是什么？

当前实现是“主会话 + 临时快照”的关系：

- 进入探索时保存：
  - 起点盘面快照（`startSudoku`）
  - 起点历史快照（`startHistory`）
  - 起点历史指针（`startIndex`）
- 探索期间直接在当前 `Game` 上继续落子，但会话中保留起点快照用于回滚。
- 提交时：保留当前局面，清除探索会话。
- 放弃时：回到起点快照，清除探索会话。

这种方式没有引入多层嵌套会话和复杂合并逻辑，符合“最小可行探索模式”的目标。

### 5. 你的 history 结构在本次作业中是否发生了变化？

主 history 仍然是线性可重放操作日志（`history + currentIndex`），没有升级为树结构。

本次变化是：

- 增加了探索会话内的起点历史快照（`startHistory`、`startIndex`），用于回溯与放弃。
- 仍然保持主流程 Undo/Redo 语义不变。
- 在 `undo/redo` 后会刷新探索状态，避免探索冲突状态滞后。

所以可以理解为：主 history 结构不变，但在 Explore 中增加了一层“会话边界元信息”。

### 6. Homework 1 中的哪些设计，在 Homework 2 中暴露出了局限？

主要暴露了 3 个局限：

1. **提示逻辑外置的风险**
   - 若提示在 Store/UI 层依赖外部求解器，容易与领域状态不一致。
   - Homework 2 要求提示进入领域，迫使我把提示能力放回 `Sudoku`/`Game`。

2. **单一线性会话模型不够表达探索语义**
   - Homework 1 只有“当前局面 + 线性操作”，缺少“会话边界”。
   - Explore 需要明确进入点、回滚点和失败路径记忆。

3. **序列化只关注主局面，未覆盖中间状态语义**
   - Homework 2 后，探索中的活动会话也需要可恢复。
   - 因此扩展了 `Game.toJSON()/createGameFromJSON()` 的 explore 字段。

### 7. 如果重做一次 Homework 1，你会如何修改原设计？

如果从头重做，我会提前做以下设计：

1. 在 `Game` 中预留“模式/会话状态机”扩展点（normal/explore），避免后续硬插。
2. 在 `Sudoku` 里从一开始就定义提示相关接口（候选、下一步），防止提示逻辑漂移到 UI。
3. 在序列化协议中预留可扩展字段（例如 `meta` / `session`），降低后续演进的兼容成本。
4. 明确区分“规则计算层”和“应用编排层”，并在测试中分层覆盖。

---

## 当前实现范围说明

- 已完成：提示最小能力、Explore 最小闭环（进入/冲突/回溯/提交/放弃）、对应测试与序列化恢复。
- 未实现（本次不要求）：多层嵌套探索、树状分支合并、高级求解算法。
