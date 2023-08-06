import { LogFunction, Transformation, TransformationProperties } from '../transformation';
import traverse, { NodePath } from '@babel/traverse';
import { findConstantVariable } from '../../helpers/variable';
import { ProxyFunctionExpression, ProxyFunctionVariable, isProxyFunctionExpression } from './proxyFunction';
import { getProperty, setProperty } from '../../helpers/misc';

export class ProxyFunctionInliner extends Transformation {
    public static readonly properties: TransformationProperties = {
        key: 'proxyFunctionInlining',
        rebuildScopeTree: true
    };

    /**
     * Executes the transformation.
     * @param log The log function.
     * @returns Whether any changes were made.
     */
    public execute(log: LogFunction): boolean {
        const usages: [NodePath, ProxyFunctionVariable][] = [];
        let depth = 0;

        traverse(this.ast, {
            enter(path) {
                setProperty(path, 'depth', depth++);
                const variable = findConstantVariable<ProxyFunctionExpression>(path, isProxyFunctionExpression, true);
                if (!variable) {
                    return;
                }

                const proxyFunction = new ProxyFunctionVariable(variable);
                usages.push(
                    ...proxyFunction.getCalls().map(p => [p, proxyFunction] as [NodePath, ProxyFunctionVariable])
                );
            }
        });

        // replace innermost proxy calls first
        usages.sort((a, b) => getProperty(b[0], 'depth') - getProperty(a[0], 'depth'));
        for (const [path, proxyFunction] of usages) {
            if (proxyFunction.replaceCall(path)) {
                this.setChanged();
            }
        }

        return this.hasChanged();
    }
}
