# 通用 Playwright 自动化测试框架

这是可以复制、修改并接入自己系统的 TypeScript 源码模板，采用 MIT 许可证。没有业务账号、业务数据、私有接口快照或产品测试场景。

## 五分钟验证框架

准备 Node.js 22 或 24。下载 ZIP 也能运行，无需 Git。

```bash
npm ci
npx playwright install chromium
npm run quality:ci
npm test
```

Linux 可用 `npx playwright install --with-deps chromium` 安装系统依赖。普通 HTML 报告不需要 Java；生成 Allure HTML 时才需要 Java。

内置用例只访问本机：登录、API 创建临时计数器、UI 加一、接口确认结果、按 ID 删除，以及身份隔离和响应结构校验。通过这些用例只能说明框架可以运行。

## 可选 Agent 测试

执行 `npm run agents:init`，为兼容的 Codex 环境生成官方 Planner、Generator、Healer。先探索与审查计划，再生成并验证用例；失败修复必须依据证据。普通回归无需模型，继续复用现有清理、覆盖和报告。[使用步骤与边界](docs/agent-testing.md#中文快速使用)

## 接入自己的系统

1. 将 `.env.example` 复制为 `.env`，设置测试环境 `BASE_URL` 和 `E2E_SKIP_EXAMPLES=true`。
2. 在应用适配层实现登录、接口路由、响应校验、页面操作和数据准备。框架核心无需引用这些业务模块。
3. 在 `tests/e2e/` 新增 `.spec.ts`，会自动发现；从统一 fixtures 导入 `test/expect`。
4. 登记稳定的页面和场景 ID。替换演示时，同时替换其覆盖登记。
5. 创建资源后立即用 `resources.track` 登记返回 ID 和精确清理回调。测试结束和断言失败时都会尝试清理；清理失败会记录对象并让测试失败。
6. 执行真实目标回归，检查 UI、后端结果和报告。静态检查通过不能代替真实回归。

默认一个 worker。并行前需要独立账号和数据域，隔离开关本身不会分配账号。进程被强制结束时，需根据资源账本执行应用自己的恢复工具。

同一场景绑定的测试全部通过才标为通过；部分跳过或未执行标为 `partial`，重试后通过标为 `flaky`，报告保留每次尝试。覆盖 ID 必须唯一，支持或排除分类必须填写原因。静态检查会拦截未等待的 Promise，业务结果断言仍需结合真实系统审查。

清理默认每个资源最多 5 秒、每次清理最多 20 秒，逐项保存结果。损坏账本中的有效记录仍按精确 ID 清理；损坏记录和超时保持未解决状态，使测试失败。同一工作目录的测试与报告生成采用运行锁，第二轮会被拒绝以保护报告；需要同时运行时使用独立目录。强制终止后，确认锁文件记录的进程已经退出，再移除 `artifacts/.report-lock`。

[完整接入指南](docs/adoption-guide.md) · [框架边界](docs/architecture.md) · [英文命令表](README.md#commands)
