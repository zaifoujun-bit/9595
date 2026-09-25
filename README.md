# 词舟 · 无账号背词 PWA

纯静态网站。词库从考纲 PDF 整理后的 SQLite 数据库导出；个人学习状态与复习记录仅存于浏览器 IndexedDB，不上传服务器。无需 Python 后端、Termux、账号或云数据库。

## 连接 Cloudflare Pages

选择 GitHub 仓库 `zaifoujun-bit/9595`，设置：

- 生产分支：`main`
- 框架预设：`None`
- 构建命令：`python3 tools/build_release.py`
- 构建输出目录：`public`
- 根目录：留空

项目包含完整构建产物，也可以使用构建命令 `exit 0`。修改静态文件后应先运行 `python tools/build_release.py`，确保离线缓存版本更新。无需设置密钥或环境变量。

网站首次联网打开会下载已发布词册和程序界面；完成缓存后可以离线学习。Chrome 支持安装到桌面。更新就绪时，点击“更新词舟”加载新版。

## 个人进度

- 进度页可导出、导入 `.db` 或 JSON，兼容已有本地版/Termux 的独立 `.db` 进度文件。
- 导入前校验考纲、单词与记录，确认后原子替换；无效文件不会覆盖原进度。
- 清空仅影响当前浏览器的个人记录。
- 手机和电脑各有自己的进度，使用导入导出手动转移。
- 更换域名、清除网站数据或使用无痕浏览可能丢失进度，请定期导出。
- 新增词册使用稳定单词 ID；不会重建或清空 IndexedDB。

## 更新考纲词册

保持原有 Words.id / Volumes.id；在本地原始词库中整理新册后执行：

```sh
python tools/export_words.py /path/to/vocabulary.db
python tools/build_release.py
```

提交 `public/content.json`、`public/service-worker.js` 等修改到 GitHub。Cloudflare 自动部署后用户可更新。导出脚本只读取已经录入 Words 的词，不会擅自加入其他考纲词，也不读取 progress.db。

## 本地预览与验证

```sh
python -m http.server 8080 --directory public
```

打开 `http://127.0.0.1:8080`。文件管理器双击 HTML 不支持 IndexedDB/PWA 的完整运行流程。

数据回归测试：`npm install` 后执行 `npm test`。测试包含进度持久化、并发写入、导入恢复、错误文件保护、新增册兼容及 SQLite 备份互通。测试库只在测试进程中运行。

`public/vendor` 包含 sql.js 1.13.0 及 MIT 许可证，用于本机处理 SQLite 备份，运行时不依赖外部 CDN。仓库不包含个人进度、原 PDF 或未录入的原始词条。
