export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export interface CommonStatusResponse {
  ok: boolean;
  phase: string;
  engine: string;
  error?: string;
  [key: string]: any;
}
