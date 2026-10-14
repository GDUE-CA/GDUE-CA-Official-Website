/**
 * 后端 API 实体类型定义
 *
 * 与后端 app/schemas/* 中的 Pydantic 模型一一对应。
 * 各 lib/api/* 模块从此处导入类型，避免类型散落在多个文件。
 */

/* ----------------------- Auth ----------------------- */

export interface LoginRequest {
  username: string;
  password: string;
  /** 记住此设备：空闲超时 30 分钟 → 30 天 */
  remember_device?: boolean;
}

/** 公开表单提交回执：只含回执码与提交时间，不回传任何个人信息 */
export interface SubmitReceipt {
  receipt_code: string;
  submitted_at: string;
}

/** 登录响应：凭据在 HttpOnly Cookie 中，响应体只含展示信息与轮换后的 CSRF 令牌 */
export interface LoginResponse {
  csrf_token: string;
  role: string;
  username: string;
  must_change_password: boolean;
  /** 实名验证状态：false 时 admin/editor 角色需先到 /realname 完成实名 */
  realname_verified: boolean;
  /** Break-Glass 应急账号会话（前端启用三层警告 UI / 初始化向导跳转） */
  is_break_glass: boolean;
  /** 系统尚未完成初始化（前端跳转 /admin/setup 初始化向导） */
  must_setup: boolean;
}

/** 公开注册（P0：强制 member，无角色字段） */
export interface RegisterRequest {
  username: string;
  display_name: string;
  password: string;
  confirm_password: string;
  email?: string;
  phone?: string;
}

export interface RegisterResponse {
  id: number;
  username: string;
  display_name: string | null;
  role: string;
}

/** 登录会话（设备管理） */
export interface LoginSessionInfo {
  id: number;
  device_name: string;
  device_model: string;
  user_agent: string;
  ip: string | null;
  remember_device: boolean;
  revoked: boolean;
  /** 带大写 Z 的 UTC ISO 字符串 */
  revoked_at: string | null;
  login_at: string;
  last_active_at: string;
  expires_at: string;
  /** 是否为当前设备 */
  is_current: boolean;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  student_id: string;
  real_name: string;
  phone: string;
  avatar_url: string | null;
  /** IANA 时区；null = 自动探测浏览器时区 */
  timezone: string | null;
  /** 模块级权限覆盖：模块名 → 允许动作列表；null = 全部使用角色默认（仅 super_admin 可写） */
  permission_overrides: Record<string, string[]> | null;
  /** 用户物理位置：国家 */
  country: string | null;
  /** 一级行政区（省/州） */
  region: string | null;
  /** 二级行政区（市/郡）；可为空 */
  locality: string | null;
  /** 国家代码（ISO 3166-1 alpha-2，如 CN）；null = 未设置 */
  country_code: string | null;
  /** 一级行政区代码（如 GD）；null = 未设置 */
  subdiv1_code: string | null;
  /** 二级行政区代码；null = 未设置 */
  subdiv2_code: string | null;
  /** 自由文本所在地（国家未收录行政区数据时使用）；null = 未设置 */
  locality_text: string | null;
  /** 显示昵称；null = 未设置（旧数据回退展示 username） */
  display_name?: string | null;
  /** 实名验证：未实名账号禁止进后台，仅可浏览前台 */
  realname_verified: boolean;
  realname_verified_at: string | null;
  realname_submitted_at: string | null;
  realname_note: string | null;
  /** Break-Glass 应急账号（/api/auth/me 合成响应；前端启用三层警告 + setup 跳转） */
  is_break_glass?: boolean;
  /** 系统尚未完成初始化（BG 会话前端跳转初始化向导用） */
  must_setup?: boolean;
  // ---- 区域格式（只存编码 / 模式字符串，不存展示文本） ----
  /** 主日历：gregorian / chinese / japanese / buddhist */
  primary_calendar?: string;
  /** 第二附加日历；null = 关闭 */
  secondary_calendar?: string | null;
  /** 一周起始日：sunday / monday / tuesday */
  week_first_day?: string;
  /** 短日期格式模式 */
  date_short_pattern?: string;
  /** 长日期格式模式 */
  date_long_pattern?: string;
  /** 短时间格式模式（12/24 小时） */
  time_short_pattern?: string;
  /** 长时间格式模式（带秒） */
  time_long_pattern?: string;
  /** 本地化系统：用户个人偏好（NULL = 跟随系统全局 sys_default_*） */
  locale?: string | null;
  region_code?: string | null;
  currency?: string | null;
  // ---- 个人资料扩展字段（Phase 规格补齐） ----
  /** 性别：male / female / hidden；null = 未设置 */
  gender?: string | null;
  /** 生日（带 Z 后缀 UTC ISO）；null = 未设置 */
  birthday?: string | null;
  /** 个性签名 / 简介 */
  bio?: string | null;
  /** 主题预设：default / apple / festival:*；null = 跟随系统默认 */
  theme?: string | null;
  /** 隐私设置：{"gender":"public|private","bio":"public|private","birthday":"public|private"}；region 永久公开不在此 JSON */
  profile_privacy?: Record<string, string> | null;
  created_at: string;
}

