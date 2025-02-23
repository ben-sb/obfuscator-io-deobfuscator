import traverse, { NodePath } from '@babel/traverse';
import { LogFunction, Transformation, TransformationProperties } from '../transformation';
import * as m from '@codemod/matchers';

export class AntiTamperRemover extends Transformation {
    public static readonly properties: TransformationProperties = {
        key: 'antiTamperRemoval',
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
                /*
                Matches the function which is used to wrap around calls of the self
                defending, debug protection and console output disabling functions.
                var _0x34a66a = (function () {
                    var _0x634fc3 = true;
                    return function (_0x446108, _0x8e5201) {
                        var _0x3cb39f = _0x634fc3
                            ? function () {
                                if (_0x8e5201) {
                                    var _0x104088 = _0x8e5201.apply(_0x446108, arguments);
                                    _0x8e5201 = null;
                                    return _0x104088;
                                }
                            }
                            : function () {};
                        _0x634fc3 = false;
                        return _0x3cb39f;
                    };
                })();
                */
                const wrapperName = m.capture(m.identifier());
                const functionWrapper = m.variableDeclaration('var', [
                    m.variableDeclarator(
                        wrapperName,
                        m.callExpression(
                            m.functionExpression(
                                null,
                                [],
                                m.blockStatement([
                                    m.variableDeclaration('var', [
                                        m.variableDeclarator(m.identifier(), m.booleanLiteral(true))
                                    ]),
                                    m.returnStatement(
                                        m.functionExpression(
                                            null,
                                            [m.identifier(), m.identifier()],
                                            m.blockStatement([
                                                m.variableDeclaration('var', [
                                                    m.variableDeclarator(
                                                        m.identifier(),
                                                        m.conditionalExpression(
                                                            m.identifier(),
                                                            m.functionExpression(
                                                                null,
                                                                [],
                                                                m.blockStatement()
                                                            ),
                                                            m.functionExpression(
                                                                null,
                                                                [],
                                                                m.blockStatement([])
                                                            )
                                                        )
                                                    )
                                                ]),
                                                m.expressionStatement(
                                                    m.assignmentExpression(
                                                        '=',
                                                        m.identifier(),
                                                        m.booleanLiteral(false)
                                                    )
                                                ),
                                                m.returnStatement(m.identifier())
                                            ])
                                        )
                                    )
                                ])
                            ),
                            []
                        )
                    )
                ]);

                /*
                Matches self defending calls
                var _0x37696c = _0x351e96(this, function () {
                    return _0x37696c.toString().search("(((.+)+)+)+$").toString().constructor(_0x37696c).search("(((.+)+)+)+$");
                });
                */
                const selfDefendingName = m.capture(m.identifier());
                const selfDefendingCall = m.variableDeclaration('var', [
                    m.variableDeclarator(
                        selfDefendingName,
                        m.callExpression(m.identifier(), [
                            m.thisExpression(),
                            m.functionExpression(
                                null,
                                [],
                                m.blockStatement([m.returnStatement(m.callExpression())])
                            )
                        ])
                    )
                ]);

                /*
                Matches debug protection
                _0x248aac(this, function () {
                    var _0x1459a4 = new RegExp('function *\\( *\\)');
                    var _0x3fc097 = new RegExp('\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)', 'i');
                    var _0x22eedd = _0x3668ff('init');
                    if (!_0x1459a4.test(_0x22eedd + 'chain') || !_0x3fc097.test(_0x22eedd + 'input')) {
                        _0x22eedd('0');
                    } else {
                        _0x3668ff();
                    }
                })();

                We also remove the actual debug protection function. In this case this is `_0x3668ff`.
                function _0x3668ff(_0x3357cd) {
                    function _0x5454fe(_0x11ef79) {
                        if (typeof _0x11ef79 === 'string') {
                            return function (_0x57f8a0) {}.constructor('while (true) {}').apply('counter');
                        } else if (('' + _0x11ef79 / _0x11ef79).length !== 0x1 || _0x11ef79 % 0x14 === 0x0) {
                            (function () {
                                return true;
                            })
                                .constructor('debugger')
                                .call('action');
                        } else {
                            (function () {
                                return false;
                            })
                                .constructor('debugger')
                                .apply('stateObject');
                        }
                        _0x5454fe(++_0x11ef79);
                    }
                    try {
                        if (_0x3357cd) {
                            return _0x5454fe;
                        } else {
                            _0x5454fe(0x0);
                        }
                    } catch (_0x1ffbd3) {}
                }
                */
                const debugProtectionName = m.capture(m.identifier());
                const debugProtectionCall = m.expressionStatement(
                    m.callExpression(
                        m.callExpression(m.identifier(), [
                            m.thisExpression(),
                            m.functionExpression(
                                null,
                                [],
                                m.blockStatement([
                                    m.variableDeclaration('var', [
                                        m.variableDeclarator(
                                            m.identifier(),
                                            m.newExpression(m.identifier('RegExp'))
                                        )
                                    ]),
                                    m.variableDeclaration('var', [
                                        m.variableDeclarator(
                                            m.identifier(),
                                            m.newExpression(m.identifier('RegExp'))
                                        )
                                    ]),
                                    m.variableDeclaration('var', [
                                        m.variableDeclarator(
                                            m.identifier(),
                                            m.callExpression(debugProtectionName)
                                        )
                                    ]),
                                    m.ifStatement(
                                        m.logicalExpression(),
                                        m.blockStatement([
                                            m.expressionStatement(
                                                m.callExpression(m.identifier(), [
                                                    m.stringLiteral('0')
                                                ])
                                            )
                                        ]),
                                        m.blockStatement([
                                            m.expressionStatement(
                                                m.callExpression(m.identifier(), [])
                                            )
                                        ])
                                    )
                                ])
                            )
                        ]),
                        []
                    )
                );

                /*
                Matches console output disabling.
                var _0x47a7a6 = _0x5ec4cc(this, function () {
                    var _0x3fa604;
                    try {
                        var _0x13dd7b = Function("return (function() {}.constructor(\"return this\")( ));");
                        _0x3fa604 = _0x13dd7b();
                    } catch (_0x425a7f) {
                        _0x3fa604 = window;
                    }
                    var _0x391b61 = _0x3fa604.console = _0x3fa604.console || {};
                    var _0x3911f6 = ["log", 'warn', "info", "error", "exception", 'table', "trace"];
                    for (var _0x3080b9 = 0x0; _0x3080b9 < _0x3911f6.length; _0x3080b9++) {
                        var _0x423cc4 = _0x5ec4cc.constructor.prototype.bind(_0x5ec4cc);
                        var _0x48665b = _0x3911f6[_0x3080b9];
                        var _0x57f828 = _0x391b61[_0x48665b] || _0x423cc4;
                        _0x423cc4.__proto__ = _0x5ec4cc.bind(_0x5ec4cc);
                        _0x423cc4.toString = _0x57f828.toString.bind(_0x57f828);
                        _0x391b61[_0x48665b] = _0x423cc4;
                    }
                });
                */
                const consoleOutputName = m.capture(m.identifier());
                const consoleOutputCall = m.variableDeclaration('var', [
                    m.variableDeclarator(
                        consoleOutputName,
                        m.callExpression(m.identifier(), [
                            m.thisExpression(),
                            m.functionExpression(
                                null,
                                [],
                                m.blockStatement([
                                    m.variableDeclaration('var', [
                                        m.variableDeclarator(m.identifier(), null)
                                    ]),
                                    m.tryStatement(),
                                    m.variableDeclaration(),
                                    m.variableDeclaration('var', [
                                        m.variableDeclarator(m.identifier(), m.arrayExpression())
                                    ]),
                                    m.forStatement()
                                ])
                            )
                        ])
                    )
                ]);

                let failedReplacement = false;
                if (functionWrapper.match(path.node)) {
                    const binding = path.scope.getBinding(wrapperName.current!.name);
                    if (binding) {
                        for (const reference of binding.referencePaths) {
                            const parent = reference.getStatementParent() as NodePath;

                            if (selfDefendingCall.match(parent.node)) {
                                const selfDefendingBinding = parent.scope.getBinding(
                                    selfDefendingName.current!.name
                                );
                                if (selfDefendingBinding) {
                                    for (const selfDefendingReference of selfDefendingBinding.referencePaths) {
                                        selfDefendingReference.getStatementParent()?.remove();
                                        self.setChanged();
                                    }
                                }
                                if (!parent.removed) {
                                    parent.remove();
                                    self.setChanged();
                                }
                            } else if (debugProtectionCall.match(parent.node)) {
                                // remove actual anti-debug function
                                const antiDebugBinding = parent.scope.getBinding(
                                    debugProtectionName.current!.name
                                );
                                if (antiDebugBinding) {
                                    antiDebugBinding.path.remove();
                                    self.setChanged();
                                }

                                // remove IIFE around call
                                parent
                                    .parentPath!.getStatementParent()
                                    ?.getStatementParent()
                                    ?.remove();
                            } else if (consoleOutputCall.match(parent.node)) {
                                const consoleOutputBinding = parent.scope.getBinding(
                                    consoleOutputName.current!.name
                                );
                                if (consoleOutputBinding) {
                                    for (const consoleOutputReference of consoleOutputBinding.referencePaths) {
                                        consoleOutputReference.getStatementParent()!.remove();
                                        self.setChanged();
                                    }
                                }
                            } else {
                                // ignore references that are within the console output function
                                const possibleParent = parent
                                    .getFunctionParent()
                                    ?.getStatementParent();
                                if (
                                    possibleParent &&
                                    consoleOutputCall.match(possibleParent.node)
                                ) {
                                    continue;
                                }

                                log('Unknown reference to generic self defending function wrapper');
                                failedReplacement = true;
                            }
                        }
                    }

                    if (!failedReplacement) {
                        path.remove();
                        self.setChanged();
                    }
                }
            }
        });

        return this.hasChanged();
    }
}
