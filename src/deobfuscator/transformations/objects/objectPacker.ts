import * as t from '@babel/types';
import { findConstantVariable } from '../../helpers/variable';
import { LogFunction, Transformation, TransformationProperties } from '../transformation';
import traverse from '@babel/traverse';

export class ObjectPacker extends Transformation {
    public static readonly properties: TransformationProperties = {
        key: 'objectPacking'
    };

    /**
     * Executes the transformation.
     * @param log The log function.
     */
    public execute(log: LogFunction): boolean {
        const self = this;

        traverse(this.ast, {
            enter(path) {
                const variable = findConstantVariable<EmptyObjectExpression>(
                    path,
                    isEmptyObjectExpression
                );
                if (!variable) {
                    return;
                }

                const parentPath = path.getStatementParent();
                if (
                    !parentPath ||
                    parentPath.parentPath == undefined ||
                    typeof parentPath.key != 'number'
                ) {
                    return;
                }

                const statements = (parentPath.parentPath.node as any)[parentPath.parentKey];
                let numRemoved = 0;
                for (let i = parentPath.key + 1; i < statements.length; i++) {
                    const node = statements[i];
                    if (
                        t.isExpressionStatement(node) &&
                        self.isPropertyAssignment(node.expression, variable.name)
                    ) {
                        // replace multiple properties assigned in same statement
                        if (self.isPropertyAssignment(node.expression.right, variable.name)) {
                            const properties = [node.expression.left];
                            let right: t.Expression = node.expression.right;
                            while (self.isPropertyAssignment(right, variable.name)) {
                                properties.push(right.left);
                                right = right.right;
                            }

                            // don't duplicate expressions with side effects
                            if (!t.isLiteral(right)) {
                                return;
                            }

                            for (const { property } of properties) {
                                const isComputed =
                                    !t.isStringLiteral(property) &&
                                    !t.isNumericLiteral(property) &&
                                    !t.isIdentifier(property);
                                const objectProperty = t.objectProperty(
                                    property,
                                    right,
                                    isComputed
                                );
                                variable.expression.properties.push(objectProperty);
                                self.setChanged();
                                numRemoved++;
                            }
                        } else {
                            const key = node.expression.left.property;
                            const isComputed =
                                !t.isStringLiteral(key) &&
                                !t.isNumericLiteral(key) &&
                                !t.isIdentifier(key);
                            const property = t.objectProperty(
                                key,
                                node.expression.right,
                                isComputed
                            );
                            variable.expression.properties.push(property);
                            self.setChanged();
                            numRemoved++;
                        }
                    } else {
                        break;
                    }
                }

                statements.splice(parentPath.key + 1, numRemoved);
            }
        });

        return this.hasChanged();
    }

    /**
     * Returns whether a node is setting a property on a given object.
     * @param node The AST node.
     * @param objectName The name of the object.
     * @returns Whether.
     */
    private isPropertyAssignment(
        node: t.Node,
        objectName: string
    ): node is t.AssignmentExpression & { left: t.MemberExpression } {
        return (
            t.isAssignmentExpression(node) &&
            t.isMemberExpression(node.left) &&
            t.isIdentifier(node.left.object) &&
            node.left.object.name == objectName
        );
    }
}

type EmptyObjectExpression = t.ObjectExpression & { properties: [] };

/**
 * Returns whether a node is an empty object expression.
 * @param node The node.
 * @returns Whether.
 */
const isEmptyObjectExpression = (node: t.Node): node is EmptyObjectExpression => {
    return t.isObjectExpression(node) && node.properties.length == 0;
};
