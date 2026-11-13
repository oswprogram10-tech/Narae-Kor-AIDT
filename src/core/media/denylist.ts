// 실제 기관·회사·사이트 이름 검사. 가상 자료가 진짜처럼 퍼지거나 사칭이 되지 않도록, 모든 매체 글에 적용한다.

/** 글자 그대로 들어 있으면 안 되는 이름 */
const PLAIN: string[] = [
  "네이버", "구글", "유튜브", "카카오", "위키백과", "위키피디아", "나무위키", "기상청", "질병관리청", "교육부",
  "국립", "서울시", "연합뉴스", "쿠팡", "삼성", "엘지", "인스타그램", "페이스북", "트위터", "틱톡", "아마존",
  "마이크로소프트", "넷플릭스", "배달의민족", "당근마켓", "롯데", "현대자동차", "나이키", "아디다스",
  "코카콜라", "맥도날드", "환경부", "보건복지부", "문화체육관광부", "과학기술정보통신부", "여성가족부", "경찰청",
  "소방청", "한국은행", "통계청", "조선일보", "중앙일보", "동아일보", "한겨레", "경향신문", "한국교육과정평가원",
  "한국교육학술정보원", "에듀넷", "디지털교과서", "YouTube", "Google", "Naver", "Wikipedia", "Facebook", "Instagram",
  "Amazon", "Netflix", "Samsung", "Apple",
];

/** 다른 낱말과 겹치는 이름은 앞뒤 글자를 보고 가려낸다. */
const PATTERNS: [string, RegExp][] = [
  ["다음(포털)", /다음\s*(카페|메일|뉴스|검색|포털|지도|웹툰|블로그|TV)/u],
  ["애플", /애플(?!리케이션|파이|민트)/u],
  ["LG", /(^|[^A-Za-z])LG([^A-Za-z]|$)/u],
  ["KBS", /(^|[^A-Za-z])KBS([^A-Za-z]|$)/u],
  ["MBC", /(^|[^A-Za-z])MBC([^A-Za-z]|$)/u],
  ["SBS", /(^|[^A-Za-z])SBS([^A-Za-z]|$)/u],
  ["EBS", /(^|[^A-Za-z])EBS([^A-Za-z]|$)/u],
  ["JTBC", /(^|[^A-Za-z])JTBC([^A-Za-z]|$)/u],
  ["YTN", /(^|[^A-Za-z])YTN([^A-Za-z]|$)/u],
  ["SK", /(^|[^A-Za-z])SK([^A-Za-z]|$)/u],
  ["http 주소", /https?:\/\//u],
  ["실제 도메인", /\.(com|net|org|kr|go\.kr|co\.kr|edu)(\b|\/)/iu],
];

/** 글에 실제 이름이 들어 있으면 문제 목록(빈 배열이면 통과) */
export function realNameProblems(text: string): string[] {
  const p: string[] = [];
  const lower = text.toLowerCase();
  for (const name of PLAIN) if (lower.includes(name.toLowerCase())) p.push(`실제 이름처럼 보이는 '${name}'이(가) 들어 있어요`);
  for (const [name, re] of PATTERNS) if (re.test(text)) p.push(`실제 이름·주소처럼 보이는 '${name}'이(가) 들어 있어요`);
  return p;
}
