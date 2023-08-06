import * as t from '@babel/types';

/**
 * Returns whether a node is a unary expression that represents a negative number.
 * @param node The AST node.
 * @returns Whether.
 */
export function isNegativeNumericLiteral(
    node: t.Node
): node is t.UnaryExpression & { operator: '-'; argument: t.NumericLiteral } {
    return t.isUnaryExpression(node) && node.operator == '-' && t.isNumericLiteral(node.argument);
}
