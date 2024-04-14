import * as t from '@babel/types';
import traverse, { NodePath } from '@babel/traverse';
import { LogFunction, Transformation, TransformationProperties } from '../transformation';

export class PropertySimplifier extends Transformation {
    public static readonly properties: TransformationProperties = {
        key: 'propertySimplification'
    };

    /**
     * Executes the transformation.
     * @param log The log function.
     */
    public execute(log: LogFunction): boolean {
        const self = this;

        traverse(this.ast, {
            MemberExpression(path) {
                if (
                    path.node.computed &&
                    t.isStringLiteral(path.node.property) &&
                    t.isValidIdentifier(path.node.property.value)
                ) {
                    path.node.property = t.identifier(path.node.property.value);
                    path.node.computed = false;
                    self.setChanged();
                }
            },
            ['ObjectProperty|ObjectMethod' as any](
                path: NodePath<t.ObjectProperty | t.ObjectMethod>
            ) {
                if (
                    path.node.computed &&
                    t.isStringLiteral(path.node.key) &&
                    t.isValidIdentifier(path.node.key.value)
                ) {
                    path.node.key = t.identifier(path.node.key.value);
                    path.node.computed = false;
                    self.setChanged();
                } else if (
                    path.node.computed &&
                    (t.isStringLiteral(path.node.key) || t.isNumericLiteral(path.node.key))
                ) {
                    path.node.computed = false;
                }
            }
        });

        return this.hasChanged();
    }
}
