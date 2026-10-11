/**
 * 强口令策略（与后端 app/core/password_policy.py 保持一致的基础规则）
 *
 * 前端只做即时提示；常见弱口令、连续序列、包含用户名等完整校验以后端为准。
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 64;

/** 统计包含的字符类别数：大写 / 小写 / 数字 / 特殊字符 */
export function passwordClassCount(pwd: string): number {
  return [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pwd)).length;
}

/** 是否满足基础强口令规则 */
export function meetsPasswordPolicy(pwd: string): boolean {
  return (
    pwd.length >= PASSWORD_MIN_LENGTH &&
    pwd.length <= PASSWORD_MAX_LENGTH &&
    !/\s/.test(pwd) &&
    passwordClassCount(pwd) >= 3
  );
}
