import { parse } from '@babel/parser';
import { Deobfuscator } from './deobfuscator/deobfuscator';
import { Config, defaultConfig } from './deobfuscator/transformations/config';

/**
 * Deobfuscates a provided JS program.
 * @param source The source code.
 * @param config The deobfuscator configuration.
 * @returns The deobfuscated code.
 */
export function deobfuscate(source: string, config: Config = defaultConfig): string {
    const ast = parse(source);

    const deobfuscator = new Deobfuscator(ast, config);
    const output = deobfuscator.execute();

    return output;
}
