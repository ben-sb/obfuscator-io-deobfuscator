import * as t from '@babel/types';
import traverse from '@babel/traverse';
import { LogFunction, Transformation, TransformationProperties } from '../transformation';
import { findConstantVariable } from '../../helpers/variable';
import { DeclarationOrAssignmentExpression, isDeclarationOrAssignmentExpression } from '../../helpers/declaration';

export class ControlFlowRecoverer extends Transformation {
    public static readonly properties: TransformationProperties = {
        key: 'controlFlowRecovery',
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
                const stateVariable = findConstantVariable<StateArrayExpression>(path, isStateArrayExpression);
                if (!stateVariable) {
                    return;
                }

                const states = stateVariable.expression.callee.object.value.split(
                    stateVariable.expression.arguments[0].value
                );

                const statementPath = path.getStatementParent();
                if (!statementPath) {
                    return;
                }

                let nextPath = statementPath.getNextSibling();
                let initialValue: number;
                if (isFlatteningForLoop(nextPath.node, stateVariable.name)) {
                    initialValue = t.isAssignmentExpression(nextPath.node.init)
                        ? nextPath.node.init.right.value
                        : nextPath.node.init.declarations[0].init.value;
                } else if (isDeclarationOrAssignmentExpression(nextPath.node, t.isIdentifier, t.isNumericLiteral)) {
                    const counterName = t.isAssignmentExpression(nextPath.node)
                        ? nextPath.node.left.name
                        : nextPath.node.declarations[0].id.name;
                    initialValue = t.isAssignmentExpression(nextPath.node)
                        ? nextPath.node.right.value
                        : nextPath.node.declarations[0].init.value;
                    nextPath = nextPath.getNextSibling();

                    if (!isFlatteningWhileLoop(nextPath.node, stateVariable.name, counterName)) {
                        return;
                    }
                } else {
                    return;
                }

                const cases = nextPath.node.body.body[0].cases;
                const casesMap = new Map<string, t.Statement[]>(
                    cases.map(c => [(c.test as t.StringLiteral).value, c.consequent])
                );

                const statements = [];
                for (let i = initialValue; ; i++) {
                    const state = states[i];
                    if (!casesMap.has(state)) {
                        break;
                    }

                    const blockStatements = casesMap.get(state) as t.Statement[];
                    statements.push(...blockStatements.filter(s => !t.isContinueStatement(s)));
                    if (
                        blockStatements.length > 0 &&
                        t.isReturnStatement(blockStatements[blockStatements.length - 1])
                    ) {
                        break;
                    }
                }

                path.remove();
                nextPath.replaceWithMultiple(statements);
                self.setChanged();
            }
        });

        return this.hasChanged();
    }
}

type StateArrayExpression = t.CallExpression & {
    callee: t.MemberExpression & { object: t.StringLiteral };
    arguments: { [0]: t.StringLiteral };
};

/**
 * Returns whether a node is a state array expression.
 * @param node The node.
 * @returns Whether.
 */
const isStateArrayExpression = (node: t.Node): node is StateArrayExpression => {
    return (
        t.isCallExpression(node) &&
        t.isMemberExpression(node.callee) &&
        t.isStringLiteral(node.callee.object) &&
        ((t.isStringLiteral(node.callee.property) && node.callee.property.value == 'split') ||
            (t.isIdentifier(node.callee.property) && node.callee.property.name == 'split')) &&
        node.arguments.length == 1 &&
        t.isStringLiteral(node.arguments[0])
    );
};

type FlatteningLoopBody = t.BlockStatement & {
    body: {
        [0]: t.SwitchStatement & {
            discriminant: t.MemberExpression & {
                object: t.Identifier;
                property: t.UpdateExpression & { argument: t.Identifier };
            };
            cases: (t.SwitchCase & { test: t.StringLiteral })[];
        };
        [1]: t.BreakStatement;
    };
};

/**
 * Returns whether a node is the body of a control flow flattening loop.
 * @param node The AST node.
 * @param statesName The name of the variable containing the states.
 * @param counterName The name of the block counter variable.
 * @returns Whether.
 */
const isFlatteningLoopBody = (node: t.Node, statesName: string, counterName: string): node is FlatteningLoopBody => {
    return (
        t.isBlockStatement(node) &&
        node.body.length == 2 &&
        t.isBreakStatement(node.body[1]) &&
        t.isSwitchStatement(node.body[0]) &&
        t.isMemberExpression(node.body[0].discriminant) &&
        t.isIdentifier(node.body[0].discriminant.object) &&
        node.body[0].discriminant.object.name == statesName &&
        t.isUpdateExpression(node.body[0].discriminant.property) &&
        t.isIdentifier(node.body[0].discriminant.property.argument) &&
        node.body[0].discriminant.property.argument.name == counterName &&
        node.body[0].cases.every(c => c.test && t.isStringLiteral(c.test))
    );
};

type FlatteningForLoop = t.ForStatement & {
    init: DeclarationOrAssignmentExpression<t.Identifier, t.NumericLiteral>;
    body: FlatteningLoopBody;
};

/**
 * Returns whether a node is a control flow flattening for loop.
 * @param node The node.
 * @param statesName The name of the variable containing the states.
 * @returns Whether.
 */
const isFlatteningForLoop = (node: t.Node, statesName: string): node is FlatteningForLoop => {
    return (
        t.isForStatement(node) &&
        node.init != undefined &&
        isDeclarationOrAssignmentExpression(node.init, t.isIdentifier, t.isNumericLiteral) &&
        isFlatteningLoopBody(
            node.body,
            statesName,
            t.isAssignmentExpression(node.init) ? node.init.left.name : node.init.declarations[0].id.name
        )
    );
};

type FlatteningWhileLoop = t.WhileStatement & {
    test: t.BooleanLiteral;
    body: FlatteningLoopBody;
};

/**
 * Returns whether a node is a control flow flattening while loop.
 * @param node The node.
 * @param statesName The name of the variable containing the states.
 * @returns Whether.
 */
const isFlatteningWhileLoop = (node: t.Node, statesName: string, counterName: string): node is FlatteningWhileLoop => {
    return (
        t.isWhileStatement(node) &&
        t.isBooleanLiteral(node.test) &&
        node.test.value == true &&
        isFlatteningLoopBody(node.body, statesName, counterName)
    );
};
