export abstract class StringDecoder {
    protected readonly stringArray: string[];
    protected readonly indexOffset: number;
    protected isFirstCall: boolean;

    /**
     * Creates a new string decoder.
     * @param stringArray The string array.
     * @param indexOffset The offset used when accessing elements by index.
     */
    constructor(stringArray: string[], indexOffset: number) {
        this.stringArray = stringArray;
        this.indexOffset = indexOffset;
        this.isFirstCall = true;
    }

    /**
     * Returns the type of the decoder.
     */
    public abstract get type(): DecoderType;

    /**
     * Decodes a string.
     * @param args The arguments of the decode call.
     */
    public abstract getString(...args: (number | string)[]): string;

    /**
     * Decodes a string for the string rotation call.
     * @param args The arguments of the decode call.
     */
    public abstract getStringForRotation(...args: (number | string)[]): string;
}

export enum DecoderType {
    BASIC = 'BASIC',
    BASE_64 = 'BASE_64',
    RC4 = 'RC4'
}
