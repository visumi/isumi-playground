import { DOCUMENT } from "@angular/common";
import { Injectable, inject } from "@angular/core";

@Injectable({ providedIn: "root" })
export class IsumiClipboardService {
  private readonly document = inject(DOCUMENT);

  async copyText(value: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch {
        // Fall through to the textarea strategy for browsers that block clipboard writes.
      }
    }

    this.copyWithTextarea(value);
  }

  private copyWithTextarea(value: string): void {
    const textarea = this.document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    this.document.body.appendChild(textarea);
    textarea.select();

    const copied = this.document.execCommand("copy");
    textarea.remove();

    if (!copied) {
      throw new Error("Copy command failed");
    }
  }
}
