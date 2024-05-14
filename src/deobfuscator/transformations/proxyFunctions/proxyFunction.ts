import * as t from '@babel/types';
import { ConstantVariable } from '../../helpers/variable';
import { copyExpression } from '../../helpers/misc';
import traverse, { NodePath } from '@babel/traverse';

export type ProxyFunctionExpression = t.Function & {
    params: t.Identifier[];
    body:
        | (t.BlockStatement & {
              body: { [0]: t.ReturnStatement & { argument: t.Expression | undefined } };
          })
        | t.Expression;
};

/**
 * Returns whether a proxy function expression.
 * @param node The node.
 * @returns Whether.
 */
export const isProxyFunctionExpression = (node: t.Node): node is ProxyFunctionExpression => {
    return (
        t.isFunction(node) &&
        node.params.every(p => t.isIdentifier(p)) &&
        ((t.isBlockStatement(node.body) &&
            node.body.body.length == 1 &&
            t.isReturnStatement(node.body.body[0]) &&
            (node.body.body[0].argument == undefined ||
                (t.isExpression(node.body.body[0].argument) &&
                    isProxyValue(node.body.body[0].argument)))) ||
            (t.isArrowFunctionExpression(node) &&
                t.isExpression(node.body) &&
                isProxyValue(node.body)))
    );
};

/**
 * Returns whether a node is a valid proxy function return value.
 * @param node The node.
 * @returns Whether.
 */
const isProxyValue = (node: t.Node): boolean => {
    if (t.isFunction(node) || t.isBlockStatement(node) || t.isSequenceExpression(node)) {
        return false;
    }
    let isValid = true;

    traverse(node, {
        ['SequenceExpression|BlockStatement|Function|AssignmentExpression'](path) {
            isValid = false;
            path.stop();
        },
        noScope: true
    });

    return isValid;
};

type Argument = t.ArgumentPlaceholder | t.JSXNamespacedName | t.SpreadElement | t.Expression;

export class ProxyFunction {
    private readonly expression: ProxyFunctionExpression;

    /**
     * Creates a new proxy function.
     * @param expression The proxy function expression.
     */
    constructor(expression: ProxyFunctionExpression) {
        this.expression = expression;
    }

    /**
     * Returns the replacement for a call of the proxy function.
     * @param args The arguments of the call.
     * @returns The replacement expression.
     */
    public getReplacement(args: Argument[]): t.Expression {
        const expression = t.isExpression(this.expression.body)
            ? copyExpression(this.expression.body)
            : this.expression.body.body[0].argument
            ? copyExpression(this.expression.body.body[0].argument)
            : t.identifier('undefined');
        this.replaceParameters(expression, args);
        return expression;
    }

    /**
     * Replaces usages of the proxy function's parameters with the concrete arguments for a given call.
     * @param expression The expression.
     * @param args The arguments of the call.
     */
    private replaceParameters(expression: t.Expression, args: Argument[]): void {
        const paramMap = new Map<string, t.Node>(
            this.expression.params.map((param: t.Identifier, index: number) => [
                param.name,
                args[index] || t.identifier('undefined')
            ])
        );
        const pathsToReplace: [NodePath, t.Expression][] = [];

        traverse(expression, {
            enter(path) {
                if (
                    t.isIdentifier(path.node) &&
                    // check it is a real identifier
                    !(
                        path.parentPath &&
                        path.parentPath.isMemberExpression() &&
                        path.key == 'property'
                    ) &&
                    paramMap.has(path.node.name)
                ) {
                    const replacement = paramMap.get(path.node.name) as t.Expression;
                    pathsToReplace.push([path, replacement]);
                }
            },
            noScope: true
        });

        for (const [path, replacement] of pathsToReplace) {
            path.replaceWith(replacement);
        }
    }
}

export class ProxyFunctionVariable extends ProxyFunction {
    private readonly variable: ConstantVariable<ProxyFunctionExpression>;

    /**
     * Creates a new proxy function variable.
     * @param variable The variable.
     */
    constructor(variable: ConstantVariable<ProxyFunctionExpression>) {
        super(variable.expression);
        this.variable = variable;
    }

    /**
     * Returns the calls to the proxy function.
     * @returns The calls to the proxy function.
     */
    public getCalls(): NodePath[] {
        return this.variable.binding.referencePaths;
    }

    /**
     * Attempts to replace a call of the proxy function.
     * @param path The path of the call.
     * @returns Whether it was replaced.
     */
    public replaceCall(path: NodePath): boolean {
        if (path.parentPath && path.parentPath.isCallExpression() && path.key == 'callee') {
            const expression = this.getReplacement(path.parentPath.node.arguments);
            path.parentPath.replaceWith(expression);
            return true;
        } else {
            return false;
        }
    }
}
