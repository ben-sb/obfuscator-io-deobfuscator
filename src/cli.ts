#!/usr/bin/env node
import { parse } from '@babel/parser';
import { program } from 'commander';
import fs from 'fs';
import { Deobfuscator } from './deobfuscator/deobfuscator';
import { defaultConfig } from './deobfuscator/transformations/config';

const pkg = require('../package.json');
program
    .name(pkg.name)
    .description(pkg.description)
    .version(pkg.version)
    .usage('<input_path> -o [output_path]')
    .argument('<input_path>', 'file to deobfuscate')
    .option('-o, --output [output_path]', 'output file path', 'deobfuscated.js')
    .option('-s, --silent', 'emit nothing to stdout')
    .action((input, options) => {
        const source = fs.readFileSync(input).toString();
        const ast = parse(source, { sourceType: 'unambiguous' });

        const deobfuscator = new Deobfuscator(ast, { ...defaultConfig, silent: !!options.silent });
        const output = deobfuscator.execute();

        fs.writeFileSync(options.output, output);
        if (!options.silent) {
            console.log(`Wrote deobfuscated file to ${options.output}`);
        }
    });

program.parse();
