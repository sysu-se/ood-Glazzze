/**
 * 简单本地 AI Agent：为提示（hint）生成中文解释文本
 * 说明：本 Agent 是本地的解释器，利用领域对象（Sudoku/Game）提供的候选信息和盘面状态
 * 产生可阅读的解释。教学用途优先：若需要接入外部 LLM，可在此模块扩展。
 */

export function generateHintExplanation(game, row, col) {
  if (!game || row == null || col == null) return '没有可用的提示。';

  try {
    const sudoku = game.getSudoku();
    const grid = sudoku.getGrid();

    if (grid[row][col] !== 0) {
      return `该位置已有数字：${grid[row][col]}，无需提示。`;
    }

    // 候选集合
    let cands = [];
    try {
      cands = game.getCandidates(row, col) || [];
    } catch (e) {
      cands = [];
    }

    // 已有数字排除原因（行/列/宫）
    const present = { row: new Set(), col: new Set(), box: new Set() };
    for (let i = 0; i < 9; i++) {
      const rVal = grid[row][i];
      const cVal = grid[i][col];
      if (rVal) present.row.add(rVal);
      if (cVal) present.col.add(cVal);
    }
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        const v = grid[r][c];
        if (v) present.box.add(v);
      }
    }

    // 如果只有一个候选，直接说明唯一候选
    if (cands.length === 1) {
      return `唯一候选：${cands[0]}。这是因为同一行、同一列或同一宫中其它数字已排除其它可能性。`;
    }

    // 普通候选解释：列出候选并简要说明排除来源
    let reason = `候选集合：${cands.join('、')}。`; 
    reason += '排除来源示例：';

    const examples = [];
    // 对每个在行/列/宫中出现的数字，作为排除示例
    const rowArr = Array.from(present.row).sort();
    const colArr = Array.from(present.col).sort();
    const boxArr = Array.from(present.box).sort();
    if (rowArr.length) examples.push(`行中已有 ${rowArr.join('、')}`);
    if (colArr.length) examples.push(`列中已有 ${colArr.join('、')}`);
    if (boxArr.length) examples.push(`宫内已有 ${boxArr.join('、')}`);

    if (examples.length) {
      reason += examples.join('；') + '。';
    } else {
      reason += '目前无法用行/列/宫的显式已填数字解释候选排除，可能需要更高阶的推理。';
    }

    reason += ' 你可以尝试在该格逐一尝试候选值进入探索模式。';
    return reason;
  } catch (err) {
    return '生成解释时发生错误。';
  }
}
