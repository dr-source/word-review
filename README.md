# 📖 单词复习系统

艾宾浩斯记忆曲线单词复习工具 — 翻卡 / 拼写 / 选择题

---

## 🖥 在平板上使用（iPad / Android）

> 把 App 部署到一个网址，平板打开就能用，还能添加到主屏幕像真 App 一样。

### 方案一：Vercel（最简单，推荐）

```bash
# 1. 安装 Vercel CLI
npm install -g vercel

# 2. 构建并部署
npm run build
vercel dist --public --yes

# 3. 得到一个网址，例如 https://word-review.vercel.app
#    分享这个网址给任何人
```

### 方案二：GitHub Pages（自动化部署）

```bash
# 1. 在 GitHub 新建仓库，把代码推上去
git init
git add .
git commit -m "init"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main

# 2. 去 GitHub 仓库 → Settings → Pages → Source 选 "GitHub Actions"
# 3. 以后每次 git push 自动部署
# 4. 访问 https://<用户名>.github.io/<仓库名>/
```

### 平板使用步骤

1. 拿到上面生成的网址（如 `https://xxx.vercel.app`）
2. 在平板浏览器（Safari / Chrome）中打开
3. **添加到主屏幕：**
   - **iPad (Safari)**：底部分享按钮 → 添加到主屏幕
   - **Android (Chrome)**：右上角菜单 → 添加到主屏幕
4. 之后桌面上会出现 App 图标，点开就是全屏无浏览器栏

### 数据说明

- 所有单词数据存在浏览器的本地存储中
- 换设备 / 清缓存会丢失，建议定期导出备份（单词管理 → 导出 JSON）

---

## 🖥 Windows 本地使用（无需安装）

解压后双击 `start.bat`，浏览器自动打开即可使用。

---

## 💻 开发者

```bash
npm install
npm run dev    # 开发模式（热更新）
npm run build  # 构建
npm run serve  # 本地预览构建结果
```
