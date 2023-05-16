export function trim(str: string): string {
    return str.replace(/^\s+|\s+$/g, '');
}

export function normalizeUnicode(str: string): string {
    return str.normalize('NFKC'); // <-- NFKC runs decompose + compose, in favor of compatibility, in contrast to NFKD. See https://unicode.org/reports/tr15/#Norm_Forms, https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize#compatibility_normalization
}