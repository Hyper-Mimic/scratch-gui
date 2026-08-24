// custom-block-shape 的几何修改器：把 scratch-blocks 的 BlockSvg 全局常量
// 改成用户设置的 内边距(paddingSize)/圆角(cornerSize)/缺口(notchSize) 值。
//
// 同时被两个地方使用：
//   1) addons/custom-block-shape/userscript.js —— 真实插件运行时（改完重绘全部积木）
//   2) addons/preview/preview.jsx —— 设置页预览（临时改几何 -> 同步重渲染预览积木 ->
//      立即还原，几何设置不会泄漏到主编辑器）
//
// 注意：这里修改的是【同一个 scratch-blocks 单例模块】的全局常量，
// 与插件运行时的行为完全一致，因此预览能 100% 还原真实几何变化。

let originalPositionArrow = null;

export default function applyChanges(
  Blockly,
  paddingSize = 100,
  cornerSize = 100,
  notchSize = 100
) {
  const BlockSvg = Blockly.BlockSvg;
  const GRID_UNIT = BlockSvg.GRID_UNIT;

  let multiplier = paddingSize / 100;
  cornerSize = cornerSize / 100;
  notchSize = notchSize / 100;

  BlockSvg.SEP_SPACE_Y = 2 * GRID_UNIT * multiplier;
  BlockSvg.MIN_BLOCK_X = 16 * GRID_UNIT * multiplier;
  BlockSvg.MIN_BLOCK_X_OUTPUT = 12 * GRID_UNIT * multiplier;
  BlockSvg.MIN_BLOCK_X_SHADOW_OUTPUT = 10 * GRID_UNIT * multiplier;
  BlockSvg.MIN_BLOCK_Y = 12 * GRID_UNIT * multiplier;
  BlockSvg.EXTRA_STATEMENT_ROW_Y = 8 * GRID_UNIT * multiplier;
  BlockSvg.MIN_BLOCK_X_WITH_STATEMENT = 40 * GRID_UNIT * multiplier;
  BlockSvg.MIN_BLOCK_Y_SINGLE_FIELD_OUTPUT = 8 * GRID_UNIT * multiplier;
  BlockSvg.MIN_BLOCK_Y_REPORTER = 10 * GRID_UNIT * multiplier;
  BlockSvg.MIN_STATEMENT_INPUT_HEIGHT = 6 * GRID_UNIT * multiplier;
  BlockSvg.NOTCH_WIDTH = 8 * GRID_UNIT * multiplier;
  BlockSvg.NOTCH_HEIGHT = 2 * GRID_UNIT * multiplier * notchSize;
  BlockSvg.NOTCH_START_PADDING = 3 * GRID_UNIT; //* multiplier
  BlockSvg.ICON_SEPARATOR_HEIGHT = 10 * GRID_UNIT * multiplier;
  BlockSvg.NOTCH_PATH_LEFT =
    "c 2,0 3," +
    1 * notchSize +
    " 4," +
    2 * notchSize +
    " l " +
    4 * multiplier * notchSize +
    "," +
    4 * multiplier * notchSize +
    " c 1," +
    1 * notchSize +
    " 2," +
    2 * notchSize +
    " 4," +
    2 * notchSize +
    " h " +
    24 * (multiplier - 0.5) +
    " c 2,0 3,-" +
    1 * notchSize +
    " 4,-" +
    2 * notchSize +
    " l " +
    4 * multiplier * notchSize +
    "," +
    -4 * multiplier * notchSize +
    "c 1,-" +
    1 * notchSize +
    " 2,-" +
    2 * notchSize +
    " 4,-" +
    2 * notchSize;
  BlockSvg.NOTCH_PATH_RIGHT =
    "h " +
    (-4 * (cornerSize - 1) - 5 * (1 - notchSize)) +
    "c -2,0 -3," +
    1 * notchSize +
    " -4," +
    2 * notchSize +
    " l " +
    -4 * multiplier * notchSize +
    "," +
    4 * multiplier * notchSize +
    " c -1," +
    1 * notchSize +
    " -2," +
    2 * notchSize +
    " -4," +
    2 * notchSize +
    " h " +
    -24 * (multiplier - 0.5) +
    " c -2,0 -3,-" +
    1 * notchSize +
    " -4,-" +
    2 * notchSize +
    " l " +
    -4 * multiplier * notchSize +
    "," +
    -4 * multiplier * notchSize +
    "c -1,-" +
    1 * notchSize +
    " -2,-" +
    2 * notchSize +
    " -4,-" +
    2 * notchSize;
  BlockSvg.INPUT_SHAPE_HEXAGONAL =
    "M " +
    4 * GRID_UNIT * multiplier +
    ",0 " +
    " h " +
    4 * GRID_UNIT +
    " l " +
    4 * GRID_UNIT * multiplier +
    "," +
    4 * GRID_UNIT * multiplier +
    " l " +
    -4 * GRID_UNIT * multiplier +
    "," +
    4 * GRID_UNIT * multiplier +
    " h " +
    -4 * GRID_UNIT +
    " l " +
    -4 * GRID_UNIT * multiplier +
    "," +
    -4 * GRID_UNIT * multiplier +
    " l " +
    4 * GRID_UNIT * multiplier +
    "," +
    -4 * GRID_UNIT * multiplier +
    " z";
  BlockSvg.INPUT_SHAPE_HEXAGONAL_WIDTH = 12 * GRID_UNIT * multiplier;
  BlockSvg.INPUT_SHAPE_ROUND =
    "M " +
    4 * GRID_UNIT * multiplier +
    ",0" +
    " h " +
    4 * GRID_UNIT * multiplier +
    " a " +
    4 * GRID_UNIT * multiplier +
    " " +
    4 * GRID_UNIT * multiplier +
    " 0 0 1 0 " +
    8 * GRID_UNIT * multiplier +
    " h " +
    -4 * GRID_UNIT * multiplier +
    " a " +
    4 * GRID_UNIT * multiplier +
    " " +
    4 * GRID_UNIT * multiplier +
    " 0 0 1 0 -" +
    8 * GRID_UNIT * multiplier +
    " z";
  BlockSvg.INPUT_SHAPE_ROUND_WIDTH = 12 * GRID_UNIT * multiplier;
  BlockSvg.INPUT_SHAPE_HEIGHT = 8 * GRID_UNIT * multiplier;
  BlockSvg.FIELD_HEIGHT = 8 * GRID_UNIT * multiplier; // NOTE: Determines string input heights
  BlockSvg.FIELD_WIDTH = 6 * GRID_UNIT * Math.min(multiplier, 1) + 10 * GRID_UNIT * Math.max(multiplier - 1, 0);
  BlockSvg.FIELD_DEFAULT_CORNER_RADIUS = 4 * GRID_UNIT * multiplier;
  BlockSvg.EDITABLE_FIELD_PADDING = 1.5 * GRID_UNIT * multiplier;
  BlockSvg.BOX_FIELD_PADDING = 2 * GRID_UNIT * multiplier;
  BlockSvg.DROPDOWN_ARROW_PADDING = 2 * GRID_UNIT * multiplier;
  BlockSvg.FIELD_WIDTH_MIN_EDIT = 8 * GRID_UNIT * multiplier;
  BlockSvg.INPUT_AND_FIELD_MIN_X = 12 * GRID_UNIT * multiplier;
  BlockSvg.INLINE_PADDING_Y = 1 * GRID_UNIT * multiplier; // For when reporters are inside reporters
  BlockSvg.SHAPE_IN_SHAPE_PADDING[1][0] = 5 * GRID_UNIT * multiplier;
  BlockSvg.SHAPE_IN_SHAPE_PADDING[1][2] = 5 * GRID_UNIT * multiplier;
  BlockSvg.SHAPE_IN_SHAPE_PADDING[1][3] = 5 * GRID_UNIT * multiplier;

  if (!originalPositionArrow) {
    originalPositionArrow = Blockly.FieldDropdown.prototype.positionArrow;
  }
  Blockly.FieldDropdown.prototype.positionArrow = function (x) {
    const arrowHeight = 12;
    this.arrowY_ = (BlockSvg.FIELD_HEIGHT - arrowHeight) / 2 + 1;
    return originalPositionArrow.call(this, x);
  };

  // Corner setting
  BlockSvg.CORNER_RADIUS = (1 * GRID_UNIT * cornerSize * 100) / 100;

  BlockSvg.TOP_LEFT_CORNER_START = "m 0," + BlockSvg.CORNER_RADIUS;

  BlockSvg.TOP_LEFT_CORNER =
    "A " + BlockSvg.CORNER_RADIUS + "," + BlockSvg.CORNER_RADIUS + " 0 0,1 " + BlockSvg.CORNER_RADIUS + ",0";

  BlockSvg.TOP_RIGHT_CORNER =
    "a " +
    BlockSvg.CORNER_RADIUS +
    "," +
    BlockSvg.CORNER_RADIUS +
    " 0 0,1 " +
    BlockSvg.CORNER_RADIUS +
    "," +
    BlockSvg.CORNER_RADIUS;

  BlockSvg.BOTTOM_RIGHT_CORNER =
    " a " +
    BlockSvg.CORNER_RADIUS +
    "," +
    BlockSvg.CORNER_RADIUS +
    " 0 0,1 -" +
    BlockSvg.CORNER_RADIUS +
    "," +
    BlockSvg.CORNER_RADIUS;

  BlockSvg.BOTTOM_LEFT_CORNER =
    "a " +
    BlockSvg.CORNER_RADIUS +
    "," +
    BlockSvg.CORNER_RADIUS +
    " 0 0,1 -" +
    BlockSvg.CORNER_RADIUS +
    ",-" +
    BlockSvg.CORNER_RADIUS;

  BlockSvg.INNER_TOP_LEFT_CORNER =
    " a " +
    BlockSvg.CORNER_RADIUS +
    "," +
    BlockSvg.CORNER_RADIUS +
    " 0 0,0 -" +
    BlockSvg.CORNER_RADIUS +
    "," +
    BlockSvg.CORNER_RADIUS;

  BlockSvg.INNER_BOTTOM_LEFT_CORNER =
    "a " +
    BlockSvg.CORNER_RADIUS +
    "," +
    BlockSvg.CORNER_RADIUS +
    " 0 0,0 " +
    BlockSvg.CORNER_RADIUS +
    "," +
    BlockSvg.CORNER_RADIUS;

  BlockSvg.TOP_RIGHT_CORNER_DEFINE_HAT =
    "a " +
    BlockSvg.DEFINE_HAT_CORNER_RADIUS +
    "," +
    BlockSvg.DEFINE_HAT_CORNER_RADIUS +
    " 0 0,1 " +
    BlockSvg.DEFINE_HAT_CORNER_RADIUS +
    "," +
    BlockSvg.DEFINE_HAT_CORNER_RADIUS +
    " v " +
    (1 * GRID_UNIT - BlockSvg.CORNER_RADIUS);

  BlockSvg.STATEMENT_INPUT_INNER_SPACE = 2.8 * GRID_UNIT - 0.9 * GRID_UNIT * cornerSize;
}

