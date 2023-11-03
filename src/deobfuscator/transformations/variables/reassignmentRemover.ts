import * as t from '@babel/types';
import { LogFunction, Transformation, TransformationProperties } from '../transformation';
import { findConstantVariable } from '../../helpers/variable';
import traverse from '@babel/traverse';

export class ReassignmentRemover extends Transformation {
    public static readonly properties: TransformationProperties = {
        key: 'reassignmentRemoval',
        rebuildScopeTree: true
    };

    /**
     * Executes the transformation.
     * @param log The log function.
     */
    public execute(log: LogFunction): boolean {
        const self = this;

        traverse(this.ast, {
            enter(path) {
                const variable = findConstantVariable<t.Identifier>(path, t.isIdentifier);
                if (!variable || variable.name == variable.expression.name) {
                    return;
                }

                for (const referencePath of variable.binding.referencePaths) {
                    referencePath.replaceWith(t.identifier(variable.expression.name));
                    self.setChanged();
                }

                // remove any declarations of variable we are replacing
                for (const declarationPath of variable.binding.constantViolations) {
                    if (declarationPath != path) {
                        declarationPath.remove();
                    }
                }
                path.remove();
            }
        });

        return this.hasChanged();
    }
}
