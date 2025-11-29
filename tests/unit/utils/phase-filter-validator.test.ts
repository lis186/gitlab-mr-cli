/**
 * PhaseFilterValidator 單元測試
 * Feature: 013-mr-phase-filters
 * Task: T010
 *
 * 測試範圍：
 * - 百分比範圍驗證（0-100）
 * - 天數範圍驗證（≥0）
 * - 邊界檢查（min ≤ max）
 * - 非空檢查（至少一個條件）
 */

import { describe, it, expect } from 'vitest';
import { PhaseFilterValidator } from '../../../src/utils/phase-filter-validator.js';
import type { PhaseFilter } from '../../../src/types/batch-comparison.js';

describe('PhaseFilterValidator', () => {
  describe('Range Validation - Percentages (0-100)', () => {
    it('should accept valid percentage values (0-100)', () => {
      // Arrange
      const filters: PhaseFilter = {
        devPercentMin: 0,
        devPercentMax: 100,
        waitPercentMin: 50,
        reviewPercentMax: 75,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject percentage values less than 0', () => {
      // Arrange
      const filters: PhaseFilter = {
        devPercentMin: -10,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('dev-percent-min (-10) 必須在 0-100 範圍內');
    });

    it('should reject percentage values greater than 100', () => {
      // Arrange
      const filters: PhaseFilter = {
        waitPercentMax: 150,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('wait-percent-max (150) 必須在 0-100 範圍內');
    });

    it('should reject multiple invalid percentage values', () => {
      // Arrange
      const filters: PhaseFilter = {
        devPercentMin: -5,
        waitPercentMax: 120,
        reviewPercentMin: 200,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toContain('dev-percent-min (-5) 必須在 0-100 範圍內');
      expect(result.errors).toContain('wait-percent-max (120) 必須在 0-100 範圍內');
      expect(result.errors).toContain('review-percent-min (200) 必須在 0-100 範圍內');
    });
  });

  describe('Range Validation - Days (≥0)', () => {
    it('should accept valid day values (≥0)', () => {
      // Arrange
      const filters: PhaseFilter = {
        devDaysMin: 0,
        waitDaysMax: 5.5,
        reviewDaysMin: 2,
        mergeDaysMax: 1.25,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject negative day values', () => {
      // Arrange
      const filters: PhaseFilter = {
        devDaysMin: -1,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('dev-days-min (-1) 必須 ≥ 0');
    });

    it('should reject multiple negative day values', () => {
      // Arrange
      const filters: PhaseFilter = {
        waitDaysMax: -2.5,
        reviewDaysMin: -3,
        mergeDaysMax: -0.5,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toContain('wait-days-max (-2.5) 必須 ≥ 0');
      expect(result.errors).toContain('review-days-min (-3) 必須 ≥ 0');
      expect(result.errors).toContain('merge-days-max (-0.5) 必須 ≥ 0');
    });
  });

  describe('Boundary Validation (min ≤ max)', () => {
    it('should accept valid min-max bounds', () => {
      // Arrange
      const filters: PhaseFilter = {
        devPercentMin: 20,
        devPercentMax: 40,
        waitDaysMin: 1,
        waitDaysMax: 5,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept equal min and max values', () => {
      // Arrange
      const filters: PhaseFilter = {
        devPercentMin: 30,
        devPercentMax: 30,
        waitDaysMin: 2.5,
        waitDaysMax: 2.5,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject percentage bounds where min > max', () => {
      // Arrange
      const filters: PhaseFilter = {
        devPercentMin: 60,
        devPercentMax: 40,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('dev-percent-min (60) 不能大於 dev-percent-max (40)');
    });

    it('should reject day bounds where min > max', () => {
      // Arrange
      const filters: PhaseFilter = {
        waitDaysMin: 5,
        waitDaysMax: 2,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('wait-days-min (5) 不能大於 wait-days-max (2)');
    });

    it('should reject multiple invalid bounds', () => {
      // Arrange
      const filters: PhaseFilter = {
        devPercentMin: 70,
        devPercentMax: 30,
        reviewDaysMin: 10,
        reviewDaysMax: 3,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain('dev-percent-min (70) 不能大於 dev-percent-max (30)');
      expect(result.errors).toContain('review-days-min (10) 不能大於 review-days-max (3)');
    });
  });

  describe('Non-Empty Validation', () => {
    it('should reject empty filter object', () => {
      // Arrange
      const filters: PhaseFilter = {};

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('至少需指定一個階段過濾條件');
    });

    it('should accept filter with at least one condition', () => {
      // Arrange
      const filters: PhaseFilter = {
        devPercentMin: 20,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept filter with multiple conditions', () => {
      // Arrange
      const filters: PhaseFilter = {
        devPercentMin: 10,
        waitDaysMax: 5,
        reviewPercentMax: 60,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Combined Validation Errors', () => {
    it('should report all validation errors simultaneously', () => {
      // Arrange - Multiple violations
      const filters: PhaseFilter = {
        devPercentMin: 150,        // Range error
        devPercentMax: 50,         // Boundary error (min > max)
        waitDaysMin: -2,           // Range error
        reviewPercentMin: 70,      // Boundary setup
        reviewPercentMax: 30,      // Boundary error (min > max)
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain('dev-percent-min (150) 必須在 0-100 範圍內');
      expect(result.errors).toContain('dev-percent-min (150) 不能大於 dev-percent-max (50)');
      expect(result.errors).toContain('wait-days-min (-2) 必須 ≥ 0');
      expect(result.errors).toContain('review-percent-min (70) 不能大於 review-percent-max (30)');
    });
  });

  describe('Edge Cases', () => {
    it('should accept boundary values (0% and 100%)', () => {
      // Arrange
      const filters: PhaseFilter = {
        devPercentMin: 0,
        devPercentMax: 100,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept zero days', () => {
      // Arrange
      const filters: PhaseFilter = {
        devDaysMin: 0,
        waitDaysMax: 0,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept decimal day values', () => {
      // Arrange
      const filters: PhaseFilter = {
        devDaysMin: 0.5,
        waitDaysMax: 1.25,
        reviewDaysMin: 2.75,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle all 16 filter conditions simultaneously', () => {
      // Arrange - All conditions defined with valid values
      const filters: PhaseFilter = {
        devPercentMin: 10,
        devPercentMax: 30,
        devDaysMin: 1,
        devDaysMax: 3,
        waitPercentMin: 5,
        waitPercentMax: 20,
        waitDaysMin: 0.5,
        waitDaysMax: 2,
        reviewPercentMin: 30,
        reviewPercentMax: 60,
        reviewDaysMin: 2,
        reviewDaysMax: 5,
        mergePercentMin: 5,
        mergePercentMax: 15,
        mergeDaysMin: 0.5,
        mergeDaysMax: 1.5,
      };

      // Act
      const result = PhaseFilterValidator.validate(filters);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
