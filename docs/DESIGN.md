# job_harvester 设计文档

> 秋招进度追踪 + 邮件自动解析 + 面试复盘系统
> 最后更新：2026-08-24

---

## 1. 项目目标与约束

### 要解决的问题

1. 投递记录散落在 Excel 里，进度靠手动维护，容易漏
2. 招聘邮件混在几千封邮件里，笔试通知和面试邀约容易错过
3. 面试被问的问题记在语雀，只有题目没有回答，无法形成可复用的复习资产
4. 缺少针对性的面试前准备材料

### 价值窗口

本系统的核心价值窗口是**秋招期间（当前起约 2-3 个月）**。所有设计取舍以「多少天后能第一次真正用上」为最高标准，而非功能完整度。任何会拖慢首次可用时间的设计，即使更优雅，也要往后排。

### 使用者

单人自用。不做多用户、不做注册登录、不做 SaaS。

---

## 2. 核心设计原则

这几条原则贯穿所有模块，遇到分歧时以此裁决：

1. **原始数据不可变，派生数据可重算。** 邮件原文、你倒的面试记录原文永久保留；解析结果、结构化数据随时可以全量重跑覆盖。改进解析逻辑不需要重新拉邮箱。

2. **能算出来的就不要存。** 「沉寂多少天」「当前该做什么」都是查询时计算，不落库、不靠定时任务刷新。

3. **结构化数据进数据库，长文本进 Markdown 文件。** 数据库只存文件路径。面试记录和项目档案要能被任意编辑器打开、被 git 管理、被系统外搜索。

4. **识别一定会出错，所以人工确认是一等公民。** 不追求 100% 准确率，而是保证错误可以低成本地被发现和修正。人工确认队列和手动录入共用同一套 UI 与写入路径。

5. **不为不存在的复杂度付出真实的复杂度。** 不引入 agent 编排框架、不做向量索引、不做微服务。

---

## 3. 架构与技术栈

### 部署形态

纯本地单机运行。后端进程 + 浏览器访问 localhost，数据存本地 SQLite。功能稳定后打包为可执行文件（启动自动打开浏览器 + 托盘图标），不做 Electron/Tauri 重桌面端。

文件操作全部在后端进程完成，不受浏览器沙箱限制。

### 技术选型

```
job_harvester/
├── apps/
│   ├── server/          NestJS + Fastify adapter + Drizzle + SQLite
│   └── web/             Vite + React + Tailwind + shadcn/ui + TanStack Query
├── packages/
│   └── shared/          Zod schema（数据库结构 / API 类型 / LLM 输出校验三用）
├── data/                运行时数据目录（gitignore）
│   ├── app.db
│   ├── mails/           大 HTML 正文、原始 eml
│   ├── attachments/
│   ├── notes/           面试记录 Markdown
│   └── dossiers/        项目档案 Markdown
└── docs/
```

| 选型 | 理由 |
|---|---|
| NestJS + Fastify adapter | 模块边界强制清晰（邮件同步 / 解析 / 投递 / 面试 / LLM 各成一个 module）；`@nestjs/schedule` 现成的定时任务；DI 让 LLM provider 可替换、便于测试 |
| Drizzle 而非 Prisma | Prisma 带 Rust 查询引擎二进制，未来打包成单文件可执行程序时是障碍；Drizzle 是纯 TypeScript |
| better-sqlite3 | 同步 API 在本地工具场景下比异步好写；Windows 有预编译包 |
| Vite SPA 而非 Next.js | 数据在本地、单人使用、无 SEO 需求，SSR/RSC 毫无价值，只会多一个进程和一套缓存心智 |
| Tailwind + shadcn/ui | 核心视图是卡片看板 + 时间线 + 少量图表，不是复杂表格，Ant Design 的优势发挥不出来 |
| Zod | 一处定义，同时用于数据库校验、API 类型、LLM 结构化输出约束与校验 |

