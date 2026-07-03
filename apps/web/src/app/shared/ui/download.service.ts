import { DOCUMENT } from "@angular/common";
import { Injectable, inject } from "@angular/core";

@Injectable({ providedIn: "root" })
export class IsumiDownloadService {
  private readonly document = inject(DOCUMENT);

  downloadText(filename: string, content: string, type = "text/plain;charset=utf-8"): void {
    this.downloadBlob(filename, new Blob([content], { type }));
  }

  downloadBlob(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    try {
      const link = this.document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
