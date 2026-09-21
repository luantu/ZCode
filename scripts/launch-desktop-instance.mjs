#!/usr/bin/env node

/**
 * 以独立实例启动打包后的桌面 App（可与本机已安装的官方 ZCode 并存，也可多开）。
 *
 * 冲突模型与设计：
 * - 业务配置（会话、凭据、provider、模型选择等）全部落在 ZCODE_DATA_BASE_DIR 数据目录，
 *   与 Electron userData 无关；启动器继承当前 shell 环境，因此自动复用与官方版相同的配置。
 * - Electron 单实例锁按 userData 目录加锁；官方版占用默认 userData，因此每个实例必须
 *   通过 ZCODE_DESKTOP_USER_DATA_DIR 指向独立目录，否则新实例会被锁拦下并退出。
 * - 桌面宿主经 UtilityProcess/MessagePort IPC 通信，不占用固定 TCP 端口，多实例无端口冲突。
 *
 * 用法:
 *   node scripts/launch-desktop-instance.mjs [--app <ZCode.app 路径>] [--slot <名称>]
 *
 * 参数:
 *   --app <path>   App 包路径，默认 packages/desktop/dist/mac-arm64/ZCode.app
 *   --slot <name>  实例槽位名；同名槽位复用同一份 Electron 状态且互斥（同槽位二次启动
 *                  会被单实例锁拦截），不同槽位互不影响。默认按时间戳生成一次性实例。
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");
const defaultAppPath = join(
  workspaceRoot,
  "packages/desktop/dist/mac-arm64/ZCode.app",
);

function parseArgs(argv) {
  const options = { app: defaultAppPath, slot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--app") options.app = argv[++index] ?? null;
    else if (arg === "--slot") options.slot = argv[++index] ?? null;
    else if (arg === "-h" || arg === "--help") options.help = true;
    else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(
    "用法: node scripts/launch-desktop-instance.mjs [--app <ZCode.app 路径>] [--slot <名称>]",
  );
  process.exit(0);
}

const executable = join(resolve(options.app), "Contents/MacOS/ZCode");
if (!existsSync(executable)) {
  console.error(`[launch-instance] 未找到可执行文件: ${executable}`);
  console.error("[launch-instance] 请先运行 pnpm bundle:desktop 构建产物。");
  process.exit(1);
}

const slot = options.slot ?? `dev-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const instanceRoot = join(homedir(), "Library/Application Support/ZCode-Instances", slot);

// 只隔离 Electron 状态；ZCODE_DATA_BASE_DIR 等业务配置环境变量原样继承。
const child = spawn(executable, [], {
  detached: true,
  stdio: "ignore",
  env: {
    ...process.env,
    ZCODE_DESKTOP_USER_DATA_DIR: instanceRoot,
    ZCODE_DESKTOP_SESSION_DATA_DIR: join(instanceRoot, "session"),
  },
});
child.unref();

console.log(`[launch-instance] slot=${slot}`);
console.log(`[launch-instance] app=${executable}`);
console.log(`[launch-instance] userData=${instanceRoot}`);
console.log(`[launch-instance] pid=${child.pid}`);
console.log(
  `[launch-instance] 数据目录=${process.env.ZCODE_DATA_BASE_DIR || "~/ (默认 HOME)"}`,
);