配套：TanStack Query（数据获取与缓存失效）、Recharts（图表）、dnd-kit（看板拖拽，可选）。

### 关于 Agent

**本项目不引入任何 agent 编排框架（LangGraph / Mastra 等）。**

系统内所有 LLM 任务的性质：

| 任务 | 性质 |
|---|---|
| 邮件是否招聘相关 | 无状态单次调用 |
| 从邮件抽取公司/业务线/事件/时间 | 无状态单次调用 |
| 公司名归并判断 | 无状态单次调用 |
| 面试记录结构化 | 无状态单次调用 |
| 面试前简报生成 | 无状态单次调用（数据由代码检索后拼入 prompt） |
| 复盘追问 / 模拟面试 | 多轮对话，但对话方是用户，本质是维护 message 数组 |

没有任何任务需要工具调用循环或自主决策。实现方式是一个约 200 行的 LLM 服务层：prompt 模板 + 调用 + Zod 校验 + 失败重试 + 调用日志。

唯一真正 agentic 的任务是「读三万行代码写项目档案」，该任务**外包给 Cursor**，不在本系统实现（见 6.3）。

可选增强：接入 Langfuse 做 prompt 版本管理与调用追踪。邮件抽取的 prompt 会反复迭代，有 trace 记录能量化每次改动的效果。

---

## 4. 数据模型

### 4.1 投递记录的粒度

**一条投递 = 公司 + 业务线 + 批次。**

岗位只作为记录字段，不参与唯一性判断（秋招不会给同一业务线投多个岗位）。

依据：真实 Excel 数据中「字节-豆包」「字节-抖音搜索」「字节-跨境电商」是三条独立流程，「腾讯」「腾讯元宝」「腾讯云智」「腾讯视频」是四条。**在大厂投递中区分独立流程的维度是业务线而非岗位。**

**不加数据库层唯一约束。** 中小公司没有业务线概念，该字段为空，而 SQLite 中 `NULL != NULL`，唯一约束形同虚设。改为应用层重复检测：发现疑似重复时提示用户选择合并或新建。

### 4.2 阶段的二维建模

阶段拆成两个正交维度：

**环节 stage**
```
APPLIED        已投递
SCREENING      简历筛选
ASSESSMENT     能力测评
WRITTEN_EXAM   笔试
INTERVIEW      面试
OFFER          Offer
CLOSED         已结束
```

**球在谁手里 ball**
```
ME     待我行动
THEM   等对方
```
`OFFER` 与 `CLOSED` 环节下该字段为空。

**为什么必须有第二维**：「收到笔试通知但没做」和「笔试做完等结果」在一维枚举里都是「笔试」，但意义天差地别——前者是有截止时间的紧急待办，后者是等待。今日待办和沉寂检测都依赖这个区分。

**沉寂检测的正确定义**：`ball == THEM && now - lastEventAt > N 天`。计算得出，不落库。对 `ball == ME` 的记录报沉寂没有意义，那是在提醒用户自己拖延。

**结束原因 outcome**（仅 `CLOSED`）
```
REJECTED     对方拒绝
WITHDRAWN    我方放弃
TALENT_POOL  进人才库
ASSUMED_DEAD 我判定已凉（长期无响应，手动归档）
```
`ASSUMED_DEAD` 与 `REJECTED` 必须区分，统计通过率时口径不同。真实数据中 35 条投递有 16 条属于此类。

**面试类型 interviewType**
```
TECH     技术面
MANAGER  主管面
HR       HR 面
CROSS    交叉面
GROUP    群面
AI       AI 面
```
配合 `round`（轮次数字）使用。「字节三面」= round 3 + TECH，「主管面」= round 4 + MANAGER。加面、交叉面均可容纳。

### 4.3 事件类型

事件是驱动整个系统的核心，投递记录的当前状态由事件派生。