export interface ProfileUpdate {
  username?: string;
  real_name?: string;
  phone?: string;
  student_id?: string;
  /** IANA 时区；空字符串 = 恢复自动探测 */
  timezone?: string;
  /** 国家；空字符串 = 清空 */
  country?: string;
  /** 一级行政区（省/州）；空字符串 = 清空 */
  region?: string;
  /** 二级行政区（市/郡）；空字符串 = 清空 */
  locality?: string;
  /** 国家代码（ISO 3166-1 alpha-2）；空字符串 = 清空 */
  country_code?: string | null;
  /** 一级行政区代码；空字符串 = 清空 */
  subdiv1_code?: string | null;
  /** 二级行政区代码；空字符串 = 清空 */
  subdiv2_code?: string | null;
  /** 自由文本所在地；空字符串 = 清空 */
  locality_text?: string | null;
  /** 显示昵称 */
  display_name?: string;
  // ---- 区域格式（只存编码 / 模式字符串） ----
  primary_calendar?: string;
  secondary_calendar?: string | null;
  week_first_day?: string;
  date_short_pattern?: string;
  date_long_pattern?: string;
  time_short_pattern?: string;
  time_long_pattern?: string;
  /** 本地化系统：空字符串 = 恢复跟随系统（存 NULL）；不传 = 不修改 */
  locale?: string;
  region_code?: string;
  currency?: string;
  // ---- 个人资料扩展字段 ----
  /** 性别：male / female / hidden；空字符串 = 清空；不传 = 不修改 */
  gender?: string;
  /** 生日 ISO 字符串；传入则规范化为 UTC naive；不传 = 不修改 */
  birthday?: string;
  /** 个性签名；空字符串 = 清空 */
  bio?: string;
  /** 主题预设：default / apple / festival:*；空字符串 = 跟随系统默认 */
  theme?: string;
  /** 隐私设置；传入 dict 则合并更新；显式传 null = 重置为默认 */
  profile_privacy?: Record<string, string> | null;
}

export interface AvatarUploadOut {
  avatar_url: string;
}

/** 用户公开个人主页信息（GET /api/users/{username}/profile）：隐私过滤后 */
export interface UserProfile {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  /** 个性签名；privacy=private 时为 null */
  bio: string | null;
  /** 性别；privacy=private 或显式 hidden 时为 null */
  gender: string | null;
  /** 生日；privacy=private 时为 null */
  birthday: string | null;
  // ---- 地区字段（永久公开，硬性约束） ----
  country: string | null;
  region: string | null;
  locality: string | null;
  country_code: string | null;
  subdiv1_code: string | null;
  subdiv2_code: string | null;
  locality_text: string | null;
  created_at: string;
}

/** 博客指标操作结果（POST /api/blog/{slug}/{share|like|unlike|favourite|unfavourite}） */
export interface BlogMetricOut {
  like_count: number;
  comment_count: number;
  share_count: number;
  favourite_count: number;
}

/** 单个 IP 的访问来源聚合（后台概览） */
export interface IpSourceStat {
  ip: string;
  /** loopback=本机 / internal=内网 / public=公网(地区未知) / invalid=无法解析 */
  region: string;
  total: number;
  admin_actions: number;
  registrations: number;
  bugs: number;
  /** 带大写 Z 的 UTC ISO 字符串 */
  last_seen: string | null;
  /** GeoIP 可读属地（查不到为 null，前端显示「未知」） */
  location_zh: string | null;
  location_en: string | null;
}

/** 访问来源统计（后台概览） */
export interface AccessStats {
  total_events: number;
  unique_ips: number;
  top_ips: IpSourceStat[];
}

/** 仪表盘聚合（GET /api/admin-stats/overview）：首屏待办计数 */
export interface AdminOverview {
  activities_total: number;
  registrations_total: number;
  registrations_pending: number;
  bugs_open: number;
  resets_pending: number;
}

export interface ChangePasswordRequest {
  old_password: string;
  new_password: string;
}

export interface ForgotPasswordRequest {
  contact_email: string;
  username_hint?: string;
  reason: string;
}

export interface PasswordResetItem {
  id: number;
  contact_email: string;
  username_hint: string | null;
  reason: string;
  status: string;
  admin_note: string | null;
  handled_at: string | null;
  created_at: string;
}

export interface SecurityQuestionOut {
  question: string;
}

export interface SecurityAnswerRequest {
  answer: string;
  new_password: string;
}

export interface SecurityQuestionUpdate {
  question: string;
  answer: string;
}

/** 创建管理员账号（仅 super_admin） */
export interface UserCreatePayload {
  username: string;
  email: string;
  password: string;
  role: AdminRole;
  student_id: string;
  real_name: string;
  phone: string;
}

/** 账号角色：super_admin / admin / editor 可进入后台；member 为普通成员（无后台权限） */
export type AdminRole = "super_admin" | "admin" | "editor" | "member";

/** 更新账号信息：自己可改基础资料，super_admin 额外可改 role/is_active */
export interface UserUpdatePayload {
  username?: string;
  real_name?: string;
  student_id?: string;
  phone?: string;
  role?: AdminRole;
  is_active?: boolean;
  /** 模块级权限覆盖（仅 super_admin 可写；空对象 = 清除覆盖恢复默认） */
  permission_overrides?: Record<string, string[]> | null;
}

/* ----------------------- 翻译 / 回执查询 ----------------------- */

/** 批量翻译请求项 */
export interface TranslationItem {
  key: string;
  text: string;
  source_lang?: string;
}

