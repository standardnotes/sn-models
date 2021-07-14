import {
  findInArray,
  extendArray,
  topLevelCompare,
  jsonParseEmbeddedKeys,
  omitUndefinedCopy,
  dateSorted,
  subtractFromArray,
  removeFromArray,
  removeFromIndex,
  arrayByDifference,
  uniqCombineObjArrays,
  uniqueArrayByKey,
  filterFromArray,
  deepMerge,
  truncateHexString,
  isSameDay,
  naturalSort,
  isNullOrUndefined
} from "@Lib/utils";

describe('utils', () => {
  it('findInArray', async () => {
    expect(findInArray).toBeTruthy();
    const array = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    expect(findInArray(array, 'id', 1)).toBeTruthy();
    expect(findInArray(array, 'id', 'foo')).toBeFalsy();
  });

  it('isNullOrUndefined', () => {
    expect(isNullOrUndefined(null)).toBe(true);
    expect(isNullOrUndefined(undefined)).toBe(true);
    expect(isNullOrUndefined(1)).toBe(false);
    expect(isNullOrUndefined('foo')).toBe(false);
    expect(isNullOrUndefined({})).toBe(false);
    expect(isNullOrUndefined([null])).toBe(false);
  });

  it('extendArray', () => {
    const array = [1, 2, 3];
    const original = array.slice();
    const extended = [4, 5, 6];
    extendArray(array, extended);
    expect(array).toEqual(original.concat(extended));
  });

  it('top level compare', () => {
    const left = { a: 1, b: 2 };
    const right = { a: 1, b: 2 };
    const middle = { a: 2, b: 1 };
    expect(topLevelCompare(left, right)).toBe(true);
    expect(topLevelCompare(right, left)).toBe(true);
    expect(topLevelCompare(left, middle)).toBe(false);
    expect(topLevelCompare(middle, right)).toBe(false);
  });

  it('jsonParseEmbeddedKeys', () => {
    const object = {
      a: { foo: 'bar' },
      b: JSON.stringify({ foo: 'bar' }),
    };
    const parsed = jsonParseEmbeddedKeys(object);
    expect(typeof parsed.a).toBe('object');
    expect(typeof parsed.b).toBe('object');
  });

  it('omitUndefined', () => {
    const object = {
      foo: '123',
      bar: undefined,
    };
    const omitted = omitUndefinedCopy(object);
    expect(Object.keys(omitted).includes('bar')).toBe(false);
  });

  it('dateSorted', () => {
    const objects = [
      { date: new Date(10) },
      { date: new Date(5) },
      { date: new Date(7) },
    ];

    /** ascending */
    const ascending = dateSorted(objects, 'date', true);
    expect(ascending[0].date.getTime()).toBe(5);
    expect(ascending[1].date.getTime()).toBe(7);
    expect(ascending[2].date.getTime()).toBe(10);

    /** descending */
    const descending = dateSorted(objects, 'date', false);
    expect(descending[0].date.getTime()).toBe(10);
    expect(descending[1].date.getTime()).toBe(7);
    expect(descending[2].date.getTime()).toBe(5);
  });

  describe('subtractFromArray', () => {
    it('Removes all items appearing in the array', () => {
      const array = [1, 2, 3, 4, 5];
      subtractFromArray(array, [1, 3, 5]);
      expect(array).toEqual([2, 4]);
    });

    it('Ignores items not appearing in the array', () => {
      const array = [1, 2, 3, 4, 5];
      subtractFromArray(array, [0, 1, 3, 5]);
      expect(array).toEqual([2, 4]);
    });
  });

  describe('removeFromArray', () => {
    it('Removes the first item appearing in the array', () => {
      const array = [1, 1, 2, 3];
      removeFromArray(array, 1);
      expect(array).toEqual([1, 2, 3]);
      removeFromArray(array, 2);
      expect(array).toEqual([1, 3]);
    });

    it('Ignores items not appearing in the array', () => {
      const array = [1, 2, 3];
      removeFromArray(array, 0);
      expect(array).toEqual([1, 2, 3]);
      removeFromArray(array, {});
    });
  });

  it('removeFromIndex', () => {
    const array = [1, 2, 3];
    removeFromIndex(array, 1);
    expect(array).toEqual([1, 3]);
  });

  it('arrayByDifference', () => {
    const array = [1, 2, 3, 4];
    const array2 = [2, 3];
    const result = arrayByDifference(array, array2);
    expect(result).toEqual([1, 4]);
  });

  it('uniqCombineObjArrays', () => {
    const arrayA = [{ a: 'a', b: 'a' }];
    const arrayB = [
      { a: 'a', b: 'a' },
      { a: '2', b: '2' },
    ];

    const result = uniqCombineObjArrays(arrayA, arrayB, ['a', 'b']);
    expect(result.length).toBe(2);
  });

  it('uniqueArrayByKey', () => {
    const arrayA = [{ uuid: 1 }, { uuid: 2 }];
    const arrayB = [{ uuid: 1 }, { uuid: 2 }, { uuid: 1 }, { uuid: 2 }];

    const result = uniqueArrayByKey(arrayA.concat(arrayB), ['uuid']);
    expect(result.length).toBe(2);
  });

  it('filterFromArray function predicate', () => {
    const array = [{ uuid: 1 }, { uuid: 2 }, { uuid: 3 }];

    filterFromArray(array, (o) => o.uuid === 1);
    expect(array.length).toBe(2);
  });

  it('lodash merge should behave as expected', () => {
    const a = {
      content: {
        references: [{ a: 'a' }],
      },
    };
    const b = {
      content: {
        references: [],
      },
    };
    // merging a with b should replace total content
    deepMerge(a, b);
    expect(a.content.references).toEqual([]);
  });

  it('truncates hex string', () => {
    const hex256 =
      'f0e4c2f76c58916ec258f246851bea091d14d4247a2fc3e18694461b1816e13b';
    const desiredBits = 128;
    const expectedLength = 32;
    const result = truncateHexString(hex256, desiredBits);
    expect(result.length).toBe(expectedLength);
  });

  describe('isSameDay', () => {
    it('returns true if two dates are on the same day', () => {
      const dateA = new Date(2021, 1, 16, 16, 30, 0);
      const dateB = new Date(2021, 1, 16, 17, 30, 0);

      const result = isSameDay(dateA, dateB);
      expect(result).toBe(true);
    });

    it('returns false if two dates are not on the same day', () => {
      const dateA = new Date(2021, 1, 16, 16, 30, 0);
      const dateB = new Date(2021, 1, 17, 17, 30, 0);

      const result = isSameDay(dateA, dateB);
      expect(result).toBe(false);
    });
  });

  describe('naturalSort', () => {
    let items;
    beforeEach(() => {
      items = [
        {
          someProperty: 'a',
        },
        {
          someProperty: 'b',
        },
        {
          someProperty: '2',
        },
        {
          someProperty: 'A',
        },
        {
          someProperty: '1',
        }
      ]
    });
    it('sorts elements in natural order in ascending direction by default', () => {
      const result = naturalSort(items, 'someProperty');
      expect(result).toHaveLength(items.length);
      expect(result[0]).toBe(items[4]);
      expect(result[1]).toBe(items[2]);
      expect(result[2]).toBe(items[0]);
      expect(result[3]).toBe(items[3]);
      expect(result[4]).toBe(items[1]);
    });
    it('sorts elements in natural order in descending direction', () => {
      const result = naturalSort(items, 'someProperty', 'desc');
      expect(result).toHaveLength(items.length);
      expect(result[0]).toBe(items[1]);
      expect(result[1]).toBe(items[3]);
      expect(result[2]).toBe(items[0]);
      expect(result[3]).toBe(items[2]);
      expect(result[4]).toBe(items[4]);
    });
  })
});
