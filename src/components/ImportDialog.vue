<template>
  <el-dialog v-model="visible" title="批量导入单词" width="520px" :close-on-click-modal="!importing">
    <div style="margin-bottom: 12px; color: #666; font-size: 14px;">
      <p>支持 .xlsx / .csv / .txt 格式</p>
      <p style="margin-top:4px;">
        <strong>自动识别列名：</strong>单词 / word、音标 / phonetic、释义 / mean / 意思、例句 / sentence
      </p>
      <p style="margin-top:4px; color:#909399; font-size:12px;">
        多余的列（如年级、单元）会被自动跳过
      </p>
    </div>
    <el-upload
      action="#"
      :auto-upload="false"
      :on-change="handleFileChange"
      :limit="1"
      accept=".xlsx,.xls,.csv,.txt"
      :disabled="importing"
    >
      <el-button type="primary" :disabled="importing">选择文件</el-button>
    </el-upload>

    <!-- 导入预览 -->
    <div v-if="previewRows.length && !importing" style="margin-top:16px;">
      <el-tag type="success" size="small" style="margin-bottom:8px;">
        已识别 {{ matchedCount }} 条单词
      </el-tag>
      <el-table :data="previewRows.slice(0, 5)" size="small" border max-height="200">
        <el-table-column prop="word" label="单词" width="120" />
        <el-table-column prop="phonetic" label="音标" width="120" />
        <el-table-column prop="mean" label="释义" min-width="140" />
      </el-table>
      <p v-if="previewRows.length > 5" style="font-size:12px;color:#909399;margin-top:4px;">
        ...共 {{ previewRows.length }} 条，仅显示前 5 条
      </p>
    </div>

    <!-- 导入进度 -->
    <div v-if="importing" style="margin-top:16px; text-align:center;">
      <el-progress :percentage="importProgress" :stroke-width="12" striped striped-flow />
      <p style="margin-top:8px; color:#909399; font-size:13px;">
        正在导入 {{ importedCount }}/{{ matchedCount }} 条...
      </p>
    </div>

    <!-- 导入完成提示 -->
    <el-alert
      v-if="showResult"
      :title="resultMsg"
      :type="resultType"
      show-icon
      :closable="false"
      style="margin-top:12px;"
    />

    <!-- 导入完成后的操作提示 -->
    <el-card v-if="showResult && resultType === 'success'" shadow="never" style="margin-top:12px; background:#fafafa;">
      <template #header><span style="font-weight:600; font-size:14px;">💡 提示</span></template>
      <ul style="margin:0; padding-left:18px; font-size:13px; line-height:2; color:#606266;">
        <li>词本列表的 <strong>词数</strong> 会自动更新</li>
        <li>如果仍显示 <strong>0词</strong>，点击左侧词本名称切换一下即可刷新</li>
        <li>切换到 <strong>背诵</strong> 页面即可开始学习</li>
      </ul>
    </el-card>

    <template #footer>
      <el-button @click="handleClose" :disabled="importing">关闭</el-button>
      <el-button
        v-if="previewRows.length && !importing"
        type="primary"
        @click="confirmImport"
        :loading="importing"
      >
        确认导入 {{ matchedCount }} 条
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import * as XLSX from 'xlsx'
import { useWordStore } from '../stores/wordStore'
import { useBookStore } from '../stores/bookStore'

const visible = ref(false)
const wordStore = useWordStore()
const bookStore = useBookStore()

let parsedRows = []
const previewRows = ref([])
const matchedCount = ref(0)

// 导入状态
const importing = ref(false)
const importProgress = ref(0)
const importedCount = ref(0)
const showResult = ref(false)
const resultMsg = ref('')
const resultType = ref('success')

// 常见列名映射
const COLUMN_KEYS = {
  word: ['word', '单词', '英文', 'english', '单词', '词汇', 'name'],
  phonetic: ['phonetic', '音标', '发音', 'pronunciation', '音标', 'phon'],
  mean: ['mean', 'meaning', '释义', '解释', '意思', '中文', '翻译', 'translation', '含义'],
  sentence: ['sentence', '例句', '例子', 'example', '句子', '示例']
}

function open() {
  visible.value = true
  parsedRows = []
  previewRows.value = []
  matchedCount.value = 0
  importing.value = false
  importProgress.value = 0
  importedCount.value = 0
  showResult.value = false
  resultMsg.value = ''
  resultType.value = 'success'
}

function handleClose() {
  visible.value = false
}

/** 检测某行是否为表头行 */
function detectHeaders(row) {
  if (!row || row.length === 0) return null
  const headerMap = {}

  row.forEach((cell, idx) => {
    if (!cell || typeof cell !== 'string') return
    const val = cell.trim().toLowerCase()

    for (const [key, aliases] of Object.entries(COLUMN_KEYS)) {
      if (aliases.includes(val) || aliases.includes(cell.trim())) {
        headerMap[idx] = key
        break
      }
    }
  })

  return Object.keys(headerMap).length > 0 ? headerMap : null
}

