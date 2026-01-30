
// Transparent/System style as requested
// Reverting explicit colors to allow system default (transparent bg, inherited font/color)

export const getSubjectColor = (id, name = '') => {
    // Return empty/transparent values so ICS does not force color and UI looks clean
    return { bg: null, text: null };
};

export const getEntityColorStyle = (id, name) => {
    return {
        backgroundColor: 'transparent',
        color: 'inherit',
        border: 'none',
        fontFamily: 'inherit' // Forces system font usage
    };
};