```
APPLY               投递
SCREEN_PASS         简历通过
SCREEN_FAIL         简历未过
ASSESSMENT_INVITE   测评通知      → ball: ME，带截止时间
ASSESSMENT_DONE     测评完成      → ball: THEM
EXAM_INVITE         笔试通知      → ball: ME，带截止时间
EXAM_DONE           笔试完成      → ball: THEM
INTERVIEW_SCHEDULED 面试邀约      → ball: ME，带预约时间、轮次、类型
INTERVIEW_DONE      面试完成      → ball: THEM
OFFER_INTENT        Offer 意向
OFFER_FORMAL        正式 Offer
REJECTED            流程终止      → stage: CLOSED
REVIVED             被捞起        → 从 CLOSED 拉回进行中
WITHDRAWN           我方放弃      → stage: CLOSED
NOTE                备注（不改变状态）
```

`REVIVED` 是必需的：真实数据中「腾讯元宝：捞起来 4.23 一面」「腾讯视频：5.15 捞起来」证明终止状态必须可逆。

### 4.4 表结构

**company**
```
id, canonicalName, industry, website, note, createdAt
```

**companyAlias**
```
id, companyId, alias, source(MANUAL|CONFIRMED|IMPORT)
```
独立成表而非 JSON 数组，便于模糊匹配查询。用户确认一次，系统永久记住。

**application**
```
id, companyId, businessUnit?, position?, batch, channel?,
appliedAt?, stage, ball?, outcome?,
currentRound, currentInterviewType?,
lastEventAt, nextDeadlineAt?,
note, createdAt, updatedAt
```
- `appliedAt` 可空：被捞起的记录没有主动投递日期
- `channel`：官网 / 内推 / 牛客 / BOSS / 被捞
- `stage` `ball` `currentRound` `lastEventAt` `nextDeadlineAt` 均为**从事件派生的冗余字段**，用于排序和筛选，可随时由事件全量重算

**event**
```
id, applicationId, type, occurredAt,
source(EMAIL|MANUAL|IMPORT), emailId?,
round?, interviewType?,
deadlineAt?, scheduledAt?,
rawText?, payload(json), createdAt
```
`rawText` 保留原始文本片段（如「简历没过，应该是还在 cd」这类带主观推测的记录），不允许 LLM 在结构化时丢弃。

**email**
```
id, messageId(unique), folder, fromName, fromAddress, subject,
receivedAt, bodyText, bodyHtmlPath?, rawPath?, hasAttachment,
screenResult(IRRELEVANT|SUSPECT|RELEVANT),
parseStatus(PENDING|PARSED|FAILED|SKIPPED), parsedAt?, confidence?,
linkedApplicationId?, reviewStatus(AUTO|NEEDS_REVIEW|CONFIRMED|IGNORED)
```
与 `event` 分离存储，解析逻辑改进后可对历史邮件全量重跑。

**attachment**
```
id, emailId, filename, path, size, mime
```

**interviewNote**
```
id, applicationId, eventId?, mdPath, rawDump, summary?, createdAt
```
`rawDump` 是你随手倒的原文，永久保留（原则 1）。

**question** —— 面试题库，面试模块的地基
```
id, text, category?, 
applicationId?, companyId?, interviewNoteId?,
round?, interviewType?, askedAt?,
myAnswer?, referenceAnswer?,
selfRating?, status(NEW|WEAK|REVIEWING|MASTERED),
source(INTERVIEW|IMPORT|GENERATED)
```
语雀历史题目直接进此表（`source=IMPORT`，`myAnswer` 为空）。错题驱动的模拟面试和面试前简报本质上都是对这张表的查询。**面试记录是原材料，题库才是可复用资产。**

**projectDossier**
```
id, name, repoPath?, mdPath, resumeBullets(json), updatedAt
```

**syncState**
```
id, folder, lastUid, lastSyncAt
```

---

## 5. 邮件管道

### 5.1 接入

QQ 邮箱，IMAP + 授权码，`imap.qq.com:993` SSL。不需要 OAuth，不需要注册开发者应用。

