import * as t from '@babel/types';
import traverse, { NodePath } from '@babel/traverse';
import { LogFunction, Transformation, TransformationProperties } from '../transformation';
import { ConstantAssignmentVariable, findConstantVariable } from '../../helpers/variable';
import { copyExpression } from '../../helpers/misc';

export class ConstantPropgator extends Transformation {
    public static readonly properties: TransformationProperties = {
        key: 'constantPropagation',
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
                // note that in general this is unsafe, should perform data flow analysis to handle params that are constants regardless of their runtime value
                const variable = findConstantVariable<Literal>(path, isLiteral);
                if (!variable) {
                    return;
                }

                // avoid propagating params that are assigned to within branches
                if (variable instanceof ConstantAssignmentVariable) {
                    if (variable.binding.path.parentKey == 'params') {
                        const functionParent =
                            variable.binding.path.getStatementParent() as NodePath<t.Function>;
                        const parentPath = path.getStatementParent() as NodePath<t.Statement>;
                        if (parentPath.parent != functionParent.node.body) {
                            return;
                        }
                    }
                }

                for (const referencePath of variable.binding.referencePaths) {
                    const expression = copyExpression(variable.expression);
                    referencePath.replaceWith(expression);
                    self.setChanged();
                }

                variable.remove();
            }
        });

        return this.hasChanged();
    }
}

/**
 * Type for literals which can be safely propagated.
 * Excludes regular expressions due to https://github.com/ben-sb/obfuscator-io-deobfuscator/issues/38
 */
type Literal = Exclude<t.Literal, t.RegExpLiteral>;

/**
 * Returns whether a node is a literal that can be safely propagated.
 * @param node The node.
 * @returns Whether.
 */
const isLiteral = (node: t.Node): node is Literal => {
    return t.isLiteral(node) && !t.isRegExpLiteral(node);
};
