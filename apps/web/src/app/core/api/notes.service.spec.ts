import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import { NotesService } from "./notes.service";

describe("NotesService", () => {
  let service: NotesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(NotesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("lists notes from the API", () => {
    service.list().subscribe((notes) => {
      expect(notes).toEqual([]);
    });

    const request = http.expectOne("http://localhost:8787/tools/notes");
    expect(request.request.method).toBe("GET");
    request.flush([]);
  });

  it("creates a note through the API", () => {
    service.create({ title: "A", body: "B" }).subscribe((note) => {
      expect(note.title).toBe("A");
    });

    const request = http.expectOne("http://localhost:8787/tools/notes");
    expect(request.request.method).toBe("POST");
    request.flush({
      id: "1",
      title: "A",
      body: "B",
      createdAt: "2026-06-05T00:00:00Z",
      updatedAt: "2026-06-05T00:00:00Z"
    });
  });
});
