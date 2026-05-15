# Vocab Coach - 项目构建聊天记录

## 项目概述
构建一个 AI 英语学习网页工具：背单词/短语、AI 生成阅读文章、AI 作文批改（图片/文字），支持 OpenAI 和 DeepSeek 多模型。

## 对话记录

---

### 用户：做一个背单词的网页
可以背短语、单词，并且用户可以上传图片用 ChatGPT 批改英语作文，根据用户习惯总结常用词，纠错、打分、语法改善、结构优化、降低重复、不用太难、保留用户的意思。

### Codex：
创建了独立网页项目 `C:\、1\`：
- `server.js` — Node.js 后端，OpenAI Responses API 图片批改
- `public/index.html` — 前端页面，侧边栏导航
- `public/app.js` — 前端逻辑（复习卡片、词库管理、批改）
- `public/styles.css` — 样式

架构：浏览器端可直接配置 OpenAI API Key，默认走演示模式。

---

### 用户：再完善一下，要有现成的单词库，比如四级六级雅思，可随意更改，并且要有更新。单词库中每个单词要有常考意思、搭配、英美式朗读。

### Codex：
- 新增 `public/presets.js` — 内置四级核心、六级进阶、雅思写作三个词库
- 词库页支持：导入所选、更新所选、更新全部
- 每个词条含：中文意思、常考意思、常用搭配、例句
- 复习卡和词库卡片：美式/英式朗读按钮（浏览器语音 API）
- 支持手动编辑词条

---

### 用户：单词要自己读，不要手点

### Codex：
复习页每出现一张新卡片自动用美式发音朗读（260ms 延迟），不期待用户点击。少数浏览器拦截首次自动发声时，点击页面任意处自动补读。

---

### 用户：运行网站 / 手机也能用 / 手机离开电脑使用

### Codex：
- 服务绑定 `0.0.0.0`，局域网地址 `http://10.60.97.102:3000`
- 下载 cloudflared 创建临时公网隧道（trycloudflare.com）
- 添加 Windows 防火墙规则
- 手机同 Wi-Fi 用局域网地址，外网用隧道地址

---

### 用户：根据用户学习的单词生成一篇短文或句子，点一下显示句子意思，所有词可以点击显示意思并且可以标注为生词，然后可以标熟词。利用艾宾浩斯记忆法或自定义。可以在网站写作文用 AI 改。AI 也可以用别的模型比如 DeepSeek，用 API Key 获取模型。

### Codex：
**后端改造（server.js 重写）：**
- 支持多模型提供商：OpenAI（Chat Completions）和 DeepSeek（deepseek-chat / deepseek-reasoner）
- 新增 `POST /api/generate-passage` — AI 根据用户单词生成阅读文章
- `POST /api/essay-review` 改为通用接口，支持文字输入和图片输入
- 所有模型调用统一走 Chat Completions API

**前端改造（index.html + app.js 重写）：**
- **阅读页**：选词来源（今日待复习/薄弱词/已掌握/全部）→ AI 生成文章；单词可点击查意；全文中文翻译可切换；标记生词（加入词库）或熟词
- **作文批改**：新增「打字」模式，不限于图片上传
- **设置页**：模型提供商选择（OpenAI/DeepSeek）、API Key、模型选择；艾宾浩斯记忆间隔设置（默认 1,2,4,7,14,30,60 天），支持自定义
- CSS 新增阅读页、设置页样式

---

### 用户：卡住不动，单词不加载

### Codex：
排查发现 `init()` 函数存在但从未被调用。模块拆分时遗漏了 `els` 对象和 `init()` 调用。修复后重新合并所有模块。

---

### 用户：能不能让网站一直运行

### Codex：
创建 Windows 计划任务 `VocabCoach`：
- 开机自启
- 崩溃后自动重启（最多重试 5 次，间隔 1 分钟）
- 使用 `start-services.bat` 同时启动 server.js 和隧道

---

### 用户：长期（公网地址）

