# Update Logs

这个目录用于记录每次 commit 前的重要开发变动，方便未来 Codex session 快速理解项目历史。

## 使用规则

每次准备 commit 前，新建一条日志：

```text
update_logs/YYYY-MM-DD-short-title.md
```

建议标题示例：

```text
2026-04-28-tauri-backend-scaffold.md
2026-04-28-local-audio-stream.md
```

每条日志应该包含：

- 本次目标。
- 主要变更文件。
- 行为变化。
- 验证结果。
- 已知限制。
- 下一步建议。

## Commit 前检查

- [ ] 是否更新或新增了本次 update log？
- [ ] 是否说明了测试结果？
- [ ] 是否说明了未完成或风险？
- [ ] 是否避免记录 API Key、token、私密路径或敏感客户信息？

## 推荐流程

1. 开发完成。
2. 运行必要测试或构建。
3. 写 `update_logs/YYYY-MM-DD-short-title.md`。
4. 检查 `git status`。
5. commit。

新 Codex session 应优先阅读最新几条 update log，而不是从 git diff 里猜历史上下文。
