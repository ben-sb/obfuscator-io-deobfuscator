import * as t from '@babel/types';
import { StringDecoder } from '../decoders/stringDecoder';
import { isNegativeNumericLiteral } from '../../expression';

type BinaryOperator = '+' | '-' | '*' | '/' | '%';
const binaryOperatorSet = new Set(['+', '-', '*', '/', '%']);

type UnaryOperator = '-';
const unaryOperatorSet = new Set(['-']);

const operationSet = new Set([
    'CallExpression',
    'UnaryExpression',
    'BinaryExpression',
    'NumericLiteral'
]);

type CallOperation = {
    type: 'CallOperation';
    decoder: StringDecoder;
    args: (number | string)[];
};

type UnaryOperation = {
    type: 'UnaryOperation';
    operator: UnaryOperator;
    argument: Operation;
};

type BinaryOperation = {
    type: 'BinaryOperation';
    operator: BinaryOperator;
    left: Operation;
    right: Operation;
};

type Operation = CallOperation | UnaryOperation | BinaryOperation | t.NumericLiteral;

/**
 * Parses an operation.
 * @param expression The expression.
 * @param decoderMap The string decoder map.
 * @returns The operation.
 */
function parseOperation(
    expression: t.BinaryExpression | t.UnaryExpression | t.CallExpression | t.NumericLiteral,
    decoderMap: Map<string, StringDecoder>
): Operation {
    switch (expression.type) {
        case 'CallExpression':
            return parseCallOperation(expression, decoderMap);
        case 'UnaryExpression':
            return parseUnaryOperation(expression, decoderMap);
        case 'BinaryExpression':
            return parseBinaryOperation(expression, decoderMap);
        case 'NumericLiteral':
            return expression;
    }
}

/**
 * Parses a call operation.
 * @param expression The call expression.
 * @param decoderMap The string decoder map.
 * @returns The call operation.
 */
function parseCallOperation(
    expression: t.CallExpression,
    decoderMap: Map<string, StringDecoder>
): CallOperation {
    if (
        !t.isIdentifier(expression.callee) ||
        expression.callee.name != 'parseInt' ||
        expression.arguments.length != 1 ||
        !t.isCallExpression(expression.arguments[0])
    ) {
        throw new Error('Unsupported string call operation');
    }

    const stringCall = expression.arguments[0];
    if (
        !t.isIdentifier(stringCall.callee) ||
        !stringCall.arguments.every(
            e => t.isNumericLiteral(e) || isNegativeNumericLiteral(e) || t.isStringLiteral(e)
        )
    ) {
        throw new Error('Unsupported string call operation');
    }

    const args = stringCall.arguments.map(e =>
        t.isNumericLiteral(e) || t.isStringLiteral(e) ? e.value : -(e as any).argument.value
    );
    const name = stringCall.callee.name;
    if (!decoderMap.has(name)) {
        throw new Error(`Unknown string decoder ${name}`);
    }

    const decoder = decoderMap.get(name) as StringDecoder;
    return {
        type: 'CallOperation',
        decoder,
        args
    };
}

/**
 * Parses a unary operation.
 * @param expression The unary expression.
 * @param decoderMap The string decoder map.
 * @returns The unary operation.
 */
function parseUnaryOperation(
    expression: t.UnaryExpression,
    decoderMap: Map<string, StringDecoder>
): UnaryOperation {
    if (!unaryOperatorSet.has(expression.operator)) {
        throw new Error(`Unsupported unary operator ${expression.operator}`);
    } else if (!operationSet.has(expression.argument.type)) {
        throw new Error(`Unsupported string rotation operation type ${expression.argument.type}`);
    }

    const argument = parseOperation(expression.argument as any, decoderMap);
    return {
        type: 'UnaryOperation',
        operator: expression.operator as UnaryOperator,
        argument
    };
}

/**
 * Parses a binary operation.
 * @param expression The binary expression.
 * @param decoderMap The string decoder map.
 * @returns The binary operation.
 */
function parseBinaryOperation(
    expression: t.BinaryExpression,
    decoderMap: Map<string, StringDecoder>
): BinaryOperation {
    if (!binaryOperatorSet.has(expression.operator)) {
        throw new Error(`Unsupported binary operator ${expression.operator}`);
    } else if (!operationSet.has(expression.left.type)) {
        throw new Error(`Unsupported string rotation operation type ${expression.left.type}`);
    } else if (!operationSet.has(expression.right.type)) {
        throw new Error(`Unsupported string rotation operation type ${expression.right.type}`);
    }

    const left = parseOperation(expression.left as any, decoderMap);
    const right = parseOperation(expression.right as any, decoderMap);
    return {
        type: 'BinaryOperation',
        operator: expression.operator as BinaryOperator,
        left,
        right
    };
}

/**
 * Applies an operation.
 * @param operation The operation.
 * @returns The result.
 */
function applyOperation(operation: Operation): any {
    switch (operation.type) {
        case 'CallOperation':
            return applyCall(operation);
        case 'UnaryOperation':
            return applyUnaryOperation(operation);
        case 'BinaryOperation':
            return applyBinaryOperation(operation);
        case 'NumericLiteral':
            return operation.value;
    }
}

/**
 * Applies a call of a string decoder.
 * @param call The call.
 * @returns The result.
 */
function applyCall(call: CallOperation): any {
    return parseInt(
        (call.decoder.getStringForRotation as (...args: (number | string)[]) => string)(
            ...call.args
        )
    );
}

/**
 * Applies a unary operation.
 * @param operation The unary operation.
 * @returns The result.
 */
function applyUnaryOperation(operation: UnaryOperation): any {
    const argument = applyOperation(operation.argument);

    switch (operation.operator) {
        case '-':
            return -argument;
    }
}

/**
 * Applies a binary operation.
 * @param operation The binary operation.
 * @returns The result.
 */
function applyBinaryOperation(operation: BinaryOperation): any {
    const left = applyOperation(operation.left);
    const right = applyOperation(operation.right);

    switch (operation.operator) {
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
    }
}

/**
 * Rotates the string array.
 * @param expression The expression containing the string array calls.
 * @param decoderMap The string decoder map.
 * @param stopValue The value to stop at.
 */
export function rotateStringArray(
    array: string[],
    expression: t.BinaryExpression,
    decoderMap: Map<string, StringDecoder>,
    stopValue: number
): void {
    const operation = parseOperation(expression, decoderMap);

    let i = 0;
    while (true) {
        try {
            const value = applyOperation(operation);
            if (value == stopValue) {
                break;
            } else {
                array.push(array.shift()!);
            }
        } catch (err) {
            array.push(array.shift()!);
        }

        // avoid entering infinite loops
        if (i++ > 1e5) {
            throw new Error('Max number of string rotation iterations reached');
        }
    }
}
