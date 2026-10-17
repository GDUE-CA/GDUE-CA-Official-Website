/**
 * 自定义安全问题内容黑名单过滤（V0.5.8 前端侧，镜像 backend/app/core/security_question_filter.py）
 *
 * 前后端双重拦截：前端提交前即时提示；最终判定以后端为准。
 * 返回 i18n 文案 key（命中时），未命中返回 null。
 */

// 个人敏感信息：模式匹配（命中即拒绝）
const PRIVACY_PATTERNS: RegExp[] = [
  /1[3-9]\d{9}/, // 手机号
  /\d{17}[\dXx]/, // 身份证号
  /(?<!\d)\d{16,19}(?!\d)/, // 银行卡号
  /(?<![A-Za-z0-9])[EGPegp]\d{8}(?!\d)/, // 护照等证件编号
  /\d{4}[-/年]\s?\d{1,2}[-/月]\s?\d{1,2}日?/, // 生日等日期
];

// 个人敏感信息：关键词（问题语义指向隐私）
const PRIVACY_KEYWORDS: string[] = [
  "身份证", "护照", "港澳通行证", "台胞证", "驾驶证", "驾照",
  "银行卡", "信用卡", "社保卡", "医保卡", "公积金",
  "学号", "工号", "学籍号", "考生号", "准考证",
  "手机号", "电话号码", "联系电话",
  "生日", "出生日期", "出生年月",
  "户籍", "户口", "家庭住址", "家庭地址",
  "id card", "passport", "social security", "credit card",
  "bank card", "phone number", "date of birth",
];

// 敏感政治 / 历史 / 争议内容：关键词
const SENSITIVE_KEYWORDS: string[] = [
  "纳粹", "nazi", "希特勒", "hitler", "法西斯", "fascist",
  "恐怖主义", "terrorist", "terrorism", "圣战", "jihad",
  "种族灭绝", "genocide",
  "台独", "港独", "藏独", "疆独", "分裂国家",
  "台湾独立", "香港独立", "两个中国", "一中一台",
  "两岸问题", "武统",
  "南京大屠杀", "慰安妇", "靖国神社", "七三一",
  "反共", "反华", "颠覆", "颜色革命",
];

/**
 * 检查自定义安全问题文本是否命中黑名单。
 * 返回 i18n key：privacy → auth.securityQuestions.blacklistPrivacy；
 * sensitive → auth.securityQuestions.blacklistSensitive；未命中返回 null。
 */
export function checkSecurityQuestionText(text: string): "privacy" | "sensitive" | null {
  if (!text) return null;
  const lowered = text.toLowerCase();
  for (const re of PRIVACY_PATTERNS) {
    if (re.test(text)) return "privacy";
  }
  for (const kw of PRIVACY_KEYWORDS) {
    if (lowered.includes(kw.toLowerCase())) return "privacy";
  }
  for (const kw of SENSITIVE_KEYWORDS) {
    if (lowered.includes(kw.toLowerCase())) return "sensitive";
  }
  return null;
}
