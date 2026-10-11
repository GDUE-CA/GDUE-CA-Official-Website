"""地区与行政区数据源（后端唯一真值源）。

- COUNTRIES：全部 ISO-3166-1 主权国家 + 特殊属地（对齐微软账号地区清单）。
- SUBDIVISIONS：部分国家的层级行政区树（CN/HK/MO/TW/GB/US/JP/KR/...）。
- 所有名称（name_zh / name_en）由后端维护；前端仅根据 code 查表渲染，
  保证 i18n 多语言切换时行政区显示名字自动更新。
- 未收录的国家 → has_second_level=False, items=[]，前端降级为自由文本输入。
"""
from __future__ import annotations

from typing import NamedTuple


class Country(NamedTuple):
    iso2: str
    name_zh: str
    official_name: str
    name_en: str
    dial_code: str


# 置顶顺序：中国大陆、中国香港、中国澳门、中国台湾，其余按 name_en 字母序
_PINNED = ("CN", "HK", "MO", "TW")

COUNTRIES: list[Country] = [
    Country("CN", "中国大陆", "中华人民共和国", "China", "86"),
    Country("HK", "中国香港", "中华人民共和国香港特别行政区", "Hong Kong", "852"),
    Country("MO", "中国澳门", "中华人民共和国澳门特别行政区", "Macao", "853"),
    Country("TW", "中国台湾", "中华人民共和国台湾省", "Taiwan", "886"),
    Country("AF", "阿富汗", "阿富汗伊斯兰酋长国", "Afghanistan", "93"),
    Country("AL", "阿尔巴尼亚", "阿尔巴尼亚共和国", "Albania", "355"),
    Country("DZ", "阿尔及利亚", "阿尔及利亚民主人民共和国", "Algeria", "213"),
    Country("AS", "美属萨摩亚", "美属萨摩亚", "American Samoa", "1684"),
    Country("AD", "安道尔", "安道尔公国", "Andorra", "376"),
    Country("AO", "安哥拉", "安哥拉共和国", "Angola", "244"),
    Country("AI", "安圭拉", "安圭拉", "Anguilla", "1264"),
    Country("AQ", "南极洲", "Antarctica", "Antarctica", ""),
    Country("AG", "安提瓜和巴布达", "安提瓜和巴布达", "Antigua and Barbuda", "1268"),
    Country("AR", "阿根廷", "阿根廷共和国", "Argentina", "54"),
    Country("AM", "亚美尼亚", "亚美尼亚共和国", "Armenia", "374"),
    Country("AW", "阿鲁巴", "阿鲁巴", "Aruba", "297"),
    Country("AU", "澳大利亚", "澳大利亚联邦", "Australia", "61"),
    Country("AT", "奥地利", "奥地利共和国", "Austria", "43"),
    Country("AZ", "阿塞拜疆", "阿塞拜疆共和国", "Azerbaijan", "994"),
    Country("BS", "巴哈马", "巴哈马联邦", "Bahamas", "1242"),
    Country("BH", "巴林", "巴林王国", "Bahrain", "973"),
    Country("BD", "孟加拉国", "孟加拉人民共和国", "Bangladesh", "880"),
    Country("BB", "巴巴多斯", "巴巴多斯", "Barbados", "1246"),
    Country("BY", "白俄罗斯", "白俄罗斯共和国", "Belarus", "375"),
    Country("BE", "比利时", "比利时王国", "Belgium", "32"),
    Country("BZ", "伯利兹", "伯利兹", "Belize", "501"),
    Country("BJ", "贝宁", "贝宁共和国", "Benin", "229"),
    Country("BM", "百慕大", "百慕大", "Bermuda", "1441"),
    Country("BT", "不丹", "不丹王国", "Bhutan", "975"),
    Country("BO", "玻利维亚", "玻利维亚多民族国", "Bolivia", "591"),
    Country("BQ", "荷兰加勒比区", "博奈尔、圣尤斯特歇斯和萨巴", "Bonaire", "Sint Eustatius and Saba,5997"),
    Country("BA", "波斯尼亚和黑塞哥维那", "波黑", "Bosnia and Herzegovina", "387"),
    Country("BW", "博茨瓦纳", "博茨瓦纳共和国", "Botswana", "267"),
    Country("BV", "布维岛", "布维岛", "Bouvet Island", ""),
    Country("BR", "巴西", "巴西联邦共和国", "Brazil", "55"),
    Country("IO", "英属印度洋领地", "英属印度洋领地", "British Indian Ocean Territory", "246"),
    Country("BN", "文莱", "文莱达鲁萨兰国", "Brunei Darussalam", "673"),
    Country("BG", "保加利亚", "保加利亚共和国", "Bulgaria", "359"),
    Country("BF", "布基纳法索", "布基纳法索", "Burkina Faso", "226"),
    Country("BI", "布隆迪", "布隆迪共和国", "Burundi", "257"),
    Country("CV", "佛得角", "佛得角共和国", "Cabo Verde", "238"),
    Country("KH", "柬埔寨", "柬埔寨王国", "Cambodia", "855"),
    Country("CM", "喀麦隆", "喀麦隆共和国", "Cameroon", "237"),
    Country("CA", "加拿大", "加拿大", "Canada", "1"),
    Country("KY", "开曼群岛", "开曼群岛", "Cayman Islands", "1345"),
    Country("CF", "中非共和国", "中非共和国", "Central African Republic", "236"),
    Country("TD", "乍得", "乍得共和国", "Chad", "235"),
    Country("CL", "智利", "智利共和国", "Chile", "56"),
    Country("CO", "哥伦比亚", "哥伦比亚共和国", "Colombia", "57"),
    Country("KM", "科摩罗", "科摩罗联盟", "Comoros", "269"),
    Country("CG", "刚果", "刚果共和国", "Congo", "242"),
    Country("CD", "刚果（金）", "刚果民主共和国", "Congo (Democratic Republic)", "243"),
    Country("CK", "库克群岛", "库克群岛", "Cook Islands", "682"),
    Country("CR", "哥斯达黎加", "哥斯达黎加共和国", "Costa Rica", "506"),
    Country("HR", "克罗地亚", "克罗地亚共和国", "Croatia", "385"),
    Country("CU", "古巴", "古巴共和国", "Cuba", "53"),
    Country("CW", "库拉索", "库拉索", "Curaçao", "5999"),
    Country("CY", "塞浦路斯", "塞浦路斯共和国", "Cyprus", "357"),
    Country("CZ", "捷克", "捷克共和国", "Czechia", "420"),
    Country("CI", "科特迪瓦", "科特迪瓦共和国", "Côte d'Ivoire", "225"),
    Country("DK", "丹麦", "丹麦王国", "Denmark", "45"),
    Country("DJ", "吉布提", "吉布提共和国", "Djibouti", "253"),
    Country("DM", "多米尼克", "多米尼克国", "Dominica", "1767"),
    Country("DO", "多米尼加共和国", "多米尼加共和国", "Dominican Republic", "1809"),
    Country("EC", "厄瓜多尔", "厄瓜多尔共和国", "Ecuador", "593"),
    Country("EG", "埃及", "阿拉伯埃及共和国", "Egypt", "20"),
    Country("SV", "萨尔瓦多", "萨尔瓦多共和国", "El Salvador", "503"),
    Country("GQ", "赤道几内亚", "赤道几内亚共和国", "Equatorial Guinea", "240"),
    Country("ER", "厄立特里亚", "厄立特里亚国", "Eritrea", "291"),
    Country("EE", "爱沙尼亚", "爱沙尼亚共和国", "Estonia", "372"),
    Country("SZ", "斯威士兰", "斯威士兰王国", "Eswatini", "268"),
    Country("ET", "埃塞俄比亚", "埃塞俄比亚联邦民主共和国", "Ethiopia", "251"),
    Country("FK", "福克兰群岛", "福克兰群岛（马尔维纳斯）", "Falkland Islands (Malvinas)", "500"),
    Country("FO", "法罗群岛", "法罗群岛", "Faroe Islands", "298"),
    Country("FJ", "斐济", "斐济共和国", "Fiji", "679"),
    Country("FI", "芬兰", "芬兰共和国", "Finland", "358"),
    Country("FR", "法国", "法兰西共和国", "France", "33"),
    Country("GF", "法属圭亚那", "法属圭亚那", "French Guiana", "594"),
    Country("PF", "法属波利尼西亚", "法属波利尼西亚", "French Polynesia", "689"),
    Country("TF", "法属南部领地", "法属南部领地", "French Southern Territories", ""),
    Country("GA", "加蓬", "加蓬共和国", "Gabon", "241"),
    Country("GM", "冈比亚", "冈比亚共和国", "Gambia", "220"),
    Country("GE", "格鲁吉亚", "格鲁吉亚", "Georgia", "995"),
    Country("DE", "德国", "德意志联邦共和国", "Germany", "49"),
    Country("GH", "加纳", "加纳共和国", "Ghana", "233"),
    Country("GI", "直布罗陀", "直布罗陀", "Gibraltar", "350"),
    Country("GR", "希腊", "希腊共和国", "Greece", "30"),
    Country("GL", "格陵兰", "格陵兰", "Greenland", "299"),
    Country("GD", "格林纳达", "格林纳达", "Grenada", "1473"),
    Country("GP", "瓜德罗普", "瓜德罗普", "Guadeloupe", "590"),
    Country("GU", "关岛", "关岛", "Guam", "1671"),
    Country("GT", "危地马拉", "危地马拉共和国", "Guatemala", "502"),
    Country("GG", "根西岛", "根西岛", "Guernsey", "441481"),
    Country("GN", "几内亚", "几内亚共和国", "Guinea", "224"),
    Country("GW", "几内亚比绍", "几内亚比绍共和国", "Guinea-Bissau", "245"),
    Country("GY", "圭亚那", "圭亚那合作共和国", "Guyana", "592"),
    Country("HT", "海地", "海地共和国", "Haiti", "509"),
    Country("HM", "赫德岛和麦克唐纳群岛", "赫德岛和麦克唐纳群岛", "Heard Island and McDonald Islands", ""),
    Country("VA", "梵蒂冈", "梵蒂冈城国", "Holy See", "3906698"),
    Country("HN", "洪都拉斯", "洪都拉斯共和国", "Honduras", "504"),
    Country("HU", "匈牙利", "匈牙利", "Hungary", "36"),
    Country("IS", "冰岛", "冰岛共和国", "Iceland", "354"),
    Country("IN", "印度", "印度共和国", "India", "91"),
    Country("ID", "印度尼西亚", "印度尼西亚共和国", "Indonesia", "62"),
    Country("IR", "伊朗", "伊朗伊斯兰共和国", "Iran", "98"),
    Country("IQ", "伊拉克", "伊拉克共和国", "Iraq", "964"),
    Country("IE", "爱尔兰", "爱尔兰", "Ireland", "353"),
    Country("IM", "马恩岛", "马恩岛", "Isle of Man", "441624"),
    Country("IL", "以色列", "以色列国", "Israel", "972"),
    Country("IT", "意大利", "意大利共和国", "Italy", "39"),
    Country("JM", "牙买加", "牙买加", "Jamaica", "1876"),
    Country("JP", "日本", "日本国", "Japan", "81"),
    Country("JE", "泽西岛", "泽西岛", "Jersey", "441534"),
    Country("JO", "约旦", "约旦哈希姆王国", "Jordan", "962"),
    Country("KZ", "哈萨克斯坦", "哈萨克斯坦共和国", "Kazakhstan", "76"),
    Country("KE", "肯尼亚", "肯尼亚共和国", "Kenya", "254"),
    Country("KI", "基里巴斯", "基里巴斯共和国", "Kiribati", "686"),
    Country("KW", "科威特", "科威特国", "Kuwait", "965"),
    Country("KG", "吉尔吉斯斯坦", "吉尔吉斯共和国", "Kyrgyzstan", "996"),
    Country("LA", "老挝", "老挝人民民主共和国", "Laos", "856"),
    Country("LV", "拉脱维亚", "拉脱维亚共和国", "Latvia", "371"),
    Country("LB", "黎巴嫩", "黎巴嫩共和国", "Lebanon", "961"),
    Country("LS", "莱索托", "莱索托王国", "Lesotho", "266"),
    Country("LR", "利比里亚", "利比里亚共和国", "Liberia", "231"),
    Country("LY", "利比亚", "利比亚国", "Libya", "218"),
    Country("LI", "列支敦士登", "列支敦士登公国", "Liechtenstein", "423"),
    Country("LT", "立陶宛", "立陶宛共和国", "Lithuania", "370"),
    Country("LU", "卢森堡", "卢森堡大公国", "Luxembourg", "352"),
    Country("MG", "马达加斯加", "马达加斯加共和国", "Madagascar", "261"),
    Country("MW", "马拉维", "马拉维共和国", "Malawi", "265"),
    Country("MY", "马来西亚", "马来西亚", "Malaysia", "60"),
    Country("MV", "马尔代夫", "马尔代夫共和国", "Maldives", "960"),
    Country("ML", "马里", "马里共和国", "Mali", "223"),
    Country("MT", "马耳他", "马耳他共和国", "Malta", "356"),
    Country("MH", "马绍尔群岛", "马绍尔群岛共和国", "Marshall Islands", "692"),
    Country("MQ", "马提尼克", "马提尼克", "Martinique", "596"),
    Country("MR", "毛里塔尼亚", "毛里塔尼亚伊斯兰共和国", "Mauritania", "222"),
    Country("MU", "毛里求斯", "毛里求斯共和国", "Mauritius", "230"),
    Country("YT", "马约特", "马约特", "Mayotte", "262"),
    Country("MX", "墨西哥", "墨西哥合众国", "Mexico", "52"),
    Country("FM", "密克罗尼西亚", "密克罗尼西亚联邦", "Micronesia", "691"),
    Country("MD", "摩尔多瓦", "摩尔多瓦共和国", "Moldova", "373"),
    Country("MC", "摩纳哥", "摩纳哥公国", "Monaco", "377"),
    Country("MN", "蒙古", "蒙古国", "Mongolia", "976"),
    Country("ME", "黑山", "黑山", "Montenegro", "382"),
    Country("MS", "蒙特塞拉特", "蒙特塞拉特", "Montserrat", "1664"),
    Country("MA", "摩洛哥", "摩洛哥王国", "Morocco", "212"),
    Country("MZ", "莫桑比克", "莫桑比克共和国", "Mozambique", "258"),
    Country("MM", "缅甸", "缅甸联邦共和国", "Myanmar", "95"),
    Country("NA", "纳米比亚", "纳米比亚共和国", "Namibia", "264"),
    Country("NR", "瑙鲁", "瑙鲁共和国", "Nauru", "674"),
    Country("NP", "尼泊尔", "尼泊尔联邦民主共和国", "Nepal", "977"),
    Country("NL", "荷兰", "荷兰王国", "Netherlands", "31"),
    Country("NC", "新喀里多尼亚", "新喀里多尼亚", "New Caledonia", "687"),
    Country("NZ", "新西兰", "新西兰", "New Zealand", "64"),
    Country("NI", "尼加拉瓜", "尼加拉瓜共和国", "Nicaragua", "505"),
    Country("NE", "尼日尔", "尼日尔共和国", "Niger", "227"),
    Country("NG", "尼日利亚", "尼日利亚联邦共和国", "Nigeria", "234"),
    Country("NU", "纽埃", "纽埃", "Niue", "683"),
    Country("NF", "诺福克岛", "诺福克岛", "Norfolk Island", "6723"),
    Country("KP", "朝鲜", "朝鲜民主主义人民共和国", "North Korea", "850"),
    Country("MK", "北马其顿", "北马其顿共和国", "North Macedonia", "389"),
    Country("MP", "北马里亚纳群岛", "北马里亚纳群岛联邦", "Northern Mariana Islands", "1670"),
    Country("NO", "挪威", "挪威王国", "Norway", "47"),
    Country("OM", "阿曼", "阿曼苏丹国", "Oman", "968"),
    Country("PK", "巴基斯坦", "巴基斯坦伊斯兰共和国", "Pakistan", "92"),
    Country("PW", "帕劳", "帕劳共和国", "Palau", "680"),
    Country("PS", "巴勒斯坦", "巴勒斯坦国", "Palestine", "970"),
    Country("PA", "巴拿马", "巴拿马共和国", "Panama", "507"),
    Country("PG", "巴布亚新几内亚", "巴布亚新几内亚独立国", "Papua New Guinea", "675"),
    Country("PY", "巴拉圭", "巴拉圭共和国", "Paraguay", "595"),
    Country("PE", "秘鲁", "秘鲁共和国", "Peru", "51"),
    Country("PH", "菲律宾", "菲律宾共和国", "Philippines", "63"),
    Country("PN", "皮特凯恩群岛", "皮特凯恩群岛", "Pitcairn", "64"),
    Country("PL", "波兰", "波兰共和国", "Poland", "48"),
    Country("PT", "葡萄牙", "葡萄牙共和国", "Portugal", "351"),
    Country("PR", "波多黎各", "波多黎各", "Puerto Rico", "1787"),
    Country("QA", "卡塔尔", "卡塔尔国", "Qatar", "974"),
    Country("RO", "罗马尼亚", "罗马尼亚", "Romania", "40"),
    Country("RU", "俄罗斯", "俄罗斯联邦", "Russia", "7"),
    Country("RW", "卢旺达", "卢旺达共和国", "Rwanda", "250"),
    Country("RE", "留尼汪", "留尼汪", "Réunion", "262"),
    Country("BL", "圣巴泰勒米", "圣巴泰勒米", "Saint Barthélemy", "59059"),
    Country("SH", "圣赫勒拿", "圣赫勒拿", "Saint Helena", "290"),
    Country("KN", "圣基茨和尼维斯", "圣基茨和尼维斯联邦", "Saint Kitts and Nevis", "1869"),
    Country("LC", "圣卢西亚", "圣卢西亚", "Saint Lucia", "1758"),
    Country("MF", "圣马丁（法属）", "圣马丁（法属）", "Saint Martin (French part)", "59059"),
    Country("PM", "圣皮埃尔和密克隆", "圣皮埃尔和密克隆", "Saint Pierre and Miquelon", "508"),
    Country("VC", "圣文森特和格林纳丁斯", "圣文森特和格林纳丁斯", "Saint Vincent and the Grenadines", "1784"),
    Country("WS", "萨摩亚", "萨摩亚独立国", "Samoa", "685"),
    Country("SM", "圣马力诺", "圣马力诺共和国", "San Marino", "378"),
    Country("ST", "圣多美和普林西比", "圣多美和普林西比民主共和国", "Sao Tome and Principe", "239"),
    Country("SA", "沙特阿拉伯", "沙特阿拉伯王国", "Saudi Arabia", "966"),
    Country("SN", "塞内加尔", "塞内加尔共和国", "Senegal", "221"),
    Country("RS", "塞尔维亚", "塞尔维亚共和国", "Serbia", "381"),
    Country("SC", "塞舌尔", "塞舌尔共和国", "Seychelles", "248"),
    Country("SL", "塞拉利昂", "塞拉利昂共和国", "Sierra Leone", "232"),
    Country("SG", "新加坡", "新加坡共和国", "Singapore", "65"),
    Country("SX", "圣马丁（荷属）", "圣马丁（荷属）", "Sint Maarten (Dutch part)", "1721"),
    Country("SK", "斯洛伐克", "斯洛伐克共和国", "Slovakia", "421"),
    Country("SI", "斯洛文尼亚", "斯洛文尼亚共和国", "Slovenia", "386"),
    Country("SB", "所罗门群岛", "所罗门群岛", "Solomon Islands", "677"),
    Country("SO", "索马里", "索马里联邦共和国", "Somalia", "252"),
    Country("ZA", "南非", "南非共和国", "South Africa", "27"),
    Country("GS", "南乔治亚和南桑威奇群岛", "南乔治亚和南桑威奇群岛", "South Georgia and the South Sandwich Islands", "500"),
    Country("KR", "韩国", "大韩民国", "South Korea", "82"),
    Country("SS", "南苏丹", "南苏丹共和国", "South Sudan", "211"),
    Country("ES", "西班牙", "西班牙王国", "Spain", "34"),
    Country("LK", "斯里兰卡", "斯里兰卡民主社会主义共和国", "Sri Lanka", "94"),
    Country("SD", "苏丹", "苏丹共和国", "Sudan", "249"),
    Country("SR", "苏里南", "苏里南共和国", "Suriname", "597"),
    Country("SJ", "斯瓦尔巴和扬马延", "斯瓦尔巴和扬马延", "Svalbard and Jan Mayen", "4779"),
    Country("SE", "瑞典", "瑞典王国", "Sweden", "46"),
    Country("CH", "瑞士", "瑞士联邦", "Switzerland", "41"),
    Country("SY", "叙利亚", "阿拉伯叙利亚共和国", "Syria", "963"),
    Country("TJ", "塔吉克斯坦", "塔吉克斯坦共和国", "Tajikistan", "992"),
    Country("TZ", "坦桑尼亚", "坦桑尼亚联合共和国", "Tanzania", "255"),
    Country("TH", "泰国", "泰王国", "Thailand", "66"),
    Country("TL", "东帝汶", "东帝汶民主共和国", "Timor-Leste", "670"),
    Country("TG", "多哥", "多哥共和国", "Togo", "228"),
    Country("TK", "托克劳", "托克劳", "Tokelau", "690"),
    Country("TO", "汤加", "汤加王国", "Tonga", "676"),
    Country("TT", "特立尼达和多巴哥", "特立尼达和多巴哥共和国", "Trinidad and Tobago", "1868"),
    Country("TN", "突尼斯", "突尼斯共和国", "Tunisia", "216"),
    Country("TM", "土库曼斯坦", "土库曼斯坦", "Turkmenistan", "993"),
    Country("TC", "特克斯和凯科斯群岛", "特克斯和凯科斯群岛", "Turks and Caicos Islands", "1649"),
    Country("TV", "图瓦卢", "图瓦卢", "Tuvalu", "688"),
    Country("TR", "土耳其", "土耳其共和国", "Türkiye", "90"),
    Country("UG", "乌干达", "乌干达共和国", "Uganda", "256"),
    Country("UA", "乌克兰", "乌克兰", "Ukraine", "380"),
    Country("AE", "阿联酋", "阿拉伯联合酋长国", "United Arab Emirates", "971"),
    Country("GB", "英国", "大不列颠及北爱尔兰联合王国", "United Kingdom", "44"),
    Country("US", "美国", "美利坚合众国", "United States", "1"),
    Country("UM", "美国本土外小岛屿", "美国本土外小岛屿", "United States Minor Outlying Islands", "1"),
    Country("UY", "乌拉圭", "乌拉圭东岸共和国", "Uruguay", "598"),
    Country("UZ", "乌兹别克斯坦", "乌兹别克斯坦共和国", "Uzbekistan", "998"),
    Country("VU", "瓦努阿图", "瓦努阿图共和国", "Vanuatu", "678"),
    Country("VE", "委内瑞拉", "委内瑞拉玻利瓦尔共和国", "Venezuela", "58"),
    Country("VN", "越南", "越南社会主义共和国", "Vietnam", "84"),
    Country("VG", "英属维尔京群岛", "英属维尔京群岛", "Virgin Islands (British)", "1284"),
    Country("VI", "美属维尔京群岛", "美属维尔京群岛", "Virgin Islands (U.S.)", "1340"),
    Country("WF", "瓦利斯和富图纳", "瓦利斯和富图纳", "Wallis and Futuna", "681"),
    Country("EH", "西撒哈拉", "阿拉伯撒哈拉民主共和国", "Western Sahara", "212"),
    Country("YE", "也门", "也门共和国", "Yemen", "967"),
    Country("ZM", "赞比亚", "赞比亚共和国", "Zambia", "260"),
    Country("ZW", "津巴布韦", "津巴布韦共和国", "Zimbabwe", "263"),
    Country("AX", "奥兰群岛", "奥兰群岛", "Åland Islands", "35818"),

]


