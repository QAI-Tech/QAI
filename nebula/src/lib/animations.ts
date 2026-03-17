export const timing = {
  fast: 0.15, // 150ms - micro-interactions (hovers, small state changes)
  normal: 0.2, // 200ms - standard animations (fades, scales)
  slow: 0.3, // 300ms - larger transitions (overlays, panels)
} as const;

export const easing = {
  default: "easeOut",
  smooth: [0.4, 0, 0.2, 1], // cubic-bezier for CSS
} as const;

export const transitions = {
  fast: { duration: timing.fast, ease: easing.default },
  normal: { duration: timing.normal, ease: easing.default },
  slow: { duration: timing.slow, ease: easing.default },

  normalDelayed: (delay: number) => ({
    duration: timing.normal,
    ease: easing.default,
    delay,
  }),
  slowDelayed: (delay: number) => ({
    duration: timing.slow,
    ease: easing.default,
    delay,
  }),
} as const;

export const variants = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
  },
  fadeInUp: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
  },
  fadeInScale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
  },
  slideUp: {
    initial: { opacity: 0, y: "100%" },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: "100%" },
  },
} as const;

export const staggerDelay = (index: number, base = 0.1, increment = 0.05) =>
  base + index * increment;
