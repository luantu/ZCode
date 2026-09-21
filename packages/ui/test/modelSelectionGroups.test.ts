import assert from "node:assert/strict";
import test from "node:test";
import type { ModelSelectionView } from "@zcode/services";
import {
  buildRegistryModelSelectGroups,
  resolveModelDisplayName,
} from "../src/lib/modelSelectionGroups.js";

function modelConfig(displayName?: string) {
  return {
    enabled: true,
    properties: {
      requiresMfjsToolSchema: false,
      contextWindow: 200000,
      inputFormat: {
        supportsText: true,
        supportsImage: false,
        supportsVideo: false,
        supportsAudio: false,
        supportsPdf: false,
      },
      outputFormat: { supportsText: true },
      supportsToolCall: true,
      supportsJsonSchemaOutput: false,
      supportsNativeWebSearch: false,
      supportsMidConversationSystem: false,
      ...(displayName === undefined ? {} : { displayName }),
    },
    optionSpecs: {
      reasoningLevel: { values: ["disabled", "enabled"], map: "{}" },
      maxOutputTokens: { max: 32000, map: "{}" },
    },
  };
}

const view = {
  revision: 1,
  providers: [
    {
      providerId: "account:zai-individual-coding-plan",
      providerName: "Z.ai Coding Plan",
      templateId: "zai-api",
      config: { api: { type: "anthropic-messages" } },
      models: [
        { modelId: "GLM-5.3-Flash", config: modelConfig("GLM-5.3 Flash") },
        { modelId: "k3", config: modelConfig() },
        { modelId: "blank-name", config: modelConfig("   ") },
      ],
    },
  ],
} as unknown as ModelSelectionView;

const groups = buildRegistryModelSelectGroups("glm", view);
const items = groups.flatMap((group) => group.items);

test("模型菜单项优先显示 displayName，缺失或空白时回退 modelId", () => {
  assert.equal(items.find((item) => item.name === "GLM-5.3 Flash")?.name, "GLM-5.3 Flash");
  assert.equal(items.find((item) => item.key.endsWith(":k3"))?.name, "k3");
  assert.equal(items.find((item) => item.key.endsWith(":blank-name"))?.name, "blank-name");
});

test("resolveModelDisplayName 沿用菜单项名称，目录外回退自定义模型名", () => {
  const value = items.find((item) => item.name === "GLM-5.3 Flash")?.value;
  assert.ok(value);
  assert.equal(resolveModelDisplayName(groups, value), "GLM-5.3 Flash");

  const fallbackValue = items.find((item) => item.key.endsWith(":k3"))?.value;
  assert.ok(fallbackValue);
  assert.equal(resolveModelDisplayName(groups, fallbackValue), "k3");
  assert.equal(resolveModelDisplayName(groups, "not-in-catalog"), null);
});
