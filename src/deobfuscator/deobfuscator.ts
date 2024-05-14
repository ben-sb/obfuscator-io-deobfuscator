import generate from '@babel/generator';
import * as t from '@babel/types';
import traverse from '@babel/traverse';
import { TransformationType } from './transformations/transformation';
import { Config, defaultConfig } from './transformations/config';
import { ObjectSimplifier } from './transformations/objects/objectSimplifier';
import { ProxyFunctionInliner } from './transformations/proxyFunctions/proxyFunctionInliner';
import { UnusedVariableRemover } from './transformations/variables/unusedVariableRemover';
import { ConstantPropgator } from './transformations/variables/constantPropagator';
import { ReassignmentRemover } from './transformations/variables/reassignmentRemover';
import { StringRevealer } from './transformations/strings/stringRevealer';
import { DeadBranchRemover } from './transformations/controlFlow/deadBranchRemover';
import { SequenceSplitter } from './transformations/controlFlow/sequenceSplitter';
import { PropertySimplifier } from './transformations/properties/propertySimplifier';
import { ExpressionSimplifier } from './transformations/expressions/expressionSimplifier';
import { ControlFlowRecoverer } from './transformations/controlFlow/controlFlowRecoverer';
import { ObjectPacker } from './transformations/objects/objectPacker';

export class Deobfuscator {
    private readonly ast: t.File;
    private readonly config: Config;
    private readonly transformationTypes: TransformationType[] = [
        UnusedVariableRemover,
        ConstantPropgator,
        ReassignmentRemover,
        DeadBranchRemover,
        ObjectPacker,
        ProxyFunctionInliner,
        ExpressionSimplifier,
        SequenceSplitter,
        ControlFlowRecoverer,
        PropertySimplifier,
        ObjectSimplifier,
        StringRevealer
    ];
    private static readonly MAX_ITERATIONS = 50;

    /**
     * Creates a new deobfuscator.
     * @param ast The AST.
     * @param config The config (optional).
     */
    constructor(ast: t.File, config: Config = defaultConfig) {
        this.ast = ast;
        this.config = config;
    }

    /**
     * Executes the deobfuscator.
     * @returns The simplified code.
     */
    public execute(): string {
        let types = this.transformationTypes.filter(t => this.config[t.properties.key].isEnabled);
        let i = 0;

        while (i < Deobfuscator.MAX_ITERATIONS) {
            let isModified = false;

            if (!this.config.silent) {
                console.log(`\n[${new Date().toISOString()}]: Starting pass ${i + 1}`);
            }
            for (const type of types) {
                const transformationConfig = this.config[type.properties.key];
                const transformation = new type(this.ast, transformationConfig);

                if (!this.config.silent) {
                    console.log(
                        `[${new Date().toISOString()}]: Executing ${
                            transformation.constructor.name
                        }`
                    );
                }

                let modified = false;
                try {
                    modified = transformation.execute(
                        console.log.bind(console, `[${transformation.constructor.name}]:`)
                    );
                } catch (err) {
                    console.error(err);
                }

                if (modified) {
                    isModified = true;
                }

                if (!this.config.silent) {
                    console.log(
                        `[${new Date().toISOString()}]: Executed ${
                            transformation.constructor.name
                        }, modified ${modified}`
                    );
                }

                if (type.properties.rebuildScopeTree) {
                    this.clearCache();
                }
            }

            i++;
            if (!isModified) {
                break;
            }
        }

        return generate(this.ast, { jsescOption: { minimal: true } }).code;
    }

    /**
     * Clears the traversal cache to force the scoping to be handled
     * again on the next traverse.
     */
    private clearCache(): void {
        (traverse as any).cache.clear();
    }
}
