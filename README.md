# Vocab Coach - AI 英语学习工具

一个本地运行的英语学习网页，集背单词、短语复习、AI 阅读生成和 AI 作文批改于一体。

## 功能

- **复习** — 不背单词风格全屏卡片，SM-2 艾宾浩斯间隔复习，自动朗读
- **词库** — 内置四级/六级/雅思词库，可导入/编辑/自定义
- **阅读** — AI 根据你的单词生成文章，点击单词查看意思、标记生词/熟词
- **批改** — 打字或拍照上传作文，AI 打分、纠错、优化结构、降低重复
- **习惯** — 自动统计常用词、薄弱语法

## 快速开始

```bash
npm start
```

打开 http://localhost:3000

## 启用 AI

在网页「设置」页填写 API Key：

| 提供商 | 获取 Key |
|--------|----------|
| DeepSeek | https://platform.deepseek.com/api_keys |
| OpenAI | https://platform.openai.com/api-keys |

保存后即可使用 AI 生成文章和批改作文。

## 手机访问

手机连同一 Wi-Fi 时用局域网地址（设置页会显示）。离开电脑时需配置 ngrok 域名。

## 云服务器部署

推荐长期使用云服务器部署，不依赖个人电脑和 ngrok。

已内置 Docker + Caddy 部署文件：

```bash
sudo bash deploy/ubuntu-deploy.sh
```

如果有域名并已解析到服务器 IP：

```bash
sudo SITE_ADDRESS=vocab.example.com bash deploy/ubuntu-deploy.sh
```

详细说明见 `deploy/README-cloud.md`。

## 分享给 Codex

把整个 `vocab-coach` 文件夹发给对方，对方只需要：

1. 解压
2. `npm start`
3. 打开 localhost:3000

无需安装额外依赖，纯 Node.js 标准库。

## 词库自定义

编辑 `public/presets.js` 可修改内置词库。格式：

```js
window.VOCAB_PRESETS = {
  banks: {
    mybank: {
      id: "mybank",
      name: "我的词库",
      description: "自定义词库",
      items: [
        { term: "example", meaning: "例子", examMeaning: "常考：例证", collocations: ["for example"], example: "This is an example." }
      ]
    }
  }
};
```

## 记忆间隔

默认艾宾浩斯曲线（1,2,4,7,14,30,60天），可在设置页自定义。

## 模型支持

- DeepSeek: deepseek-chat, deepseek-reasoner
- OpenAI: gpt-5.5, gpt-5.4, gpt-5.4-mini, gpt-4o, gpt-4o-mini

## 文件结构

```
vocab-coach/
  server.js          — Node 服务，API 代理和模型调用
  public/
    index.html       — 前端页面
    app.js           — 前端逻辑
    styles.css       — 样式（不背单词风格）
    presets.js       — 内置词库数据
  deploy/            — 云服务器部署配置
  Dockerfile         — Docker 镜像配置
  docker-compose.yml — App + Caddy 编排
  tools/             — ngrok/cloudflared（可选）
```

## License

MIT
