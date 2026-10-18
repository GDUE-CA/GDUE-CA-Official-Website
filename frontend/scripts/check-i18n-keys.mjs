#!/usr/bin/env node
/**
 * i18n key 一致性编译校验（V0.5.9 §9）
 *
 * 以 zh-cn.json 为基准：扫描 i18n/messages/*.json，
 * 任一语言文件的 key 集合与基准不一致（缺失 / 多余）时输出编译警告。
 * 仅警告不中断构建（翻译采用回退链兜底，页面不会裸露出 key）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MESSAGES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "i18n", "messages");
const BASE_LOCALE = "zh-cn";

/** 递归收集全部叶子 key（点号路径；扁平点号 key 与嵌套等价处理） */
function collectKeys(obj, prefix = "", out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) collectKeys(v, key, out);
    else out.add(key);
  }
  return out;
}

const files = fs.readdirSync(MESSAGES_DIR).filter((f) => f.endsWith(".json"));
if (!files.includes(`${BASE_LOCALE}.json`)) {
  console.warn(`[i18n-check] 警告：基准语言文件 ${BASE_LOCALE}.json 不存在`);
  process.exit(0);
}

const baseKeys = collectKeys(JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, `${BASE_LOCALE}.json`), "utf8")));
let warnCount = 0;

for (const f of files) {
  if (f === `${BASE_LOCALE}.json`) continue;
  const keys = collectKeys(JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, f), "utf8")));
  const missing = [...baseKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !baseKeys.has(k));
  if (missing.length || extra.length) {
    warnCount++;
    console.warn(
      `[i18n-check] 警告：${f} 与基准 ${BASE_LOCALE}.json key 集合不一致` +
      `（缺失 ${missing.length}，多余 ${extra.length}）`
    );
    const sample = [...missing.slice(0, 5).map((k) => `-${k}`), ...extra.slice(0, 5).map((k) => `+${k}`)];
    if (sample.length) console.warn(`[i18n-check]   示例：${sample.join(", ")}${missing.length + extra.length > 10 ? " …" : ""}`);
  }
}

if (warnCount === 0) {
  console.log(`[i18n-check] OK：${files.length} 个语言文件 key 集合完全对齐（基准 ${BASE_LOCALE}，共 ${baseKeys.size} 键）`);
}
