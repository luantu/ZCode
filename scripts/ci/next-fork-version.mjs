#!/usr/bin/env node

/**
 * 计算 fork 发布版本号，保证 electron-updater 的 semver 严格递增。
 *
 * 规则：
 * - 上游基线 patch 段按 ×1000 编码：上游 3.14.0 → fork 从 3.14.100 起步；
 *   上游 3.14.1 → 基线 1000，fork 跳到 3.14.1100。同基线内每次发布 patch +1。
 * - 上游版本只用于切基线；fork 自己的版本永远单调递增，与上游是否回退无关。
 *
 * 输出（供 CI 捕获）：下一版本号，如 3.14.100。
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "../..");

function parseVersion(raw) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(raw).trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersion(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  return 0;
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function listForkTags() {
  const output = execSync("git tag --list 'v*'", { encoding: "utf8", cwd: workspaceRoot });
  return output
    .split("\n")
    .map((tag) => parseVersion(tag))
    .filter((version) => version !== null)
    .sort(compareVersion);
}

const upstream = parseVersion(readJsonRootVersion());
const forkTags = listForkTags();
const lastFork = forkTags.at(-1) ?? null;

if (!upstream) {
  console.error(`[next-fork-version] 根 package.json 版本不可解析: ${readJsonRootVersion()}`);
  process.exit(1);
}

const upstreamBasePatch = upstream.patch * 1000;
let next;
if (!lastFork) {
  next = { major: upstream.major, minor: upstream.minor, patch: upstreamBasePatch + 100 };
} else {
  const lastForkBasePatch = Math.floor(lastFork.patch / 1000) * 1000;
  const upstreamMoved =
    upstream.major > lastFork.major ||
    upstream.minor > lastFork.minor ||
    upstreamBasePatch > lastForkBasePatch;
  next = upstreamMoved
    ? { major: upstream.major, minor: upstream.minor, patch: upstreamBasePatch + 100 }
    : { major: lastFork.major, minor: lastFork.minor, patch: lastFork.patch + 1 };
}

console.log(formatVersion(next));

function readJsonRootVersion() {
  return JSON.parse(readFileSync(resolve(workspaceRoot, "package.json"), "utf8")).version;
}
