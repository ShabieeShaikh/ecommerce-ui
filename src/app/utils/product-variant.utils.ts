import { CategoryAttributeDefinition, ProductVariantAttribute } from '../models/product-catalog.models';

export type VariantSelections = Readonly<Record<string, readonly string[]>>;

export function cartesianProduct<T>(axes: readonly (readonly T[])[]): T[][] {
  if (!axes.length) return [];
  return axes.reduce<T[][]>(
    (combinations, axis) => combinations.flatMap(combination => axis.map(value => [...combination, value])),
    [[]]
  );
}

export function generateVariantCombinations(
  definitions: readonly CategoryAttributeDefinition[],
  selections: VariantSelections
): ProductVariantAttribute[][] {
  const selectedDefinitions = definitions
    .filter(definition => definition.isVariantAttribute && (selections[definition.key]?.length ?? 0) > 0)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  if (!selectedDefinitions.length) return [];

  const axes = selectedDefinitions.map(definition => selections[definition.key].map(value => ({
    attributeDefinitionId: definition.id,
    attributeKey: definition.key,
    value
  })));
  return cartesianProduct(axes);
}

export function variantCombinationKey(attributes: readonly ProductVariantAttribute[]): string {
  return attributes
    .map(attribute => `${attribute.attributeKey}:${attribute.value}`)
    .sort((left, right) => left.localeCompare(right))
    .join('|');
}
