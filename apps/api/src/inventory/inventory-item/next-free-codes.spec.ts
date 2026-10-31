import { nextFreeCodes } from './inventory-item-import.service';

describe('nextFreeCodes', () => {
  it('老编码大小写/空格不规范也不会撞号', () => {
    const rows = [{ code: 'WP0001' }, { code: 'wp0007' }, { code: 'WP0003 ' }, { code: 'ABC' }];
    expect(nextFreeCodes(rows, 2)).toEqual(['WP0008', 'WP0009']);
  });
  it('没有编码时从 WP0001 开始', () => {
    expect(nextFreeCodes([], 2)).toEqual(['WP0001', 'WP0002']);
  });
});