### Codex：
下载 ngrok，配置固定域名 `carnival-everyone-overhead.ngrok-free.dev`（需用户注册 ngrok 免费账号）。
替换 cloudflared 临时隧道为 ngrok 永久域名。

---

### 用户：优化一下，单词下面要有常考短语搭配

### Codex：
调整复习卡片和词库卡片的布局顺序：
1. 单词 / 中文释义
2. **常考意思**（黄色底色标注）
3. **常见搭配**（蓝色标签）
4. 美式 / 英式朗读
5. 例句

新增 `.exam-meaning-block`、增强 `.collocation-row` 等 CSS 样式。

---

### 用户：UI 优化一下，高级一点，模仿 Apple 的设计

### Codex：
整个 CSS 重写为 Apple 风格：
- 系统字体 `SF Pro Display / PingFang SC`
- 半透明毛玻璃侧边栏（backdrop-filter blur）
- 圆润圆角（12-18px），胶囊按钮（20px）
- 多层细腻阴影
- iOS 风格分段控件（segmented control）
- 低饱和柔和配色（蓝/绿/橙/红）
- 0.2s cubic-bezier 过渡动画
- 移动端底部毛玻璃导航

---

### 用户：点认识/不认识/模糊要弹出单词搭配意思，不要直接跳过

### Codex：
修改 `markCard()` 逻辑：点击评级按钮后先显示答案（含常考意思+搭配），2 秒后再自动跳转下一张卡片。如果未显示答案就点评级，自动先弹出答案。

---

### 用户：参考不背单词的 UI

### Codex：
**HTML 重构：**
- 去掉侧边栏，改为底部 5 个 tab：复习 / 词库 / 阅读 / 批改 / 设置
- 复习页改为全屏沉浸式卡片：顶部进度+切换、中间大字居中、底部三个大按钮（不认识/模糊/认识+SVG 图标）、底部进度条
- 其他页面改为单列滚动布局

**CSS 重写为不背单词风格：**
- 米白底色（#f5f3ef），白色卡片
- 底部 tab bar（半透明毛玻璃 + safe-area 适配）
- 全屏复习卡片，44px 大字
- 简约无边框表单
- 移动端优先，桌面端居中 max-width 640px

---

### 用户：手机单独使用不行

### Codex：
Cloudflare quick tunnel 临时地址每次重启会变。切换回 ngrok 固定域名 `carnival-everyone-overhead.ngrok-free.dev`。

---

### 用户：把这个项目弄成可以分享给 Codex/OpenAI 的

### Codex：
- 清理项目文件，去掉构建中间文件
- 重写 `README.md`（完整的项目说明和使用指南）
- 更新 `package.json`（零依赖，仅 Node.js >=18）
- 复制到干净目录 `vocab-coach/`，验证可独立运行
- 最终文件结构：`server.js`、`public/{index.html,app.js,styles.css,presets.js}`、`package.json`、`README.md`

---

## 最终项目文件

```
vocab-coach/
├── package.json          # npm start 即可运行，零依赖
├── README.md             # 完整使用说明
├── server.js             # Node.js 后端（多模型 API 代理）
└── public/
    ├── index.html        # 5 个 Tab 页面（不背单词风格）
    ├── app.js            # 前端逻辑（~45KB）
    ├── styles.css        # 不背单词风格样式
    └── presets.js        # 四级/六级/雅思词库
```

## 技术要点

- **前端**：纯 HTML/CSS/JS，无框架，localStorage 持久化
- **后端**：Node.js 标准库（http/fs/os/path），零 npm 依赖
- **AI 模型**：OpenAI Chat Completions + DeepSeek Chat Completions，JSON 结构化输出
- **SM-2 算法**：可配置间隔的间隔重复复习系统
- **朗读**：Web Speech API，英式/美式 accent
- **隧道**：ngrok 永久域名

## 启动方式

```bash
npm start
# 打开 http://localhost:3000
# 在设置页填写 DeepSeek 或 OpenAI API Key
```
