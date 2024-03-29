import * as t from '@babel/types';
import traverse, { NodePath } from '@babel/traverse';
import { LogFunction, Transformation, TransformationProperties } from '../transformation';

export class SequenceSplitter extends Transformation {
    public static readonly properties: TransformationProperties = {
        key: 'sequenceSplitting'
    };

    /**
     * Executes the transformation.
     * @param log The log function.
     */
    public execute(log: LogFunction): boolean {
        const self = this;

        traverse(this.ast, {
            ConditionalExpression(path) {
                if (path.parentPath && path.parentPath.isExpressionStatement()) {
                    const replacement = t.ifStatement(
                        path.node.test,
                        t.expressionStatement(path.node.consequent),
                        t.expressionStatement(path.node.alternate)
                    );

                    if (
                        path.parentPath.parentPath &&
                        path.parentPath.parentPath.key == 'alternate' &&
                        path.parentPath.parentPath.isBlockStatement() &&
                        path.parentPath.parentPath.node.body.length == 1
                    ) {
                        path.parentPath.parentPath.replaceWith(replacement);
                    } else {
                        path.parentPath.replaceWith(replacement);
                    }
                    path.skip();
                    self.setChanged();
                }
            },
            LogicalExpression(path) {
                if (
                    (path.node.operator == '&&' || path.node.operator == '||') &&
                    path.parentPath &&
                    path.parentPath.isExpressionStatement()
                ) {
                    const test =
                        path.node.operator == '&&'
                            ? path.node.left
                            : t.unaryExpression('!', path.node.left);
                    const replacement = t.ifStatement(test, t.expressionStatement(path.node.right));

                    if (
                        path.parentPath.parentPath &&
                        path.parentPath.parentPath.key == 'alternate' &&
                        path.parentPath.parentPath.isBlockStatement() &&
                        path.parentPath.parentPath.node.body.length == 1
                    ) {
                        path.parentPath.parentPath.replaceWith(replacement);
                    } else {
                        path.parentPath.replaceWith(replacement);
                    }
                    path.skip();
                    self.setChanged();
                }
            },
            ['ForStatement|WhileStatement|DoWhileStatement' as any](
                path: NodePath<t.ForStatement | t.WhileStatement | t.DoWhileStatement>
            ) {
                if (!t.isBlockStatement(path.node.body)) {
                    path.node.body = t.blockStatement([path.node.body]);
                    self.setChanged();
                }
            },
            IfStatement(path) {
                if (!t.isBlockStatement(path.node.consequent)) {
                    path.node.consequent = t.blockStatement([path.node.consequent]);
                    self.setChanged();
                }
                if (
                    path.node.alternate &&
                    !t.isBlockStatement(path.node.alternate) &&
                    !t.isIfStatement(path.node.alternate)
                ) {
                    path.node.alternate = t.blockStatement([path.node.alternate]);
                    self.setChanged();
                }
            },
            VariableDeclaration(path) {
                if (path.node.declarations.length > 1) {
                    const replacements = path.node.declarations.map(d =>
                        t.variableDeclaration(path.node.kind, [d])
                    );

                    if (
                        path.parentPath &&
                        path.parentPath.isForStatement() &&
                        path.parentKey == 'init'
                    ) {
                        const lastDeclaration = replacements.pop();
                        path.parentPath.insertBefore(replacements);
                        path.parentPath.node.init = lastDeclaration;
                    } else {
                        path.replaceWithMultiple(replacements);
                    }
                    self.setChanged();
                }
            },
            SequenceExpression(path) {
                const expressions = path.node.expressions;
                if (expressions.length == 1) {
                    path.replaceWith(expressions[0]);
                    self.setChanged();
                    return;
                }

                let outerPath: NodePath = path;
                while (!t.isStatement(outerPath.node)) {
                    const parent = outerPath.parentPath;
                    if (!parent) {
                        return;
                    }

                    if (
                        (parent.isConditionalExpression() &&
                            (outerPath.key == 'consequent' || outerPath.key == 'alternate')) ||
                        (parent.isLogicalExpression() && outerPath.key == 'right') ||
                        (parent.isForStatement() &&
                            (outerPath.key == 'test' || outerPath.key == 'update')) ||
                        (parent.isDoWhileStatement() && outerPath.key == 'test') ||
                        (parent.isArrowFunctionExpression() && outerPath.key == 'body')
                    ) {
                        return;
                    }

                    outerPath = parent;
                }

                const lastExpression = expressions[expressions.length - 1];
                if (self.isExcluded(lastExpression)) {
                    const firstExpressions = expressions.splice(0, expressions.length - 2);

                    if (firstExpressions.length > 0) {
                        const expressionStatements = firstExpressions.map(e =>
                            t.expressionStatement(e)
                        );
                        outerPath.insertBefore(expressionStatements);
                        self.setChanged();
                    }
                } else {
                    const lastExpression = expressions.splice(expressions.length - 1, 1)[0];
                    const expressionStatements = expressions.map(e => t.expressionStatement(e));
                    outerPath.insertBefore(expressionStatements);
                    path.replaceWith(lastExpression);
                    self.setChanged();
                }
            }
        });

        return this.hasChanged();
    }

    /**
     * Returns whether a node that is the last in a sequence expression
     * is excluded from being placed on its own.
     * @param node The AST node.
     * @returns Whether.
     */
    private isExcluded(node: t.Node): boolean {
        return t.isIdentifier(node) && node.name == 'eval';
    }
}
