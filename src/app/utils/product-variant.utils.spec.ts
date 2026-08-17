import { CategoryAttributeDefinition } from '../models/product-catalog.models';
import { cartesianProduct, generateVariantCombinations, variantCombinationKey } from './product-variant.utils';

describe('product variant utilities', () => {
  it('generates a Cartesian product for any number of axes', () => {
    expect(cartesianProduct([['Black', 'Blue'], ['128GB', '256GB'], ['Standard', 'Plus']])).toHaveLength(8);
  });

  it('generates generic typed combinations from category definitions', () => {
    const definitions = [variantDefinition('color', 1), variantDefinition('storage', 2)];
    const combinations = generateVariantCombinations(definitions, {
      color: ['Black', 'Blue'], storage: ['128GB', '256GB']
    });

    expect(combinations.map(combination => combination.map(attribute => attribute.value).join(' / '))).toEqual([
      'Black / 128GB', 'Black / 256GB', 'Blue / 128GB', 'Blue / 256GB'
    ]);
    expect(new Set(combinations.map(variantCombinationKey)).size).toBe(4);
  });
});

function variantDefinition(key: string, sortOrder: number): CategoryAttributeDefinition {
  return {
    id: `definition-${key}`, categoryId: 'Test', key, label: key, inputType: 'multi-select',
    required: true, isVariantAttribute: true, options: [], sortOrder
  };
}