Node 侧使用 `imapflow`（IMAP 客户端）+ `mailparser`（邮件解析），同一作者维护，质量优于同类。

**两个必踩的坑**：

1. QQ 邮箱 IMAP 会拒绝未发送 `ID` 命令的客户端，直接登录报 `Unsafe Login`。登录后需手工发送 `ID` 命令声明客户端信息。
2. **招聘邮件不一定在 `INBOX`**。QQ 邮箱自动分类会把不少 HR 系统邮件归入「订阅邮件」，部分进垃圾箱。同步时必须遍历多个文件夹。

**凭据存储**：授权码存系统凭据管理器（`keytar` / Windows 凭据管理器），不写入代码、不写入 `.env`。数据库只存邮箱地址。

**回溯范围**：2026 年 3 月 1 日起，做成配置项。

**同步触发**：第一版仅手动同步按钮。开发期需要对同一批邮件反复重跑解析，定时任务会干扰调试。解析准确率满意后再加定时轮询。**不做 IMAP IDLE**——招聘邮件晚十五分钟看到不影响任何决策，不值得为此维护长连接重连逻辑。

### 5.2 识别与抽取

三段式：

```
规则粗筛 → LLM 精抽取 → 人工确认队列
```

1. **规则粗筛**：发件人域名白名单、关键词、正则。目标是把明显无关的邮件挡在 LLM 之前，节省成本和时间。判定结果写入 `email.screenResult`。
2. **LLM 精抽取**：对 `SUSPECT` 和 `RELEVANT` 的邮件，抽取公司、业务线、岗位、事件类型、发生时间、截止时间。输出用 Zod 校验，不合格重试。
3. **人工确认队列**：高置信度直接入库；低置信度进队列，用户一键确认 / 修正 / 忽略。**用户的修正反哺规则**（确认某发件人域名后自动加入白名单）。

**笔试截止时间必须作为独立字段单独抽取。** 它是唯一一个错过就彻底没机会的时间点（常写在正文中，如「请于 X 月 X 日 24:00 前完成」），优先级高于其他所有字段。

### 5.3 事件归并

邮件事件挂到投递记录的匹配优先级：

1. 邮件线程（`In-Reply-To` / `References`）
2. 邮件中的显式业务线 / 岗位名
3. 该公司唯一进行中的投递
4. 以上都无法确定 → 进人工确认队列

公司名归并依赖 `companyAlias` 表。真实数据中「字节 - 豆包」「字节- 抖音搜索」「字节 -跨境电商」空格位置各不相同，别名表是必需的。

### 5.4 成本

粗估：3000 封邮件，粗筛后约 300-400 封进 LLM，每封取正文前 2000 token，总量约 60 万 token。以 DeepSeek 价格计，全量跑一遍**成本为个位数人民币**。成本不是约束，隐私才是。

---

## 6. 面试模块

### 6.1 复盘录入

**主入口是一个大文本框**，面试后随手倒一段（「问了 MySQL 索引、Redis 缓存穿透、我项目那个消息队列为啥选 Kafka，第三个答崩了」这种粒度即可）。LLM 结构化成题目条目写入 `question` 表。

**录入摩擦是这个功能唯一的生死线。** 面试刚结束时人是疲惫的，任何需要填十个字段的表单都会在两次之后烂尾。已验证的事实：用户的历史记录（语雀）只有题目、没有回答，正是因为记录成本太高。

**Agent 追问必须克制**：只针对关键且缺失的信息追问两三句，目标是趁记忆最新捞出「你怎么答的、哪里卡住了」——这层信息价值最高且流失最快。逐条盘问会让这个功能变成负担。

**移动端场景**：不做微信集成。面试后在外面用微信「文件传输助手」随手记（语音转文字或打字），回家粘贴进系统。零开发成本、零稳定性风险。

### 6.2 模拟面试与面试前简报

**模拟面试定位为错题驱动的文字问答。** 题目来源：

