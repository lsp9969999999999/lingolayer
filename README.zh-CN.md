# LingoLayer

[English README](README.md)

LingoLayer 是一款适用于 Chrome / Edge 的 Manifest V3 网页双语翻译扩展。译文显示在原文下方，原文始终保留，方便对照阅读。

## 功能

- 按需翻译整页或选中的文字。
- 支持动态页面、SPA 路由、菜单、标签和无限滚动内容。
- 只翻译视口内或附近内容，减少 API 用量。
- 支持批量、并发、重试和本地翻译缓存。
- 自动跳过代码块、命令、文件名、标识符和隐藏内容。
- 可设置目标语言、译文样式、字号和自动翻译规则。
- 所有请求均使用用户自行配置的服务商和 API Key。

## 本地安装

1. 打开 `chrome://extensions/`（Edge 用户打开 `edge://extensions/`）。
2. 开启右上角的**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择包含 `manifest.json` 的项目根目录。
4. 打开扩展设置，填入你自己的服务商 API Key，测试连接并保存。

`test/` 是本地测试目录，不是需要加载的扩展目录。

## 使用

- 点击工具栏扩展图标，选择**翻译此页面**。
- 选中文字后使用右键菜单或 `Alt+S` 翻译选中内容。
- 使用 `Alt+T` 翻译或恢复当前页面。
- 在**高级设置**中调整目标语言、网站规则、性能、缓存和样式。

## API Key 与隐私

LingoLayer 不提供共享 API Key，也不提供翻译服务。用户自行提供服务商账号并承担 API 用量费用。API Key 和翻译缓存只保存在浏览器本地；网页文本只发送到用户选择的接口。LingoLayer 不设开发者统计、广告或跟踪服务器。

请阅读已发布的[隐私政策](https://lsp9969999999999.github.io/lingolayer/privacy-policy.html)。

## 测试

```bash
cd test
npm install
npm test
```

测试覆盖 DOM 分段、跳过规则、请求与缓存、重试、翻译模式、动态内容和演示流程。

## 作者与反馈

作者：**lenny**，版权归作者所有。

如遇问题或有功能需求，请在 [GitHub Issues](https://github.com/lsp9969999999999/lingolayer/issues) 留言，或发送邮件至 `417429682@qq.com`。