/** 单条翻译结果 */
export interface TranslationResult {
  text: string;
  source_lang: string;
  translated: boolean;
}

/** 批量翻译响应 */
export interface BatchTranslateResponse {
  translations: Record<string, TranslationResult>;
}

/** 回执码公开查询结果（不含个人隐私字段） */
export interface ReceiptQueryResult {
  receipt_code: string;
  type: "activity" | "club" | "bug";
  activity_title: string | null;
  status: string;
  submitted_at: string;
  checkin_open: boolean;
  checked_in_at: string | null;
}

/* ----------------------- Activity ----------------------- */

export type ActivityStatus =
  | "draft"
  | "published"
  | "registration_open"
  | "ended"
  | "archived";

/**
 * 后端实时计算的业务状态（P0：不存库，按当前 UTC 时间实时算出）。
 * pre_register 预报名 / registration_open 报名中 / upcoming 即将进行 /
 * ongoing 进行中 / ended 已结束；draft/archived 为特殊回退态。
 */
export type RuntimeStatus =
  | "pre_register"
  | "registration_open"
  | "upcoming"
  | "ongoing"
  | "ended"
  | "draft"
  | "archived";

export interface Activity {
  id: number;
  title: string;
  /** 前台展示标识（历史数据迁移自 markdown slug；空 = 未设置） */
  slug: string | null;
  /** 列表短描述（前台活动列表 / 首页近期活动栏目展示） */
  description: string;
  content: string;
  category: string | null;
  status: ActivityStatus;
  register_start: string | null;
  register_end: string | null;
  /** 活动开始时间（Phase 3：发布活动时双必填） */
  start_at: string | null;
  /** 活动结束时间（Phase 3：发布活动时双必填） */
  end_at: string | null;
  max_participants: number;
  /** 实际参与人数（历史活动统计值；null = 未统计） */
  participants: number | null;
  cover_url: string | null;
  checkin_open: boolean;
  /** 一键报名人数（activity_enrols 实时计数） */
  enrolled_count: number;
  /** 当前登录用户是否已报名（游客恒为 false；列表/详情接口实时返回） */
  enrolled: boolean;
  /** 后端实时业务状态（五态 + draft/archived 回退；不存库） */
  runtime_status: RuntimeStatus | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityCreate {
  title: string;
  slug?: string;
  description?: string;
  content: string;
  category?: string;
  status?: ActivityStatus;
  register_start?: string;
  register_end?: string;
  start_at?: string;
  end_at?: string;
  max_participants?: number;
  participants?: number | null;
  cover_url?: string;
}

/* ----------------------- Registration ----------------------- */

export type RegistrationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "checked_in";

export type RegistrationType = "activity" | "club";

/** 报名来源：form=公开表单提交 / manual=管理员后台手动补录 */
export type RegistrationSource = "form" | "manual";

export interface Registration {
  id: number;
  receipt_code: string;
  content_lang: string;
  registration_type: RegistrationType;
  source: RegistrationSource;
  activity_id: number | null;
  name: string;
  student_id: string;
  college: string;
  major: string;
  phone_cc: string;
  phone_number: string;
  email: string | null;
  position: string | null;
  introduction: string | null;
  status: RegistrationStatus;
  remark: string | null;
  submit_ip: string | null;
  checked_in_at: string | null;
  submitted_at: string;
}

export interface RegistrationCreate {
  name: string;
  student_id: string;
  college: string;
  major: string;
  phone_cc: string;
  phone_number: string;
  email?: string;
  position?: string;
  introduction?: string;
}

/** 管理员手动补录报名（POST /api/registrations/admin/manual） */
export interface ManualRegistrationCreate extends RegistrationCreate {
  registration_type: RegistrationType;
  /** 活动报名必填；社团报名忽略 */
  activity_id?: number;
  /** 默认 approved；补录场景通常直接通过 */
  status?: RegistrationStatus;
  /** 补录原因等备注，写入 remark */
  remark?: string;
}

/* ----------------------- Bug Report ----------------------- */

export interface BugReport {
  id: number;
  receipt_code: string;
  content_lang: string;
  contact_email: string | null;
  contact_phone: string | null;
  description: string;
  extra: string | null;
  resolved: boolean;
  submit_ip: string | null;
  created_at: string;
}

export interface BugReportCreate {
  contact_email?: string;
  contact_phone?: string;
  description: string;
  extra?: string;
}

/* ----------------------- System Settings ----------------------- */

/** 公开站点信息（GET /api/system/settings，访客可读） */
export type PublicSystemSettings = Pick<
  SystemSettings,
  "site_name" | "footer" | "icp_info" | "club_checkin_open" |
  "sys_default_locale" | "sys_default_timezone" | "sys_default_region" | "sys_default_currency"
>;

/** 完整系统配置（GET /api/system/settings/admin，需 admin） */
export interface SystemSettings {
  site_name: string;
  footer: string | null;
  icp_info: string | null;
  ip_blacklist: string[];
  allowed_hosts: string[];
  cors_origins: string[];
  club_checkin_open: boolean;
  /** 本地化系统全局默认（用户字段 NULL 时回退此处） */
  sys_default_locale: string | null;
  sys_default_timezone: string | null;
  sys_default_region: string | null;
  sys_default_currency: string | null;
  /** 后端服务端口（参考值，实际生效需运维重载 Nginx） */
  network_port: number;
  /** 后端监听 IP（参考值） */
  network_listen_ip: string;
  /** 站点绑定域名列表（参考值） */
  network_domains: string[];
  /** 管理员可信来源 IP 白名单（Web 配置，优先于环境变量 ADMIN_TRUSTED_IPS；空 = 未配置） */
  admin_trusted_ips: string[];
  /** 全局登录会话空闲超时（分钟）；预设值 [1,2,5,10,15,20,30,60,120] */
  session_idle_timeout_minutes: number;
}

/** 网络配置变更历史条目 */
export interface NetworkConfigHistory {
  id: number;
  config_snapshot: {
    network_port: number;
    network_listen_ip: string;
    network_domains: string[];
  };
  change_summary: string | null;
  user_id: number | null;
  ip: string | null;
  /** 带大写 Z 的 UTC ISO 字符串 */
  created_at: string | null;
}

/* ===================== CMS 扩展类型骨架（Phase 1 预定义） ===================== */
/* 各模块的 Create/Update/Out 变体在实现对应 API 时细化；此处先建共用骨架。 */

/** 通用分页响应（后端 utils/crud.paginate 返回结构） */
export interface Paginated<T> {
  total: number;
  items: T[];
  page: number;
  page_size: number;
}

/* ---------- 公告（Phase 3） ---------- */
export type AnnouncementCategory = "homepage" | "home";

export interface Announcement {
  id: number;
  title: string;
  content: string;
  link: string | null;
  start_at: string | null;
  end_at: string | null;
  enabled: boolean;
  priority: number;
  category: AnnouncementCategory;
  created_by: number | null;
  created_at: string;
}

export interface AnnouncementCreate {
  title: string;
  content: string;
  link?: string;
  start_at?: string;
  end_at?: string;
  enabled?: boolean;
  priority?: number;
  category?: AnnouncementCategory;
}

export type AnnouncementUpdate = Partial<AnnouncementCreate>;

/* ---------- 用户信息通知（通知列表 / 已读状态） ---------- */
export interface NotificationItem {
  id: number;
  title: string;
  content: string;
  link: string | null;
  /** 发布时间：后端原始 UTC-Z 字符串，由客户端组件本地化渲染 */
  published_at: string;
  is_read: boolean;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  unread_count: number;
}

export interface MarkReadResponse {
  unread_count: number;
}

/* ---------- 内容块（Phase 3 社团介绍等） ---------- */
export interface ContentBlock {
  id: number;
  key: string;
  title: string | null;
  body_md: string;
  /** 后端模型 updated_by 不直接返回；保持可选兼容 */
  updated_by?: number | null;
  updated_at: string | null;
}

export interface ContentBlockUpdate {
  title?: string;
  body_md: string;
}

/* ---------- 成员（Phase 3） ---------- */
export type MemberTerm = "current" | "former";

export interface Member {
  id: number;
  name: string;
  role_title: string;
  term: MemberTerm;
  bio: string | null;
  avatar_url: string | null;
  display_order: number;
  archived: boolean;
  created_at: string;
  gender: string | null;
  grade: string | null;
  department: string | null;
  major_class: string | null;
  // 仅管理端返回
  phone?: string | null;
  wechat?: string | null;
  political_status?: string | null;
  is_intl_student?: boolean;
}

export interface MemberCreate {
  name: string;
  role_title?: string;
  term?: MemberTerm;
  bio?: string;
  avatar_url?: string;
  display_order?: number;
  archived?: boolean;
  gender?: string;
  grade?: string;
  department?: string;
  major_class?: string;
  phone?: string;
  wechat?: string;
  political_status?: string;
  is_intl_student?: boolean;
}

export interface MemberUpdate {
  name?: string;
  role_title?: string;
  term?: MemberTerm;
  bio?: string;
  avatar_url?: string;
  display_order?: number;
  archived?: boolean;
  gender?: string;
  grade?: string;
  department?: string;
  major_class?: string;
  phone?: string;
  wechat?: string;
  political_status?: string;
  is_intl_student?: boolean;
}

export interface MemberImportError {
  row: number;
  name: string;
  reason: string;
}

export interface MemberImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: MemberImportError[];
}

