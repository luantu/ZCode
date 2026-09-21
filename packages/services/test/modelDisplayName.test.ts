import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ModelConfig,
  ModelConfigRules,
  ModelPropertiesConfig,
  clearManualModelConfig,
  createRegistryModelConfig,
  serializeRegistryModelConfig,
} from "@zcode/provider";
import { decodeZCodeBuiltinRelease } from "@zcode/provider-node";

const builtinJsonPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../config/provider/zcode-builtin.json",
);
const builtinRelease = decodeZCodeBuiltinRelease(JSON.parse(readFileSync(builtinJsonPath, "utf8")));
const builtinRules = builtinRelease.config.modelConfigRules;

function resolveDisplayName(modelId: string, providerId = "test:provider"): string | undefined {
  return builtinRules.resolve({ providerId, modelId }).properties?.displayName;
}

test("builtin JSON 经 release schema 全量解析，displayName 种子规则随 revision 生效", () => {
  assert.ok(builtinRelease.revision >= 31, "改内容必须升 revision");
  const displayNames = builtinRelease.config.modelConfigRules
    .rules()
    .map((rule) => rule.config.properties?.displayName)
    .filter((displayName) => displayName !== undefined);
  assert.ok(displayNames.length >= 90, `期望覆盖全部已知模型家族，实际 ${displayNames.length} 条`);
});

test("已知模型解析出 displayName，大小写与 provider 前缀变体归并到同一名称", () => {
  assert.equal(resolveDisplayName("GLM-5.3-Flash"), "GLM-5.3 Flash");
  assert.equal(resolveDisplayName("glm-5.3-flash"), "GLM-5.3 Flash");
  assert.equal(resolveDisplayName("z-ai/glm-5.3-flash"), "GLM-5.3 Flash");
  assert.equal(resolveDisplayName("claude-sonnet-4-5-20251001"), "Claude Sonnet 4.5");
  assert.equal(resolveDisplayName("anthropic/claude-sonnet-4.5"), "Claude Sonnet 4.5");
  assert.equal(resolveDisplayName("claude-opus-4-6"), "Claude Opus 4.6");
  assert.equal(resolveDisplayName("moonshotai/kimi-k2.6"), "Kimi K2.6");
  assert.equal(resolveDisplayName("openai/gpt-5.6-luna"), "GPT-5.6 Luna");
  assert.equal(resolveDisplayName("minimax/minimax-m2.7"), "MiniMax M2.7");
  assert.equal(resolveDisplayName("qwen/qwen3.5-plus-20260420"), "Qwen3.5 Plus");
});

test("无 displayName 规则的模型保持 undefined，由 UI 回退显示 modelId", () => {
  assert.equal(resolveDisplayName("k3"), undefined);
  assert.equal(resolveDisplayName("totally-unknown-model"), undefined);
  assert.equal(resolveDisplayName("emohaa"), undefined);
});

test("displayName 与既有规则叠加，完整配置可入 registry 并随序列化白名单带出", () => {
  // 与生产 resolver 相同的完整身份输入：缺 apiType/baseUrl 时 modelApiRules 不参与，
  // optionSpecs 的 map 叶子不会被补齐，complete 校验必然失败。
  const identity = {
    providerId: "account:zai-individual-coding-plan",
    templateId: "zai-api",
    apiType: "anthropic-messages",
    baseUrl: "https://api.z.ai/api/anthropic",
  };
  const resolved = builtinRules.resolve({ ...identity, modelId: "GLM-5.3-Flash" });
  assert.equal(resolved.properties?.displayName, "GLM-5.3 Flash");
  assert.ok(
    (resolved.properties?.contextWindow ?? 0) > 0,
    "能力字段仍由既有规则叠加得出，不受 displayName 规则影响",
  );

  const registry = createRegistryModelConfig(resolved);
  assert.equal(registry.ok, true, "带 displayName 的完整配置必须通过 complete 校验");
  if (!registry.ok) return;
  const serialized = serializeRegistryModelConfig(registry.config);
  assert.equal(serialized.properties.displayName, "GLM-5.3 Flash");

  const unknown = builtinRules.resolve({ ...identity, modelId: "k3" });
  const unknownRegistry = createRegistryModelConfig(unknown);
  assert.equal(unknownRegistry.ok, true);
  if (!unknownRegistry.ok) return;
  const unknownSerialized = serializeRegistryModelConfig(unknownRegistry.config);
  assert.equal(
    Object.prototype.hasOwnProperty.call(unknownSerialized.properties, "displayName"),
    false,
    "无 displayName 的模型序列化结果不应出现该键",
  );
});

test("规则叠加：后规则覆盖前规则，无 displayName 的规则不清除已有值", () => {
  const rules = new ModelConfigRules([
    {
      type: "model",
      modelMatch: ".*",
      config: new ModelConfig({
        enabled: true,
        properties: new ModelPropertiesConfig({ displayName: "Base Name" }),
      }),
    },
    {
      type: "model",
      modelMatch: "specific-model",
      config: new ModelConfig({
        properties: new ModelPropertiesConfig({ contextWindow: 128000 }),
      }),
    },
    {
      type: "model",
      modelMatch: "specific-model",
      config: new ModelConfig({
        properties: new ModelPropertiesConfig({ displayName: "Specific Name" }),
      }),
    },
  ]);

  const base = rules.resolve({ providerId: "test:provider", modelId: "other-model" });
  assert.equal(base.properties?.displayName, "Base Name");

  const specific = rules.resolve({ providerId: "test:provider", modelId: "specific-model" });
  assert.equal(specific.properties?.displayName, "Specific Name");
  assert.equal(specific.properties?.contextWindow, 128000);
});

test("手动配置语义：displayName 属于系统叶子，手动叠加时保留、恢复智能配置时随规则回来", () => {
  const systemConfig = new ModelConfig({
    enabled: true,
    properties: new ModelPropertiesConfig({ contextWindow: 200000, displayName: "GLM-5.3 Flash" }),
  });
  const cleared = clearManualModelConfig(systemConfig.toJSON());
  assert.equal(
    cleared.properties?.displayName,
    "GLM-5.3 Flash",
    "displayName 不在手动白名单，不被清除",
  );
  assert.equal(
    cleared.properties?.contextWindow,
    undefined,
    "contextWindow 是手动可编辑叶子，被清除",
  );
});
