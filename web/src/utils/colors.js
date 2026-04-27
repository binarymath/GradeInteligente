
// Transparent/System style as requested
// Reverting explicit colors to allow system default (transparent bg, inherited font/color)

export const getSubjectColor = (id, name = '') => {
    // Hash string to pseudo-random color
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    // Convert HSL to HEX purely for ICS compatibility
    const h = hue;
    const s = 65;
    const l = 50;
    const a = s * Math.min(l, 100 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color / 100).toString(16).padStart(2, '0');
    };
    const hex = `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
    
    return { bg: hex, text: '#ffffff' };
};

export const getEntityColorStyle = (id, name) => {
    return {
        backgroundColor: 'transparent',
        color: 'inherit',
        border: 'none',
        fontFamily: 'inherit' // Forces system font usage
    };
};