/* ---------- 招新信息（Phase 3） ---------- */
export interface RecruitmentInfo {
  id: number;
  title: string;
  content: string;
  target_dept: string | null;
  start_at: string | null;
  end_at: string | null;
  enabled: boolean;
  created_at: string;
}

export interface RecruitmentInfoCreate {
  title: string;
  content: string;
  target_dept?: string;
  start_at?: string;
  end_at?: string;
  enabled?: boolean;
}

export type RecruitmentInfoUpdate = Partial<RecruitmentInfoCreate>;

/* ---------- 博客（Phase 4） ---------- */
export type BlogPostStatus = "draft" | "published" | "scheduled" | "archived";

export interface BlogTag {
  id: number;
  name: string;
  slug: string;
  created_at: string;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  content_md: string;
  content_html: string;
  excerpt: string | null;
  cover_url: string | null;
  status: BlogPostStatus;
  published_at: string | null;
  scheduled_at: string | null;
  author_id: number | null;
  /** 作者用户名（后端序列化自 author 关系） */
  author: string | null;
  allow_comments: boolean;
  tags: BlogTag[];
  // ---- 4 项统计指标（冗余计数，前端列表/详情展示） ----
  like_count: number;
  comment_count: number;
  share_count: number;
  favourite_count: number;
  created_at: string;
  updated_at: string;
}

