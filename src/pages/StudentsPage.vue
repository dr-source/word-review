<template>
  <div class="students-page">
    <el-card class="students-card">
      <template #header>
        <div class="students-header">
          <span>
            <el-icon style="vertical-align: middle; margin-right: 6px;"><User /></el-icon>
            学生档案
          </span>
          <el-tag type="info" size="small">一人一份记录，互不干扰</el-tag>
        </div>
      </template>

      <div class="add-row">
        <el-input
          v-model="newName"
          placeholder="输入学生姓名，例如：张小明"
          maxlength="12"
          clearable
          @keyup.enter="handleAdd"
        />
        <el-button type="primary" :disabled="!newName.trim()" @click="handleAdd">新建档案</el-button>
      </div>

      <el-table :data="rows" border stripe size="small" max-height="480">
        <el-table-column prop="name" label="学生" min-width="130">
          <template #default="{ row }">
            <strong>{{ row.name }}</strong>
            <el-tag v-if="row.id === studentStore.currentId" size="small" type="success" style="margin-left: 6px;">
              当前
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="今日学习" width="90" align="center">
          <template #default="{ row }">{{ row.summary.today }}</template>
        </el-table-column>
        <el-table-column label="累计掌握" width="110" align="center">
          <template #default="{ row }">{{ row.summary.learned }}/{{ row.summary.total }}</template>
        </el-table-column>
        <el-table-column label="掌握率" width="90" align="center">
          <template #default="{ row }">{{ row.summary.rate }}%</template>
        </el-table-column>
        <el-table-column label="错题" width="70" align="center">
          <template #default="{ row }">{{ row.summary.wrong }}</template>
        </el-table-column>
        <el-table-column label="连续天数" width="90" align="center">
          <template #default="{ row }">{{ row.summary.streak }}</template>
        </el-table-column>
        <el-table-column label="操作" width="210" align="center">
          <template #default="{ row }">
            <el-button
              size="small"
              type="primary"
              :disabled="row.id === studentStore.currentId"
              @click="handleSwitch(row)"
            >
              切换
            </el-button>
            <el-button size="small" @click="handleRename(row)">改名</el-button>
            <el-button
              size="small"
              type="danger"
              :disabled="studentStore.students.length <= 1"
              @click="handleRemove(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <p class="tip">
        切换学生后页面会自动刷新，之后的学习进度、错题本、学习统计都会单独记录在该学生名下；
        第二天打开会回到上次选中的学生，接着往后记。
      </p>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useStudentStore } from '../stores/studentStore'

const studentStore = useStudentStore()
const newName = ref('')

const rows = computed(() =>
  studentStore.students.map(s => ({
    ...s,
    summary: studentStore.summarize(s.id)
  }))
)

function handleAdd() {
  const name = newName.value.trim()
  if (!name) return
  try {
    studentStore.addStudent(name)
    newName.value = ''
    ElMessage.success(`已创建「${name}」的档案`)
  } catch (e) {
    ElMessage.error(e.message || '创建失败')
  }
}

function handleSwitch(row) {
  if (row.id === studentStore.currentId) return
  ElMessage.info(`正在切换到「${row.name}」...`)
  studentStore.switchStudent(row.id)
}

async function handleRename(row) {
  try {
    const { value } = await ElMessageBox.prompt('修改学生姓名', `重命名「${row.name}」`, {
      inputValue: row.name,
      inputPattern: /\S+/,
      inputErrorMessage: '姓名不能为空',
      confirmButtonText: '保存',
      cancelButtonText: '取消'
    })
    studentStore.renameStudent(row.id, value)
    ElMessage.success('已保存')
  } catch (e) {
    if (e !== 'cancel' && e !== 'close' && e?.message) ElMessage.error(e.message)
  }
}

async function handleRemove(row) {
  try {
    await ElMessageBox.confirm(
      `删除「${row.name}」后，该学生的进度、错题本和学习记录会一起清除，且无法恢复。确定删除吗？`,
      '删除学生档案',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
    studentStore.removeStudent(row.id)
    ElMessage.success(`已删除「${row.name}」的档案`)
  } catch (e) {
    if (e !== 'cancel' && e !== 'close' && e?.message) ElMessage.error(e.message)
  }
}
</script>

<style scoped>
.students-page {
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
}
.students-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.add-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.add-row .el-input {
  max-width: 320px;
}
.tip {
  margin-top: 16px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text-muted);
}
@media (max-width: 640px) {
  .add-row {
    flex-direction: column;
  }
  .add-row .el-input {
    max-width: 100%;
  }
}
</style>