/** 智能查找单词列——找第一个看起来像英文单词的列 */
function findWordColumnIndex(row) {
  if (!row || row.length === 0) return 0
  for (let i = 0; i < Math.min(row.length, 6); i++) {
    const val = String(row[i] || '').trim()
    // 跳过纯数字（年级、单元编号）和明显的中文
    if (/^\d+$/.test(val)) continue
    if (/^[a-zA-Z]/.test(val)) return i
  }
  return 0
}

/** 数据行解析 */
function parseRow(row, colMap) {
  if (!row || row.length === 0) return null

  let word = ''
  let phonetic = ''
  let mean = ''
  let sentence = ''

  if (colMap) {
    // 基于列名映射
    for (const [idx, key] of Object.entries(colMap)) {
      const val = String(row[parseInt(idx)] || '').trim()
      if (key === 'word') word = val
      else if (key === 'phonetic') phonetic = val
      else if (key === 'mean') mean = val
      else if (key === 'sentence') sentence = val
    }
  } else {
    // 无表头：智能猜测
    const wordIdx = findWordColumnIndex(row)
    word = String(row[wordIdx] || '').trim()
    // 音标通常在单词后第1列，释义在第2列
    phonetic = String(row[wordIdx + 1] || '').trim()
    // 如果音标列不像是音标（没有 / 或 [），则视为释义
    if (phonetic && !phonetic.startsWith('/') && !phonetic.startsWith('[')) {
      mean = phonetic
      phonetic = ''
      sentence = String(row[wordIdx + 2] || '').trim()
    } else {
      mean = String(row[wordIdx + 2] || '').trim()
      sentence = String(row[wordIdx + 3] || '').trim()
    }
  }

  if (!word || /^\d+$/.test(word)) return null
  return { word, phonetic, mean, sentence }
}

function handleFileChange(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    let data
    if (file.raw.name.endsWith('.csv') || file.raw.name.endsWith('.txt')) {
      // CSV/TXT：按文本解析，避免 XLSX 对 CSV 的编码问题
      const text = new TextDecoder('utf-8').decode(e.target.result)
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      parsedRows = lines.map(line => {
        // 处理引号包裹的逗号
        const cols = []
        let current = ''
        let inQuote = false
        for (const ch of line) {
          if (ch === '"') inQuote = !inQuote
          else if (ch === ',' && !inQuote) {
            cols.push(current.trim())
            current = ''
          } else current += ch
        }
        cols.push(current.trim())
        return cols
      })
    } else {
      // Excel
      data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      parsedRows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    }

    // 过滤空行
    parsedRows = parsedRows.filter(row => row && row.some(c => c && String(c).trim()))

    if (parsedRows.length === 0) {
      previewRows.value = []
      matchedCount.value = 0
      return
    }

    // 检测表头
    const headerMap = detectHeaders(parsedRows[0])
    const startIdx = headerMap ? 1 : 0
    let colMap = headerMap

    if (!colMap) {
      // 无表头：从第一行推断单词列位置
      const wordIdx = findWordColumnIndex(parsedRows[0])
      if (wordIdx > 0) {
        // 前面有年级/单元列，自动偏移
        console.log(`Auto-detected word column at index ${wordIdx}`)
      }
    }

    // 解析数据行
    const result = []
    for (let i = startIdx; i < parsedRows.length; i++) {
      const item = parseRow(parsedRows[i], colMap)
      if (item) result.push(item)
    }

    previewRows.value = result
    matchedCount.value = result.length
  }

  if (file.raw.name.endsWith('.csv') || file.raw.name.endsWith('.txt')) {
    reader.readAsArrayBuffer(file.raw)
  } else {
    reader.readAsArrayBuffer(file.raw)
  }
}

async function confirmImport() {
  importing.value = true
  importProgress.value = 0
  importedCount.value = 0
  showResult.value = false

  const items = previewRows.value
  try {
    // 模拟进度：先快速到 30%（准备中），然后等待插入结果
    importProgress.value = 10
    const result = await wordStore.batchAddWords(bookStore.currentBookId, items)
    importProgress.value = 100
    importedCount.value = result.count

    // 刷新词本词数
    await bookStore.loadWordCounts()

    if (result.count > 0) {
      resultType.value = 'success'
      resultMsg.value = `✅ 成功导入 ${result.count} 条单词！`
    } else {
      resultType.value = 'warning'
      resultMsg.value = '没有导入任何单词，请检查文件格式'
    }
  } catch (e) {
    resultType.value = 'error'
    resultMsg.value = '导入失败：' + (e.message || '请检查网络连接后重试')
    importProgress.value = 0
  }
  showResult.value = true
  importing.value = false
  // 不清空预览，让用户看到导入结果
}

defineExpose({ open, handleClose })
</script>
