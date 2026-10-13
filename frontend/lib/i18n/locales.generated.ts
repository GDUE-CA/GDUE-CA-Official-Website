/**
 * AUTO-GENERATED FILE — 请勿手改
 * 由 next.config.ts 扫描 i18n/messages/*.json 自动生成；
 * 新增/删除语言文件后重启 dev（或重新 build）自动更新。
 */
export const locales = [
  "zh-cn",
  "ar-sa",
  "de-de",
  "en-us",
  "es-es",
  "fr-fr",
  "hi-in",
  "it-it",
  "ja-jp",
  "ko-kr",
  "pt-br",
  "ru-ru",
  "tr-tr",
  "zh-cn-sg",
  "zh-hk",
  "zh-mo",
  "zh-yue-cn",
  "zh-yue-tw",
] as const;

export type Locale = (typeof locales)[number];

/** 字典动态加载器（键与 locales 一一对应；打包器需要字面量 import 路径） */
export const dictionaryLoaders = {
  "zh-cn": () => import("@/i18n/messages/zh-cn.json").then((m) => m.default),
  "ar-sa": () => import("@/i18n/messages/ar-sa.json").then((m) => m.default),
  "de-de": () => import("@/i18n/messages/de-de.json").then((m) => m.default),
  "en-us": () => import("@/i18n/messages/en-us.json").then((m) => m.default),
  "es-es": () => import("@/i18n/messages/es-es.json").then((m) => m.default),
  "fr-fr": () => import("@/i18n/messages/fr-fr.json").then((m) => m.default),
  "hi-in": () => import("@/i18n/messages/hi-in.json").then((m) => m.default),
  "it-it": () => import("@/i18n/messages/it-it.json").then((m) => m.default),
  "ja-jp": () => import("@/i18n/messages/ja-jp.json").then((m) => m.default),
  "ko-kr": () => import("@/i18n/messages/ko-kr.json").then((m) => m.default),
  "pt-br": () => import("@/i18n/messages/pt-br.json").then((m) => m.default),
  "ru-ru": () => import("@/i18n/messages/ru-ru.json").then((m) => m.default),
  "tr-tr": () => import("@/i18n/messages/tr-tr.json").then((m) => m.default),
  "zh-cn-sg": () => import("@/i18n/messages/zh-cn-sg.json").then((m) => m.default),
  "zh-hk": () => import("@/i18n/messages/zh-hk.json").then((m) => m.default),
  "zh-mo": () => import("@/i18n/messages/zh-mo.json").then((m) => m.default),
  "zh-yue-cn": () => import("@/i18n/messages/zh-yue-cn.json").then((m) => m.default),
  "zh-yue-tw": () => import("@/i18n/messages/zh-yue-tw.json").then((m) => m.default),
} as const;
