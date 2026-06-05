import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { LucideSave, LucideRefreshCw, LucideSquarePen, LucideTrash2 } from "@lucide/angular";
import { NotesService } from "../../core/api/notes.service";
import { Note } from "../../core/api/api.types";
import { IsumiAlertComponent, IsumiButtonComponent, IsumiCardComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiPageHeaderComponent, IsumiSkeletonComponent } from "../../shared/ui";

@Component({
  selector: "isumi-notes",
  standalone: true,
  imports: [DatePipe, FormsModule, IsumiAlertComponent, IsumiButtonComponent, IsumiCardComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiPageHeaderComponent, IsumiSkeletonComponent, LucideSave, LucideRefreshCw, LucideSquarePen, LucideTrash2],
  templateUrl: "./notes.component.html",
  styleUrl: "./notes.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotesComponent implements OnInit {
  private readonly notesService = inject(NotesService);

  readonly notes = signal<Note[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly title = signal("");
  readonly body = signal("");
  readonly hasContent = computed(() => this.title().trim().length > 0 || this.body().trim().length > 0);

  ngOnInit(): void {
    this.loadNotes();
  }

  loadNotes(): void {
    this.loading.set(true);
    this.error.set(null);
    this.notesService.list().subscribe({
      next: (notes) => this.notes.set(notes),
      error: () => this.error.set("Nao foi possivel carregar suas notas."),
      complete: () => this.loading.set(false)
    });
  }

  createNote(): void {
    const title = this.title().trim();
    const body = this.body().trim();

    if (!title && !body) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.notesService.create({ title: title || "Sem titulo", body }).subscribe({
      next: (note) => {
        this.notes.update((notes) => [note, ...notes]);
        this.title.set("");
        this.body.set("");
      },
      error: () => this.error.set("Nao foi possivel salvar a nota."),
      complete: () => this.saving.set(false)
    });
  }

  updateNote(note: Note, field: "title" | "body", value: string): void {
    const payload = { [field]: value };
    this.notes.update((notes) => notes.map((item) => item.id === note.id ? { ...item, ...payload } : item));
    this.notesService.update(note.id, payload).subscribe({
      error: () => {
        this.error.set("Nao foi possivel atualizar a nota.");
        this.loadNotes();
      }
    });
  }

  deleteNote(note: Note): void {
    this.notes.update((notes) => notes.filter((item) => item.id !== note.id));
    this.notesService.delete(note.id).subscribe({
      error: () => {
        this.error.set("Nao foi possivel remover a nota.");
        this.loadNotes();
      }
    });
  }
}
