import { isRightVersionGreaterThanLeft, compareSemVersions } from "@Lib/version";

describe('versions', () => {
  it('isRightVersionGreaterThanLeft', async () => {
    expect(isRightVersionGreaterThanLeft('0.0.0', '0.0.1')).toBe(true);
    expect(isRightVersionGreaterThanLeft('0.0.0', '0.0.0.1')).toBe(true);
    expect(isRightVersionGreaterThanLeft('1.0.0', '1.0.1')).toBe(true);

    expect(isRightVersionGreaterThanLeft('0.0.1', '0.0.0')).toBe(false);
    expect(isRightVersionGreaterThanLeft('0.1.1', '0.1.0')).toBe(false);
    expect(isRightVersionGreaterThanLeft('1.1.1', '1.1.0')).toBe(false);

    expect(isRightVersionGreaterThanLeft('1.1.001', '1.1.001')).toBe(false);
  });

  it('compareSemVersions', () => {
    expect(compareSemVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareSemVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemVersions('1.0.1', '1.0.0')).toBe(1);
    expect(compareSemVersions('100.0.1', '2.0.15')).toBe(1);

    expect(compareSemVersions('0.1', '0.2')).toBe(-1);
    expect(compareSemVersions('0.1', '0.0.2')).toBe(1);
    expect(compareSemVersions('0.0', '0.00')).toBe(0);

    expect(compareSemVersions('2.0.01', '2.0.1')).toBe(0);
    expect(compareSemVersions('2.0.0001', '2.0.01')).toBe(0);

    expect(compareSemVersions('2.0.1001', '2.0.01')).toBe(1);
    expect(compareSemVersions('2.0.1001', '2.2.01')).toBe(-1);
  });
});