export interface BlogPostCreate {
  title: string;
  slug?: string;
  content_md: string;
  excerpt?: string;
  cover_url?: string;
  status?: BlogPostStatus;
  scheduled_at?: string;
  allow_comments?: boolean;
  tag_ids?: number[];
}

export type BlogPostUpdate = Partial<BlogPostCreate>;

export interface BlogTagCreate {
  name: string;
  slug?: string;
}

/* ---------- 评论（Phase 5） ---------- */
/**
 * 评论状态标签（后端按 is_deleted + is_hidden 派生）：
 * - normal: 正常可见
 * - user_deleted: 用户自删（is_deleted=true）
 * - admin_hidden: 管理员屏蔽（is_hidden=true）
 * - user_deleted_and_admin_hidden: 用户删 + 管理员屏蔽
 */
export type CommentStatusLabel =
  | "normal"
  | "user_deleted"
  | "admin_hidden"
  | "user_deleted_and_admin_hidden";

/** 公开评论（GET /api/blog/{id}/comments）：不返回完整 IP，只返回属地 */
export interface CommentPublic {
  id: number;
  post_id: number;
  author_name: string;
  content: string;
  /** IP 属地中文（ip2region）；"local"/"intranet" 为特殊枚举 */
  location_zh: string | null;
  /** IP 属地英文（GeoLite2） */
  location_en: string | null;
  created_at: string;
}

/** 公开评论列表响应：allowed 表示当前是否可提交（双开关判定） */
export interface CommentListResponse extends Paginated<CommentPublic> {
  allowed: boolean;
}

/** 后台评论（GET /api/admin/comments）：含完整 IP + 双布尔状态 + 状态标签 + 所属文章标题 */
export interface CommentAdmin {
  id: number;
  post_id: number;
  author_name: string;
  content: string;
  submit_ip: string | null;
  location_zh: string | null;
  location_en: string | null;
  /** 用户自删标记（公开列表不可见，后台留存） */
  is_deleted: boolean;
  /** 管理员屏蔽标记（公开列表不可见，后台留存） */
  is_hidden: boolean;
  /** 状态标签 key（前端 i18n 渲染） */
  status_label: CommentStatusLabel;
  created_at: string;
  deleted_at: string | null;
  post_title: string | null;
}

export interface CommentCreate {
  author_name: string;
  content: string;
}

/** 评论全局开关（GET/PUT /api/admin/comments/settings） */
export interface CommentSettings {
  comments_enabled: boolean;
}

/* ---------- 媒体文件（Phase 3/7） ---------- */
export type MediaCategory = "avatar" | "blog" | "cover" | "member" | "misc";

export interface MediaFile {
  id: number;
  filename: string;
  original_name: string;
  mime: string;
  size: number;
  storage_path: string;
  uploader_id: number | null;
  /** 列表接口回填的上传者用户名 */
  uploader_name: string | null;
  category: MediaCategory;
  created_at: string;
}

/* ---------- 操作日志（Phase 7） ---------- */
export interface AuditLogInfo {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  target: string | null;
  detail: string | null;
  ip: string | null;
  trace_id: string | null;
  created_at: string;
}

/* ---------- 数据统计（Phase 7） ---------- */
/** 活动报名统计快照（含活动名，GET /api/admin/stats/activities） */
export interface ActivityStatRow extends ActivityStatistics {
  activity_name: string;
}

/** 活动实时报名计数（GET /api/admin/stats/activities/live） */
export interface ActivityLiveStatRow {
  activity_id: number;
  activity_name: string;
  status: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  checked_in: number;
}

