import * as t from '@babel/types';
import { isTypeFunction } from './variable';

export type DeclarationOrAssignmentStatement<T extends t.LVal, V extends t.Expression> =
    | (t.VariableDeclaration & {
          declarations: [t.VariableDeclarator & { id: T; init: V }];
      })
    | (t.ExpressionStatement & { expression: t.AssignmentExpression & { left: T; right: V } });

/**
 * Checks whether a node is a variable declaration or assignment expression
 * within an expression statement that is initialising a variable that
 * satisfies the provided constraints.
 * @param node The AST node.
 * @param isId The function that determines whether the variable being declared matches.
 * @param isValue The function that determines whether the value the variable is initialised to matches.
 * @returns Whether.
 */
export function isDeclarationOrAssignmentStatement<T extends t.LVal, V extends t.Expression>(
    node: t.Node,
    isId: isTypeFunction<T> | ((node: t.Node) => boolean),
    isValue: isTypeFunction<V> | ((node: t.Node) => boolean)
): node is DeclarationOrAssignmentStatement<T, V> {
    return (
        (t.isVariableDeclaration(node) &&
            node.declarations.length == 1 &&
            isId(node.declarations[0].id) &&
            node.declarations[0].init &&
            isValue(node.declarations[0].init)) ||
        (t.isExpressionStatement(node) &&
            t.isAssignmentExpression(node.expression) &&
            isId(node.expression.left) &&
            isValue(node.expression.right))
    );
}

/**
 * Checks whether a node is a variable declaration or assignment expression
 * that is initialising a variable that satisfies the provided constraints.
 * @param node The AST node.
 * @param isId The function that determines whether the variable being declared matches.
 * @param isValue The function that determines whether the value the variable is initialised to matches.
 * @returns Whether.
 */
export type DeclarationOrAssignmentExpression<T extends t.LVal, V extends t.Expression> =
    | (t.VariableDeclaration & {
          declarations: [t.VariableDeclarator & { id: T; init: V }];
      })
    | (t.AssignmentExpression & { left: T; right: V });

export function isDeclarationOrAssignmentExpression<T extends t.LVal, V extends t.Expression>(
    node: t.Node,
    isId: isTypeFunction<T> | ((node: t.Node) => boolean),
    isValue: isTypeFunction<V> | ((node: t.Node) => boolean)
): node is DeclarationOrAssignmentExpression<T, V> {
    return (
        (t.isVariableDeclaration(node) &&
            node.declarations.length == 1 &&
            isId(node.declarations[0].id) &&
            node.declarations[0].init &&
            isValue(node.declarations[0].init)) ||
        (t.isAssignmentExpression(node) && isId(node.left) && isValue(node.right))
    );
}
