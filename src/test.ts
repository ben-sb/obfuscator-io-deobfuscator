import { parse } from '@babel/parser';
import fs from 'fs';
import { Deobfuscator } from './deobfuscator/deobfuscator';

const source = fs.readFileSync('input/source.js').toString();
const ast = parse(source, { sourceType: 'unambiguous' });

const deobfuscator = new Deobfuscator(ast);
const output = deobfuscator.execute();

fs.writeFileSync('output/output.js', output);
