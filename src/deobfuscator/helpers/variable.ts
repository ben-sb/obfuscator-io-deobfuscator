import { Binding, NodePath } from '@babel/traverse';
import * as t from '@babel/types';

export abstract class ConstantVariable<T extends t.Node> {
    public readonly name: string;
    public readonly binding: Binding;
    public readonly expression: T;

    /**
     * Creates a new constant variable.
     * @param name The name of the variable.
     * @param binding The binding.
     * @param expression The value the variable holds.
     */
    constructor(name: string, binding: Binding, expression: T) {
        this.name = name;
        this.binding = binding;
        this.expression = expression;
    }

    /**
     * Removes the variable and any declarations.
     */
    public abstract remove(): void;
}

export class ConstantDeclarationVariable<T extends t.Node> extends ConstantVariable<T> {
    private readonly declaratorPath: NodePath<t.Node>;

    /**
     * Creates a new constant variable that is declared and initialised immediately.
     * @param declaratorPath The path of the variable declarator.
     * @param name The name of the variable.
     * @param binding The binding.
     * @param expression The value the variable holds.
     */
    constructor(declaratorPath: NodePath<t.Node>, name: string, binding: Binding, expression: T) {
        super(name, binding, expression);
        this.declaratorPath = declaratorPath;
    }

    /**
     * Removes the variable.
     */
    public remove(): void {
        this.declaratorPath.remove();
    }
}

export class ConstantAssignmentVariable<T extends t.Node> extends ConstantVariable<T> {
    private readonly declaratorPath: NodePath<t.Node>;
    private readonly assignmentPath: NodePath<t.AssignmentExpression>;

    /**
     * Creates a new constant variable that is declared with no value then assigned to later.
     * @param declaratorPath The path of the variable declarator.
     * @param assignmentPath The path of the assignment to the variable.
     * @param name The name of the variable.
     * @param binding The binding.
     * @param expression The value the variable holds.
     */
    constructor(
        declaratorPath: NodePath<t.Node>,
        assignmentPath: NodePath<t.AssignmentExpression>,
        name: string,
        binding: Binding,
        expression: T
    ) {
        super(name, binding, expression);
        this.declaratorPath = declaratorPath;
        this.assignmentPath = assignmentPath;
    }

    /**
     * Removes the variable.
     */
    public remove(): void {
        this.declaratorPath.remove();

        // only safe to remove an assignment if the parent doesn't rely on it
        if (
            this.assignmentPath.parentPath &&
            this.assignmentPath.parentPath.isExpressionStatement()
        ) {
            this.assignmentPath.remove();
        } else {
            this.assignmentPath.replaceWith(this.expression);
        }
    }
}

export type isTypeFunction<T extends t.Node> = (node: t.Node) => node is T;

/**
 * Checks whether a node is initialising a 'constant' variable and returns the variable if so.
 * @param path The path.
 * @param isType The function that determines whether the expression is of the desired type.
 * @returns The constant variable or undefined.
 */
export function findConstantVariable<T extends t.Node>(
    path: NodePath,
    isType: isTypeFunction<T>,
    canBeFunction: boolean = false
): ConstantVariable<T> | undefined {
    if (
        path.isVariableDeclarator() &&
        t.isIdentifier(path.node.id) &&
        path.node.init != undefined &&
        isType(path.node.init)
    ) {
        const name = path.node.id.name;
        const binding = path.scope.getBinding(name);
        return binding && isConstantBinding(path, binding)
            ? new ConstantDeclarationVariable<T>(path, name, binding, path.node.init)
            : undefined;
    }
    // essentially same as declarator but allows function declarations
    else if (
        canBeFunction &&
        path.isFunctionDeclaration() &&
        t.isIdentifier(path.node.id) &&
        isType(path.node)
    ) {
        const name = path.node.id.name;
        const binding = path.scope.getBinding(name);
        return binding && isConstantBinding(path, binding)
            ? new ConstantDeclarationVariable<T>(path, name, binding, path.node)
            : undefined;
    } else if (
        path.isAssignmentExpression() &&
        path.node.operator == '=' &&
        t.isIdentifier(path.node.left) &&
        isType(path.node.right)
    ) {
        const name = path.node.left.name;
        const binding = path.scope.getBinding(name);
        return binding && isConstantAssignedBinding(path, binding)
            ? new ConstantAssignmentVariable(binding.path, path, name, binding, path.node.right)
            : undefined;
    }

    return undefined;
}

/**
 * Returns whether a binding is constant for our purposes. Babel views
 * 'var' declarations within loops as non constants so this acts as a fix
 * for that.
 * @param path The path.
 * @param binding The binding.
 * @returns Whether.
 */
function isConstantBinding(path: NodePath, binding: Binding): boolean {
    return (
        binding.constant ||
        (binding.constantViolations.length == 1 &&
            path.node == binding.path.node &&
            path.node == binding.constantViolations[0].node)
    );
}

/**
 * Returns whether a binding with a single assignment expression (separate
 * to the declaration) can be treated as constant.
 * @param path The path.
 * @param binding The binding.
 * @returns Whether.
 */
function isConstantAssignedBinding(
    path: NodePath<t.AssignmentExpression>,
    binding: Binding
): boolean {
    if (
        ((binding.path.isVariableDeclarator() && binding.path.node.init == undefined) ||
            binding.path.parentKey === 'params') && // either variable declarator with no initialiser or parameter of function
        binding.constantViolations.length === 1 &&
        binding.constantViolations[0].node === path.node
    ) {
        const declarationParent = binding.path.isVariableDeclarator()
            ? (binding.path.getStatementParent() as NodePath<t.Statement>).parent
            : (binding.path.parent as t.Function).body;
        const parent = path.findParent(
            p => p.isStatement() || p.isConditionalExpression() || p.isLogicalExpression()
        );
        if (!parent || !parent.isStatement() || parent.parent !== declarationParent) {
            return false;
        }
        return true;
    } else {
        return false;
    }
}
