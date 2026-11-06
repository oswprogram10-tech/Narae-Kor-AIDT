// 미디어 나래(매체) 핵심부 공개 API. 읽기 핵심부(@/core/reading)의 형식·채점을 재사용한다.
export * from "./types";
export { MEDIA_PASSAGES, getMediaPassage } from "./passages";
export { MEDIA_ITEMS, getMediaItem } from "./items";
export { MEDIA_ACTIVITIES, getMediaActivity, mediaActivitiesForGrade } from "./activities";
export { realNameProblems } from "./denylist";
export { correctResultOf, displayQueries, displayResults, resultsFor, searchEvidence, type EvidenceField } from "./search";
export {
  WRONG_QUERY_MESSAGE,
  WRONG_RESULT_MESSAGE,
  correctMediaAnswerOf,
  gradeMediaAnswer,
  mediaCorrectFeedback,
  mediaFeedbackFor,
  renderMediaAnswer,
  type MediaFeedback,
  type MediaGradeReason,
  type MediaGradeResult,
} from "./grade";
export { validateMediaItem, validateMediaPassage } from "./validate";
