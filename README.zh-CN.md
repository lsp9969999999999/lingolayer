# LingoLayer

[English README](README.md)

LingoLayer 是一款适用于 Chrome / Edge 的 Manifest V3 网页双语翻译与跨境购物辅助扩展。译文显示在原文下方，原文始终保留，方便对照阅读。

**当前正式版本：**[v1.0.2](https://github.com/lsp9969999999999/lingolayer/releases/latest) · [全部历史版本下载](https://github.com/lsp9969999999999/lingolayer/releases)

## 功能

- 按需翻译整页或选中的文字。
- 支持动态页面、SPA 路由、菜单、标签和无限滚动内容。
- 只翻译视口内或附近内容，减少 API 用量。
- 支持批量、并发、重试和本地翻译缓存。
- 自动跳过代码块、命令、文件名、标识符和隐藏内容。
- 可设置目标语言、译文样式、字号和自动翻译规则。
- 可按网站启用“替换原文”模式，让商品菜单、标签更紧凑；悬停即可查看原文。
- 可只翻译选中的区域，例如商品标题或参数表，而不影响整页。
- 可按需生成商品摘要，汇总价格、配送、退换与要点。
- 可记录网站术语，并通过本地反馈优化单条译文。
- 所有请求均使用用户自行配置的服务商和 API Key。

## 安装

### 使用发行包

1. 在 [Releases 页面](https://github.com/lsp9969999999999/lingolayer/releases)下载 `lingolayer-<版本号>.zip`。
2. 解压到长期保存的本地文件夹。
3. 打开 `chrome://extensions/`（Edge 用户打开 `edge://extensions/`）。
4. 开启右上角的**开发者模式**。
5. 点击**加载已解压的扩展程序**，选择包含 `manifest.json` 的解压目录。
6. 打开扩展设置，填入你自己的服务商 API Key，测试连接并保存。

### 使用源码

克隆或下载本仓库后，按上方第 3–6 步加载即可。`test/` 是本地测试目录，不是需要加载的扩展目录。

## 使用

- 点击工具栏扩展图标，选择**翻译此页面**。
- 选择**翻译区域**，再点击高亮的商品标题、菜单、参数表或其他局部区域。
- 选择**购物摘要**，商品页右上角会显示按需生成的摘要卡片。
- 选中文字后使用右键菜单或 `Alt+S` 翻译选中内容。
- 使用 `Alt+T` 翻译或恢复当前页面。
- 在**高级设置**中调整目标语言、网站规则、替换模式、购物术语、性能、缓存和样式。

## 版本下载与历史

每个正式版本均提供可加载的扩展 ZIP 包，历史版本会保留，便于回退或测试。

| 版本 | 主要功能 |
| --- | --- |
| [v1.0.2](https://github.com/lsp9969999999999/lingolayer/releases/tag/v1.0.2) | 区域翻译、购物摘要、术语记忆、本地反馈 |
| [v1.0.1](https://github.com/lsp9969999999999/lingolayer/releases/tag/v1.0.1) | 多目标语言、按站点替换原文模式 |

完整改动见 [CHANGELOG.md](CHANGELOG.md)。

## API Key 与隐私

LingoLayer 不提供共享 API Key，也不提供翻译服务。用户自行提供服务商账号并承担 API 用量费用。API Key 和翻译缓存只保存在浏览器本地；网页文本只发送到用户选择的接口。LingoLayer 不设开发者统计、广告或跟踪服务器。

请阅读已发布的[隐私政策](https://lsp9969999999999.github.io/lingolayer/privacy-policy.html)。

## 测试

```bash
cd test
npm install
npm test
```

测试覆盖 DOM 分段、跳过规则、请求与缓存、重试、翻译模式、动态内容、区域翻译、购物摘要、反馈与演示流程。

## 项目结构

```text
manifest.json       扩展清单
src/                弹窗、设置页、后台、内容脚本与样式
icons/              扩展图标
test/               Node/jsdom 测试（不会被浏览器加载）
docs/               商店文案、隐私政策与发布清单
CHANGELOG.md        版本历史
```

## 作者与反馈

作者：**lenny**，版权归作者所有。

如遇问题或有功能需求，请在 [GitHub Issues](https://github.com/lsp9969999999999/lingolayer/issues) 留言，或发送邮件至 `417429682@qq.com`。
