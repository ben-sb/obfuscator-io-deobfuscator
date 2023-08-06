import { TransformationConfig } from './transformation';

export type TransformationKey =
    | 'objectSimplification'
    | 'objectPacking'
    | 'proxyFunctionInlining'
    | 'stringRevealing'
    | 'expressionSimplification'
    | 'constantPropagation'
    | 'reassignmentRemoval'
    | 'sequenceSplitting'
    | 'controlFlowRecovery'
    | 'deadBranchRemoval'
    | 'unusedVariableRemoval'
    | 'propertySimplification';

export type Config = { [key in TransformationKey]: TransformationConfig } & {
    silent?: boolean;
};

export const defaultConfig: Config = {
    silent: false,
    objectSimplification: {
        isEnabled: true,
        unsafeReplace: true
    },
    objectPacking: {
        isEnabled: true
    },
    proxyFunctionInlining: {
        isEnabled: true
    },
    stringRevealing: {
        isEnabled: true
    },
    expressionSimplification: {
        isEnabled: true
    },
    constantPropagation: {
        isEnabled: true
    },
    reassignmentRemoval: {
        isEnabled: true
    },
    sequenceSplitting: {
        isEnabled: true
    },
    controlFlowRecovery: {
        isEnabled: true
    },
    deadBranchRemoval: {
        isEnabled: true
    },
    unusedVariableRemoval: {
        isEnabled: true
    },
    propertySimplification: {
        isEnabled: true
    }
};
