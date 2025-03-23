import * as t from '@babel/types';
import traverse from '@babel/traverse';
import { LogFunction, Transformation, TransformationProperties } from '../transformation';
import { isNegativeNumericLiteral } from '../../helpers/expression';

export class ExpressionSimplifier extends Transformation {
    public static readonly properties: TransformationProperties = {
        key: 'expressionSimplification'
    };
    private static readonly RESOLVABLE_UNARY_OPERATORS: Set<string> = new Set([
        '-',
        '+',
        '!',
        '~',
        'typeof',
        'void'
    ]);
    private static readonly RESOLVABLE_BINARY_OPERATORS: Set<string> = new Set([
        '==',
        '!=',
        '===',
        '!==',
        '<',
        '<=',
        '>',
        '>=',
        '<<',
        '>>',
        '>>>',
        '+',
        '-',
        '*',
        '/',
        '%',
        '**',
        '|',
        '^',
        '&'
    ]);

    /**
     * Executes the transformation.
     * @param log The log function.
     */
    public execute(log: LogFunction): boolean {
        const self = this;

        traverse(this.ast, {
            ['UnaryExpression|BinaryExpression'](path) {
                const replacement = path.isUnaryExpression()
                    ? self.simplifyUnaryExpression(path.node)
                    : self.simplifyBinaryExpression(path.node as t.BinaryExpression);
                if (replacement) {
                    path.replaceWith(replacement);
                    self.setChanged();
                }
            }
        });

        return this.hasChanged();
    }

    /**
     * Attempts to simplify an expression.
     * @param expression The expression.
     * @returns The expression in the simplest form possible.
     */
    private simplifyExpression(expression: t.Expression): t.Expression {
        if (t.isUnaryExpression(expression) || t.isBinaryExpression(expression)) {
            const replacement = t.isUnaryExpression(expression)
                ? this.simplifyUnaryExpression(expression)
                : this.simplifyBinaryExpression(expression);
            return replacement || expression;
        } else {
            return expression;
        }
    }

    /**
     * Attempts to simplify a unary expression.
     * @param expression The unary expression.
     * @returns The simplified expression or undefined.
     */
    private simplifyUnaryExpression(expression: t.UnaryExpression): t.Expression | undefined {
        if (!ExpressionSimplifier.RESOLVABLE_UNARY_OPERATORS.has(expression.operator)) {
            return undefined;
        } else if (isNegativeNumericLiteral(expression)) {
            return undefined; // avoid trying to simplify negative numbers
        }

        const argument = this.simplifyExpression(expression.argument);

        if (this.isResolvableExpression(argument)) {
            const argumentValue = this.getResolvableExpressionValue(argument);
            const value = this.applyUnaryOperation(
                expression.operator as ResolvableUnaryOperator,
                argumentValue
            );
            return this.convertValueToExpression(value);
        } else {
            return undefined;
        }
    }

    /**
     * Attempts to simplify a binary expression.
     * @param expression The binary expression.
     * @returns The simplified expression or undefined.
     */
    private simplifyBinaryExpression(expression: t.BinaryExpression): t.Expression | undefined {
        if (
            !t.isExpression(expression.left) ||
            !ExpressionSimplifier.RESOLVABLE_BINARY_OPERATORS.has(expression.operator)
        ) {
            return undefined;
        }

        const left = this.simplifyExpression(expression.left);
        const right = this.simplifyExpression(expression.right);

        if (this.isResolvableExpression(left) && this.isResolvableExpression(right)) {
            const leftValue = this.getResolvableExpressionValue(left);
            const rightValue = this.getResolvableExpressionValue(right);
            const value = this.applyBinaryOperation(
                expression.operator as ResolvableBinaryOperator,
                leftValue,
                rightValue
            );
            return this.convertValueToExpression(value);
        } else if (expression.operator == '-' && isNegativeNumericLiteral(right)) {
            // convert (- -a) to +a (as long as a is a number)
            expression.right = right.argument;
            expression.operator = '+';
            return expression;
        } else {
            return undefined;
        }
    }

