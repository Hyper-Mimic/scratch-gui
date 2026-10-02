import React from 'react';
import styles from './spinner.css';
// 勾线 + 填充 logo 动画（<style> + <svg> 的内联片段），与启动 splash 页、项目加载 loader 共用同一份
import splashLogo from '../../playground/splash-logo.js';

const Loading = () => (
    <div className={styles.container}>
        {/* splashLogo 自带一个 <style> 与 <svg>，全局类名 .splash-logo 未被 CSS Modules 哈希，
            所以这里直接内联注入；尺寸/配色覆写见 spinner.css 的 .logo。 */}
        <div
            className={styles.logo}
            dangerouslySetInnerHTML={{__html: splashLogo}}
        />
    </div>
);

export default Loading;
