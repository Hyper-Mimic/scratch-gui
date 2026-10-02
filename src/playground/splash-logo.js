/* eslint-disable */
'use strict';

/**
 * HyperMimic splash logo —— 勾线 + 填充动画。
 *
 * 素材 stroke.svg 原本是单条 path（fill #FFFFFF + fill-rule evenodd），这里拆成两层：
 *   1) .splash-logo__fill    —— 原来的整条 path，勾线结束后淡入成实心图形
 *   2) .splash-logo__p--1..5 —— 5 个闭合子路径，逐条描边勾线
 *
 * 时间轴（整轮周期由 --splash-logo-cycle 控制，默认 15s）：
 *   0        -> 29.17%       正序勾线 #0->#4，每段带缓动曲线
 *   29.17% -> 50%            停顿，填充在 36% 前后淡入
 *   50       -> 79.17%  倒序擦除 #4->#0
 *   79.17% -> 100%      停顿
 *
 * 各段时长权重 = 周长 * (1-1.0) + 平均周长 * 1.0
 *   （0 = 完全按周长，短段会一闪而过；1 = 完全等分）
 *
 * 可调项（全部走 CSS 自定义属性，继承覆盖即可，改默认值请改 gen.py 后重跑）：
 *   --splash-logo-cycle         整轮时长，默认 15s
 *   --splash-logo-width         线宽，默认 10
 *   --splash-logo-fill-opacity  填充浓度，默认 0.55
 *   --splash-logo-size          显示尺寸，默认 min(128px, 40vw)
 *   --splash-logo-ink           线/填充色，默认 currentColor
 * 去掉光晕：删掉 SVG 根节点上的 splash-logo--glow 类。
 *
 * 注意：不使用 animation-direction: alternate —— 非线性缓动下 alternate 的时间
 * 镜像不再对称，因此正放/倒放都在 keyframes 里显式编码。
 *
 * 本文件仅作为模板片段注入 index.ejs / embed.ejs 的 splash 区域，
 * 不在 webpack entry 列表中，不会被打包。
 */

const STYLE = `<style>.splash-logo {
  display: block;
  width: var(--splash-logo-size, min(128px, 40vw));
  height: auto;
  /* 描线动的是 stroke-dashoffset（paint 属性），只能主线程重绘。把它关进自己的
     合成层后：栅格化（含下面的 drop-shadow 光晕）交给 raster 线程，脏区也不再
     扩散到整页 —— splash / loader / 积木区占位三处都受益。 */
  will-change: transform;
}
.splash-logo--glow {
  filter: drop-shadow(0 0 2px var(--splash-logo-ink, currentColor));
}

/* 填充层：垫在描线层下面，勾线结束后淡入 */
.splash-logo__fill {
  fill: var(--splash-logo-ink, currentColor);
  fill-rule: evenodd;
  stroke: none;
  opacity: 0;
  /* 只动 opacity：提升为独立合成层后，淡入淡出交给 compositor，
     避免每帧重新栅格化这条 1576 段的 evenodd 填充路径（主线程瓶颈） */
  will-change: opacity;
  animation: splash-logo-fill var(--splash-logo-cycle, 15s) linear infinite both;
}

/* 描线层 */
.splash-logo__p {
  fill: none;
  stroke: var(--splash-logo-ink, currentColor);
  stroke-width: var(--splash-logo-width, 10);
  stroke-linecap: round;
  stroke-linejoin: round;
  /* pathLength="1" 归一化：1 即整条路径长。
     gap 比 dash 长 0.01、隐藏态 offset 取 1.005，使等待中的路径整条落在
     gap 内部，避免 round cap 在起点残留圆点。 */
  stroke-dasharray: 1 1.01;
  stroke-dashoffset: 1.005;
  animation-duration: var(--splash-logo-cycle, 15s);
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  animation-fill-mode: both;
}
.splash-logo__p--1 { animation-name: splash-logo-draw-1; }
@keyframes splash-logo-draw-1 {
  0% { stroke-dashoffset: 1.005; animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1); }
  5.83% { stroke-dashoffset: 0; animation-timing-function: linear; }
  73.34% { stroke-dashoffset: 0; animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1); }
  79.17% { stroke-dashoffset: 1.005; }
  100% { stroke-dashoffset: 1.005; }
}
.splash-logo__p--2 { animation-name: splash-logo-draw-2; }
@keyframes splash-logo-draw-2 {
  0% { stroke-dashoffset: 1.005; }
  5.83% { stroke-dashoffset: 1.005; animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1); }
  11.67% { stroke-dashoffset: 0; animation-timing-function: linear; }
  67.5% { stroke-dashoffset: 0; animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1); }
  73.34% { stroke-dashoffset: 1.005; }
  100% { stroke-dashoffset: 1.005; }
}
.splash-logo__p--3 { animation-name: splash-logo-draw-3; }
@keyframes splash-logo-draw-3 {
  0% { stroke-dashoffset: 1.005; }
  11.67% { stroke-dashoffset: 1.005; animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1); }
  17.5% { stroke-dashoffset: 0; animation-timing-function: linear; }
  61.67% { stroke-dashoffset: 0; animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1); }
  67.5% { stroke-dashoffset: 1.005; }
  100% { stroke-dashoffset: 1.005; }
}
.splash-logo__p--4 { animation-name: splash-logo-draw-4; }
@keyframes splash-logo-draw-4 {
  0% { stroke-dashoffset: 1.005; }
  17.5% { stroke-dashoffset: 1.005; animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1); }
  23.34% { stroke-dashoffset: 0; animation-timing-function: linear; }
  55.83% { stroke-dashoffset: 0; animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1); }
  61.67% { stroke-dashoffset: 1.005; }
  100% { stroke-dashoffset: 1.005; }
}
.splash-logo__p--5 { animation-name: splash-logo-draw-5; }
@keyframes splash-logo-draw-5 {
  0% { stroke-dashoffset: 1.005; }
  23.34% { stroke-dashoffset: 1.005; animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1); }
  29.17% { stroke-dashoffset: 0; animation-timing-function: linear; }
  50% { stroke-dashoffset: 0; animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1); }
  55.83% { stroke-dashoffset: 1.005; }
  100% { stroke-dashoffset: 1.005; }
}
@keyframes splash-logo-fill {
  0% { opacity: 0; }
  29.17% { opacity: 0; animation-timing-function: cubic-bezier(0.33, 0, 0.67, 1); }
  36% { opacity: var(--splash-logo-fill-opacity, 0.55); animation-timing-function: linear; }
  50% { opacity: var(--splash-logo-fill-opacity, 0.55); animation-timing-function: cubic-bezier(0.33, 0, 0.67, 1); }
  56% { opacity: 0; }
  100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .splash-logo__p {
    animation: none;
    stroke-dashoffset: 0;
  }
  .splash-logo__fill {
    animation: none;
    opacity: 0;
  }
}
</style>`;

