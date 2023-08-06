import { DecoderType, StringDecoder } from './stringDecoder';

export class BasicStringDecoder extends StringDecoder {
    /**
     * Returns the type of the decoder.
     */
    public get type(): DecoderType {
        return DecoderType.BASIC;
    }

    /**
     * Decodes a string.
     * @param index The index.
     */
    public getString(index: number): string {
        return this.stringArray[index + this.indexOffset];
    }

    /**
     * Decodes a string for the rotate string call.
     * @param index The index.
     * @returns THe string.
     */
    public getStringForRotation(index: number): string {
        return this.getString(index);
    }
}
