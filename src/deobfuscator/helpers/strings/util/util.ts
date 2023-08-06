const BASE_64_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';

/**
 * Base 64 transforms a string.
 * @param str The string.
 * @returns The transformed string.
 */
export function base64Transform(str: string): string {
    let a = '';
    let c = 0;
    let d = 0;
    let e;

    for (let i = 0; (e = str.charAt(i++)); ) {
        e = BASE_64_ALPHABET.indexOf(e);
        if (e != -1) {
            d = c % 4 ? d * 64 + e : e;
            if (c++ % 4) {
                a += String.fromCharCode(255 & (d >> ((-2 * c) & 6)));
            }
        }
    }

    const encoded = a
        .split('')
        .map(c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('');
    return decodeURIComponent(encoded);
}
