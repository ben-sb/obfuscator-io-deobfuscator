import * as t from '@babel/types';
import { LogFunction, Transformation, TransformationConfig, TransformationProperties } from '../transformation';
import traverse, { NodePath } from '@babel/traverse';
import { findConstantVariable } from '../../helpers/variable';
import { ProxyObject, ProxyObjectExpression, isProxyObjectExpression } from './proxyObject';
import { getProperty, setProperty } from '../../helpers/misc';

interface ObjectSimplificationConfig extends TransformationConfig {
    unsafeReplace?: boolean;
}

export class ObjectSimplifier extends Transformation {
    public static readonly properties: TransformationProperties = {
        key: 'objectSimplification',
        rebuildScopeTree: true
    };
    private readonly config: ObjectSimplificationConfig;

    /**
     * Creates a new transformation.
     * @param ast The AST.
     * @param config The config.
     */
    constructor(ast: t.File, config: ObjectSimplificationConfig) {
        super(ast, config);
        this.config = config;
    }

    /**
     * Executes the transformation.
     * @param log The log function.
     * @returns Whether any changes were made.
     */
    public execute(log: LogFunction): boolean {
        const self = this;
        const usages: [NodePath, ProxyObject][] = [];
        let depth = 0;

        traverse(this.ast, {
            enter(path) {
                setProperty(path, 'depth', depth++);
                const variable = findConstantVariable<ProxyObjectExpression>(path, isProxyObjectExpression);
                if (!variable) {
                    return;
                }

                // check if object values are modified
                for (const referencePath of variable.binding.referencePaths) {
                    if (
                        referencePath.parentPath &&
                        referencePath.parentPath.isMemberExpression() &&
                        referencePath.parentPath.parentPath &&
                        referencePath.parentPath.parentPath.isAssignmentExpression() &&
                        referencePath.parentPath.key == 'left'
                    ) {
                        if (!self.config.unsafeReplace) {
                            log(`Not replacing object ${variable.name} as it is modified`);
                            path.skip();
                            return;
                        }
                    }
                }

                const proxyObject = new ProxyObject(variable);
                proxyObject.process();

                usages.push(...proxyObject.getUsages().map(p => [p, proxyObject] as [NodePath, ProxyObject]));
            }
        });

        // replace innermost usages first
        usages.sort((a, b) => getProperty(b[0], 'depth') - getProperty(a[0], 'depth'));
        for (const [path, proxyObject] of usages) {
            if (proxyObject.replaceUsage(path)) {
                this.setChanged();
            }
        }

        return this.hasChanged();
    }
}
