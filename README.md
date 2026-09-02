# LingoLayer

[中文说明](README.zh-CN.md)

LingoLayer is a Chrome/Edge Manifest V3 extension for bilingual web reading and cross-border shopping. It places translations below the original text, so the source remains available for comparison.

**Current release:** [v1.0.2](https://github.com/lsp9969999999999/lingolayer/releases/latest) · [All version downloads](https://github.com/lsp9969999999999/lingolayer/releases)

## Features

- Translate a full page or selected text on demand.
- Support dynamic pages, SPA navigation, menus, labels, and infinite scrolling.
- Translate only visible or near-viewport content to reduce usage.
- Batch, concurrent requests, retries, and local translation caching.
- Skip code blocks, commands, file names, identifiers, and hidden content.
- Choose target language, translation style, font scale, and automatic-translation rules.
- Use **Replace original** mode per site for compact shopping menus and labels, while hovering to view the source text.
- Translate a selected area, such as a product title or specification table, without translating the whole page.
- Create an on-demand shopping summary with price, delivery, returns, and key highlights.
- Keep site-specific shopping terminology consistent and improve individual translations through local feedback.
- Keep all translation requests under the user's selected provider and API key.

## Install

### From a release package

1. Download the `lingolayer-<version>.zip` asset from [Releases](https://github.com/lsp9969999999999/lingolayer/releases).
2. Extract it to a permanent local folder.
3. Open `chrome://extensions/` (or `edge://extensions/`).
4. Enable **Developer mode**.
5. Select **Load unpacked** and choose this project root, the folder containing `manifest.json`.
6. Open the extension settings, enter your own provider API key, test the connection, and save.

### From source

Clone or download this repository, then follow steps 3–4 above. The `test/` folder is for local tests and is not the extension directory to load.

## Usage

- Click the toolbar icon and choose **Translate this page**.
- Choose **Translate an area**, then click a highlighted product title, menu, table, or other focused region.
- Choose **Shopping summary** to display an on-demand summary at the upper-right of a product page.
- Select text and use the context menu or `Alt+S` for selection translation.
- Use `Alt+T` to translate or restore the current page.
- Configure target language, site rules, replacement mode, shopping terminology, performance, cache, and styles in **Advanced settings**.

## Releases and version history

Each release provides a loadable extension ZIP and is retained for rollback or testing older versions.

| Version | Highlights |
| --- | --- |
| [v1.0.2](https://github.com/lsp9969999999999/lingolayer/releases/tag/v1.0.2) | Area translation, shopping summary, terminology memory, local feedback |
| [v1.0.1](https://github.com/lsp9969999999999/lingolayer/releases/tag/v1.0.1) | Multilingual target languages and Replace original mode |

See [CHANGELOG.md](CHANGELOG.md) for detailed changes.

## Your API key and privacy

LingoLayer does not provide a shared API key or a translation service. Users provide and pay for their own provider account and API usage. API keys and cached translations are stored locally in the browser. Webpage text is sent only to the endpoint selected by the user; LingoLayer has no developer analytics, advertising, or tracking server.

Read the published [Privacy Policy](https://lsp9969999999999.github.io/lingolayer/privacy-policy.html).

## Tests

```bash
cd test
npm install
npm test
```

The test suite covers DOM segmentation, skip rules, translation requests, caching, retry behavior, modes, dynamic content, area translation, shopping summaries, feedback, and the demo flow.

## Project structure

```text
manifest.json       Extension manifest
src/                Popup, options, background, content, demo, and styles
icons/              Extension icons
test/               Node/jsdom tests (not loaded by Chrome)
docs/               Store listing, privacy policy, and release checklist
CHANGELOG.md        Version history
```

## Author and support

Created and maintained by **lenny**. Copyright belongs to the author.

For issues or feature requests, leave a message in [GitHub Issues](https://github.com/lsp9969999999999/lingolayer/issues), or email `417429682@qq.com`.
