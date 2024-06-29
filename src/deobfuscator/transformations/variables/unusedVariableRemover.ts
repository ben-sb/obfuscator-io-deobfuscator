import * as t from '@babel/types';
import traverse from '@babel/traverse';
import { LogFunction, Transformation, TransformationProperties } from '../transformation';

export class UnusedVariableRemover extends Transformation {
    public static readonly properties: TransformationProperties = {
        key: 'unusedVariableRemoval',
        rebuildScopeTree: true
    };

    /**
     * Executes the transformation.
     * @param log The log function.
     */
    public execute(log: LogFunction): boolean {
        const self = this;

        traverse(this.ast, {
            Scope(path) {
                for (const binding of Object.values(path.scope.bindings)) {
                    if (
                        !binding.referenced &&
                        binding.constantViolations.length == 0 &&
                        binding.path.key != 'handler' &&
                        !binding.path.isFunctionExpression() // don't remove named function expressions
                    ) {
                        // ensure we don't remove variables that are exposed globally
                        if (
                            t.isProgram(binding.scope.block) &&
                            (binding.kind == 'var' || binding.kind == 'hoisted')
                        ) {
                            return;
                        }

                        const paths =
                            binding.path.parentKey == 'params'
                                ? [...binding.referencePaths, ...binding.constantViolations]
                                : [
                                      binding.path,
                                      ...binding.referencePaths,
                                      ...binding.constantViolations
                                  ];

                        for (const path of paths) {
                            // skip any patterns declaring other variables
                            if (
                                path.isVariableDeclarator() &&
                                ((t.isArrayPattern(path.node.id) &&
                                    path.node.id.elements.length > 1) ||
                                    (t.isObjectPattern(path.node.id) &&
                                        path.node.id.properties.length > 1))
                            ) {
                                continue;
                            }

                            if (
                                path.key == 'consequent' ||
                                path.key == 'alternate' ||
                                path.key == 'body'
                            ) {
                                path.replaceWith(t.blockStatement([]));
                            } else {
                                // check if we are going to create an empty variable declaration (otherwise can sometimes trigger Babel build error)
                                const parentPath = path.parentPath;
                                if (
                                    parentPath &&
                                    parentPath.isVariableDeclaration() &&
                                    parentPath.node.declarations.length == 1
                                ) {
                                    parentPath.remove();
                                } else {
                                    path.remove();
                                }
                            }

                            if (paths.length > 0) {
                                self.setChanged();
                            }
                        }
                    }
                }
            }
        });

        return this.hasChanged();
    }
}