- `question` 表中 `status IN (NEW, WEAK)` 的历史题
- 项目档案推导出的追问
- 目标公司的历史真题

**不做语音。** ASR/TTS 链路的工程量和延迟都是坑，而「练口头表达」是通用能力，用现成 AI 产品或找同学对练性价比更高。本系统的不可替代性来自数据，不来自形式。

**优先级更高的是「面试前简报」**：面某家公司之前，自动汇总该公司历史事件、上次被问的题、相关项目档案要点、当前薄弱题目，生成一页考前提纲。理由：它是**刚需时刻**（面试前一小时）的产物，使用频率会远高于需要主动挤出半小时的模拟面试。

### 6.3 项目档案

**由 Cursor 生成 Markdown，本系统只负责读取和使用。** 档案是低频产物（一个项目一辈子写一次），为此建一整套 agent 基础设施投入产出比过低，而 Cursor 的代码理解能力更强。生成流程可固化为一个 Cursor skill。

**档案范围由简历决定，而非由代码决定。** 面试官只会顺着简历上的三五行追问。正确方向是「从简历要点出发，去代码里找证据和细节」。最大的项目约 3.2 万行代码（Turborepo，apps 22069 行 + packages 9616 行，468 个文件），全量入上下文不可行，但简历驱动后真正需要精读的可能只有两三千行。

档案内容：背景、架构、关键技术选型及理由、个人负责部分、量化数据、已知短板、可能被追问的点。

**绝大多数面试问题不需要读代码。** 「为什么选 Kafka 不选 RabbitMQ」「QPS 多少」「流量翻十倍怎么改」的答案不在代码里，在设计决策和数据里。需要翻代码的只有实现细节题。

---

## 7. 提醒

只做页面内提醒，不做外部推送渠道。

- **今日待办**：`ball == ME` 且尚未截止（`nextDeadlineAt` 为空，或本地日历日 ≥ 今天）的记录，按 `nextDeadlineAt` 排序。已截止的仍留在看板「待我行动」栏，不进今日待办
- **沉寂检测**：`ball == THEM && now - lastEventAt > N 天`，高亮显示

不做日历导出、不做微信推送、不做系统通知。

---

## 8. 隐私与安全

- LLM 使用 DeepSeek / Qwen 云 API（OpenAI 兼容协议，切换供应商只改 `baseURL`）
- **脱敏中间件**：发送前将手机号、身份证号、银行卡号替换为占位符
- 本地模型方案已排除：显存 8GB 不足以跑质量可用的模型，且本地小模型在「从半结构化 HTML 邮件稳定抽出 JSON」上失败率明显更高，而这是整个系统的地基
- 邮箱授权码存系统凭据管理器
- `data/` 目录整体 gitignore，代码仓库与个人数据严格分离

---

## 9. 路线图

顺序的唯一标准是「多少天后能第一次真正用上」。

| 阶段 | 内容 | 预估 |
|---|---|---|
| M1 | 数据模型 + 手动录入 + 看板 + 时间线视图 | 2-3 天 |
| M2 | Excel / 语雀历史数据导入 | 1 天 |
| M3 | IMAP 同步 + 原始邮件入库 + 规则粗筛 + 邮件列表页（**不接 LLM**） | 3-4 天 |
| M4 | LLM 抽取 + 人工确认队列 + 公司别名归并 | 3 天 |
| M5 | 面试复盘录入 + 题库 + 项目档案接入 | 2 天 |
| M6 | 面试前简报 | 1-2 天 |
| M7 | 错题驱动模拟面试 | 2 天 |
| M8 | 定时同步 + 打包 + 托盘 | 1-2 天 |

**为什么手动版排在邮件管道之前**（反直觉但关键）：

1. 两三天就能用上，邮件管道要一周，秋招等不起
2. 手动录入过程中会立刻撞上数据模型缺陷（「这个状态没地方放」「这个字段没用」），此时改模型成本几乎为零；先建管道再改模型则管道要跟着重写
3. 人工确认队列的 UI 与手动录入 UI 本质相同，M1 做完 M4 可直接复用

