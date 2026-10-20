# dsh-continue

简体中文 | [English](README.en.md)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 客户端插件：对话任务
任务被停止、异常中断或输出被截断后，输入框为空时**发送按钮会变成实心播放键**。点一下就会继续上一轮任务，不必再手动输入“继续”。

![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.2-4D6BFE)
![Version](https://img.shields.io/badge/version-1.5.0-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)
![Checks](https://img.shields.io/badge/checks-27-brightgreen)

## 为什么

任务被停止、异常中断或输出被截断后想恢复，通常还要在输入框里打一句“继续”。这个动作没有
信息量，却打断了操作。正常完成的轮次不会显示这个按钮，避免滥用。

`dsh-continue` 把这一步变成一个按钮：

- 对话空闲、输入框为空、最后一轮是**中止/异常/截断状态**时，**发送按钮本身变成实心播放图标**（箭头被替换成实心三角），React 重渲染也不会把它还原
- 正常完成（`completed`）和 `forked` 不显示，避免普通对话也被 Continue 打扰
- 显示的状态：用户停止（`aborted`）、`blocked`、`error`、`max-tokens`、`interrupted`，以及尾部只有 `turn/start` 的中断
- 输入文字或添加附件后立即恢复普通发送按钮，不会遮挡正常发送
- 点击后由**本插件自己的宿主路由**注入一条隐藏的 user 消息（`source.kind = 'continue'`），不经过 Goal 服务
- 聊天里**不会出现普通用户气泡**，取而代之是一张和 Goal 同款的**可展开触发卡片**，标题为「继续对话」
- 卡片按注入时间匹配，重启后依然保持「继续对话」标题
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

1. 通过 `sessions.binding(sessionId).session` 确认当前 Session 仍可用；
2. `POST /dsh-continue/round`，由宿主侧调用 `agent.followup({ role: 'user', content, source: { kind: 'continue', form: 'notice' } })`；
3. 该消息进入 `next-turn` 并唤醒一轮，和 Goal 回合走的是同一条队列与生命周期；
4. 客户端随后把这张触发卡片的标题改成「继续对话」并换成播放图标（按注入时间匹配，最多看守 20 秒）；
5. 路由不可用时回退到 `session.prompt()` 提交一条普通排队提示词，保证功能不消失；
6. 失败时播放键恢复，并在 tooltip 中提示重试。

提交的仍是普通用户提示词：中文界面发送 `继续完成上一次任务直到完成，不要询问用户确认。`，英文界面发送对应英文。
它不绕过 Host 的 Session 日志、队列或运行生命周期，也不需要 Goal 服务。

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

宿主半注册同源路由 `POST /dsh-continue/round`，把一条 `source.kind = 'continue'` 的 user 消息交给
当前 live agent 的 `followup()`；浏览器半注册在 `conversation.input.right` 槽位：

1. 通过 `useSession` 读取当前会话的 `running` / `blank` / `openState` / `subagent` /
   `pendingSubmissions`；
2. 注入的 `turnState()` 从 Session 事件窗口反向查找最后一个 `turn/start` 或 `turn/end`；
3. 终态、空闲且输入框为空时，接管 Host 主发送按钮（启用 + 实心播放图标），并用 MutationObserver
   顶住 React 重渲染；
4. 点击后调用上面的宿主路由；随后按注入时间把对应的触发卡片改标题为「继续对话」并换成播放图标。
   路由不可用时回退到公开的 `session.prompt()`。

## 已知限制

- 只覆盖当前打开的对话；侧边栏其他会话需要切换过去后才显示按钮
- 触发卡片标题的替换依赖「注入时间 ↔ 卡片时间」匹配（±4 秒）与内置标题文本，DSH 若改变触发
  卡片结构需要跟随适配；卡片记录的注入时间保存在 localStorage，重启后仍能改回「继续对话」
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
