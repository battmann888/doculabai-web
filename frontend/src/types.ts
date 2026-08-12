export type EditAction =
  | 'replace_text'
  | 'insert_text'
  | 'delete_text'
  | 'delete_image'
  | 'replace_image'
  | 'replace_text_with_image'
  | 'replace_image_with_text'
  | 'replace_formatting'
  | 'replace_table'
  | 'summarize'
  | 'translate'
  | 'restyle'
  | 'tone'
  | 'custom';

export interface DocSegment {
  id: string;
  type: 'heading' | 'paragraph' | 'table' | 'image' | 'list';
  text: string;
  position: number;
  meta?: {
    level?: number;
    rows?: number;
    cols?: number;
    cells?: string[][];
    src?: string;
    style?: string;
    fontFamily?: string;
    bold?: boolean;
    formatting?: string;
    cellFormatting?: string[][];
    sourcePart?: string;
    nodeIndex?: number;
    relationshipId?: string;
    imagePath?: string;
    location?: 'body' | 'header' | 'footer' | 'footnote' | 'endnote' | 'comment';
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachmentName?: string;
  applied?: boolean;
  action?: string;
  affectedSegments?: string[];
  diff?: SegmentDiff[];
  reviewStatus?: 'pending' | 'approved' | 'discarded';
}

export interface SegmentDiff {
  segmentId: string;
  before: string;
  after: string;
  action: EditAction;
  target?: {
    row?: number;
    column?: number;
  };
}

export interface AIEditRequest {
  documentText: string;
  segments: DocSegment[];
  userPrompt: string;
  conversationHistory: ChatMessage[];
  fileName: string;
  fontFamily?: string;
  images?: Record<string, string>;
  referenceImage?: string;
}

export interface AIEditResponse {
  success: boolean;
  edits: SegmentDiff[];
  explanation: string;
  action: EditAction;
}

export interface ProcessingStatus {
  stage: 'idle' | 'uploading' | 'parsing' | 'rendering' | 'ready' | 'editing' | 'downloading' | 'error';
  message: string;
  progress?: number;
}
