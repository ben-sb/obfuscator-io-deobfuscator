import { base64Transform } from '../util/util';
import { DecoderType, StringDecoder } from './stringDecoder';

export class Base64StringDecoder extends StringDecoder {
    private readonly stringCache: Map<string, string>;

    /**
     * Creates a new base 64 string decoder.
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
        return DecoderType.BASE_64;
    }

    /**
     * Decodes a string.
     * @param index The index.
     * @returns The string.
     */
    public getString(index: number): string {
        const cacheKey = index + this.stringArray[0];
        if (this.stringCache.has(cacheKey)) {
            return this.stringCache.get(cacheKey) as string;
        }

        const encoded = this.stringArray[index + this.indexOffset];
        const str = base64Transform(encoded);
        this.stringCache.set(cacheKey, str);
        return str;
    }

    /**
     * Decodes a string for the rotate string call.
     * @param index The index.
     * @returns THe string.
     */
    public getStringForRotation(index: number): string {
        if (this.isFirstCall) {
            this.isFirstCall = false;
            throw new Error();
        }

        return this.getString(index);
    }
}
