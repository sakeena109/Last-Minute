
export enum RevisionTime {
  FIVE_MINS = '5 minutes',
  TEN_MINS = '10 minutes'
}

export interface Definition {
  term: string;
  definition: string;
}

export interface MCQ {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface FileData {
  base64: string;
  mimeType: string;
  name: string;
}

export type LearningStyle = 'Visual' | 'Auditory' | 'Kinesthetic' | 'Reading/Writing';

export interface StudentProfile {
  name: string;
  email: string;
  grade: string;
  major: string;
  university: string;
  studentId: string;
  studyGoal: string;
  avatarSeed: string;
  joinedDate: string;
  preferredStudyTime: 'Morning' | 'Afternoon' | 'Night';
  learningStyle: LearningStyle;
  academicStrengths: string;
  linkedInUrl?: string;
  githubUrl?: string;
}

export interface RevisionResult {
  revisionNotes: string;
  definitions: Definition[];
  formulas: string[];
  examTips: string[];
  mcqs: MCQ[];
  flowchart: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  title: string;
  result: RevisionResult;
  time: RevisionTime;
}
