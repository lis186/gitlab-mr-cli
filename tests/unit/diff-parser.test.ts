/**
 * Diff 解析工具單元測試
 * Feature: 007-mr-size-analysis
 */

import { describe, it, expect } from 'vitest'
import { calculateLineChanges, calculateTotalChanges } from '../../src/utils/diff-parser.js'

describe('diff-parser', () => {
  describe('calculateLineChanges', () => {
    it('應該正確計算新增和刪除行數', () => {
      const diff = `@@ -10,7 +10,8 @@
 export function login(username: string, password: string) {
-  if (!username || !password) {
-    throw new Error('Invalid credentials')
+  if (!username) {
+    throw new Error('Username is required')
+  }
+  if (!password) {
+    throw new Error('Password is required')
   }
 }`

      const result = calculateLineChanges(diff)

      expect(result.additions).toBe(5) // 5 行新增
      expect(result.deletions).toBe(2) // 2 行刪除
    })

    it('應該忽略檔案標記行（+++ 和 ---）', () => {
      const diff = `--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1,3 +1,4 @@
+import { User } from './types'
-const foo = 'bar'`

      const result = calculateLineChanges(diff)

      expect(result.additions).toBe(1) // 只計算一行 +
      expect(result.deletions).toBe(1) // 只計算一行 -
    })

    it('應該處理空 diff', () => {
      const result = calculateLineChanges('')

      expect(result.additions).toBe(0)
      expect(result.deletions).toBe(0)
    })

    it('應該處理只有新增的 diff（新檔案）', () => {
      const diff = `@@ -0,0 +1,5 @@
+export interface User {
+  id: number
+  username: string
+  email: string
+}`

      const result = calculateLineChanges(diff)

      expect(result.additions).toBe(5)
      expect(result.deletions).toBe(0)
    })

    it('應該處理只有刪除的 diff（刪除檔案）', () => {
      const diff = `@@ -1,3 +0,0 @@
-const oldCode = true
-const deprecated = 'remove this'
-console.log('old')`

      const result = calculateLineChanges(diff)

      expect(result.additions).toBe(0)
      expect(result.deletions).toBe(3)
    })
  })

  describe('calculateTotalChanges', () => {
    it('應該累加多個 diff 的統計', () => {
      const diffs = [
        {
          diff: `@@ -1,2 +1,3 @@
+line 1
-line 2
+line 3`,
        },
        {
          diff: `@@ -1,1 +1,2 @@
+new line
-old line`,
        },
      ]

      const result = calculateTotalChanges(diffs)

      expect(result.additions).toBe(3) // 2 + 1
      expect(result.deletions).toBe(2) // 1 + 1
    })

    it('應該處理空陣列', () => {
      const result = calculateTotalChanges([])

      expect(result.additions).toBe(0)
      expect(result.deletions).toBe(0)
    })

    it('應該處理包含空 diff 的陣列', () => {
      const diffs = [{ diff: '' }, { diff: '+new line\n-old line' }]

      const result = calculateTotalChanges(diffs)

      expect(result.additions).toBe(1)
      expect(result.deletions).toBe(1)
    })
  })
})
