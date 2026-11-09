// 듣기 나래 채점: 읽기 핵심부의 채점·피드백을 그대로 다시 내보낸다(새 채점 형식 없음).
export {
  gradeAnswer as gradeListeningAnswer,
  feedbackFor as listeningFeedbackFor,
  correctFeedback as listeningCorrectFeedback,
  correctAnswerOf as correctListeningAnswerOf,
  renderAnswer as renderListeningAnswer,
  type GradeReason as ListeningGradeReason,
  type GradeResult as ListeningGradeResult,
  type ReadingAnswer as ListeningAnswer,
} from "@/core/reading";