// 快照 BlockSvg 全部自有属性 + FieldDropdown.positionArrow，
// 供预览在单次同步渲染内临时改几何后还原（避免泄漏到主编辑器）。
export function snapshotGeometry(Blockly) {
  const BlockSvg = Blockly.BlockSvg;
  const snapshot = {};
  for (const key of Object.keys(BlockSvg)) {
    const value = BlockSvg[key];
    if (Array.isArray(value)) {
      snapshot[key] = value.map((row) => (Array.isArray(row) ? row.slice() : row));
    } else {
      snapshot[key] = value;
    }
  }
  snapshot.__positionArrow = Blockly.FieldDropdown.prototype.positionArrow;
  return snapshot;
}

export function restoreGeometry(Blockly, snapshot) {
  if (!snapshot) return;
  const BlockSvg = Blockly.BlockSvg;
  for (const key of Object.keys(snapshot)) {
    if (key === "__positionArrow") continue;
    BlockSvg[key] = snapshot[key];
  }
  if (snapshot.__positionArrow) {
    Blockly.FieldDropdown.prototype.positionArrow = snapshot.__positionArrow;
  }
}

// 从设置对象应用几何（缺省用 100），供插件 userscript 与设置页预览共用。
export function applyChangesFromSettings(Blockly, settings = {}) {
  const get = (key, dflt) => (settings[key] !== undefined ? settings[key] : dflt);
  return applyChanges(
    Blockly,
    get("paddingSize", 100),
    get("cornerSize", 100),
    get("notchSize", 100)
  );
}
