# job_harvester

秋招进度追踪 + 邮件自动解析 + 面试复盘系统。

## 前置要求

- Node.js >= 20
- pnpm 9

## 快速开始

```powershell
pnpm install
pnpm dev
```

开发模式下会同时启动：

- 前端 Vite dev server：http://localhost:5173（`/api` 代理到后端）
- 后端 NestJS + Fastify：http://localhost:3000

浏览器访问 **http://localhost:5173**，可查看公司列表并新增公司。

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 开发模式，前后端同时启动 |
| `pnpm build` | 构建 shared、web、server |
| `pnpm start` | 生产模式单进程启动（server 托管 web 静态文件） |
| `pnpm typecheck` | 全仓库 TypeScript 检查 |
| `pnpm test` | 运行测试（含 companies 集成测试） |

## 生产模式

```powershell
pnpm build
pnpm start
```

浏览器访问 **http://localhost:3000** —— 同一端口提供前端页面与 `/api` 接口。

## 目录结构

```
job_harvester/
├── apps/
│   ├── server/          NestJS + Fastify + Drizzle + SQLite
│   └── web/             Vite + React + Tailwind + shadcn/ui
├── packages/
│   └── shared/          Zod schema（前后端类型贯通）
├── data/                运行时数据（gitignore，SQLite 存于此）
└── docs/
```

## 类型贯通验证

修改 `packages/shared/src/schemas/company.ts` 中的字段名后运行：

```powershell
pnpm typecheck
```

预期 server 与 web 两侧同时产生类型错误。

## 设计文档

详见 [`docs/DESIGN.md`](docs/DESIGN.md) 与 [`docs/issues/`](docs/issues/)。