/** 招新统计分组计数 */
export interface RecruitmentGroupStat {
  key: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

/** 招新统计（GET /api/admin/stats/recruitment） */
export interface RecruitmentStats {
  total: number;
  by_position: RecruitmentGroupStat[];
  by_college: RecruitmentGroupStat[];
  by_status: RecruitmentGroupStat[];
}

/* ---------- IP 规则（Phase 2） ---------- */
export type IpRuleType = "whitelist" | "blacklist";

export interface IpRule {
  id: number;
  type: IpRuleType;
  rule: string;
  label: string | null;
  reason: string | null;
  /** null = 永久封禁/永久信任 */
  expires_at: string | null;
  /** 白名单可选：绑定账号实现可信 IP 自动登录 */
  bound_user_id: number | null;
  created_by: number | null;
  created_at: string;
}

export interface IpRuleCreate {
  type: IpRuleType;
  rule: string;
  label?: string;
  reason?: string;
  expires_at?: string;
  bound_user_id?: number;
}

/** 当前 IP 的封禁状态（GET /api/security/ban-status） */
export interface BanStatus {
  banned: boolean;
  reason: string | null;
  /** null = 永久封禁 */
  expires_at: string | null;
  permanent: boolean;
}

/** 网络配置（GET/PUT /api/security/network，仅含网络 3 字段） */
export interface NetworkConfig {
  network_port: number;
  network_listen_ip: string;
  network_domains: string[];
}

/* ---------- 第三方登录（Phase 6，对齐后端 schemas/oauth.py） ---------- */
export type OAuthProvider = "github" | "microsoft" | "apple" | "google";

/** 公开渠道开关（登录页显隐按钮，不含凭据） */
export interface OAuthChannelBrief {
  provider: OAuthProvider;
  enabled: boolean;
}

/** 后台渠道配置输出（secret 永不回传明文，仅展示脱敏掩码） */
export interface OAuthChannel {
  provider: OAuthProvider;
  enabled: boolean;
  client_id: string | null;
  has_secret: boolean;
  secret_masked: string | null;
  redirect_uri: string | null;
  updated_at: string | null;
}

/** 渠道配置更新：client_secret 传明文重新加密保存，空串=清除；"***" 占位不覆盖 */
export interface OAuthChannelUpdate {
  enabled?: boolean;
  client_id?: string;
  client_secret?: string;
  redirect_uri?: string;
}

/** 补资料页读取的第三方预填信息（来自 HttpOnly 票据 Cookie） */
export interface PendingOAuthProfile {
  provider: OAuthProvider;
  email: string | null;
  name: string | null;
  avatar: string | null;
}

/** 补资料请求：用户名手动自定义（禁用第三方昵称） */
export interface OAuthCompleteRequest {
  username: string;
  student_id: string;
  real_name: string;
  phone_cc: string;
  phone_number: string;
}

/* ---------- SSO 受信应用（Phase 6，对齐后端 schemas/sso.py） ---------- */
export interface SsoClient {
  id: number;
  client_id: string;
  name: string;
  redirect_uris: string[];
  is_active: boolean;
  created_at: string;
  /** 仅创建 / 重置 secret 响应中一次性返回明文 */
  secret: string | null;
}

export interface SsoClientCreate {
  name: string;
  redirect_uris: string[];
}

export interface SsoClientUpdate {
  name?: string;
  redirect_uris?: string[];
  is_active?: boolean;
}

/* ---------- 实名验证（Phase 6，对齐后端 schemas/realname.py） ---------- */
export type RealnameStatus = "pending" | "approved" | "rejected";

export interface RealnameRequest {
  id: number;
  user_id: number;
  username: string | null;
  student_id: string;
  real_name: string;
  /** 区号+号码（后端拼接存储） */
  phone: string;
  evidence_url: string | null;
  status: RealnameStatus;
  /** 拒绝原因 */
  note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  /** 申请者当前实名状态（重复提交边界展示） */
  user_realname_verified: boolean | null;
}

/** 用户端实名状态：当前账号实名状态 + 最近一次申请 */
export interface RealnameStatusOut {
  verified: boolean;
  verified_at: string | null;
  latest: RealnameRequest | null;
}

/** 提交实名申请 */
export interface RealnameSubmit {
  student_id: string;
  real_name: string;
  phone_cc: string;
  phone_number: string;
  evidence_url?: string;
}

/** 凭证上传响应 */
export interface EvidenceUploadOut {
  url: string;
}

/* ---------- 活动统计快照（Phase 3） ---------- */
export interface ActivityStatistics {
  activity_id: number;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  checked_in: number;
  generated_at: string;
}

/* ---------- 访问日志（Phase 7） ---------- */
export interface VisitLog {
  id: number;
  ip_hash: string;
  path: string;
  country: string | null;
  region: string | null;
  source: string | null;
  created_at: string;
}

/* ========== Phase 8: Memo 碎片笔记 ==========
 * 业务边界：与 Blog（正式长文）、Document（协作文档）、Activity 并列独立；
 * 三张数据表（memo / blog_post / document）不可互相替代。
 * 全局标签池与 Blog（兼容历史 BlogTag）/ Document / Activity 共享。
 */

/** 可见性枚举：public 全体可见；member_only 已登录可见；private 仅作者可见 */
export type MemoVisibility = "public" | "member_only" | "private";

/** 全站共享标签池 */
export interface MemoTagOut {
  id: number;
  name: string;
  slug: string;
  /** 使用该标签的模块列表（memo/document/activity 等） */
  scopes: string[];
  created_at: string;
}

/** 标签 + 关联 memo 数 */
export interface MemoTagWithCount extends MemoTagOut {
  memo_count: number;
}

/** Memo 作者摘要 */
export interface MemoAuthorBrief {
  id: number;
  username: string;
  avatar_url: string | null;
}

/** Memo 附件 */
export interface MemoAttachmentOut {
  id: number;
  url: string;
  original_name: string | null;
  mime: string;
  size: number;
  /** image = 内联渲染图片；file = 仅下载链接 */
  kind: "image" | "file";
  created_at: string;
}

/** Memo 详情 */
export interface MemoOut {
  id: number;
  content_md: string;
  content_html: string;
  archived: boolean;
  visibility: MemoVisibility;
  /** 公开分享 slug：null = 未生成 */
  share_slug: string | null;
  like_count: number;
  favorite_count: number;
  comment_count: number;
  /** 转发/分享次数（仅计数器，不存储分享者身份） */
  share_count: number;
  author: MemoAuthorBrief | null;
  tags: MemoTagOut[];
  attachments: MemoAttachmentOut[];
  liked_by_me: boolean;
  favorited_by_me: boolean;
  admin_removed: boolean;
  created_at: string;
  updated_at: string;
}

/** Memo 时间线列表项 */
export interface MemoBriefOut {
  id: number;
  excerpt: string;
  visibility: MemoVisibility;
  archived: boolean;
  like_count: number;
  favorite_count: number;
  comment_count: number;
  /** 转发/分享次数（仅计数器，不存储分享者身份） */
  share_count: number;
  has_image: boolean;
  first_image_url: string | null;
  author: MemoAuthorBrief | null;
  tags: MemoTagOut[];
  liked_by_me: boolean;
  favorited_by_me: boolean;
  created_at: string;
  updated_at: string;
}

/** Memo 版本快照列表项 */
export interface MemoVersionBriefOut {
  id: number;
  memo_id: number;
  version_no: number;
  edit_note: string | null;
  editor: MemoAuthorBrief | null;
  visibility: MemoVisibility;
  created_at: string;
}

/** Memo 版本完整（带原文） */
export interface MemoVersionOut extends MemoVersionBriefOut {
  content_md: string;
}

/** 创建 Memo 入参 */
export interface MemoCreate {
  content_md: string;
  visibility?: MemoVisibility;
  /** 标签名列表（懒创建）；同名复用；scopes 自动追加 MEMO */
  tag_names?: string[];
  /** 已上传的附件 URL 列表（/uploads/memos/...） */
  attachment_urls?: string[];
}

/** 创建 Memo 响应：id + 首版本号 + 本次新增的标签名（前端可提示） */
export interface MemoCreateOut {
  id: number;
  version_no: number;
  new_tags: string[];
}

/** 编辑 Memo 入参 */
export interface MemoUpdate {
  content_md?: string;
  visibility?: MemoVisibility;
  tag_names?: string[];
  attachment_urls?: string[];
  /** 编辑原因：写进 memo_versions.edit_note */
  edit_note?: string;
}

/** 回滚 Memo 入参 */
export interface MemoRollback {
  target_version_no: number;
  /** 必填：写明回滚原因（写入 edit_note） */
  edit_note: string;
}

/** 点赞 / 收藏统一响应：状态 + 最新计数 */
export interface MemoInteractionOut {
  liked: boolean;
  favorited: boolean;
  like_count: number;
  favorite_count: number;
}

/** 公开分享链接响应 */
export interface MemoShareOut {
  share_slug: string;
  share_url: string;
  visibility: MemoVisibility;
}

/** 全文检索 hit */
export interface MemoSearchHit {
  memo: MemoBriefOut;
  snippet: string;
  matched_keywords: string[];
}

/** 全文检索响应 */
export interface MemoSearchResponse {
  total: number;
  items: MemoSearchHit[];
}

/** 通用分页响应 */
export interface PaginatedResponse<T> {
  total: number;
  items: T[];
  page: number;
  page_size: number;
}

/** 标签下的 Memo 列表响应（额外带 slug） */
export interface TagMemosResponse extends PaginatedResponse<MemoBriefOut> {
  // 复用 query path，避免重复
}

/* ---------- 项目展示 CMS（Phase 9，对齐后端 schemas/project.py） ---------- */
export type ProjectStatus = "draft" | "published" | "archived";

export interface Project {
  id: number;
  title: string;
  slug: string;
  description: string;
  /** 技术栈标签数组（如 ["Next.js", "React"]） */
  tech_stack: string[];
  github_url: string | null;
  demo_url: string | null;
  /** 截图 URL 数组 */
  screenshots: string[];
  /** 完成年份 */
  year: number;
  /** 项目负责人（展示名） */
  leader: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  /** 仅详情（ProjectOut）返回；列表项不含正文 */
  content_md?: string;
}

export interface ProjectCreate {
  title: string;
  /** 不填则后端按 project-{id} 自动生成 */
  slug?: string;
  description?: string;
  tech_stack?: string[];
  github_url?: string;
  demo_url?: string;
  screenshots?: string[];
  year: number;
  leader?: string;
  content_md: string;
  status?: ProjectStatus;
}

export type ProjectUpdate = Partial<ProjectCreate>;

/* ---------- 界面主题（对齐后端 schemas/theme.py） ---------- */
export type ThemeLayout = "microsoft" | "apple";

export interface Theme {
  id: number;
  /** 主题唯一 key（小写字母开头 + 小写字母/数字/连字符），User.theme 引用此值 */
  key: string;
  name: string;
  layout: ThemeLayout;
  /** 亮色 CSS 变量包（{"--background": "60 9% 97.8%"}） */
  css_vars: Record<string, string>;
  /** 暗色 CSS 变量包；null = 沿用基础暗色变量 */
  dark_vars: Record<string, string> | null;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ThemeCreate {
  key: string;
  name: string;
  layout?: ThemeLayout;
  css_vars?: Record<string, string>;
  dark_vars?: Record<string, string> | null;
  enabled?: boolean;
  sort_order?: number;
}

export type ThemeUpdate = Partial<Omit<ThemeCreate, "key">>;

/** 前台活动展示形状（由 Activity 映射而来，见 lib/api/activities.ts 的 mapActivityToClubEvent） */
export interface ClubEvent {
  /** 活动数字 id（详情页 / 报名接口用） */
  id: number;
  slug: string;
  title: string;
  type: "lecture" | "competition" | "recruitment" | "workshop";
  /** YYYY-MM-DD（活动开始日期） */
  date: string;
  description: string;
  participants: number;
  images: string[];
  content: string;
  /** 后端持久化状态 */
  status: ActivityStatus;
  /** 一键报名人数 */
  enrolled_count: number;
  /** 当前用户是否已报名（游客 false；列表数据为 ISR 缓存值，报名交互以 EnrolButton 实时拉取为准） */
  enrolled: boolean;
  /** 后端实时业务状态（预报名/报名中/即将进行/进行中/已结束） */
  runtime_status: RuntimeStatus | null;
}

/* ----------------------- Geo（国家/行政区划） ----------------------- */

/** 国家/地区（GET /api/geo/countries；CN/HK/MO/TW 置顶） */
export interface GeoCountry {
  /** ISO 3166-1 alpha-2 代码 */
  iso2: string;
  /** 中文显示名 */
  display_name_zh: string;
  /** 官方名称 */
  official_name: string;
  /** 英文名 */
  name_en: string;
  /** 国际电话区号（不含 +，如 "86"） */
  dial_code: string;
}

/** 行政区划条目（一级，含下级） */
export interface GeoSubdivisionItem {
  code: string;
  name_zh: string;
  name_en: string;
  /** 二级行政区划 */
  children: {
    code: string;
    name_zh: string;
    name_en: string;
  }[];
}

/** 行政区划查询响应（GET /api/geo/subdivisions?country={iso2}） */
export interface SubdivisionsResponse {
  /** 是否存在二级行政区划 */
  has_second_level: boolean;
  /** 一级行政区划列表；未收录国家为空数组（前端转自由文本） */
  items: GeoSubdivisionItem[];
}

/* ===================== Break-Glass + 系统初始化 =====================
 * 对齐后端 app/api/system_init.py + app/api/security.py (admin_router) + app/api/audit.py (bg_router)
 * BG 凭据永不入业务库，只从环境变量读；会话只存布尔标记 is_break_glass。
 */

/** 系统初始化状态（GET /api/system-init/status，公开接口） */
export interface SystemInitStatus {
  system_initialized: boolean;
  default_locale: string | null;
  default_timezone: string | null;
  default_region: string | null;
  default_currency: string | null;
}

/** BG 密码强度校验请求（POST /api/system-init/break-glass/verify-password） */
export interface BGPasswordVerifyRequest {
  password: string;
  confirm_password: string;
}

/** BG 密码哈希生成结果（POST /api/system-init/break-glass/password-hash） */
export interface BGPasswordHashResult {
  hash: string;
  warning: string;
}

/** 首位业务超级管理员（初始化向导步骤 3） */
export interface FirstAdminPayload {
  username: string;
  display_name: string;
  email: string;
  password: string;
}

/** 系统初始化提交请求（POST /api/system-init/initialize） */
export interface SystemInitRequest {
  default_locale: string;
  default_timezone: string;
  default_region: string;
  default_currency: string;
  admin: FirstAdminPayload;
}

/** 初始化完成响应 */
export interface SystemInitResult {
  initialized: boolean;
}

/* ---------- 登录防爆破封禁面板 ---------- */

/** 封禁条目（GET /api/admin/security/bans，对齐后端 BanOut） */
export interface BanEntry {
  policy: "break_glass" | "normal";
  account: string;
  account_label: string;
  dim: "IP" | "BrowserFingerprint";
  dim_value: string;
  stage: number;
  banned_at: string;
  /** null = 永久封禁 */
  until: string | null;
  permanent: boolean;
  last_fail_at: string;
  ip: string | null;
}

/** 封禁重置请求（POST /api/admin/security/bans/reset） */
export interface BanResetRequest {
  policy: "break_glass" | "normal";
  account: string;
  dim: "IP" | "BrowserFingerprint";
  dim_value: string;
}

/** BG 高危操作确认请求（POST /api/audit/bg-confirm） */
export interface BGConfirmRequest {
  action: string;
  target?: string | null;
  confirmed: boolean;
}

/* ===================== /setting 账号自服务（/api/account） ===================== */

/** 深浅色模式 */
export type ColorScheme = "light" | "dark" | "system";

/** 界面显示偏好（GET/PUT /api/account/display） */
export interface DisplayPreference {
  theme_name: string | null;
  color_scheme: ColorScheme;
  font_scale: number;
  enable_landscape: boolean;
  updated_at?: string | null;
}

export type DisplayPreferenceUpdate = Partial<
  Pick<
    DisplayPreference,
    "theme_name" | "color_scheme" | "font_scale" | "enable_landscape"
  >
>;

/** 通知偏好（GET/PUT /api/account/notifications；安全项只读且恒 true） */
export interface NotificationPreference {
  content_liked: boolean;
  content_commented: boolean;
  content_replied: boolean;
  biz_task_assigned: boolean;
  biz_task_changed: boolean;
  biz_announcement: boolean;
  security_new_device: boolean;
  security_credential_change: boolean;
  security_notice_locked: boolean;
  updated_at?: string | null;
}

export type NotificationPreferenceUpdate = Partial<
  Pick<
    NotificationPreference,
    | "content_liked"
    | "content_commented"
    | "content_replied"
    | "biz_task_assigned"
    | "biz_task_changed"
    | "biz_announcement"
  >
>;

/** 黑名单条目（GET /api/account/blocks） */
export interface BlockedUser {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  blocked_at: string;
}

/** 拉黑搜索候选用户（GET /api/account/blocks/search） */
export interface BlockCandidate {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

/** 第三方 OAuth 授权记录（GET /api/account/oauth-grants） */
export interface OAuthGrant {
  id: number;
  provider: OAuthProvider;
  created_at: string;
}
