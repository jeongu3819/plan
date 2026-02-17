/**
 * HSL color utilities for adaptive sidebar theming.
 * Supports contrast checks, lightness adjustment, and auto text color.
 */

// ── Parse hex to RGB ──
export function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return [r, g, b];
}

// ── RGB → HSL ──
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return [h * 360, s * 100, l * 100];
}

// ── HSL → RGB ──
function hue2rgb(p: number, q: number, t: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h /= 360; s /= 100; l /= 100;
    let r: number, g: number, b: number;
    if (s === 0) {
        r = g = b = l;
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// ── RGB → Hex ──
export function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

// ── Hex → HSL ──
export function hexToHsl(hex: string): [number, number, number] {
    return rgbToHsl(...hexToRgb(hex));
}

// ── HSL → Hex ──
export function hslToHex(h: number, s: number, l: number): string {
    return rgbToHex(...hslToRgb(h, s, l));
}

// ── Relative luminance (sRGB) ──
export function luminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map(c => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// ── Contrast ratio between two hex colors ──
export function contrastRatio(hex1: string, hex2: string): number {
    const l1 = luminance(...hexToRgb(hex1));
    const l2 = luminance(...hexToRgb(hex2));
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

// ── Auto text color: white or black based on WCAG AA ──
export function autoTextColor(bgHex: string): string {
    const lum = luminance(...hexToRgb(bgHex));
    return lum > 0.179 ? '#1A1D29' : '#FFFFFF';
}

// ── Derive sidebar color from background ──
export function deriveSidebarColor(bgHex: string): string {
    const [h, s, l] = hexToHsl(bgHex);
    // Darker backgrounds (l < 50): make sidebar slightly darker
    // Lighter backgrounds (l >= 50): make sidebar much darker for contrast
    let sidebarL: number;
    if (l < 30) {
        sidebarL = Math.max(5, l - 8);
    } else if (l < 50) {
        sidebarL = Math.max(8, l - 15);
    } else {
        sidebarL = Math.max(10, l - 40);
    }
    // Boost saturation slightly for richness
    const sidebarS = Math.min(100, s + 10);
    return hslToHex(h, sidebarS, sidebarL);
}

// ── Derive sidebar hover color ──
export function deriveSidebarHover(sidebarHex: string): string {
    const [h, s, l] = hexToHsl(sidebarHex);
    return hslToHex(h, Math.min(100, s + 5), Math.min(100, l + 8));
}

// ── Derive sidebar active highlight ──
export function deriveSidebarActive(sidebarHex: string): string {
    const [h, s, l] = hexToHsl(sidebarHex);
    return hslToHex(h, Math.min(100, s + 15), Math.min(95, l + 12));
}

// ── Derive sidebar muted text ──
export function deriveSidebarMuted(sidebarHex: string): string {
    const [h, s, l] = hexToHsl(sidebarHex);
    return hslToHex(h, Math.max(5, s - 20), Math.min(90, l + 25));
}

// ── Derive sidebar divider ──
export function deriveSidebarDivider(sidebarHex: string): string {
    const [h, s, l] = hexToHsl(sidebarHex);
    return hslToHex(h, Math.max(5, s - 10), Math.min(90, l + 12));
}
