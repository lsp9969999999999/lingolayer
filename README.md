# LingoLayer

[中文说明](README.zh-CN.md)

LingoLayer is a Chrome/Edge Manifest V3 extension for bilingual web reading. It places translations below the original text, so the source remains available for comparison.

## Features

- Translate a full page or selected text on demand.
- Support dynamic pages, SPA navigation, menus, labels, and infinite scrolling.
- Translate only visible or near-viewport content to reduce usage.
- Batch, concurrent requests, retries, and local translation caching.
- Skip code blocks, commands, file names, identifiers, and hidden content.
- Choose target language, translation style, font scale, and automatic-translation rules.
- Keep all translation requests under the user's selected provider and API key.

## Install locally

1. Open `chrome://extensions/` (or `edge://extensions/`).
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this project root, the folder containing `manifest.json`.
4. Open the extension settings, enter your own provider API key, test the connection, and save.

The `test/` folder is for local tests and is not the extension directory to load.

## Usage

- Click the toolbar icon and choose **Translate this page**.
- Select text and use the context menu or `Alt+S` for selection translation.
- Use `Alt+T` to translate or restore the current page.
- Configure target language, site rules, performance, cache, and styles in **Advanced settings**.

## Your API key and privacy

LingoLayer does not provide a shared API key or a translation service. Users provide and pay for their own provider account and API usage. API keys and cached translations are stored locally in the browser. Webpage text is sent only to the endpoint selected by the user; LingoLayer has no developer analytics, advertising, or tracking server.

Read the published [Privacy Policy](https://lsp9969999999999.github.io/lingolayer/privacy-policy.html).

## Tests

```bash
cd test
npm install
npm test
```

The test suite covers DOM segmentation, skip rules, translation requests, caching, retry behavior, modes, dynamic content, and the demo flow.

## Project structure

```text
manifest.json       Extension manifest
src/                Popup, options, background, content, demo, and styles
icons/              Extension icons
test/               Node/jsdom tests (not loaded by Chrome)
docs/               Store listing, privacy policy, and release checklist
```

## Author and support

Created and maintained by **lenny**. Copyright belongs to the author.

For issues or feature requests, leave a message in [GitHub Issues](https://github.com/lsp9969999999999/lingolayer/issues), or email `417429682@qq.com`.
