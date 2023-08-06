import { base64Transform } from '../util/util';
import { DecoderType, StringDecoder } from './stringDecoder';

export class Rc4StringDecoder extends StringDecoder {
    private readonly stringCache: Map<string, string>;

    /**
     * Creates a new RC4 string decoder.
     * @param stringArray The string array.
     * @param indexOffset The offset used when accessing elements by index.
     */
    constructor(stringArray: string[], indexOffset: number) {
        super(stringArray, indexOffset);
        this.stringCache = new Map();
    }

    /**
     * Returns the type of the decoder.
     */
    public get type(): DecoderType {
        return DecoderType.RC4;
    }

    /**
     * Decodes a string.
     * @param index The index.
     */
    public getString(index: number, key: string): string {
        const cacheKey = index + this.stringArray[0];
        if (this.stringCache.has(cacheKey)) {
            return this.stringCache.get(cacheKey) as string;
        }

        const encoded = this.stringArray[index + this.indexOffset];
        const str = this.rc4Decode(encoded, key);
        this.stringCache.set(cacheKey, str);
        return str;
    }

    /**
     * Decodes a string for the rotate string call.
     * @param index The index.
     * @returns THe string.
     */
    public getStringForRotation(index: number, key: string): string {
        if (this.isFirstCall) {
            this.isFirstCall = false;
            throw new Error();
        }

        return this.getString(index, key);
    }

    /**
     * Decodes a string encoded with RC4.
     * @param str The RC4 encoded string.
     * @param key The key.
     * @returns The decoded string.
     */
    private rc4Decode(str: string, key: string): string {
        const s = [];
        let j = 0;
        let decoded = '';
        str = base64Transform(str);

        for (var i = 0; i < 256; i++) {
            s[i] = i;
        }

        for (var i = 0; i < 256; i++) {
            j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
            [s[i], s[j]] = [s[j], s[i]];
        }

        i = 0;
        j = 0;
        for (let y = 0; y < str.length; y++) {
            i = (i + 1) % 256;
            j = (j + s[i]) % 256;
            [s[i], s[j]] = [s[j], s[i]];
            decoded += String.fromCharCode(str.charCodeAt(y) ^ s[(s[i] + s[j]) % 256]);
        }

        return decoded;
    }
}