const PATHS = [
    "M0 66.58L0.15 377.91L2.41 391.18L7.46 404.09L14.82 415.34L24.29 424.89L35.47 432.33L47.53 437.25L60.32 439.72L73.35 439.64L86.1 437.01L98.1 431.95L108.87 424.63L118.15 415.2L127.27 424.45L138.05 431.77L150.44 436.96L163.21 439.5L375.2 439.98L389.31 438.11L402.7 433.26L414.76 425.66L424.92 415.66L430.96 406.95L435.7 397L438.64 386.81L439.94 376.28L439.98 64.94L438.11 50.8L433.27 37.37L425.69 25.3L415.71 15.11L404.52 7.67L392.46 2.75L379.67 0.28L366.65 0.36L353.9 2.99L341.9 8.05L331.12 15.37L321.85 24.8L312.41 15.29L301.59 8.04L289.56 3.04L276.38 0.46L58.29 0.5L46.36 3.11L35.47 7.67L25.24 14.34L16.67 22.48L9.66 32L4.3 43L1.05 54.79L0 66.58Z",
    "M25.09 66.53L25.47 379.04L30.71 394.32L35.46 400.91L41.6 406.6L55.89 413.53L71.99 414.52L85 410.48L96.01 402.4L103.67 391.41L107.47 378.28L107.75 108.14L270.52 108.14L279.32 107.14L293.23 101.16L304.21 90.36L310.48 76.28L311.22 61.13L307.3 48.3L299.68 37.58L289.08 29.81L276.34 25.72L65.66 25.1L50.13 28.44L36.84 37.59L28.14 50.91L25.09 66.53Z",
    "M332.24 66.53L332.24 331.85L168.96 331.86L153.43 335.2L143.5 341.25L135.63 349.84L130.55 360.05L128.42 371.76L129.63 383.35L134.01 394.15L141.22 403.29L150.46 409.95L159.43 413.42L168.96 414.71L376.11 414.82L386.53 412.81L396.11 408.2L404.02 401.48L410.02 393L413.6 383.78L414.9 373.97L414.9 66.28L413.78 56.95L407.8 43.3L397.37 32.64L383.86 26.39L368.76 25.37L354.31 29.86L342.61 39.08L334.91 51.85L332.24 66.53Z",
    "M171.64 127.68L266.82 127.7L282.06 131.13L295.3 140.36L304.01 153.97L306.87 169.88L305.87 178.19L303.33 185.9L297.97 194.81L290.58 202.09L281.36 207.4L271.36 210.14L170.62 210.54L155.12 207.1L143.32 199.3L134.95 188.2L130.71 174.95L131.15 160.78L136.32 147.59L145.62 136.92L157.95 130.01L171.64 127.68Z",
    "M171.64 229.2L266.82 229.22L282.06 232.65L289.14 236.61L295.3 241.88L304.01 255.49L306.87 271.4L305.87 279.72L303.33 287.43L297.82 296.53L290.58 303.61L281.59 308.82L271.36 311.67L170.62 312.07L154.89 308.52L143.14 300.65L134.84 289.49L130.68 276.22L131.2 262.05L136.45 248.9L145.81 238.29L157.95 231.53L171.64 229.2Z",
];

const SVG = '<svg class="splash-logo splash-logo--glow" viewBox="-6 -6 452 452" aria-hidden="true" ' +
    'xmlns="http://www.w3.org/2000/svg">' +
    '<path class="splash-logo__fill" d="' + PATHS.join('') + '"/>' +
    '<path class="splash-logo__p splash-logo__p--1" pathLength="1" d="' + PATHS[0] + '"/>' +
    '<path class="splash-logo__p splash-logo__p--2" pathLength="1" d="' + PATHS[1] + '"/>' +
    '<path class="splash-logo__p splash-logo__p--3" pathLength="1" d="' + PATHS[2] + '"/>' +
    '<path class="splash-logo__p splash-logo__p--4" pathLength="1" d="' + PATHS[3] + '"/>' +
    '<path class="splash-logo__p splash-logo__p--5" pathLength="1" d="' + PATHS[4] + '"/>' +
    '</svg>';

module.exports = STYLE + SVG;
