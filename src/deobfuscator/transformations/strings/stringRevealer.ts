import * as t from '@babel/types';
import traverse, { NodePath } from '@babel/traverse';
import { LogFunction, Transformation, TransformationProperties } from '../transformation';
import {
    isDeclarationOrAssignmentExpression,
    isDeclarationOrAssignmentStatement
} from '../../helpers/declaration';
import { BasicStringDecoder } from '../../helpers/strings/decoders/basicStringDecoder';
import generate from '@babel/generator';
import { Rc4StringDecoder } from '../../helpers/strings/decoders/rc4StringDecoder';
import { DecoderType, StringDecoder } from '../../helpers/strings/decoders/stringDecoder';
import { Base64StringDecoder } from '../../helpers/strings/decoders/base64StringDecoder';
import { rotateStringArray } from '../../helpers/strings/rotation/rotation';

const BASE_64_WRAPPER_REGEX =
    /['"]abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\+\/=['"]\.indexOf/;

const RC4_WRAPPER_REGEX =
    /[a-zA-Z$_]?[a-zA-Z0-9$_]+\s?\+=\s?String\.fromCharCode\([a-zA-Z$_]?[a-zA-Z0-9$_]+\.charCodeAt\([a-zA-Z$_]?[a-zA-Z0-9$_]+\)\s?\^\s?[a-zA-Z$_]?[a-zA-Z0-9$_]+\[\([a-zA-Z$_]?[a-zA-Z0-9$_]+\[[a-zA-Z$_]?[a-zA-Z0-9$_]+\]\s?\+\s?[a-zA-Z$_]?[a-zA-Z0-9$_]+\[[a-zA-Z$_]?[a-zA-Z0-9$_]+\]\)\s?%\s?(?:256|0x100)\]\)/;

export class StringRevealer extends Transformation {
    public static readonly properties: TransformationProperties = {
        key: 'stringRevealing',
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
                if (
                    self.isDirectStringArrayDeclarator(path.node) ||
                    self.isStringArrayFunction(path.node)
                ) {
                    const isDirectArray = t.isVariableDeclarator(path.node);
                    let stringArray: string[];
                    if (t.isFunction(path.node)) {
                        if (t.isVariableDeclaration(path.node.body.body[0])) {
                            const arrayExpression = path.node.body.body[0].declarations[0]
                                .init as t.ArrayExpression;
                            stringArray = arrayExpression.elements.map(
                                e => (e as t.StringLiteral).value
                            );
                        } else {
                            const string = (path.node.body.body[0] as any).expression.right.callee
                                .object.value;
                            const separator = (path.node.body.body[0] as any).expression.right
                                .arguments[0].value;
                            stringArray = string.split(separator);
                        }
                    } else {
                        stringArray = path.node.init.elements.map(
                            e => (e as t.StringLiteral).value
                        );
                    }

                    const arrayName = path.node.id.name;
                    const binding = path.scope.getBinding(arrayName);
                    if (!binding) {
                        return;
                    }

                    const wrapperFunctionSet: Set<NodePath<t.FunctionDeclaration>> = new Set();
                    const stringDecoders = [];
                    let rotateCall: NodePath<t.ExpressionStatement> | undefined;
                    for (const referencePath of binding.referencePaths) {
                        // ignore call to function from within
                        if (!isDirectArray && referencePath.scope == path.scope) {
                            continue;
                        }

                        if (referencePath.parentKey == 'callee') {
                            const functionParent = referencePath.getFunctionParent();
                            if (!functionParent) {
                                log('Unknown reference to string array function, no function parent');
                                return;
                            }

                            if (self.isBasicStringArrayWrapper(functionParent.node, arrayName)) {
                                const body = (functionParent.node as any).body.body;
                                const offsetExpression = body[1].expression.right.body.body[0].expression.right;
                                const absoluteOffset = offsetExpression.right.value;
                                const offset =
                                    offsetExpression.operator == '+'
                                        ? absoluteOffset
                                        : -absoluteOffset;
                                const decoder = new BasicStringDecoder(stringArray, offset);
                                stringDecoders.push(decoder);

                                wrapperFunctionSet.add(
                                    functionParent as NodePath<t.FunctionDeclaration>
                                );
                            } else if (self.isComplexStringArrayWrapperVariant(functionParent.node, arrayName)) {
                                const body = (functionParent.node as any).body.body;
                                const offsetExpression = body[0].expression.right;
                                const absoluteOffset = offsetExpression.right.value;
                                const offset =
                                    offsetExpression.operator == '+'
                                        ? absoluteOffset
                                        : -absoluteOffset;

                                const src = generate(functionParent.node).code;
                                if (BASE_64_WRAPPER_REGEX.test(src)) {
                                    if (RC4_WRAPPER_REGEX.test(src)) {
                                        const decoder = new Rc4StringDecoder(stringArray, offset);
                                        stringDecoders.push(decoder);
                                    } else {
                                        const decoder = new Base64StringDecoder(
                                            stringArray,
                                            offset
                                        );
                                        stringDecoders.push(decoder);
                                    }

                                    wrapperFunctionSet.add(
                                        functionParent as NodePath<t.FunctionDeclaration>
                                    );
                                } else {
                                    log('Unknown string array wrapper type');
                                    return;
                                }
                            } else if (self.isBasicStringArrayWrapperVariant(functionParent.node, arrayName)) {
                                const body = (functionParent.node as any).body.body;
                                const offsetExpression = body[0].expression.right;
                                const absoluteOffset = offsetExpression.right.value;

                                const offset =
                                    offsetExpression.operator == '+'
                                        ? absoluteOffset
                                        : -absoluteOffset;
                                const decoder = new BasicStringDecoder(stringArray, offset);
                                stringDecoders.push(decoder);

                                wrapperFunctionSet.add(
                                    functionParent as NodePath<t.FunctionDeclaration>
                                );
                            } else if (
                                self.isComplexStringArrayWrapper(functionParent.node, arrayName)
                            ) {
                                const offsetExpression = (functionParent.node as any).body.body[1]
                                    .expression.right.body.body[0].expression.right;
                                const absoluteOffset = offsetExpression.right.value;
                                const offset =
                                    offsetExpression.operator == '+'
                                        ? absoluteOffset
                                        : -absoluteOffset;

                                const src = generate(functionParent.node).code;
                                if (BASE_64_WRAPPER_REGEX.test(src)) {
                                    if (RC4_WRAPPER_REGEX.test(src)) {
                                        const decoder = new Rc4StringDecoder(stringArray, offset);
                                        stringDecoders.push(decoder);
                                    } else {
                                        const decoder = new Base64StringDecoder(
                                            stringArray,
                                            offset
                                        );
                                        stringDecoders.push(decoder);
                                    }

                                    wrapperFunctionSet.add(
                                        functionParent as NodePath<t.FunctionDeclaration>
                                    );
                                } else {
                                    log('Unknown string array wrapper type');
                                    return;
                                }
                            } else if (
                                self.isComplexFunctionStringArrayWrapper(
                                    functionParent.node,
                                    arrayName
                                )
                            ) {
                                const offsetStatement = (functionParent.node as any).body.body[0];
                                const offsetExpression = (
                                    t.isVariableDeclaration(offsetStatement)
                                        ? offsetStatement.declarations[0].init
                                        : (offsetStatement as any).expression.right
                                ) as t.BinaryExpression & { right: t.NumericLiteral };
                                const absoluteOffset = offsetExpression.right.value;
                                const offset =
                                    offsetExpression.operator == '+'
                                        ? absoluteOffset
                                        : -absoluteOffset;

                                const src = generate(functionParent.node).code;
                                if (BASE_64_WRAPPER_REGEX.test(src)) {
                                    if (RC4_WRAPPER_REGEX.test(src)) {
                                        const decoder = new Rc4StringDecoder(stringArray, offset);
                                        stringDecoders.push(decoder);
                                    } else {
                                        const decoder = new Base64StringDecoder(
                                            stringArray,
                                            offset
                                        );
                                        stringDecoders.push(decoder);
                                    }

                                    wrapperFunctionSet.add(
                                        functionParent as NodePath<t.FunctionDeclaration>
                                    );
                                } else {
                                    log('Unknown string array wrapper type');
                                    return;
                                }
                            } else {
                                log('Unknown reference to string array function, !isBasicStringArrayWrapper and !isComplexStringArrayWrapper');
                                return;
                            }
                        } else if (
                            isDirectArray &&
                            referencePath.key == 'object' &&
                            referencePath.parentPath &&
                            referencePath.parentPath.isMemberExpression()
                        ) {
                            const functionParent = referencePath.getFunctionParent();
                            if (!functionParent) {
                                log('Unknown reference to string array function, no function parent.');
                                return;
                            }

                            if (
                                self.isComplexDirectStringArrayWrapper(
                                    functionParent.node,
                                    arrayName
                                )
                            ) {
                                const offsetStatement = (functionParent.node as any).body.body[0];
                                const offsetExpression = (
                                    t.isVariableDeclaration(offsetStatement)
                                        ? offsetStatement.declarations[0].init
                                        : (offsetStatement as any).expression.right
                                ) as t.BinaryExpression & { right: t.NumericLiteral };
                                const absoluteOffset = offsetExpression.right.value;
                                const offset =
                                    offsetExpression.operator == '+'
                                        ? absoluteOffset
                                        : -absoluteOffset;

                                const src = generate(functionParent.node).code;
                                if (BASE_64_WRAPPER_REGEX.test(src)) {
                                    if (RC4_WRAPPER_REGEX.test(src)) {
                                        const decoder = new Rc4StringDecoder(stringArray, offset);
                                        stringDecoders.push(decoder);
                                    } else {
                                        const decoder = new Base64StringDecoder(
                                            stringArray,
                                            offset
                                        );
                                        stringDecoders.push(decoder);
                                    }

                                    wrapperFunctionSet.add(
                                        functionParent as NodePath<t.FunctionDeclaration>
                                    );
                                } else {
                                    log('Unknown string array wrapper type');
                                    return;
                                }
                            } else {
                                log('Unknown reference to string array function, !isComplexDirectStringArrayWrapper');
                                return;
                            }
                        } else if (referencePath.parentKey == 'arguments') {
                            const parentPath = referencePath.parentPath as NodePath;
                            if (self.isRotateStringArrayCall(parentPath.node, arrayName)) {
                                rotateCall =
                                    parentPath.parentPath as NodePath<t.ExpressionStatement>;
                            } else {
                                log('Unknown reference to string array function, !isRotateStringArrayCall');
                                return;
                            }
                        } else {
                            log('Unknown reference to string array function');
                            return;
                        }
                    }

                    // ensure there is at least one wrapper function
                    if (wrapperFunctionSet.size == 0) {
                        log('No string wrapper functions found');
                        return;
                    }

                    const wrapperFunctions = Array.from(wrapperFunctionSet);
                    const wrapperFunctionNames = wrapperFunctions.map(w => w.node.id!.name);
                    const wrapperBindings = wrapperFunctions.map((w, i) =>
                        w.scope.getBinding(wrapperFunctionNames[i])
                    );
                    if (wrapperBindings.find(w => !w)) {
                        log(`Failed to find string concealer wrapper functions`);
                        return;
                    }

                    // perform string rotation if necessary
                    if (rotateCall) {
                        const stopValue = (rotateCall.node.expression as any).arguments[1].value;

                        const body = (rotateCall.node.expression as any).callee.body.body;
                        const loop = body[body.length - 1];
                        const statement = loop.body.body[0].block.body[0];
                        const expression: t.BinaryExpression = t.isVariableDeclaration(statement)
                            ? statement.declarations[0].init
                            : (statement as any).expression.right;

                        const decoderMap = new Map<string, StringDecoder>(
                            stringDecoders.map((decoder, index) => [
                                wrapperFunctionNames[index],
                                decoder
                            ])
                        );
                        rotateStringArray(stringArray, expression, decoderMap, stopValue);
                    }

                    let failedReplacement = false;
                    for (let i = 0; i < wrapperFunctions.length; i++) {
                        const wrapperFunction = wrapperFunctions[i];
                        const wrapperBinding = wrapperBindings[i];
                        const decoder = stringDecoders[i];

                        for (const referencePath of wrapperBinding!.referencePaths) {
                            const functionParent = referencePath.getFunctionParent();
                            const outerFunctionParent =
                                functionParent && functionParent.getFunctionParent();
                            const parentPath = referencePath.parentPath;
                            if (
                                (functionParent &&
                                    (functionParent.node == wrapperFunction.node ||
                                        (rotateCall &&
                                            functionParent.node ==
                                                (rotateCall.node.expression as t.CallExpression)
                                                    .callee))) ||
                                (outerFunctionParent &&
                                    outerFunctionParent.node == wrapperFunction.node)
                            ) {
                                continue;
                            } else if (
                                !parentPath ||
                                !self.isStringArrayWrapperCall(parentPath.node, decoder.type)
                            ) {
                                failedReplacement = true;
                            } else {
                                try {
                                    const args = parentPath.node.arguments.map(
                                        a => (a as t.NumericLiteral | t.StringLiteral).value
                                    );
                                    const value = (
                                        decoder.getString as (
                                            ...args: (number | string)[]
                                        ) => string
                                    )(...args);
                                    if (typeof value == 'string') {
                                        parentPath.replaceWith(t.stringLiteral(value));
                                        self.setChanged();
                                    } else {
                                        failedReplacement = true;
                                    }
                                } catch (err) {
                                    failedReplacement = true;
                                }
                            }
                        }
                    }

                    if (!failedReplacement) {
                        path.remove();
                        for (const wrapper of wrapperFunctions) {
                            wrapper.remove();
                        }
                        if (rotateCall) {
                            rotateCall.remove();
                        }

                        self.setChanged();
                    }
                } else if (self.isEscapedStringLiteral(path.node)) {
                    path.node.extra = undefined;
                    self.setChanged();
                }
            }
        });
        return this.hasChanged();
    }

    /**
     * Returns whether a node is directly declaring a string array.
     * @param node The AST node.
     * @returns Whether.
     */
    private isDirectStringArrayDeclarator(node: t.Node): node is t.VariableDeclarator & {
        id: t.Identifier;
        init: t.ArrayExpression & { elements: t.StringLiteral[] };
    } {
        return (
            t.isVariableDeclarator(node) &&
            t.isIdentifier(node.id) &&
            node.init != undefined &&
            t.isArrayExpression(node.init) &&
            node.init.elements.length > 0 &&
            node.init.elements.every(e => t.isStringLiteral(e))
        );
    }

    /**
     * Returns whether a node is the function that splits and returns the
     * string array.
     * @param node The AST node.
     * @returns Whether.
     */
    private isStringArrayFunction(
        node: t.Node
    ): node is t.FunctionDeclaration & { id: t.Identifier } {
        return (
            t.isFunctionDeclaration(node) &&
            t.isBlockStatement(node.body) &&
            node.body.body.length == 3 &&
            isDeclarationOrAssignmentStatement(
                node.body.body[0],
                t.isIdentifier,
                (node: t.Node) =>
                    (t.isArrayExpression(node) && node.elements.every(e => t.isStringLiteral(e))) || // explicit string array
                    (t.isCallExpression(node) && // creating string array by splitting a string
                        t.isMemberExpression(node.callee) &&
                        t.isStringLiteral(node.callee.object) &&
                        t.isIdentifier(node.callee.property) &&
                        node.callee.property.name == 'split' &&
                        node.arguments.length == 1 &&
                        t.isStringLiteral(node.arguments[0]))
            ) &&
            isDeclarationOrAssignmentStatement(
                node.body.body[1],
                t.isIdentifier,
                (node: t.Node) =>
                    t.isFunctionExpression(node) &&
                    t.isBlockStatement(node.body) &&
                    node.body.body.length == 1 &&
                    t.isReturnStatement(node.body.body[0]) &&
                    t.isIdentifier(node.body.body[0].argument)
            ) &&
            t.isReturnStatement(node.body.body[2]) &&
            t.isCallExpression(node.body.body[2].argument) &&
            t.isIdentifier(node.body.body[2].argument.callee) &&
            node.body.body[2].argument.arguments.length == 0
        );
    }


    /**
     * Returns whether a node is a basic string array wrapper function.
     * @param node The AST node.
     * @param stringArrayName The name of the string array function.
     * @returns Whether.
     */
    private isBasicStringArrayWrapper(
        node: t.Node,
        stringArrayName: string
    ): node is t.FunctionDeclaration {
        return (
            t.isFunctionDeclaration(node) &&
            t.isBlockStatement(node.body) &&
            node.body.body.length == 3 &&
            isDeclarationOrAssignmentStatement(
                node.body.body[0],
                t.isIdentifier,
                (node: t.Node) =>
                    t.isCallExpression(node) &&
                    t.isIdentifier(node.callee) &&
                    node.callee.name == stringArrayName &&
                    node.arguments.length == 0
            ) &&
            isDeclarationOrAssignmentStatement(
                node.body.body[1],
                t.isIdentifier,
                (node: t.Node) =>
                    t.isFunctionExpression(node) &&
                    t.isBlockStatement(node.body) &&
                    node.body.body.length == 3 &&
                    isDeclarationOrAssignmentStatement(
                        node.body.body[0],
                        t.isIdentifier,
                        (node: t.Node) =>
                            t.isBinaryExpression(node) &&
                            (node.operator == '-' || node.operator == '+') &&
                            t.isIdentifier(node.left) &&
                            t.isNumericLiteral(node.right)
                    ) &&
                    isDeclarationOrAssignmentStatement(
                        node.body.body[1],
                        t.isIdentifier,
                        (node: t.Node) =>
                            t.isMemberExpression(node) &&
                            t.isIdentifier(node.object) &&
                            t.isIdentifier(node.property)
                    ) &&
                    t.isReturnStatement(node.body.body[2]) &&
                    t.isIdentifier(node.body.body[2].argument)
            ) &&
            t.isReturnStatement(node.body.body[2]) &&
            t.isCallExpression(node.body.body[2].argument) &&
            t.isIdentifier(node.body.body[2].argument.callee) &&
            node.body.body[2].argument.arguments.length == 2 &&
            t.isIdentifier(node.body.body[2].argument.arguments[0]) &&
            t.isIdentifier(node.body.body[2].argument.arguments[1])
        );
    }

    /*
        function a0_0x14d1(_0x525553, _0x387daf) {
            _0x525553 = _0x525553 - 0xcf;
            const _0x4c7ba2 = a0_0x4c7b();
            let _0x14d12d = _0x4c7ba2[_0x525553];
            return _0x14d12d;
        }
    */
    private isBasicStringArrayWrapperVariant(
        node: t.Node,
        stringArrayName: string
    ): node is t.FunctionDeclaration {
        if (
            !t.isFunctionDeclaration(node) ||
            !t.isBlockStatement(node.body) ||
            node.body.body.length < 4
        ) {
            return false;
        }

        const statements = node.body.body;

        // The parameter-normalisation assignment is always the first statement,
        // e.g. _0x525553 = _0x525553 - 0xcf; (the offset consumer also reads
        // body[0], so this must stay at index 0).
        const offsetStatement = statements[0];
        if (
            !t.isExpressionStatement(offsetStatement) ||
            !t.isAssignmentExpression(offsetStatement.expression) ||
            offsetStatement.expression.operator !== '=' ||
            !t.isIdentifier(offsetStatement.expression.left) ||
            !t.isBinaryExpression(offsetStatement.expression.right) ||
            (offsetStatement.expression.right.operator !== '-' &&
                offsetStatement.expression.right.operator !== '+') ||
            !t.isIdentifier(offsetStatement.expression.right.left) ||
            offsetStatement.expression.right.left.name !==
                offsetStatement.expression.left.name ||
            !t.isNumericLiteral(offsetStatement.expression.right.right)
        ) {
            return false;
        }
        const indexName = offsetStatement.expression.left.name;

        // obfuscator.io injects junk statements (empty statements, dead function
        // declarations and side-effect-free filler declarations) between the
        // meaningful ones to break a fixed-shape/length match, so locate the
        // remaining statements by role rather than by index.

        // Check for const _0x4c7ba2 = a0_0x4c7b(); where a0_0x4c7b is stringArrayName
        let arrayLocalName: string | undefined;
        for (const statement of statements) {
            if (
                t.isVariableDeclaration(statement) &&
                t.isVariableDeclarator(statement.declarations[0]) &&
                t.isIdentifier(statement.declarations[0].id) &&
                t.isCallExpression(statement.declarations[0].init) &&
                t.isIdentifier(statement.declarations[0].init.callee) &&
                statement.declarations[0].init.callee.name === stringArrayName &&
                statement.declarations[0].init.arguments.length === 0
            ) {
                arrayLocalName = statement.declarations[0].id.name;
                break;
            }
        }
        if (arrayLocalName === undefined) {
            return false;
        }

        // Check for let _0x14d12d = _0x4c7ba2[_0x525553];
        let resultName: string | undefined;
        for (const statement of statements) {
            if (
                t.isVariableDeclaration(statement) &&
                t.isVariableDeclarator(statement.declarations[0]) &&
                t.isIdentifier(statement.declarations[0].id) &&
                t.isMemberExpression(statement.declarations[0].init) &&
                statement.declarations[0].init.computed === true &&
                t.isIdentifier(statement.declarations[0].init.object) &&
                statement.declarations[0].init.object.name === arrayLocalName &&
                t.isIdentifier(statement.declarations[0].init.property) &&
                statement.declarations[0].init.property.name === indexName
            ) {
                resultName = statement.declarations[0].id.name;
                break;
            }
        }
        if (resultName === undefined) {
            return false;
        }

        // Check for return _0x14d12d;
        return statements.some(
            statement =>
                t.isReturnStatement(statement) &&
                t.isIdentifier(statement.argument) &&
                statement.argument.name === resultName
        );
    }

    /*
        Flat complex variant — same offset-first layout as the basic variant
        but with base64/RC4 decoding and caching logic inline:

        function relay(scheduler, node) {
            scheduler = scheduler - 334;
            const queue = item();
            let res = queue[scheduler];
            if (relay.kziBxw === undefined) {
                var setup = function (payload) { ... base64 ... };
                relay.KosdwQ = setup;
                relay.ArGtil = {};
                relay.kziBxw = true;
            }
            const token = queue[0];
            const flag = scheduler + token;
            const ptr = relay.ArGtil[flag];
            if (!ptr) { res = relay.KosdwQ(res); relay.ArGtil[flag] = res; }
            else { res = ptr; }
            return res;
        }
    */
    private isComplexStringArrayWrapperVariant(
        node: t.Node,
        stringArrayName: string
    ): node is t.FunctionDeclaration {
        if (!this.isBasicStringArrayWrapperVariant(node, stringArrayName)) {
            return false;
        }

        const statements = (node as t.FunctionDeclaration).body.body;
        return statements.some(s => t.isIfStatement(s));
    }

    /**
     * Returns whether a node is either a base 64 or RC4 string array wrapper function.
     * @param node The AST node.
     * @param stringArrayName The name of the string array function.
     * @returns Whether.
     */
    private isComplexStringArrayWrapper(
        node: t.Node,
        stringArrayName: string
    ): node is t.FunctionDeclaration {
        return (
            t.isFunctionDeclaration(node) &&
            t.isBlockStatement(node.body) &&
            node.body.body.length == 3 &&
            isDeclarationOrAssignmentStatement(
                node.body.body[0],
                t.isIdentifier,
                (node: t.Node) =>
                    t.isCallExpression(node) &&
                    t.isIdentifier(node.callee) &&
                    node.callee.name == stringArrayName &&
                    node.arguments.length == 0
            ) &&
            isDeclarationOrAssignmentStatement(
                node.body.body[1],
                t.isIdentifier,
                (node: t.Node) =>
                    t.isFunctionExpression(node) &&
                    t.isBlockStatement(node.body) &&
                    node.body.body.length >= 4 &&
                    isDeclarationOrAssignmentStatement(
                        node.body.body[0],
                        t.isIdentifier,
                        (node: t.Node) =>
                            t.isBinaryExpression(node) &&
                            (node.operator == '-' || node.operator == '+') &&
                            t.isIdentifier(node.left) &&
                            t.isNumericLiteral(node.right)
                    ) &&
                    isDeclarationOrAssignmentStatement(
                        node.body.body[1],
                        t.isIdentifier,
                        (node: t.Node) =>
                            t.isMemberExpression(node) &&
                            t.isIdentifier(node.object) &&
                            t.isIdentifier(node.property)
                    ) &&
                    t.isIfStatement(node.body.body[2]) &&
                    t.isIfStatement(node.body.body[node.body.body.length - 2]) &&
                    t.isReturnStatement(node.body.body[node.body.body.length - 1])
            ) &&
            t.isReturnStatement(node.body.body[2]) &&
            t.isCallExpression(node.body.body[2].argument) &&
            t.isIdentifier(node.body.body[2].argument.callee) &&
            node.body.body[2].argument.arguments.length == 2 &&
            t.isIdentifier(node.body.body[2].argument.arguments[0]) &&
            t.isIdentifier(node.body.body[2].argument.arguments[1])
        );
    }

    /**
     * Returns whether a node is a base 64 or RC4 string array wrapper function
     * with an inlined body, around a function-based string array.
     * @param node The AST node.
     * @param stringArrayName The name of the string array function.
     * @returns Whether.
     */
    private isComplexFunctionStringArrayWrapper(
        node: t.Node,
        stringArrayName: string
    ): node is t.FunctionDeclaration {
        if (
            !t.isFunctionDeclaration(node) ||
            !t.isBlockStatement(node.body) ||
            node.body.body.length < 7
        ) {
            return false;
        }
        const body = node.body.body;

        if (
            !isDeclarationOrAssignmentStatement(
                body[0],
                t.isIdentifier,
                (node: t.Node) =>
                    t.isBinaryExpression(node) &&
                    (node.operator == '-' || node.operator == '+') &&
                    t.isIdentifier(node.left) &&
                    t.isNumericLiteral(node.right)
            )
        ) {
            return false;
        }

        if (
            !isDeclarationOrAssignmentStatement(
                body[1],
                t.isIdentifier,
                (node: t.Node) =>
                    t.isCallExpression(node) &&
                    t.isIdentifier(node.callee) &&
                    node.callee.name == stringArrayName &&
                    node.arguments.length == 0
            )
        ) {
            return false;
        }
        const arrayName = t.isVariableDeclaration(body[1])
            ? (body[1].declarations[0].id as t.Identifier).name
            : ((body[1] as t.ExpressionStatement).expression as t.AssignmentExpression).left &&
              ((
                  (body[1] as t.ExpressionStatement).expression as t.AssignmentExpression
              ).left as t.Identifier).name;

        if (
            !isDeclarationOrAssignmentStatement(
                body[2],
                t.isIdentifier,
                (node: t.Node) =>
                    t.isMemberExpression(node) &&
                    node.computed &&
                    t.isIdentifier(node.object) &&
                    node.object.name == arrayName
            )
        ) {
            return false;
        }

        if (!t.isIfStatement(body[3])) {
            return false;
        }

        if (!t.isIfStatement(body[body.length - 2])) {
            return false;
        }

        const lastStatement = body[body.length - 1];
        return (
            t.isReturnStatement(lastStatement) &&
            !!lastStatement.argument &&
            t.isIdentifier(lastStatement.argument)
        );
    }

    /**
     * Returns whether a node is either a base 64 or RC4 string array wrapper function,
     * around a direct string array.
     * @param node The AST node.
     * @param stringArrayName The name of the string array.
     * @returns Whether.
     */
    private isComplexDirectStringArrayWrapper(
        node: t.Node,
        stringArrayName: string
    ): node is t.FunctionDeclaration {
        let lastStatement: t.Statement;
        return (
            t.isFunctionDeclaration(node) &&
            t.isBlockStatement(node.body) &&
            node.body.body.length >= 6 &&
            isDeclarationOrAssignmentStatement(
                node.body.body[0],
                t.isIdentifier,
                (node: t.Node) =>
                    t.isBinaryExpression(node) &&
                    (node.operator == '-' || node.operator == '+') &&
                    t.isIdentifier(node.left) &&
                    t.isNumericLiteral(node.right)
            ) &&
            isDeclarationOrAssignmentStatement(
                node.body.body[1],
                t.isIdentifier,
                (node: t.Node) =>
                    t.isMemberExpression(node) &&
                    t.isIdentifier(node.object) &&
                    node.object.name == stringArrayName &&
                    t.isIdentifier(node.property)
            ) &&
            t.isIfStatement(node.body.body[2]) &&
            t.isVariableDeclaration(node.body.body[3]) &&
            t.isIfStatement(node.body.body[node.body.body.length - 2]) &&
            (lastStatement = node.body.body[node.body.body.length - 1]) &&
            t.isReturnStatement(lastStatement) &&
            !!lastStatement.argument &&
            t.isIdentifier(lastStatement.argument)
        );
    }

    /**
     * Returns whether a node is a call to rotate the string array.
     * @param node The AST node.
     * @param stringArrayName The name of the string array function.
     * @returns Whether.
     */
    private isRotateStringArrayCall(
        node: t.Node,
        stringArrayName: string
    ): node is t.CallExpression & {
        callee: t.FunctionExpression & { body: t.BlockStatement };
        arguments: [t.Identifier, t.NumericLiteral];
    } {
        return (
            t.isCallExpression(node) &&
            node.arguments.length == 2 &&
            t.isIdentifier(node.arguments[0]) &&
            node.arguments[0].name == stringArrayName &&
            t.isNumericLiteral(node.arguments[1]) &&
            t.isFunctionExpression(node.callee) &&
            t.isBlockStatement(node.callee.body) &&
            ((node.callee.body.body.length == 1 &&
                t.isForStatement(node.callee.body.body[0]) &&
                node.callee.body.body[0].init != undefined &&
                isDeclarationOrAssignmentExpression(
                    node.callee.body.body[0].init,
                    t.isIdentifier,
                    (node: t.Node) =>
                        t.isCallExpression(node) &&
                        t.isIdentifier(node.callee) &&
                        node.arguments.length == 0
                ) &&
                node.callee.body.body[0].test != undefined &&
                t.isBooleanLiteral(node.callee.body.body[0].test) &&
                node.callee.body.body[0].test.value) ||
                (node.callee.body.body.length == 2 &&
                    isDeclarationOrAssignmentStatement(
                        node.callee.body.body[0],
                        t.isIdentifier,
                        (node: t.Node) =>
                            t.isCallExpression(node) &&
                            t.isIdentifier(node.callee) &&
                            node.arguments.length == 0
                    ) &&
                    t.isWhileStatement(node.callee.body.body[1]) &&
                    t.isBooleanLiteral(node.callee.body.body[1].test) &&
                    node.callee.body.body[1].test.value == true) ||
                (node.callee.body.body.length == 1 &&
                    t.isWhileStatement(node.callee.body.body[0]) &&
                    t.isBooleanLiteral(node.callee.body.body[0].test) &&
                    node.callee.body.body[0].test.value == true &&
                    t.isBlockStatement(node.callee.body.body[0].body) &&
                    node.callee.body.body[0].body.body.length == 1 &&
                    t.isTryStatement(node.callee.body.body[0].body.body[0])))
        );
    }

    /**
     * Returns whether a node is a call of the string array wrapper function.
     * @param node The AST node.
     * @param wrapperType The type of string wrapper.
     * @returns Whether.
     */
    private isStringArrayWrapperCall(
        node: t.Node,
        wrapperType: DecoderType
    ): node is t.CallExpression & {
        callee: t.Identifier;
        arguments: (t.NumericLiteral | t.StringLiteral)[];
    } {
        return (
            t.isCallExpression(node) &&
            t.isIdentifier(node.callee) &&
            ((wrapperType == DecoderType.RC4 &&
                node.arguments.length == 2 &&
                t.isNumericLiteral(node.arguments[0]) &&
                t.isStringLiteral(node.arguments[1])) ||
                (wrapperType != DecoderType.RC4 &&
                    (node.arguments.length == 1 || node.arguments.length == 2) &&
                    t.isNumericLiteral(node.arguments[0])))
        );
    }

    /**
     * Returns whether a node is an escaped string literal.
     * @param node The AST node.
     * @returns Whether.
     */
    private isEscapedStringLiteral(node: t.Node): node is t.StringLiteral {
        return (
            t.isStringLiteral(node) &&
            node.extra != undefined &&
            typeof node.extra.rawValue == 'string' &&
            typeof node.extra.raw == 'string' &&
            node.extra.raw.replace(/["']/g, '') != node.extra.rawValue
        );
    }
}
