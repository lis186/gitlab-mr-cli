/**
 * 規模分類邏輯單元測試
 * Feature: 007-mr-size-analysis
 */

import { describe, it, expect } from 'vitest'
import {
  categorizeMRSize,
  SIZE_THRESHOLDS,
  exceedsFileThreshold,
  exceedsLOCThreshold,
} from '../../src/models/size-category.js'
import { SizeCategory } from '../../src/types/mr-size.js'

describe('size-category', () => {
  describe('categorizeMRSize', () => {
    it('應該正確分類 XS 規模的 MR', () => {
      // 檔案數 ≤ 10，行數 ≤ 100
      expect(categorizeMRSize(5, 50)).toBe(SizeCategory.XS)
      expect(categorizeMRSize(10, 100)).toBe(SizeCategory.XS)
      expect(categorizeMRSize(1, 10)).toBe(SizeCategory.XS)
    })

    it('應該正確分類 S 規模的 MR', () => {
      // 檔案數 ≤ 20，行數 ≤ 200
      expect(categorizeMRSize(15, 150)).toBe(SizeCategory.S)
      expect(categorizeMRSize(20, 200)).toBe(SizeCategory.S)
      expect(categorizeMRSize(11, 101)).toBe(SizeCategory.S)
    })

    it('應該正確分類 M 規模的 MR', () => {
      // 檔案數 ≤ 50，行數 ≤ 400
      expect(categorizeMRSize(30, 300)).toBe(SizeCategory.M)
      expect(categorizeMRSize(50, 400)).toBe(SizeCategory.M)
      expect(categorizeMRSize(21, 201)).toBe(SizeCategory.M)
    })

    it('應該正確分類 L 規模的 MR', () => {
      // 檔案數 ≤ 100，行數 ≤ 800
      expect(categorizeMRSize(60, 600)).toBe(SizeCategory.L)
      expect(categorizeMRSize(100, 800)).toBe(SizeCategory.L)
      expect(categorizeMRSize(51, 401)).toBe(SizeCategory.L)
    })

    it('應該正確分類 XL 規模的 MR', () => {
      // 檔案數 > 100 或 行數 > 800
      expect(categorizeMRSize(150, 1000)).toBe(SizeCategory.XL)
      expect(categorizeMRSize(101, 500)).toBe(SizeCategory.XL)
      expect(categorizeMRSize(50, 801)).toBe(SizeCategory.XL)
    })

    describe('邊界案例：當門檻衝突時使用較大的類別', () => {
      it('檔案數 XS + 行數 XL = XL', () => {
        // 5 個檔案（XS），但 900 行（XL）→ 應為 XL
        expect(categorizeMRSize(5, 900)).toBe(SizeCategory.XL)
      })

      it('檔案數 L + 行數 S = L', () => {
        // 60 個檔案（L），但 150 行（S）→ 應為 L
        expect(categorizeMRSize(60, 150)).toBe(SizeCategory.L)
      })

      it('檔案數 S + 行數 M = M', () => {
        // 15 個檔案（S），但 300 行（M）→ 應為 M
        expect(categorizeMRSize(15, 300)).toBe(SizeCategory.M)
      })

      it('檔案數 XL + 行數 XS = XL', () => {
        // 150 個檔案（XL），但 50 行（XS）→ 應為 XL
        expect(categorizeMRSize(150, 50)).toBe(SizeCategory.XL)
      })

      it('檔案數 M + 行數 L = L', () => {
        // 30 個檔案（M），但 700 行（L）→ 應為 L
        expect(categorizeMRSize(30, 700)).toBe(SizeCategory.L)
      })
    })

    it('應該處理 0 值（空 MR）', () => {
      expect(categorizeMRSize(0, 0)).toBe(SizeCategory.XS)
    })

    it('應該處理極端大值', () => {
      expect(categorizeMRSize(10000, 50000)).toBe(SizeCategory.XL)
    })
  })

  describe('SIZE_THRESHOLDS', () => {
    it('應該定義所有規模類別的門檻', () => {
      expect(SIZE_THRESHOLDS.XS).toEqual({ files: 10, loc: 100 })
      expect(SIZE_THRESHOLDS.S).toEqual({ files: 20, loc: 200 })
      expect(SIZE_THRESHOLDS.M).toEqual({ files: 50, loc: 400 })
      expect(SIZE_THRESHOLDS.L).toEqual({ files: 100, loc: 800 })
      expect(SIZE_THRESHOLDS.XL).toEqual({ files: Infinity, loc: Infinity })
    })
  })

  describe('exceedsFileThreshold', () => {
    it('應該檢查 L 類別的檔案數門檻', () => {
      // L 的門檻是 > 50 檔案（M 的上限）
      expect(exceedsFileThreshold(60, 'L')).toBe(true)
      expect(exceedsFileThreshold(50, 'L')).toBe(false)
      expect(exceedsFileThreshold(40, 'L')).toBe(false)
    })

    it('應該檢查 XL 類別的檔案數門檻', () => {
      // XL 的門檻是 > 100 檔案（L 的上限）
      expect(exceedsFileThreshold(150, 'XL')).toBe(true)
      expect(exceedsFileThreshold(100, 'XL')).toBe(false)
      expect(exceedsFileThreshold(90, 'XL')).toBe(false)
    })
  })

  describe('exceedsLOCThreshold', () => {
    it('應該檢查 L 類別的行數門檻', () => {
      // L 的門檻是 > 400 行（M 的上限）
      expect(exceedsLOCThreshold(500, 'L')).toBe(true)
      expect(exceedsLOCThreshold(400, 'L')).toBe(false)
      expect(exceedsLOCThreshold(300, 'L')).toBe(false)
    })

    it('應該檢查 XL 類別的行數門檻', () => {
      // XL 的門檻是 > 800 行（L 的上限）
      expect(exceedsLOCThreshold(900, 'XL')).toBe(true)
      expect(exceedsLOCThreshold(800, 'XL')).toBe(false)
      expect(exceedsLOCThreshold(700, 'XL')).toBe(false)
    })
  })
})
