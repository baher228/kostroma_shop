import type { PromotionTablePreview } from '../types';

export type PreviewDownload = { blob: Blob; fileName: string };
export type PreviewContent = PromotionTablePreview | {
  type: 'pdf';
  blob: Blob;
  fileName?: string;
  notice?: string;
};
export type DocumentPreviewState = {
  fileName: string;
  loading: boolean;
  error: string;
  content: PreviewContent | null;
  objectUrl: string | null;
  download?: () => Promise<PreviewDownload>;
};

/** Owns PDF URLs and invalidates pending requests when a preview is replaced or closed. */
export class DocumentPreviewController {
  state: DocumentPreviewState | null = null;
  private generation = 0;
  private listener: ((state: DocumentPreviewState | null) => void) | null = null;

  subscribe(listener: (state: DocumentPreviewState | null) => void) {
    this.listener = listener;
    listener(this.state);
    return () => { this.listener = null; };
  }

  close() {
    this.generation += 1;
    if (this.state?.objectUrl) URL.revokeObjectURL(this.state.objectUrl);
    this.state = null;
    this.listener?.(null);
  }

  async open(fileName: string, load: () => Promise<PreviewContent>, download?: () => Promise<PreviewDownload>) {
    this.close();
    const generation = this.generation;
    this.state = { fileName, loading: true, error: '', content: null, objectUrl: null, download };
    this.listener?.(this.state);
    try {
      const content = await load();
      if (generation !== this.generation) return;
      this.state = {
        fileName: content.type === 'pdf' ? content.fileName || fileName : fileName,
        loading: false,
        error: '',
        content,
        objectUrl: content.type === 'pdf' ? URL.createObjectURL(content.blob) : null,
        download,
      };
    } catch (error) {
      if (generation !== this.generation) return;
      this.state = {
        fileName, loading: false, error: error instanceof Error ? error.message : 'Не удалось открыть документ.',
        content: null, objectUrl: null, download,
      };
    }
    this.listener?.(this.state);
  }
}
