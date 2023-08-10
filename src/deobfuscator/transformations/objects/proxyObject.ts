import * as t from '@babel/types';
import { ConstantVariable } from '../../helpers/variable';
import { copyExpression } from '../../helpers/misc';
import { ProxyFunction, isProxyFunctionExpression } from '../proxyFunctions/proxyFunction';
import { NodePath } from '@babel/traverse';

export type ProxyObjectExpression = t.ObjectExpression;

/**
 * Returns whether a node is a proxy object.
 * @param node The node.
 * @returns Whether.
 */
export const isProxyObjectExpression = (node: t.Node): node is ProxyObjectExpression => {
    return t.isObjectExpression(node) && node.properties.length > 0;
};

export class ProxyObject {
    private readonly variable: ConstantVariable<ProxyObjectExpression>;
    private readonly literalProperties: Map<string | number, t.Expression> = new Map();
    private readonly proxyFunctionProperties: Map<string | number, ProxyFunction> = new Map();

    /**
     * Creates a new proxy object.
     * @param variable The variable.
     */
    constructor(variable: ConstantVariable<ProxyObjectExpression>) {
        this.variable = variable;
    }

    /**
     * Finds all the object's entries which can be replaced.
     */
    public process(): void {
        for (const property of this.variable.expression.properties) {
            if (t.isObjectProperty(property) && this.isLiteralPropertyKey(property)) {
                const key = t.isIdentifier(property.key) ? property.key.name : property.key.value;
                if (t.isLiteral(property.value)) {
                    this.literalProperties.set(key, property.value);
                } else if (isProxyFunctionExpression(property.value)) {
                    const proxyFunction = new ProxyFunction(property.value);
                    this.proxyFunctionProperties.set(key, proxyFunction);
                }
            } else if (t.isObjectMethod(property) && this.isLiteralMethodKey(property)) {
                const key = t.isIdentifier(property.key) ? property.key.name : property.key.value;
                if (isProxyFunctionExpression(property)) {
                    const proxyFunction = new ProxyFunction(property);
                    this.proxyFunctionProperties.set(key, proxyFunction);
                }
            }
        }
    }

    /**
     * Returns the usages of the object.
     * @returns The usages.
     */
    public getUsages(): NodePath[] {
        return this.variable.binding.referencePaths;
    }

    /**
     * Attempts to replace a usage of the object.
     * @param path The path of the usage.
     * @returns Whether it was replaced.
     */
    public replaceUsage(path: NodePath): boolean {
        const parentPath = path.parentPath;
        if (
            parentPath &&
            parentPath.isMemberExpression() &&
            this.isLiteralMemberKey(parentPath.node) &&
            (!parentPath.parentPath ||
                !parentPath.parentPath.isAssignmentExpression() ||
                parentPath.parentKey != 'left')
        ) {
            const key = t.isIdentifier(parentPath.node.property)
                ? parentPath.node.property.name
                : parentPath.node.property.value;

            if (this.literalProperties.has(key)) {
                const value = this.literalProperties.get(key) as t.Expression;
                parentPath.replaceWith(copyExpression(value));
                return true;
            } else if (
                parentPath.parentPath &&
                parentPath.parentPath.isCallExpression() &&
                parentPath.key == 'callee' &&
                this.proxyFunctionProperties.has(key)
            ) {
                const proxyFunction = this.proxyFunctionProperties.get(key) as ProxyFunction;
                const replacement = proxyFunction.getReplacement(
                    parentPath.parentPath.node.arguments
                );
                parentPath.parentPath.replaceWith(replacement);
                return true;
            }
        }

        return false;
    }

    /**
     * Returns whether an object property has a literal key.
     * @param property The object property.
     * @returns Whether.
     */
    private isLiteralPropertyKey(
        property: t.ObjectProperty
    ): property is
        | (t.ObjectProperty & { key: t.StringLiteral | t.NumericLiteral })
        | (t.ObjectProperty & { computed: false; key: t.Identifier }) {
        return (
            t.isStringLiteral(property.key) ||
            t.isNumericLiteral(property.key) ||
            (!property.computed && t.isIdentifier(property.key))
        );
    }

    /**
     * Returns whether an object method has a literal key.
     * @param property The object method.
     * @returns Whether.
     */
    private isLiteralMethodKey(
        property: t.ObjectMethod
    ): property is
        | (t.ObjectMethod & { key: t.StringLiteral | t.NumericLiteral })
        | (t.ObjectMethod & { computed: false; key: t.Identifier }) {
        return (
            t.isStringLiteral(property.key) ||
            t.isNumericLiteral(property.key) ||
            (!property.computed && t.isIdentifier(property.key))
        );
    }

    /**
     * Returns whether a member expression has a literal key.
     * @param member The member expression.
     * @returns Whether.
     */
    private isLiteralMemberKey(
        member: t.MemberExpression
    ): member is
        | (t.MemberExpression & { property: t.StringLiteral | t.NumericLiteral })
        | (t.MemberExpression & { computed: false; property: t.Identifier }) {
        return (
            t.isStringLiteral(member.property) ||
            t.isNumericLiteral(member.property) ||
            (!member.computed && t.isIdentifier(member.property))
        );
    }
}
