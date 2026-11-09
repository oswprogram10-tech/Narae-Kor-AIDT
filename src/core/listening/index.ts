// 소리·말 나래(듣기) 핵심부 공개 API. 읽기 핵심부(@/core/reading)의 형식·채점을 재사용한다.
export { LISTENING_PASSAGES, getListeningPassage } from "./passages";
export { LISTENING_ITEMS, getListeningItem } from "./items";
export { LISTENING_ACTIVITIES, getListeningActivity, listeningActivitiesForGrade, type ListeningActivity } from "./activities";
export {
  correctListeningAnswerOf,
  gradeListeningAnswer,
  listeningCorrectFeedback,
  listeningFeedbackFor,
  renderListeningAnswer,
  type ListeningAnswer,
  type ListeningGradeReason,
  type ListeningGradeResult,
} from "./grade";
export { validateListeningItem, validateListeningPassage } from "./validate";
export { VOICE_PRESETS, listeningScript, speakerVoice, type ScriptLine, type SpeakerVoice } from "./voice";