def get_countries() -> list[dict]:
    """返回面向前端的国家列表（CN/HK/MO/TW 置顶）。"""
    return [
        {
            "iso2": c.iso2,
            "display_name_zh": c.name_zh,
            "official_name": c.official_name,
            "name_en": c.name_en,
            "dial_code": c.dial_code,
        }
        for c in COUNTRIES
    ]


def get_country(iso2: str) -> Country | None:
    return next((c for c in COUNTRIES if c.iso2 == iso2), None)


def _build_subdivisions():
    """层级行政区树。结构：{iso2: (has_second_level, items)}
    items: [{code, name_zh, name_en, children: [{code,name_zh,name_en}]}]
    """
    sd: dict[str, tuple[bool, list]] = {}

    # ---------- 中国大陆：省(34) → 市 ----------
    cn_provinces = [
        ("CN-11", "北京市", "Beijing", ["北京市"]),
        ("CN-12", "天津市", "Tianjin", ["天津市"]),
        ("CN-13", "河北省", "Hebei", ["石家庄市", "唐山市", "秦皇岛市", "邯郸市", "邢台市", "保定市", "张家口市", "承德市", "沧州市", "廊坊市", "衡水市"]),
        ("CN-14", "山西省", "Shanxi", ["太原市", "大同市", "阳泉市", "长治市", "晋城市", "朔州市", "晋中市", "运城市", "忻州市", "临汾市", "吕梁市"]),
        ("CN-15", "内蒙古自治区", "Inner Mongolia", ["呼和浩特市", "包头市", "乌海市", "赤峰市", "通辽市", "鄂尔多斯市", "呼伦贝尔市", "巴彦淖尔市", "乌兰察布市"]),
        ("CN-21", "辽宁省", "Liaoning", ["沈阳市", "大连市", "鞍山市", "抚顺市", "本溪市", "丹东市", "锦州市", "营口市", "阜新市", "辽阳市", "盘锦市", "铁岭市", "朝阳市", "葫芦岛市"]),
        ("CN-22", "吉林省", "Jilin", ["长春市", "吉林市", "四平市", "辽源市", "通化市", "白山市", "松原市", "白城市"]),
        ("CN-23", "黑龙江省", "Heilongjiang", ["哈尔滨市", "齐齐哈尔市", "鸡西市", "鹤岗市", "双鸭山市", "大庆市", "伊春市", "佳木斯市", "七台河市", "牡丹江市", "黑河市", "绥化市"]),
        ("CN-31", "上海市", "Shanghai", ["上海市"]),
        ("CN-32", "江苏省", "Jiangsu", ["南京市", "无锡市", "徐州市", "常州市", "苏州市", "南通市", "连云港市", "淮安市", "盐城市", "扬州市", "镇江市", "泰州市", "宿迁市"]),
        ("CN-33", "浙江省", "Zhejiang", ["杭州市", "宁波市", "温州市", "嘉兴市", "湖州市", "绍兴市", "金华市", "衢州市", "舟山市", "台州市", "丽水市"]),
        ("CN-34", "安徽省", "Anhui", ["合肥市", "芜湖市", "蚌埠市", "淮南市", "马鞍山市", "淮北市", "铜陵市", "安庆市", "黄山市", "滁州市", "阜阳市", "宿州市", "六安市", "亳州市", "池州市", "宣城市"]),
        ("CN-35", "福建省", "Fujian", ["福州市", "厦门市", "莆田市", "三明市", "泉州市", "漳州市", "南平市", "龙岩市", "宁德市"]),
        ("CN-36", "江西省", "Jiangxi", ["南昌市", "景德镇市", "萍乡市", "九江市", "新余市", "鹰潭市", "赣州市", "吉安市", "宜春市", "抚州市", "上饶市"]),
        ("CN-37", "山东省", "Shandong", ["济南市", "青岛市", "淄博市", "枣庄市", "东营市", "烟台市", "潍坊市", "济宁市", "泰安市", "威海市", "日照市", "临沂市", "德州市", "聊城市", "滨州市", "菏泽市"]),
        ("CN-41", "河南省", "Henan", ["郑州市", "开封市", "洛阳市", "平顶山市", "安阳市", "鹤壁市", "新乡市", "焦作市", "濮阳市", "许昌市", "漯河市", "三门峡市", "南阳市", "商丘市", "信阳市", "周口市", "驻马店市"]),
        ("CN-42", "湖北省", "Hubei", ["武汉市", "黄石市", "十堰市", "宜昌市", "襄阳市", "鄂州市", "荆门市", "孝感市", "荆州市", "黄冈市", "咸宁市", "随州市"]),
        ("CN-43", "湖南省", "Hunan", ["长沙市", "株洲市", "湘潭市", "衡阳市", "邵阳市", "岳阳市", "常德市", "张家界市", "益阳市", "郴州市", "永州市", "怀化市", "娄底市"]),
        ("CN-44", "广东省", "Guangdong", ["广州市", "韶关市", "深圳市", "珠海市", "汕头市", "佛山市", "江门市", "湛江市", "茂名市", "肇庆市", "惠州市", "梅州市", "汕尾市", "河源市", "阳江市", "清远市", "东莞市", "中山市", "潮州市", "揭阳市", "云浮市"]),
        ("CN-45", "广西壮族自治区", "Guangxi", ["南宁市", "柳州市", "桂林市", "梧州市", "北海市", "防城港市", "钦州市", "贵港市", "玉林市", "百色市", "贺州市", "河池市", "来宾市", "崇左市"]),
        ("CN-46", "海南省", "Hainan", ["海口市", "三亚市", "三沙市", "儋州市"]),
        ("CN-50", "重庆市", "Chongqing", ["重庆市"]),
        ("CN-51", "四川省", "Sichuan", ["成都市", "自贡市", "攀枝花市", "泸州市", "德阳市", "绵阳市", "广元市", "遂宁市", "内江市", "乐山市", "南充市", "眉山市", "宜宾市", "广安市", "达州市", "雅安市", "巴中市", "资阳市"]),
        ("CN-52", "贵州省", "Guizhou", ["贵阳市", "六盘水市", "遵义市", "安顺市", "毕节市", "铜仁市"]),
        ("CN-53", "云南省", "Yunnan", ["昆明市", "曲靖市", "玉溪市", "保山市", "昭通市", "丽江市", "普洱市", "临沧市"]),
        ("CN-54", "西藏自治区", "Tibet", ["拉萨市", "日喀则市", "昌都市", "林芝市", "山南市", "那曲市", "阿里地区"]),
        ("CN-61", "陕西省", "Shaanxi", ["西安市", "铜川市", "宝鸡市", "咸阳市", "渭南市", "延安市", "汉中市", "榆林市", "安康市", "商洛市"]),
        ("CN-62", "甘肃省", "Gansu", ["兰州市", "嘉峪关市", "金昌市", "白银市", "天水市", "武威市", "张掖市", "平凉市", "酒泉市", "庆阳市", "定西市", "陇南市"]),
        ("CN-63", "青海省", "Qinghai", ["西宁市", "海东市"]),
        ("CN-64", "宁夏回族自治区", "Ningxia", ["银川市", "石嘴山市", "吴忠市", "固原市", "中卫市"]),
        ("CN-65", "新疆维吾尔自治区", "Xinjiang", ["乌鲁木齐市", "克拉玛依市", "吐鲁番市", "哈密市"]),
    ]
    cn_items = []
    for pcode, pzh, pen, cities in cn_provinces:
        cn_items.append({
            "code": pcode, "name_zh": pzh, "name_en": pen,
            "children": [
                {"code": f"{pcode}-{i+1:02d}", "name_zh": c, "name_en": c}
                for i, c in enumerate(cities)
            ],
        })
    sd["CN"] = (True, cn_items)

    # ---------- 中国香港：18 区（无二级） ----------
    hk_districts = ["中西区", "湾仔区", "东区", "南区", "油尖旺区", "深水埗区", "九龙城区", "黄大仙区",
                    "观塘区", "葵青区", "荃湾区", "屯门区", "元朗区", "北区", "大埔区", "沙田区", "西贡区", "离岛区"]
    sd["HK"] = (False, [
        {"code": f"HK-{i+1:02d}", "name_zh": d, "name_en": d, "children": []}
        for i, d in enumerate(hk_districts)
    ])

    # ---------- 中国澳门：7 堂区 ----------
    mo_parishes = ["花地玛堂区", "花王堂区", "望德堂区", "大堂区", "风顺堂区", "嘉模堂区", "圣方济各堂区"]
    sd["MO"] = (False, [
        {"code": f"MO-{i+1:02d}", "name_zh": d, "name_en": d, "children": []}
        for i, d in enumerate(mo_parishes)
    ])

    # ---------- 中国台湾：22 县市 ----------
    tw_cities = ["台北市", "新北市", "桃园市", "台中市", "台南市", "高雄市", "基隆市", "新竹市",
                 "嘉义市", "新竹县", "苗栗县", "彰化县", "南投县", "云林县", "嘉义县", "屏东县",
                 "宜兰县", "花莲县", "台东县", "澎湖县", "金门县", "连江县"]
    sd["TW"] = (False, [
        {"code": f"TW-{i+1:02d}", "name_zh": d, "name_en": d, "children": []}
        for i, d in enumerate(tw_cities)
    ])

    # ---------- 英国：4 构成国 → 主要城市 ----------
    gb = [
        ("GB-ENG", "英格兰", "England", ["伦敦", "曼彻斯特", "伯明翰", "利兹", "利物浦", "布里斯托尔", "谢菲尔德", "纽卡斯尔", "诺丁汉", "莱斯特"]),
        ("GB-SCT", "苏格兰", "Scotland", ["爱丁堡", "格拉斯哥", "阿伯丁", "邓迪", "因弗内斯"]),
        ("GB-WLS", "威尔士", "Wales", ["加的夫", "斯旺西", "纽波特", "雷克瑟姆"]),
        ("GB-NIR", "北爱尔兰", "Northern Ireland", ["贝尔法斯特", "德里", "纽里", "阿兹"]),
    ]
    sd["GB"] = (True, [
        {"code": c, "name_zh": zh, "name_en": en,
         "children": [{"code": f"{c}-{i+1:02d}", "name_zh": city, "name_en": city} for i, city in enumerate(cities)]}
        for c, zh, en, cities in gb
    ])

    # ---------- 美国：50 州 + DC → 主要城市 ----------
    us_states = [
        ("US-AL", "阿拉巴马州", "Alabama", ["伯明翰", "蒙哥马利", "莫比尔", "亨茨维尔"]),
        ("US-AK", "阿拉斯加州", "Alaska", ["安克雷奇", "费尔班克斯", "朱诺"]),
        ("US-AZ", "亚利桑那州", "Arizona", ["菲尼克斯", "图森", "梅萨", "斯科茨代尔"]),
        ("US-AR", "阿肯色州", "Arkansas", ["小石城", "费耶特维尔", "史密斯堡"]),
        ("US-CA", "加利福尼亚州", "California", ["洛杉矶", "旧金山", "圣迭戈", "圣何塞", "萨克拉门托", "弗雷斯诺", "长滩", "奥克兰"]),
        ("US-CO", "科罗拉多州", "Colorado", ["丹佛", "科罗拉多斯普林斯", "奥罗拉", "博尔德"]),
        ("US-CT", "康涅狄格州", "Connecticut", ["布里奇波特", "纽黑文", "哈特福德", "斯坦福"]),
        ("US-DE", "特拉华州", "Delaware", ["威尔明顿", "多佛", "纽瓦克"]),
        ("US-FL", "佛罗里达州", "Florida", ["迈阿密", "奥兰多", "杰克逊维尔", "坦帕", "圣彼得堡"]),
        ("US-GA", "佐治亚州", "Georgia", ["亚特兰大", "萨凡纳", "奥古斯塔", "哥伦布"]),
        ("US-HI", "夏威夷州", "Hawaii", ["檀香山", "希洛", "凯卢阿"]),
        ("US-ID", "爱达荷州", "Idaho", ["博伊西", "南帕", "默里迪恩"]),
        ("US-IL", "伊利诺伊州", "Illinois", ["芝加哥", "奥罗拉", "罗克福德", "斯普林菲尔德"]),
        ("US-IN", "印第安纳州", "Indiana", ["印第安纳波利斯", "韦恩堡", "埃文斯维尔", "南本德"]),
        ("US-IA", "艾奥瓦州", "Iowa", ["得梅因", "锡达拉皮兹", "达文波特"]),
        ("US-KS", "堪萨斯州", "Kansas", ["威奇托", "欧弗兰帕克", "堪萨斯城"]),
        ("US-KY", "肯塔基州", "Kentucky", ["路易斯维尔", "列克星敦", "鲍灵格林"]),
        ("US-LA", "路易斯安那州", "Louisiana", ["新奥尔良", "巴吞鲁日", "什里夫波特"]),
        ("US-ME", "缅因州", "Maine", ["波特兰", "刘易斯顿", "班戈"]),
        ("US-MD", "马里兰州", "Maryland", ["巴尔的摩", "盖瑟斯堡", "罗克维尔"]),
        ("US-MA", "马萨诸塞州", "Massachusetts", ["波士顿", "伍斯特", "斯普林菲尔德", "剑桥"]),
        ("US-MI", "密歇根州", "Michigan", ["底特律", "大急流城", "沃伦", "安娜堡"]),
        ("US-MN", "明尼苏达州", "Minnesota", ["明尼阿波利斯", "圣保罗", "德卢斯"]),
        ("US-MS", "密西西比州", "Mississippi", ["杰克逊", "格尔夫波特", "南黑文"]),
        ("US-MO", "密苏里州", "Missouri", ["堪萨斯城", "圣路易斯", "斯普林菲尔德", "哥伦比亚"]),
        ("US-MT", "蒙大拿州", "Montana", ["比灵斯", "米苏拉", "大瀑布城"]),
        ("US-NE", "内布拉斯加州", "Nebraska", ["奥马哈", "林肯", "贝尔维尤"]),
        ("US-NV", "内华达州", "Nevada", ["拉斯维加斯", "里诺", "亨德森"]),
        ("US-NH", "新罕布什尔州", "New Hampshire", ["曼彻斯特", "纳舒厄", "康科德"]),
        ("US-NJ", "新泽西州", "New Jersey", ["纽瓦克", "泽西市", "特伦顿", "帕特森"]),
        ("US-NM", "新墨西哥州", "New Mexico", ["阿尔伯克基", "拉斯克鲁塞斯", "圣菲"]),
        ("US-NY", "纽约州", "New York", ["纽约", "布法罗", "罗切斯特", "锡拉丘兹", "奥尔巴尼"]),
        ("US-NC", "北卡罗来纳州", "North Carolina", ["夏洛特", "罗利", "格林斯伯勒", "达勒姆"]),
        ("US-ND", "北达科他州", "North Dakota", ["法戈", "俾斯麦", "大福克斯"]),
        ("US-OH", "俄亥俄州", "Ohio", ["哥伦布", "克利夫兰", "辛辛那提", "托莱多", "阿克伦"]),
        ("US-OK", "俄克拉何马州", "Oklahoma", ["俄克拉何马城", "塔尔萨", "诺曼"]),
        ("US-OR", "俄勒冈州", "Oregon", ["波特兰", "塞勒姆", "尤金", "格雷欣"]),
        ("US-PA", "宾夕法尼亚州", "Pennsylvania", ["费城", "匹兹堡", "阿伦敦", "哈里斯堡"]),
        ("US-RI", "罗得岛州", "Rhode Island", ["普罗维登斯", "沃里克", "克兰斯顿"]),
        ("US-SC", "南卡罗来纳州", "South Carolina", ["查尔斯顿", "哥伦比亚", "北查尔斯顿"]),
        ("US-SD", "南达科他州", "South Dakota", ["苏福尔斯", "拉皮德城", "阿伯丁"]),
        ("US-TN", "田纳西州", "Tennessee", ["纳什维尔", "孟菲斯", "诺克斯维尔", "查塔努加"]),
        ("US-TX", "得克萨斯州", "Texas", ["休斯敦", "圣安东尼奥", "达拉斯", "奥斯汀", "沃斯堡", "埃尔帕索"]),
        ("US-UT", "犹他州", "Utah", ["盐湖城", "西瓦利城", "普罗沃"]),
        ("US-VT", "佛蒙特州", "Vermont", ["伯灵顿", "埃塞克斯", "拉特兰"]),
        ("US-VA", "弗吉尼亚州", "Virginia", ["弗吉尼亚比奇", "诺福克", "切萨皮克", "里士满"]),
        ("US-WA", "华盛顿州", "Washington", ["西雅图", "斯波坎", "塔科马", "贝尔维尤"]),
        ("US-WV", "西弗吉尼亚州", "West Virginia", ["查尔斯顿", "亨廷顿", "摩根敦"]),
        ("US-WI", "威斯康星州", "Wisconsin", ["密尔沃基", "麦迪逊", "格林贝"]),
        ("US-WY", "怀俄明州", "Wyoming", ["夏延", "卡斯珀", "拉勒米"]),
        ("US-DC", "哥伦比亚特区", "District of Columbia", ["华盛顿"]),
    ]
    sd["US"] = (True, [
        {"code": c, "name_zh": zh, "name_en": en,
         "children": [{"code": f"{c}-{i+1:02d}", "name_zh": city, "name_en": city} for i, city in enumerate(cities)]}
        for c, zh, en, cities in us_states
    ])

    # ---------- 日本：47 都道府县（无二级） ----------
    jp = ["北海道", "青森县", "岩手县", "宫城县", "秋田县", "山形县", "福岛县",
          "茨城县", "栃木县", "群马县", "埼玉县", "千叶县", "东京都", "神奈川县",
          "新潟县", "富山县", "石川县", "福井县", "山梨县", "长野县", "岐阜县",
          "静冈县", "爱知县", "三重县", "滋贺县", "京都府", "大阪府", "兵库县",
          "奈良县", "和歌山县", "鸟取县", "岛根县", "冈山县", "广岛县", "山口县",
          "徳岛县", "香川县", "爱媛县", "高知县", "福冈县", "佐贺县", "长崎县",
          "熊本县", "大分县", "宫崎县", "鹿儿岛县", "冲绳县"]
    sd["JP"] = (False, [
        {"code": f"JP-{i+1:02d}", "name_zh": p, "name_en": p, "children": []}
        for i, p in enumerate(jp)
    ])

    # ---------- 韩国：17 市道 ----------
    kr = ["首尔特别市", "釜山广域市", "大邱广域市", "仁川广域市", "光州广域市",
          "大田广域市", "蔚山广域市", "世宗特别自治市", "京畿道", "江原道",
          "忠清北道", "忠清南道", "全罗北道", "全罗南道", "庆尚北道", "庆尚南道",
          "济州特别自治道"]
    sd["KR"] = (False, [
        {"code": f"KR-{i+1:02d}", "name_zh": p, "name_en": p, "children": []}
        for i, p in enumerate(kr)
    ])

    # ---------- 德国：16 州 ----------
    de = ["巴登-符腾堡", "巴伐利亚", "柏林", "勃兰登堡", "不来梅", "汉堡", "黑森",
          "梅克伦堡-前波美拉尼亚", "下萨克森", "北莱茵-威斯特伐利亚", "莱茵兰-普法尔茨",
          "萨尔", "萨克森", "萨克森-安哈尔特", "石勒苏益格-荷尔斯泰因", "图林根"]
    sd["DE"] = (False, [
        {"code": f"DE-{i+1:02d}", "name_zh": p, "name_en": p, "children": []}
        for i, p in enumerate(de)
    ])

    # ---------- 法国：18 大区 ----------
    fr = ["大东部", "新阿基坦", "奥弗涅-罗讷-阿尔卑斯", "布列塔尼", "中央-卢瓦尔河谷",
          "科西嘉", "勃艮第-弗朗什-孔泰", "法兰西岛", "奥克西塔尼", "上法兰西",
          "诺曼底", "卢瓦尔河地区", "普罗旺斯-阿尔卑斯-蓝色海岸", "留尼汪",
          "马提尼克", "瓜德罗普", "马约特", "法属圭亚那"]
    sd["FR"] = (False, [
        {"code": f"FR-{i+1:02d}", "name_zh": p, "name_en": p, "children": []}
        for i, p in enumerate(fr)
    ])

    # ---------- 加拿大：13 省区 ----------
    ca = ["阿尔伯塔", "不列颠哥伦比亚", "曼尼托巴", "新不伦瑞克", "纽芬兰与拉布拉多",
          "新斯科舍", "安大略", "爱德华王子岛", "魁北克", "萨斯喀彻温",
          "西北地区", "努纳武特", "育空"]
    sd["CA"] = (False, [
        {"code": f"CA-{i+1:02d}", "name_zh": p, "name_en": p, "children": []}
        for i, p in enumerate(ca)
    ])

    # ---------- 澳大利亚：8 州领地 ----------
    au = ["新南威尔士", "维多利亚", "昆士兰", "南澳大利亚", "西澳大利亚",
          "塔斯马尼亚", "澳大利亚首都领地", "北领地"]
    sd["AU"] = (False, [
        {"code": f"AU-{i+1:02d}", "name_zh": p, "name_en": p, "children": []}
        for i, p in enumerate(au)
    ])

    # ---------- 意大利：20 大区 ----------
    it = ["皮埃蒙特", "瓦莱达奥斯塔", "伦巴第", "特伦蒂诺-上阿迪杰", "威尼托",
          "弗留利-威尼斯朱利亚", "利古里亚", "艾米利亚-罗马涅", "托斯卡纳",
          "翁布里亚", "马尔凯", "拉齐奥", "阿布鲁佐", "莫利塞", "坎帕尼亚",
          "普利亚", "巴西利卡塔", "卡拉布里亚", "西西里", "撒丁"]
    sd["IT"] = (False, [
        {"code": f"IT-{i+1:02d}", "name_zh": p, "name_en": p, "children": []}
        for i, p in enumerate(it)
    ])

    # ---------- 西班牙：17 自治区 + 2 自治市 ----------
    es = ["安达卢西亚", "阿拉贡", "阿斯图里亚斯", "巴利阿里群岛", "巴斯克",
          "加那利群岛", "坎塔布里亚", "卡斯蒂利亚-莱昂", "卡斯蒂利亚-拉曼恰",
          "加泰罗尼亚", "埃斯特雷马杜拉", "加利西亚", "拉里奥哈", "马德里",
          "穆尔西亚", "纳瓦拉", "巴伦西亚", "休达", "梅利利亚"]
    sd["ES"] = (False, [
        {"code": f"ES-{i+1:02d}", "name_zh": p, "name_en": p, "children": []}
        for i, p in enumerate(es)
    ])

    return sd


SUBDIVISIONS = _build_subdivisions()


def get_subdivisions(iso2: str) -> tuple[bool, list[dict]]:
    """返回 (has_second_level, items)；未收录国家 → (False, [])。"""
    return SUBDIVISIONS.get(iso2.upper(), (False, []))


def find_subdivision(iso2: str, code: str) -> dict | None:
    """在指定国家的 subdivision 树中查找 code（一级或二级）。"""
    has_l2, items = get_subdivisions(iso2)
    for it in items:
        if it["code"] == code:
            return it
        for ch in it.get("children", []):
            if ch["code"] == code:
                return ch
    return None
