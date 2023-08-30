import { parse, parseExpression } from '@babel/parser';
import fs from 'fs';
import { Deobfuscator } from './deobfuscator/deobfuscator';

// needed for webpack
(globalThis as any).parser = { parse, parseExpression };

const source = fs.readFileSync('input/source.js').toString();
const ast = parse(source, { sourceType: 'unambiguous' });

const deobfuscator = new Deobfuscator(ast);
const output = deobfuscator.execute();

fs.writeFileSync('output/output.js', output);
