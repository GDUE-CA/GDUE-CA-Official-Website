/**
 * 项目版本号（全站唯一真值源）。
 *
 * 与后端 app/core/config.py 的 PROJECT_VERSION 必须保持一致；
 * 升级版本时前后端两处常量同步修改，页脚 / /setting 底部等展示点读取本常量，
 * 禁止在别处硬编码版本字符串。
 */
export const APP_VERSION = "v0.5.0";
