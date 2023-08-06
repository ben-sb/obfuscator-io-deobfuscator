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
                const variable = findConstantVariable<EmptyObjectExpression>(path, isEmptyObjectExpression);
                if (!variable) {
                    return;
                }

                const parentPath = path.getStatementParent();
                if (!parentPath || parentPath.parentPath == undefined || typeof parentPath.key != 'number') {
                    return;
                }

                const statements = (parentPath.parentPath.node as any)[parentPath.parentKey];
                let numRemoved = 0;
                for (let i = parentPath.key + 1; i < statements.length; i++) {
                    const node = statements[i];
                    if (
                        t.isExpressionStatement(node) &&
                        t.isAssignmentExpression(node.expression) &&
                        t.isMemberExpression(node.expression.left) &&
                        t.isIdentifier(node.expression.left.object) &&
                        node.expression.left.object.name == variable.name
                    ) {
                        const key = node.expression.left.property;
                        const isComputed = !t.isStringLiteral(key) && !t.isNumericLiteral(key) && !t.isIdentifier(key);
                        const property = t.objectProperty(key, node.expression.right, isComputed);
                        variable.expression.properties.push(property);
                        self.setChanged();
                        numRemoved++;
                    } else {
                        break;
                    }
                }

                statements.splice(parentPath.key + 1, numRemoved);
            }
        });

        return this.hasChanged();
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
