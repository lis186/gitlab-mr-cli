/**
 * Batch Processor Unit Tests
 *
 * T016: Unit tests for batch-processor utility
 * Tests processBatchItems() and processBatch() functions
 *
 * @module tests/unit/batch-processor.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { processBatchItems, processBatch } from '../../src/utils/batch-processor'
import type { BatchProcessOptions } from '../../src/utils/batch-processor'

describe('Batch Processor Unit Tests (T016)', () => {
  describe('processBatchItems()', () => {
    it('should process all items successfully', async () => {
      const items = ['item1', 'item2', 'item3']
      const processor = vi.fn(async (item: string) => item.toUpperCase())

      const result = await processBatchItems(items, processor)

      expect(result.successes).toEqual(['ITEM1', 'ITEM2', 'ITEM3'])
      expect(result.failures).toEqual([])
      expect(result.total).toBe(3)
      expect(result.successCount).toBe(3)
      expect(result.failureCount).toBe(0)
      expect(processor).toHaveBeenCalledTimes(3)
    })

    it('should handle empty array', async () => {
      const items: string[] = []
      const processor = vi.fn(async (item: string) => item)

      const result = await processBatchItems(items, processor)

      expect(result.successes).toEqual([])
      expect(result.failures).toEqual([])
      expect(result.total).toBe(0)
      expect(result.successCount).toBe(0)
      expect(result.failureCount).toBe(0)
      expect(processor).not.toHaveBeenCalled()
    })

    it('should isolate errors (single failure does not affect others)', async () => {
      const items = ['item1', 'item2', 'item3', 'item4']
      const processor = vi.fn(async (item: string) => {
        if (item === 'item2') {
          throw new Error('Processing failed for item2')
        }
        return item.toUpperCase()
      })

      const result = await processBatchItems(items, processor)

      expect(result.successes).toEqual(['ITEM1', 'ITEM3', 'ITEM4'])
      expect(result.failures).toHaveLength(1)
      expect(result.failures[0].index).toBe(1) // item2 is at index 1
      expect(result.failures[0].error.message).toBe('Processing failed for item2')
      expect(result.total).toBe(4)
      expect(result.successCount).toBe(3)
      expect(result.failureCount).toBe(1)
    })

    it('should collect all failures when multiple items fail', async () => {
      const items = ['item1', 'item2', 'item3', 'item4']
      const processor = vi.fn(async (item: string) => {
        if (item === 'item2' || item === 'item4') {
          throw new Error(`Failed: ${item}`)
        }
        return item.toUpperCase()
      })

      const result = await processBatchItems(items, processor)

      expect(result.successes).toEqual(['ITEM1', 'ITEM3'])
      expect(result.failures).toHaveLength(2)
      expect(result.failures[0].index).toBe(1) // item2
      expect(result.failures[0].error.message).toBe('Failed: item2')
      expect(result.failures[1].index).toBe(3) // item4
      expect(result.failures[1].error.message).toBe('Failed: item4')
      expect(result.successCount).toBe(2)
      expect(result.failureCount).toBe(2)
    })

    it('should handle all items failing', async () => {
      const items = ['item1', 'item2', 'item3']
      const processor = vi.fn(async (item: string) => {
        throw new Error(`Failed: ${item}`)
      })

      const result = await processBatchItems(items, processor)

      expect(result.successes).toEqual([])
      expect(result.failures).toHaveLength(3)
      expect(result.successCount).toBe(0)
      expect(result.failureCount).toBe(3)
    })

    it('should convert non-Error rejections to Error instances', async () => {
      const items = ['item1', 'item2']
      const processor = vi.fn(async (item: string) => {
        if (item === 'item2') {
          // eslint-disable-next-line prefer-promise-reject-errors
          throw 'String error message'
        }
        return item
      })

      const result = await processBatchItems(items, processor)

      expect(result.failures).toHaveLength(1)
      expect(result.failures[0].error).toBeInstanceOf(Error)
      expect(result.failures[0].error.message).toBe('String error message')
    })

    it('should pass correct index to processor function', async () => {
      const items = ['a', 'b', 'c']
      const processor = vi.fn(async (item: string, index: number) => `${item}-${index}`)

      const result = await processBatchItems(items, processor)

      expect(result.successes).toEqual(['a-0', 'b-1', 'c-2'])
      expect(processor).toHaveBeenNthCalledWith(1, 'a', 0)
      expect(processor).toHaveBeenNthCalledWith(2, 'b', 1)
      expect(processor).toHaveBeenNthCalledWith(3, 'c', 2)
    })
  })

  describe('processBatchItems() - Batch Size Control', () => {
    it('should use default batch size of 10', async () => {
      const items = Array.from({ length: 25 }, (_, i) => `item${i}`)
      const batchSizes: number[] = []
      let currentBatch = 0

      const processor = vi.fn(async (item: string) => {
        const batchNum = Math.floor(currentBatch / 10)
        if (!batchSizes[batchNum]) {
          batchSizes[batchNum] = 0
        }
        batchSizes[batchNum]++
        currentBatch++
        return item
      })

      await processBatchItems(items, processor)

      // 25 items with batch size 10: [10, 10, 5]
      expect(processor).toHaveBeenCalledTimes(25)
    })

    it('should respect custom batch size', async () => {
      const items = Array.from({ length: 15 }, (_, i) => `item${i}`)
      const processor = vi.fn(async (item: string) => item)

      await processBatchItems(items, processor, { batchSize: 5 })

      // 15 items with batch size 5: should be processed in 3 batches
      expect(processor).toHaveBeenCalledTimes(15)
    })

    it('should handle batch size larger than items array', async () => {
      const items = ['item1', 'item2', 'item3']
      const processor = vi.fn(async (item: string) => item)

      const result = await processBatchItems(items, processor, { batchSize: 100 })

      expect(result.successCount).toBe(3)
      expect(processor).toHaveBeenCalledTimes(3)
    })

    it('should handle batch size of 1', async () => {
      const items = ['item1', 'item2', 'item3']
      const processor = vi.fn(async (item: string) => item)

      const result = await processBatchItems(items, processor, { batchSize: 1 })

      expect(result.successCount).toBe(3)
      expect(processor).toHaveBeenCalledTimes(3)
    })

    it('should process items in correct batches maintaining index', async () => {
      const items = Array.from({ length: 7 }, (_, i) => i)
      const processor = vi.fn(async (item: number, index: number) => {
        expect(index).toBe(item) // Index should match item value
        return item * 2
      })

      const result = await processBatchItems(items, processor, { batchSize: 3 })

      expect(result.successes).toEqual([0, 2, 4, 6, 8, 10, 12])
    })
  })

  describe('processBatchItems() - Progress Callback', () => {
    it('should call onProgress callback after each batch', async () => {
      const items = Array.from({ length: 25 }, (_, i) => `item${i}`)
      const progressUpdates: Array<{ processed: number; total: number }> = []
      const onProgress = vi.fn((processed: number, total: number) => {
        progressUpdates.push({ processed, total })
      })

      const processor = vi.fn(async (item: string) => item)

      await processBatchItems(items, processor, { batchSize: 10, onProgress })

      // Should be called 3 times: after batch 1 (10), batch 2 (20), batch 3 (25)
      expect(onProgress).toHaveBeenCalledTimes(3)
      expect(progressUpdates).toEqual([
        { processed: 10, total: 25 },
        { processed: 20, total: 25 },
        { processed: 25, total: 25 },
      ])
    })

    it('should call onProgress even when some items fail', async () => {
      const items = ['item1', 'item2', 'item3', 'item4']
      const onProgress = vi.fn()
      const processor = vi.fn(async (item: string) => {
        if (item === 'item2') {
          throw new Error('Failed')
        }
        return item
      })

      await processBatchItems(items, processor, { batchSize: 2, onProgress })

      // Should be called twice regardless of failures
      expect(onProgress).toHaveBeenCalledTimes(2)
      expect(onProgress).toHaveBeenNthCalledWith(1, 2, 4)
      expect(onProgress).toHaveBeenNthCalledWith(2, 4, 4)
    })

    it('should not call onProgress when no callback provided', async () => {
      const items = ['item1', 'item2', 'item3']
      const processor = vi.fn(async (item: string) => item)

      // Should not throw error when onProgress is undefined
      const result = await processBatchItems(items, processor)

      expect(result.successCount).toBe(3)
    })

    it('should call onProgress with correct totals for single batch', async () => {
      const items = ['item1', 'item2']
      const onProgress = vi.fn()
      const processor = vi.fn(async (item: string) => item)

      await processBatchItems(items, processor, { batchSize: 10, onProgress })

      expect(onProgress).toHaveBeenCalledTimes(1)
      expect(onProgress).toHaveBeenCalledWith(2, 2)
    })
  })

  describe('processBatchItems() - Error Handling Strategy', () => {
    it('should skip errors by default (errorHandling: "skip")', async () => {
      const items = ['item1', 'item2', 'item3']
      const processor = vi.fn(async (item: string) => {
        if (item === 'item2') {
          throw new Error('Failed')
        }
        return item
      })

      const result = await processBatchItems(items, processor)

      expect(result.successes).toEqual(['item1', 'item3'])
      expect(result.failures).toHaveLength(1)
      expect(result.successCount).toBe(2)
    })

    it('should skip errors when explicitly set to "skip"', async () => {
      const items = ['item1', 'item2', 'item3']
      const processor = vi.fn(async (item: string) => {
        if (item === 'item2') {
          throw new Error('Failed')
        }
        return item
      })

      const result = await processBatchItems(items, processor, { errorHandling: 'skip' })

      expect(result.successes).toEqual(['item1', 'item3'])
      expect(result.failures).toHaveLength(1)
    })

    it('should throw on first error when errorHandling is "throw"', async () => {
      const items = ['item1', 'item2', 'item3', 'item4']
      const processor = vi.fn(async (item: string) => {
        if (item === 'item2') {
          throw new Error('Failed at item2')
        }
        return item
      })

      await expect(
        processBatchItems(items, processor, { errorHandling: 'throw' })
      ).rejects.toThrow('Failed at item2')

      // Should have processed item1 successfully before throwing
      expect(processor).toHaveBeenCalled()
    })

    it('should throw immediately within a batch when errorHandling is "throw"', async () => {
      const items = ['item1', 'item2', 'item3', 'item4', 'item5']
      const processor = vi.fn(async (item: string) => {
        if (item === 'item3') {
          throw new Error('Failed at item3')
        }
        return item
      })

      await expect(
        processBatchItems(items, processor, { batchSize: 10, errorHandling: 'throw' })
      ).rejects.toThrow('Failed at item3')
    })

    it('should preserve error details when throwing', async () => {
      const items = ['item1', 'item2']
      const customError = new Error('Custom error message')
      customError.name = 'CustomError'

      const processor = vi.fn(async (item: string) => {
        if (item === 'item2') {
          throw customError
        }
        return item
      })

      try {
        await processBatchItems(items, processor, { errorHandling: 'throw' })
        expect.fail('Should have thrown error')
      } catch (error) {
        expect(error).toBe(customError)
        expect((error as Error).message).toBe('Custom error message')
        expect((error as Error).name).toBe('CustomError')
      }
    })
  })

  describe('processBatch()', () => {
    it('should return only successful results', async () => {
      const items = ['item1', 'item2', 'item3']
      const processor = vi.fn(async (item: string) => item.toUpperCase())

      const results = await processBatch(items, processor)

      expect(results).toEqual(['ITEM1', 'ITEM2', 'ITEM3'])
    })

    it('should filter out failed items from results', async () => {
      const items = ['item1', 'item2', 'item3', 'item4']
      const processor = vi.fn(async (item: string) => {
        if (item === 'item2' || item === 'item4') {
          throw new Error('Failed')
        }
        return item.toUpperCase()
      })

      const results = await processBatch(items, processor)

      expect(results).toEqual(['ITEM1', 'ITEM3'])
    })

    it('should return empty array when all items fail', async () => {
      const items = ['item1', 'item2', 'item3']
      const processor = vi.fn(async (item: string) => {
        throw new Error('All failed')
      })

      const results = await processBatch(items, processor)

      expect(results).toEqual([])
    })

    it('should return empty array for empty input', async () => {
      const items: string[] = []
      const processor = vi.fn(async (item: string) => item)

      const results = await processBatch(items, processor)

      expect(results).toEqual([])
    })

    it('should pass through options to processBatchItems', async () => {
      const items = Array.from({ length: 15 }, (_, i) => `item${i}`)
      const onProgress = vi.fn()
      const processor = vi.fn(async (item: string) => item)

      await processBatch(items, processor, { batchSize: 5, onProgress })

      // Progress should be called 3 times (15 items / 5 batch size)
      expect(onProgress).toHaveBeenCalledTimes(3)
    })

    it('should work with custom processor return types', async () => {
      interface Result {
        value: string
        processed: boolean
      }

      const items = ['a', 'b', 'c']
      const processor = async (item: string): Promise<Result> => ({
        value: item.toUpperCase(),
        processed: true,
      })

      const results = await processBatch(items, processor)

      expect(results).toEqual([
        { value: 'A', processed: true },
        { value: 'B', processed: true },
        { value: 'C', processed: true },
      ])
    })

    it('should throw when errorHandling is "throw" and item fails', async () => {
      const items = ['item1', 'item2', 'item3']
      const processor = vi.fn(async (item: string) => {
        if (item === 'item2') {
          throw new Error('Failed')
        }
        return item
      })

      await expect(
        processBatch(items, processor, { errorHandling: 'throw' })
      ).rejects.toThrow('Failed')
    })
  })

  describe('Large-scale batch processing', () => {
    it('should handle 100 items efficiently', async () => {
      const items = Array.from({ length: 100 }, (_, i) => i)
      const processor = vi.fn(async (item: number) => item * 2)

      const result = await processBatchItems(items, processor, { batchSize: 10 })

      expect(result.successCount).toBe(100)
      expect(result.successes).toHaveLength(100)
      expect(result.successes[0]).toBe(0)
      expect(result.successes[99]).toBe(198)
    })

    it('should handle 100 items with some failures', async () => {
      const items = Array.from({ length: 100 }, (_, i) => i)
      const processor = vi.fn(async (item: number) => {
        // Fail on multiples of 10
        if (item % 10 === 0 && item !== 0) {
          throw new Error(`Failed at ${item}`)
        }
        return item * 2
      })

      const result = await processBatchItems(items, processor, { batchSize: 10 })

      // 100 items - 9 failures (10, 20, 30, 40, 50, 60, 70, 80, 90) = 91 successes
      expect(result.successCount).toBe(91)
      expect(result.failureCount).toBe(9)
      expect(result.failures[0].index).toBe(10)
      expect(result.failures[8].index).toBe(90)
    })

    it('should call progress callback correctly for large dataset', async () => {
      const items = Array.from({ length: 100 }, (_, i) => i)
      const progressUpdates: number[] = []
      const onProgress = vi.fn((processed: number) => {
        progressUpdates.push(processed)
      })

      const processor = vi.fn(async (item: number) => item)

      await processBatchItems(items, processor, { batchSize: 10, onProgress })

      // Should be called 10 times (100 / 10)
      expect(onProgress).toHaveBeenCalledTimes(10)
      expect(progressUpdates).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
    })
  })

  describe('Edge cases and concurrent behavior', () => {
    it('should process items in batches concurrently within batch', async () => {
      const items = ['a', 'b', 'c', 'd', 'e']
      const executionLog: string[] = []

      const processor = async (item: string): Promise<string> => {
        executionLog.push(`start-${item}`)
        await new Promise((resolve) => setTimeout(resolve, 10))
        executionLog.push(`end-${item}`)
        return item
      }

      await processBatchItems(items, processor, { batchSize: 3 })

      // Within each batch, items should start before previous ones end
      // Batch 1: a, b, c should overlap
      const aStartIndex = executionLog.indexOf('start-a')
      const aEndIndex = executionLog.indexOf('end-a')
      const bStartIndex = executionLog.indexOf('start-b')
      const cStartIndex = executionLog.indexOf('start-c')

      // b and c should start before a ends (concurrent execution)
      expect(bStartIndex).toBeLessThan(aEndIndex)
      expect(cStartIndex).toBeLessThan(aEndIndex)
    })

    it('should handle processor that returns undefined', async () => {
      const items = [1, 2, 3]
      const processor = vi.fn(async (item: number): Promise<undefined> => undefined)

      const result = await processBatchItems(items, processor)

      expect(result.successes).toEqual([undefined, undefined, undefined])
      expect(result.successCount).toBe(3)
    })

    it('should handle processor that returns null', async () => {
      const items = [1, 2, 3]
      const processor = vi.fn(async (item: number): Promise<null> => null)

      const result = await processBatchItems(items, processor)

      expect(result.successes).toEqual([null, null, null])
      expect(result.successCount).toBe(3)
    })

    it('should maintain correct indices when batch size does not divide evenly', async () => {
      const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
      const processor = vi.fn(async (item: string) => {
        if (item === 'c' || item === 'f') {
          throw new Error(`Failed: ${item}`)
        }
        return item
      })

      const result = await processBatchItems(items, processor, { batchSize: 3 })

      expect(result.failures).toHaveLength(2)
      expect(result.failures[0].index).toBe(2) // 'c' is at index 2
      expect(result.failures[1].index).toBe(5) // 'f' is at index 5
    })

    it('should handle mixed types in generic processor', async () => {
      interface InputItem {
        id: number
        name: string
      }

      interface OutputItem {
        id: number
        processed: string
      }

      const items: InputItem[] = [
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
        { id: 3, name: 'third' },
      ]

      const processor = async (item: InputItem): Promise<OutputItem> => ({
        id: item.id,
        processed: item.name.toUpperCase(),
      })

      const result = await processBatchItems(items, processor)

      expect(result.successes).toEqual([
        { id: 1, processed: 'FIRST' },
        { id: 2, processed: 'SECOND' },
        { id: 3, processed: 'THIRD' },
      ])
    })
  })
})
