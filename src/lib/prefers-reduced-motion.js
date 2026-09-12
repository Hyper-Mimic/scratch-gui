/**
 * Returns true when the user asked for reduced motion.
 * Modals skip their close animation delay in that case, since the CSS animation is off too.
 * @returns {boolean} true when the exit animation should be skipped.
 */
const prefersReducedMotion = () => (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

export default prefersReducedMotion;
