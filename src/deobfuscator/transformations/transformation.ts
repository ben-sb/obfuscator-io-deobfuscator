import * as t from '@babel/types';
import { TransformationKey } from './config';

export abstract class Transformation {
    protected readonly ast: t.File;
    private changed: boolean = false;

    /**
     * Creates a new transformation.
     * @param ast The AST.
     * @param config The transformation config.
     */
    constructor(ast: t.File, config: TransformationConfig) {
        this.ast = ast;
    }

    /**
     * Executes the transformation.
     * @param log The log function.
     * @returns Whether changes were made.
     */
    public abstract execute(log: LogFunction): boolean;

    /**
     * Returns whether the script has been modified.
     * @returns Whether the script has been modified.
     */
    protected hasChanged(): boolean {
        return this.changed;
    }

    /**
     * Marks that the script has been modified.
     */
    protected setChanged(): void {
        this.changed = true;
    }
}

export type LogFunction = (...args: string[]) => void;

export interface TransformationConfig {
    isEnabled: boolean;
    [key: string]: boolean | undefined;
}

/**
 * Static properties all transformations must have.
 */
export interface TransformationProperties {
    key: TransformationKey;
    rebuildScopeTree?: boolean;
}

/**
 * Represents the transformation class type.
 */
export interface TransformationType {
    new (ast: t.File, config: TransformationConfig): Transformation;
    properties: TransformationProperties;
}
