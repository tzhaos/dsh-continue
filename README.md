# dsh-continue

简体中文 | [English](README.en.md)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 客户端插件：对话任务
任务被停止、异常中断或输出被截断后，输入框为空时**发送按钮会变成播放键**。点一下就会继续上一轮任务，不必再手动输入“继续”。

![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.2-4D6BFE)
![Version](https://img.shields.io/badge/version-1.1.1-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)
![Checks](https://img.shields.io/badge/checks-19-brightgreen)

## 为什么

任务被停止、异常中断或输出被截断后想恢复，通常还要在输入框里打一句“继续”。这个动作没有
信息量，却打断了操作。正常完成的轮次不会显示这个按钮，避免滥用。

`dsh-continue` 把这一步变成一个按钮：

- 对话空闲、输入框为空、最后一轮是**中止/异常/截断状态**时，**发送按钮本身变成播放图标**
- 正常完成（`completed`）和 `forked` 不显示，避免普通对话也被 Continue 打扰
- 显示的状态：用户停止（`aborted`）、`blocked`、`error`、`max-tokens`、`interrupted`，以及尾部只有 `turn/start` 的中断
- 输入文字或添加附件后立即恢复普通发送按钮，不会遮挡正常发送
- 点击后直接通过当前 Session 的 `prompt()` 提交一条普通的排队提示词
- 不需要先填入草稿、不需要附件、也不触发发送按钮以外的流程

## 可见状态

按钮只在以下条件同时满足时出现：

- 当前会话已打开，且不是空白会话
- `running === false`
- 没有待提交/排队中的本地提交
- 最后一轮的 `turn/end` reason 是 `aborted` / `blocked` / `error` / `max-tokens` / `interrupted`，或最后一轮只有 `turn/start`（异常中断）
- 输入框没有文字和附件（Host 的主发送按钮处于 disabled 状态）
- 不是子智能体会话

任务运行中、对话正在加载、会话被移除时按钮隐藏。

## 行为

点击播放键会：

1. 通过 `sessions.binding(sessionId).session` 取得当前 Session；
2. 调用 `beginSubmission({ mode: 'queue', text })` 建立本地提交回显；
3. 调用 `session.prompt([{ type: 'text', text }], 'queue', undefined, requestId)`；
4. Host 接受后播放键暂时隐藏，等待运行状态接管；
5. 失败时播放键恢复，并在 tooltip 中提示重试。

提交的是普通用户提示词：中文界面发送 `继续`，英文界面发送 `Continue`。它不绕过 Host 的
Session 日志、队列或运行生命周期。

## 安装

### Plugin Manager（推荐）

在启用 Creator 预设的会话中执行：

```text
plugin_manager(action="install_bundle", target="<本目录的绝对路径>")
```

`target` 必须是绝对路径；如果当前 profile 之前已经装过同名插件，会返回
`already-installed`，先 `remove_bundle` 再安装即可。

### 手工安装（开发用）

1. 让包能从 profile 目录解析到：

   ```powershell
   $profile = "$env:USERPROFILE\.dsh\profiles\desktop"
   New-Item -ItemType Directory -Force -Path "$profile\node_modules" | Out-Null
   New-Item -ItemType Junction -Path "$profile\node_modules\dsh-continue" `
            -Target "<本目录的绝对路径>"
   ```

2. 在 profile 的 `package.json` 中加入 `link:` 依赖，并把包名追加到
   `dsh.profile.bundles`。只改依赖不会触发重组，必须让有序 bundle 列表发生变化。

### 环境要求

- DeepSeek Harness `0.2.1-rc.2`（Web 或 Desktop Web 界面）
- 无需构建、零运行时依赖

## 实现

插件注册在 `conversation.input.right` 槽位：

1. 通过 `useSession` 读取当前会话的 `running` / `blank` / `openState` / `subagent` /
   `pendingSubmissions`；
2. 注入的 `turnState()` 从 Session 事件窗口反向查找最后一个 `turn/start` 或 `turn/end`；
3. 终态、空闲且输入框为空时，在 Host 主发送按钮的位置覆盖一个播放键；
4. 点击后使用当前 Session 的公开 `prompt()` 接口提交，不修改会话 Store，不写额外的远端接口。

## 已知限制

- 只覆盖当前打开的对话；侧边栏其他会话需要切换过去后才显示按钮
- 有正文的“继续”提示词会作为一条真实用户消息出现在对话记录中
- 任务的“正常完成”和“停止”都通过 Session 的 `turn/end` reason 判断；DSH 未来若改变事件
  契约需要跟随适配
- DSH 客户端 API 仍是 pre-stable

## 开发与测试

```sh
node scripts/check.mjs
```

零依赖测试覆盖清单、bundle patch、locale、历史/终端状态、显示/隐藏条件、成功与失败提交、
按钮标签、主题 token 和资源清理等 18 项检查。

## 许可证

[MIT](LICENSE)
