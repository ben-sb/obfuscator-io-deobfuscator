import generate from '@babel/generator';
import * as t from '@babel/types';
import {parseExpression} from '@babel/parser';

/**
 * Copies an expression.
 * @param expression The expression.
 * @returns The copy.
 */
export const copyExpression = (expression: t.Expression): t.Expression => {
    return parseExpression(generate(expression).code);
};

/**
 * Sets a property on an object.
 * @param obj The object.
 * @param property The property key.
 * @param value The value.
 */
export const setProperty = (obj: any, property: string, value: any): void => {
    (obj as Record<string, any>).property = value;
};

/**
 * Gets the value of a property on an object.
 * @param obj The object.
 * @param property The property key.
 * @returns
 */
export const getProperty = (obj: any, property: string): any => {
    return (obj as Record<string, any>).property;
};
