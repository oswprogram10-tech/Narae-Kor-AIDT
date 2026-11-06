// 상상·울림 나래(문학) 핵심부 공개 API. 읽기 핵심부(@/core/reading)의 형식·채점을 재사용한다.
export * from "./types";
export { LITERATURE_PASSAGES, getLiteraturePassage } from "./passages";
export { LITERATURE_ITEMS, getLiteratureItem } from "./items";
export { LITERATURE_ACTIVITIES, getLiteratureActivity, literatureActivitiesForGrade } from "./activities";
export {
  OWN_LINE_MAX,
  displayEventIds,
  displayEvents,
  displayFeelings,
  feelingOrder,
  moodGraph,
  ownLineCheck,
  type OwnLineCheck,
} from "./display";
export {
  WRONG_SCALE_MESSAGE,
  correctLiteratureAnswerOf,
  gradeLiteratureAnswer,
  literatureCorrectFeedback,
  literatureFeedbackFor,
  renderLiteratureAnswer,
  type LiteratureFeedback,
  type LiteratureGradeReason,
  type LiteratureGradeResult,
} from "./grade";
export { validateLiteratureItem, validateLiteraturePassage } from "./validate";
