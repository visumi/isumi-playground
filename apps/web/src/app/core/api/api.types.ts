export interface MeResponse {
  uid: string;
  email: string;
  name: string | null;
  picture: string | null;
  allowed: boolean;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteRequest {
  title: string;
  body: string;
}

export type UpdateNoteRequest = Partial<CreateNoteRequest>;