    /**
     * Applies a unary operation.
     * @param operator The operator.
     * @param argument The argument value.
     * @returns The resultant value.
     */
    private applyUnaryOperation(operator: ResolvableUnaryOperator, argument: any): any {
        switch (operator) {
            case '-':
                return -argument;
            case '+':
                return +argument;
            case '!':
                return !argument;
            case '~':
                return ~argument;
            case 'typeof':
                return typeof argument;
            case 'void':
                return void argument;
        }
    }

    /**
     * Applies a binary operation.
     * @param operator The resolvable binary operator.
     * @param left The value of the left expression.
     * @param right The value of the right expression.
     * @returns The resultant value.
     */
    private applyBinaryOperation(operator: ResolvableBinaryOperator, left: any, right: any): any {
        switch (operator) {
            case '==':
                return left == right;
            case '!=':
                return left != right;
            case '===':
                return left === right;
            case '!==':
                return left !== right;
            case '<':
                return left < right;
            case '<=':
                return left <= right;
            case '>':
                return left > right;
            case '>=':
                return left >= right;
            case '<<':
                return left << right;
            case '>>':
                return left >> right;
            case '>>>':
                return left >>> right;
            case '+':
                return left + right;
            case '-':
                return left - right;
            case '*':
                return left * right;
            case '/':
                return left / right;
            case '%':
                return left % right;
            case '**':
                return left ** right;
            case '|':
                return left | right;
            case '^':
                return left ^ right;
            case '&':
                return left & right;
        }
    }

    /**
     * Gets the real value from a resolvable expression.
     * @param expression The resolvable expression.
     * @returns The value.
     */
    private getResolvableExpressionValue(expression: ResolvableExpression): any {
        switch (expression.type) {
            case 'NumericLiteral':
            case 'StringLiteral':
            case 'BooleanLiteral':
            case 'DecimalLiteral':
                return expression.value;
            case 'BigIntLiteral':
                return BigInt(expression.value);
            case 'UnaryExpression':
                return -this.getResolvableExpressionValue(
                    expression.argument as Exclude<t.Literal, t.RegExpLiteral | t.TemplateLiteral>
                );
            case 'NullLiteral':
                return null;
            case 'Identifier':
                return undefined;
            case 'ArrayExpression':
                return [];
            case 'ObjectExpression':
                return {};
        }
    }

    /**
     * Attempts to convert a value of unknown type to an expression node.
     * @param value The value.
     * @returns The expression or undefined.
     */
    private convertValueToExpression(value: any): t.Expression | undefined {
        switch (typeof value) {
            case 'string':
                return t.stringLiteral(value);
            case 'number':
                return value >= 0
                    ? t.numericLiteral(value)
                    : t.unaryExpression('-', t.numericLiteral(Math.abs(value)));
            case 'boolean':
                return t.booleanLiteral(value);
            case 'bigint':
                return t.bigIntLiteral(value.toString());
            case 'undefined':
                return t.identifier('undefined');
            default:
                return undefined;
        }
    }

    /**
     * Returns whether a node is a resolvable expression that can be
     * evaluated safely.
     * @param node The AST node.
     * @returns Whether.
     */
    private isResolvableExpression(node: t.Node): node is ResolvableExpression {
        return (
            (t.isLiteral(node) && !t.isRegExpLiteral(node) && !t.isTemplateLiteral(node)) ||
            (t.isUnaryExpression(node) && node.operator == '-' && t.isLiteral(node.argument)) ||
            (t.isIdentifier(node) && node.name == 'undefined') ||
            (t.isArrayExpression(node) && node.elements.length == 0) ||
            (t.isObjectExpression(node) && node.properties.length == 0)
        );
    }
}

type ResolvableExpression =
    | Exclude<t.Literal, t.RegExpLiteral | t.TemplateLiteral>
    | (t.UnaryExpression & { operator: '-'; argument: t.Literal })
    | (t.Identifier & { name: 'undefined' })
    | (t.ArrayExpression & { elements: [] })
    | (t.ObjectExpression & { properties: [] });

type ResolvableUnaryOperator = '-' | '+' | '!' | '~' | 'typeof' | 'void';

type ResolvableBinaryOperator =
    | '=='
    | '!='
    | '==='
    | '!=='
    | '<'
    | '<='
    | '>'
    | '>='
    | '<<'
    | '>>'
    | '>>>'
    | '+'
    | '-'
    | '*'
    | '/'
    | '%'
    | '**'
    | '|'
    | '^'
    | '&';
