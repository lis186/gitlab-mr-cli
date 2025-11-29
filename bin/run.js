#!/usr/bin/env node

import { config } from 'dotenv'
import { execute } from '@oclif/core'

// 載入 .env 環境變數（使用 quiet 選項禁用輸出訊息，避免污染 JSON 格式）
config({ quiet: true })

await execute({development: false, dir: import.meta.url})
