import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { logger } from '../../utils/logger.js';

export interface CacheOptions {
  /**
   * 快取目錄路徑（預設：~/.gitlab-analysis/cache）
   */
  cacheDir?: string;

  /**
   * 快取生存時間（毫秒）（預設：30 分鐘）
   */
  ttl?: number;

  /**
   * 是否啟用快取（預設：true）
   */
  enabled?: boolean;
}

export interface CacheEntry<T> {
  /**
   * 快取的資料
   */
  data: T;

  /**
   * 快取建立時間戳
   */
  timestamp: number;

  /**
   * 快取過期時間戳
   */
  expiresAt: number;

  /**
   * 快取鍵值
   */
  key: string;
}

/**
 * 檔案系統快取服務
 *
 * 功能：
 * - 基於檔案系統的持久化快取
 * - TTL 自動過期機制
 * - 快取鍵值自動生成
 * - 過期快取自動清理
 */
export class CacheService {
  private cacheDir: string;
  private ttl: number;
  private enabled: boolean;

  constructor(options: CacheOptions = {}) {
    this.cacheDir = options.cacheDir || path.join(os.homedir(), '.gitlab-analysis', 'cache');
    this.ttl = options.ttl || 30 * 60 * 1000; // 預設 30 分鐘
    this.enabled = options.enabled ?? true;

    if (this.enabled) {
      this.ensureCacheDir();
    }
  }

  /**
   * 確保快取目錄存在
   */
  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      logger.debug(`快取目錄已建立: ${this.cacheDir}`);
    }
  }

  /**
   * 生成快取鍵值的雜湊值
   */
  private generateCacheKey(keyParts: Record<string, any>): string {
    const sortedKey = Object.keys(keyParts)
      .sort()
      .reduce((acc, key) => {
        acc[key] = keyParts[key];
        return acc;
      }, {} as Record<string, any>);

    const keyString = JSON.stringify(sortedKey);
    return crypto.createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * 取得快取檔案路徑
   */
  private getCacheFilePath(cacheKey: string): string {
    return path.join(this.cacheDir, `${cacheKey}.json`);
  }

  /**
   * 讀取快取
   *
   * @param keyParts - 快取鍵值組成部分
   * @returns 快取的資料，若不存在或已過期則返回 null
   */
  async get<T>(keyParts: Record<string, any>): Promise<T | null> {
    if (!this.enabled) {
      logger.debug('快取已停用，跳過讀取');
      return null;
    }

    const cacheKey = this.generateCacheKey(keyParts);
    const filePath = this.getCacheFilePath(cacheKey);

    try {
      if (!fs.existsSync(filePath)) {
        logger.debug(`快取未命中: ${cacheKey}`);
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(content);

      // 檢查是否過期
      const now = Date.now();
      if (now > entry.expiresAt) {
        logger.debug(`快取已過期: ${cacheKey} (過期時間: ${new Date(entry.expiresAt).toISOString()})`);
        // 刪除過期的快取檔案
        fs.unlinkSync(filePath);
        return null;
      }

      logger.debug(`快取命中: ${cacheKey} (剩餘時間: ${Math.round((entry.expiresAt - now) / 1000)}秒)`);
      return entry.data;
    } catch (error) {
      logger.warn(`讀取快取失敗: ${cacheKey}`, error);
      return null;
    }
  }

  /**
   * 寫入快取
   *
   * @param keyParts - 快取鍵值組成部分
   * @param data - 要快取的資料
   * @returns 是否成功寫入
   */
  async set<T>(keyParts: Record<string, any>, data: T): Promise<boolean> {
    if (!this.enabled) {
      logger.debug('快取已停用，跳過寫入');
      return false;
    }

    const cacheKey = this.generateCacheKey(keyParts);
    const filePath = this.getCacheFilePath(cacheKey);

    try {
      const now = Date.now();
      const entry: CacheEntry<T> = {
        data,
        timestamp: now,
        expiresAt: now + this.ttl,
        key: cacheKey,
      };

      fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
      // 設定文件權限為 0600（只有擁有者可讀寫），增強安全性
      fs.chmodSync(filePath, 0o600);
      logger.debug(`快取已寫入: ${cacheKey} (TTL: ${this.ttl / 1000}秒)`);
      return true;
    } catch (error) {
      logger.warn(`寫入快取失敗: ${cacheKey}`, error);
      return false;
    }
  }

  /**
   * 刪除快取
   *
   * @param keyParts - 快取鍵值組成部分
   * @returns 是否成功刪除
   */
  async delete(keyParts: Record<string, any>): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    const cacheKey = this.generateCacheKey(keyParts);
    const filePath = this.getCacheFilePath(cacheKey);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug(`快取已刪除: ${cacheKey}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.warn(`刪除快取失敗: ${cacheKey}`, error);
      return false;
    }
  }

  /**
   * 清理所有過期的快取
   *
   * @returns 清理的快取數量
   */
  async cleanup(): Promise<number> {
    if (!this.enabled) {
      return 0;
    }

    let count = 0;
    const now = Date.now();

    try {
      const files = fs.readdirSync(this.cacheDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const entry: CacheEntry<any> = JSON.parse(content);

          if (now > entry.expiresAt) {
            fs.unlinkSync(filePath);
            count++;
          }
        } catch {
          // 忽略無法解析的檔案
        }
      }

      if (count > 0) {
        logger.debug(`清理了 ${count} 個過期快取`);
      }
    } catch (error) {
      logger.warn('清理快取時發生錯誤', error);
    }

    return count;
  }

  /**
   * 清除所有快取
   *
   * @returns 清除的快取數量
   */
  async clear(): Promise<number> {
    if (!this.enabled) {
      return 0;
    }

    let count = 0;

    try {
      const files = fs.readdirSync(this.cacheDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);
        fs.unlinkSync(filePath);
        count++;
      }

      logger.debug(`清除了 ${count} 個快取`);
    } catch (error) {
      logger.warn('清除快取時發生錯誤', error);
    }

    return count;
  }

  /**
   * 取得快取統計資訊
   */
  async getStats(): Promise<{
    totalCaches: number;
    expiredCaches: number;
    totalSize: number;
    cacheDir: string;
  }> {
    if (!this.enabled) {
      return {
        totalCaches: 0,
        expiredCaches: 0,
        totalSize: 0,
        cacheDir: this.cacheDir,
      };
    }

    let totalCaches = 0;
    let expiredCaches = 0;
    let totalSize = 0;
    const now = Date.now();

    try {
      const files = fs.readdirSync(this.cacheDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        totalCaches++;

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const entry: CacheEntry<any> = JSON.parse(content);

          if (now > entry.expiresAt) {
            expiredCaches++;
          }
        } catch {
          // 忽略無法解析的檔案
        }
      }
    } catch (error) {
      logger.warn('取得快取統計資訊時發生錯誤', error);
    }

    return {
      totalCaches,
      expiredCaches,
      totalSize,
      cacheDir: this.cacheDir,
    };
  }
}

/**
 * 預設的快取服務實例
 */
export const cacheService = new CacheService();