**种子数据的特殊价值**：M2 完成后，35 条实习投递 + 语雀历史真题即刻入库。此时可以立即执行一个高价值动作——结合项目档案为历史题目生成参考答案，逐题自评，产出一份**秋招第一场面试之前的针对性复习清单**。这可能是本系统在当前阶段最大的价值点，高于邮件解析。

---

## 10. 明确不做的事

记录在此以避免重复讨论：

| 不做 | 原因 |
|---|---|
| 多用户 / 注册登录 / SaaS | 单人自用，纯粹的工作量浪费 |
| Electron / Tauri 完整桌面端 | 文件操作在后端进程即可完成，桌面端只多给「双击启动」，不值得 |
| Next.js | 数据在本地、单人、无 SEO，SSR/RSC 零价值 |
| agent 编排框架 | 所有 LLM 任务都是无状态单次调用，无编排需求 |
| 代码向量索引 / RAG | 代码 embedding 检索效果一般，工程量大，代码一改就要重建；项目档案已覆盖 90% 场景 |
| 本地 LLM | 8GB 显存不足；结构化抽取质量不达标 |
| IMAP IDLE | 实时性收益极低，长连接重连维护成本高 |
| 语音模拟面试 | ASR/TTS 工程量大；练表达用通用产品性价比更高 |
| 微信双向对话 | 需要公网可访问地址（云服务器或内网穿透），叠加消息加解密、5 秒被动回复超时、异步补发客服消息，工程量是单向推送的 5-10 倍，且持续消耗运维精力 |
| 日历 .ics 导出 | 锦上添花，非核心 |
| 面试录音 + 转写 | 未经面试官同意录音在合规与道德上均有问题 |
| 继续在语雀记录 + 双向同步 | 双数据源冲突是经典的坑；改为历史一次性导入，之后只写系统（Markdown 落盘补偿写作体验） |

---

## 11. 待定项

- Drizzle schema 的完整字段定义与迁移文件
- 规则粗筛的具体规则集（发件人域名白名单初始值、关键词表）
- 沉寂检测的阈值 N（建议投递后 21 天、面试后 10 天，需实际使用后校准）
- 各 prompt 的具体内容与 few-shot 样例（可用 Excel 中的真实语料构造）
- 打包方案的具体工具（pkg / nexe / Node SEA）

---

## 附录：真实数据观察

来自 `实习投递.xlsx`（35 条，2026 年 3-5 月春招实习），这些观察直接塑造了上述设计：

| 观察 | 影响的设计 |
|---|---|
| 表头为 `投递日期 / 状态 / 一面`，E 列有数据但无表头 | 固定阶段列必然被现实打破 → 事件流建模 |
| 「字节 - 豆包」「字节- 抖音搜索」「字节 -跨境电商」 | 业务线是区分独立流程的维度；空格不一致证明需要别名表 |
| 单元格内容如「当天测评，29笔试，4.7约面试时间」 | 真实记录粒度本就是事件流，被二维表压扁 |
| 「腾讯元宝：捞起来 4.23 一面」「腾讯视频：5.15 捞起来」 | 终止状态必须可逆 → `REVIVED` 事件 |
| 35 条中 16 条只有公司名和投递日期，之后无下文 | 沉寂是最常见状态 → 沉寂检测 + `ASSUMED_DEAD` |
| 「4.1100000000000003」 | Excel 浮点误差，导入时需 round |
| 日期为「3.11」形式，无年份 | 导入时按上下文补 2026 |
| 「简历没过，应该是还在 cd」 | 带主观推测的记录 → `event.rawText` 保留原文 |
| 美团那条出现「ai面」 | 面试类型需包含 `AI` |
| 腾讯元宝、腾讯视频无投递日期 | `appliedAt` 可空，`channel` 需要「被捞」 |
