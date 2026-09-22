# Fork 桌面发布与自动更新规则

## 目标

`luantu/ZCode` 自动同步 `zai-org/ZCode`，质量门通过后构建并发布 macOS arm64 桌面包；已安装的 fork 桌面版只从本 fork 的 GitHub Releases 检查更新并完成静默升级。

## 所有者与单一路径

- 上游同步状态由 `.github/workflows/sync-upstream.yml` 唯一拥有：合并成功且 `typecheck`、`lint` 通过后才推进 `main`；冲突或检查失败转 PR，不直接覆盖 fork 定制。
- fork 发布版本和 Release 由 `.github/workflows/build-release.yml` 唯一拥有；`scripts/ci/next-fork-version.mjs` 负责产生严格递增的 semver。
- 应用更新源由打包进 `app-update.yml` 的 GitHub provider 唯一决定；fork 构建不得回退官方 manifest provider。
- 业务数据仍由既有 `ZCODE_DATA_BASE_DIR` 路径拥有，替换 App 不迁移或复制用户数据。

## 签名不变量

- 每个可发布 Release 必须使用同一 `ZCode Fork Signing` 证书签名；证书 SHA-1 必须与首个已安装签名版一致。
- CI 只导入包含该单一身份的 PKCS#12，不得把登录钥匙串里的其它身份写入 GitHub secrets。
- 临时钥匙串使用绝对路径、长超时，只作为搜索列表中的唯一钥匙串。
- `security import` 必须配置无头 runner 可用的私钥访问 ACL；签名后必须下载产物并机械验证不是 ad-hoc。
- 未配置或未通过签名验证时只允许上传 workflow artifact，不得发布 Release。

## 发布顺序与失败语义

```text
上游变化 / 手动 dispatch
  → sync-upstream 合并与质量门
  → build-release 计算新版本
  → 构建 + 证书签名
  → 本地机械验证签名身份与 app-update.yml
  → 发布正式 Release + latest-mac.yml
  → 下载已发布 ZIP 再次验证签名身份
```

- 任一步失败，Release 不得成为最新可更新版本。
- 同一 HEAD 已有发布 tag 时幂等跳过。
- 只保留最近三个成功 Release；删除前不得影响当前 `latest-mac.yml`。

## 自动更新验收

1. 已安装版本 N 与 Release N+1 的签名身份相同。
2. N+1 的 `app-update.yml` 指向 `owner: luantu`、`repo: ZCode`、`provider: github`。
3. GitHub Release 为非草稿，包含 ZIP、DMG、blockmap、`latest-mac.yml`，其中 ZIP sha512 与实际文件一致。
4. 运行版本 N 的“检查更新”能发现 N+1，下载完成后退出/重启安装，用户数据与账号状态保持不变。
5. 重启后 `/Applications/ZCode.app` 版本为 N+1，且 `codesign --verify --deep` 通过。
