/**
 * i18n 字典合并工具（client-safe：不依赖 next/headers，客户端/服务端共用）
 *
 * 规范约束（§3 / S06）：
 * - 语言文件中的「扁平点号 key」（如 "common.save"）展开为嵌套结构后再合并；
 * - 空字符串视为缺失词条（翻译留空 → 自动回退兜底语言，防页面空白）；
 * - 合并方向：回退链终态语言（zh-cn / en-gb）为底，回退链上越靠后的语言优先级越高（自身差异最后覆盖）。
 */

export type Dict = Record<string, unknown>;

/** 深合并：base 为底，override 的键覆盖 base（递归嵌套对象；数组/原始值整体替换） */
export function deepMerge<T>(base: T, override: unknown): T {
  if (
    base && typeof base === "object" && !Array.isArray(base) &&
    override && typeof override === "object" && !Array.isArray(override)
  ) {
    const out: Dict = { ...(base as Dict) };
    for (const [k, v] of Object.entries(override as Dict)) {
      out[k] = k in out ? deepMerge(out[k], v) : v;
    }
    return out as T;
  }
  return (override as T) ?? base;
}

/**
 * 展开扁平点号 key（递归到每一层嵌套对象）：
 * { "a.b": 1, c: { "d.e": 2 } } → { a: { b: 1 }, c: { d: { e: 2 } } }
 * 与已存在的嵌套 key 冲突时深合并。
 */
export function expandFlatKeys(obj: Dict): Dict {
  const out: Dict = {};
  for (const [k, raw] of Object.entries(obj)) {
    const v =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? expandFlatKeys(raw as Dict)
        : raw;
    if (!k.includes(".")) {
      out[k] = k in out ? deepMerge(out[k], v) : v;
      continue;
    }
    const parts = k.split(".");
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof cur[p] !== "object" || cur[p] === null || Array.isArray(cur[p])) {
        cur[p] = {};
      }
      cur = cur[p] as Dict;
    }
    const leaf = parts[parts.length - 1];
    cur[leaf] = leaf in cur ? deepMerge(cur[leaf], v) : v;
  }
  return out;
}

/** 空字符串叶子视为缺失：递归剔除（留空的翻译 key 不进最终字典，触发回退链） */
export function stripEmptyLeaves(obj: Dict): Dict {
  const out: Dict = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      if (v !== "") out[k] = v;
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sub = stripEmptyLeaves(v as Dict);
      if (Object.keys(sub).length > 0) out[k] = sub;
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * 按回退链构建最终字典。
 * dicts 顺序 = [自身, 父语言, …, 分组终态语言]（localeFallbackChain 的输出顺序）；
 * 内部反转后以终态语言（zh-cn / en-gb）为底逐层覆盖，保证自身词条优先级最高。
 */
export function mergeLocaleChain(dicts: Dict[]): Dict {
  let acc: Dict = {};
  for (const d of [...dicts].reverse()) {
    acc = deepMerge(acc, d);
  }
  return acc;
}
