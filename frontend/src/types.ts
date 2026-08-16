export type EditAction =
  | 'replace_text'
  | 'insert_text'
  | 'delete_text'
  | 'delete_image'
  | 'replace_image'
  | 'replace_text_with_image'
  | 'replace_image_with_text'
  | 'replace_image_with_uploaded'
  | 'replace_formatting'
  | 'replace_table'
  | 'summarize'
  | 'translate'
  | 'restyle'
  | 'tone'
  | 'custom';


export type OperationType =
  | 'format_text'
  | 'format_paragraph'
  | 'modify_page_layout'
  | 'modify_heading_style'
  | 'resize_image'
  | 'add_page_break';


export interface TextFormatProps {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontFamily?: string;
  
  fontSize?: number;
  
  color?: string;
  
  highlight?: string;
  alignment?: 'left' | 'center' | 'right' | 'justify';
}

export interface ParagraphFormatProps {
  lineSpacingRule?: 'auto' | 'exact' | 'atLeast';
  
  lineSpacing?: number;
  
  spaceBefore?: number;
  
  spaceAfter?: number;
  
  indentLeft?: number;
  
  indentRight?: number;
  
  firstLine?: number;
}

export interface PageLayoutProps {
  marginTopCm?: number;
  marginBottomCm?: number;
  marginLeftCm?: number;
  marginRightCm?: number;
  
  pageSizeWidthCm?: number;
  
  pageSizeHeightCm?: number;
  orientation?: 'portrait' | 'landscape';
}


export interface AIOperation {
  type: OperationType;
  
  segmentId?: string;
  
  level?: number;
  
  widthCm?: number;
  
  properties?: TextFormatProps | ParagraphFormatProps | PageLayoutProps;
}


export interface AIRecommendation {
  
  id: string;
  
  title: string;
  
  description: string;
  
  operations?: AIOperation[];
  
  edits?: SegmentDiff[];
}


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
  
  operations?: AIOperation[];
  
  recommendations?: AIRecommendation[];
  
  operationResults?: OperationResult[];
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

export interface OperationResult {
  type: OperationType;
  
  description: string;
  success: boolean;
  
  error?: string;
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
  operationId?: string;
}

export interface AIEditResponse {
  success: boolean;
  edits: SegmentDiff[];
  
  operations?: AIOperation[];
  
  recommendations?: AIRecommendation[];
  explanation: string;
  action: EditAction;
}

export interface ProcessingStatus {
  stage: 'idle' | 'uploading' | 'parsing' | 'rendering' | 'ready' | 'editing' | 'downloading' | 'error';
  message: string;
  progress?: number;
}

export type StructuredEdit =

  | {
      kind: 'replace-image-with-text';
      segmentId: string;
      text: string;
      fontFamily?: string;
      fontSize?: number;
      bold?: boolean;
      italic?: boolean;
    }
  | {
      kind: 'replace-image-with-table';
      segmentId: string;
      rows: number;
      cols: number;
      cells: string[][];
    }
  | {
      kind: 'replace-image';
      segmentId: string;
      file: File;
    };

