import { DatePipe, DecimalPipe } from "@angular/common";
import { CdkTrapFocus } from "@angular/cdk/a11y";
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from "@angular/cdk/drag-drop";
import { HttpErrorResponse } from "@angular/common/http";
import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, computed, inject, input, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import {
  LucideArrowDown,
  LucideArrowUp,
  LucideBedDouble,
  LucideBus,
  LucideCalendarDays,
  LucideCar,
  LucideClock3,
  LucideFiles,
  LucideFootprints,
  LucideGripVertical,
  LucideImagePlus,
  LucideLink,
  LucideMapPin,
  LucidePlane,
  LucidePlus,
  LucideRoute,
  LucideTrash2,
  LucideWifiOff,
  LucideX
} from "@lucide/angular";
import { firstValueFrom } from "rxjs";
import {
  CreateTripFlightRequest,
  TripDay,
  TripDayItem,
  TripPlace,
  TripPlaceCategory,
  TripSnapshot,
  TripTransportMode
} from "../../core/api/api.types";
import { TripsService } from "../../core/api/trips.service";
import {
  IsumiAvatarComponent,
  IsumiBreadcrumbComponent,
  IsumiButtonComponent,
  IsumiInputDirective,
  IsumiModalService,
  IsumiSelectDirective,
  IsumiTagComponent,
  IsumiToastService,
  IsumiTooltipComponent,
  injectIsumiModalData,
  injectIsumiModalRef
} from "../../shared/ui";
import { TripRoomStore } from "./trip-room.store";

type TrayDragData = { kind: "place"; place: TripPlace };
type ItemDragData = { kind: "item"; item: TripDayItem };

interface DeleteTripRoomModalData {
  roomTitle: string;
}

@Component({
  selector: "isumi-delete-trip-room-modal",
  standalone: true,
  imports: [IsumiButtonComponent, LucideTrash2, LucideX],
  template: `
    <div class="grid gap-5">
      <header class="flex items-start justify-between gap-4">
        <div>
          <div class="mb-3 grid size-10 place-items-center rounded-sm bg-destructive/15 text-destructive">
            <svg lucideTrash2 class="size-5" aria-hidden="true"></svg>
          </div>
          <h2 class="m-0 text-[1.2rem] font-black">Excluir viagem</h2>
          <p class="m-0 mt-2 max-w-[52ch] text-sm leading-6 text-muted-foreground">
            Isto remove "{{ data?.roomTitle || "esta viagem" }}", incluindo roteiro, lugares, imagens, voos e hospedagens. Esta ação não pode ser desfeita.
          </p>
        </div>
        <isumi-button class="max-sm:hidden" variant="ghost" size="sm" iconOnly ariaLabel="Fechar confirmação" (click)="modalRef.close(false)">
          <svg icon lucideX class="size-4" aria-hidden="true"></svg>
          Fechar
        </isumi-button>
      </header>

      <footer class="flex justify-end gap-2 max-sm:grid max-sm:grid-cols-1">
        <isumi-button mobileFull variant="secondary" type="button" (click)="modalRef.close(false)">Cancelar</isumi-button>
        <isumi-button mobileFull variant="destructive" type="button" (click)="modalRef.close(true)">
          <svg icon lucideTrash2 class="size-4" aria-hidden="true"></svg>
          Excluir viagem
        </isumi-button>
      </footer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeleteTripRoomModalComponent {
  readonly data = injectIsumiModalData<DeleteTripRoomModalData>();
  readonly modalRef = injectIsumiModalRef<DeleteTripRoomModalData, boolean>();
}

@Component({
  selector: "isumi-trip-room",
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    CdkTrapFocus,
    FormsModule,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    IsumiAvatarComponent,
    IsumiBreadcrumbComponent,
    IsumiButtonComponent,
    IsumiInputDirective,
    IsumiSelectDirective,
    IsumiTagComponent,
    IsumiTooltipComponent,
    LucideArrowDown,
    LucideArrowUp,
    LucideBedDouble,
    LucideBus,
    LucideCalendarDays,
    LucideCar,
    LucideClock3,
    LucideFiles,
    LucideFootprints,
    LucideGripVertical,
    LucideImagePlus,
    LucideLink,
    LucideMapPin,
    LucidePlane,
    LucidePlus,
    LucideRoute,
    LucideTrash2,
    LucideWifiOff,
    LucideX
  ],
  providers: [TripRoomStore],
  templateUrl: "./trip-room.component.html",
  styleUrl: "./trip-room.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripRoomComponent implements OnInit, OnDestroy {
  private readonly trips = inject(TripsService);
  readonly router = inject(Router);
  private readonly toast = inject(IsumiToastService);
  private readonly modal = inject(IsumiModalService);
  readonly store = inject(TripRoomStore);
  readonly roomId = input.required<string>();
  readonly loading = signal(true);
  readonly deletingRoom = signal(false);
  readonly panel = signal<"place" | "flight" | "lodging" | null>(null);
  readonly selectedItemId = signal<string | null>(null);
  readonly imageUrls = signal<Record<string, string>>({});
  readonly breadcrumbItems = computed(() => [
    { label: "Salas", link: "/tools/trips" },
    { label: "Sala" }
  ]);

  readonly placeName = signal("");
  readonly placeCategory = signal<TripPlaceCategory>("other");
  readonly placeAddress = signal("");
  readonly placeNotes = signal("");
  readonly flightDirection = signal<CreateTripFlightRequest["direction"]>("outbound");
  readonly departureAirport = signal("");
  readonly arrivalAirport = signal("");
  readonly departureAt = signal("");
  readonly arrivalAt = signal("");
  readonly airline = signal("");
  readonly flightNumber = signal("");
  readonly lodgingName = signal("");
  readonly lodgingAddress = signal("");
  readonly checkInDate = signal("");
  readonly checkOutDate = signal("");

  readonly editDuration = signal(60);
  readonly editTransportMode = signal<TripTransportMode | "">("");
  readonly editTransportMinutes = signal<number | null>(null);
  readonly editTransportNotes = signal("");
  readonly selectedItem = computed(() =>
    this.store.snapshot()?.items.find((item) => item.id === this.selectedItemId()) || null
  );
  readonly unscheduledPlaces = computed(() => {
    const scheduled = new Set(this.store.snapshot()?.items.map((item) => item.placeId) || []);
    return this.store.places().filter((place) => !scheduled.has(place.id));
  });

  async ngOnInit(): Promise<void> {
    try {
      await this.store.load(this.roomId());
      this.initializeDateForms();
      await this.loadImages();
      await this.store.connect();
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 403) {
        await this.router.navigate(["/tools/trips", this.roomId()]);
        return;
      }
      this.toast.error("Não foi possível abrir esta viagem.");
      await this.router.navigateByUrl("/tools/trips");
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.store.disconnect();
    for (const url of Object.values(this.imageUrls())) URL.revokeObjectURL(url);
  }

  @HostListener("document:keydown.escape")
  closeOverlays(): void {
    if (this.selectedItemId()) {
      this.closeItem();
      return;
    }
    this.panel.set(null);
  }

  placeById(placeId: string): TripPlace | undefined {
    return this.store.places().find((place) => place.id === placeId);
  }

  dayTotal(dayId: string): number {
    return this.store.itemsForDay(dayId).reduce(
      (total, item) => total + item.durationMinutes + (item.transportMinutes || 0),
      0
    );
  }

  lodgingForDay(day: TripDay) {
    return this.store.lodgings().find((lodging) =>
      lodging.checkInDate <= day.date && lodging.checkOutDate > day.date
    );
  }

  editorForItem(itemId: string): string | null {
    const entry = Object.entries(this.store.editing()).find(([, selectedItemId]) => selectedItemId === itemId);
    if (!entry) return null;
    return this.store.presence().find((person) => person.userId === entry[0])?.name || "Outra pessoa";
  }

  drop(event: CdkDragDrop<TripDayItem[], TripDayItem[] | TripPlace[]>, day: TripDay): void {
    const data = event.item.data as TrayDragData | ItemDragData;
    if (data.kind === "place") {
      void this.addPlaceToDay(data.place, day.id);
      return;
    }
    this.store.moveItem(data.item, day.id, event.currentIndex);
  }

  async addPlaceToDay(place: TripPlace, dayId: string): Promise<void> {
    try {
      this.store.setSnapshot(await firstValueFrom(this.trips.createItem(this.roomId(), {
        dayId,
        placeId: place.id,
        durationMinutes: 60
      })));
    } catch {
      this.toast.error("Não foi possível adicionar o lugar ao dia.");
    }
  }

  moveRelative(item: TripDayItem, delta: number): void {
    this.store.moveItem(item, item.dayId, Math.max(0, item.position + delta));
  }

  moveToDay(item: TripDayItem, dayId: string): void {
    this.store.moveItem(item, dayId, this.store.itemsForDay(dayId).length);
  }

  openItem(item: TripDayItem): void {
    this.selectedItemId.set(item.id);
    this.editDuration.set(item.durationMinutes);
    this.editTransportMode.set(item.transportMode || "");
    this.editTransportMinutes.set(item.transportMinutes);
    this.editTransportNotes.set(item.transportNotes || "");
    this.store.selectItem(item.id);
  }

  closeItem(): void {
    this.selectedItemId.set(null);
    this.store.selectItem(null);
  }

  async saveItem(): Promise<void> {
    const item = this.selectedItem();
    if (!item) return;
    try {
      this.store.setSnapshot(await firstValueFrom(this.trips.updateItem(this.roomId(), item.id, {
        durationMinutes: Number(this.editDuration()),
        transportMode: this.editTransportMode() || null,
        transportMinutes: this.editTransportMinutes() ? Number(this.editTransportMinutes()) : null,
        transportNotes: this.editTransportNotes(),
        version: item.version
      })));
      this.closeItem();
    } catch {
      this.toast.error("Não foi possível salvar os detalhes do roteiro.");
    }
  }

  async removeItem(item: TripDayItem): Promise<void> {
    await firstValueFrom(this.trips.deleteItem(this.roomId(), item.id));
    await this.reload();
  }

  async createPlace(): Promise<void> {
    if (!this.placeName().trim()) return;
    try {
      this.store.setSnapshot(await firstValueFrom(this.trips.createPlace(this.roomId(), {
        name: this.placeName().trim(),
        category: this.placeCategory(),
        address: this.placeAddress(),
        notes: this.placeNotes()
      })));
      this.placeName.set("");
      this.placeAddress.set("");
      this.placeNotes.set("");
      this.panel.set(null);
    } catch {
      this.toast.error("Não foi possível salvar o lugar.");
    }
  }

  async uploadImage(place: TripPlace, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const image = await compressToWebp(file);
      await firstValueFrom(this.trips.uploadPlaceImage(this.roomId(), place.id, image));
      await this.reload();
      await this.loadImage(place.id, true);
    } catch {
      this.toast.error("Não foi possível preparar a imagem. Use uma foto menor.");
    } finally {
      input.value = "";
    }
  }

  async createFlight(): Promise<void> {
    try {
      this.store.setSnapshot(await firstValueFrom(this.trips.createFlight(this.roomId(), {
        direction: this.flightDirection(),
        departureAirport: this.departureAirport().toUpperCase(),
        arrivalAirport: this.arrivalAirport().toUpperCase(),
        departureAt: this.departureAt(),
        arrivalAt: this.arrivalAt(),
        airline: this.airline(),
        flightNumber: this.flightNumber()
      })));
      this.panel.set(null);
    } catch {
      this.toast.error("Confira os dados do voo.");
    }
  }

  async createLodging(): Promise<void> {
    try {
      this.store.setSnapshot(await firstValueFrom(this.trips.createLodging(this.roomId(), {
        name: this.lodgingName(),
        address: this.lodgingAddress(),
        checkInDate: this.checkInDate(),
        checkOutDate: this.checkOutDate()
      })));
      this.panel.set(null);
    } catch {
      this.toast.error("Confira os dados da hospedagem.");
    }
  }

  async copyInviteUrl(): Promise<void> {
    const path = this.router.serializeUrl(this.router.createUrlTree(["/tools/trips", this.roomId()]));
    const inviteUrl = `${window.location.origin}${path}`;

    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(inviteUrl);
          copied = true;
        } catch {
          copied = false;
        }
      }
      if (!copied) this.copyWithTextarea(inviteUrl);
      this.toast.success("Link de convite copiado.");
    } catch {
      this.toast.error("Não foi possível copiar o link da sala.");
    }
  }

  private copyWithTextarea(value: string): void {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Copy command failed");
  }

  async openDeleteRoomModal(): Promise<void> {
    const room = this.store.room();
    if (!room || this.store.snapshot()?.currentMemberRole !== "owner") return;

    const ref = this.modal.open<DeleteTripRoomModalComponent, DeleteTripRoomModalData, boolean>(
      DeleteTripRoomModalComponent,
      {
        data: { roomTitle: room.title },
        ariaLabel: "Confirmar exclusão da viagem",
        closeOnBackdrop: false
      }
    );

    if (await ref.closed) {
      await this.deleteRoom();
    }
  }

  private async deleteRoom(): Promise<void> {
    this.deletingRoom.set(true);
    try {
      await firstValueFrom(this.trips.delete(this.roomId()));
      this.toast.success("Viagem excluída.");
      await this.router.navigateByUrl("/tools/trips");
    } catch {
      this.toast.error("Não foi possível excluir a viagem.");
    } finally {
      this.deletingRoom.set(false);
    }
  }

  categoryLabel(category: TripPlaceCategory): string {
    return {
      food: "Comer e beber",
      culture: "Cultura",
      nightlife: "Vida noturna",
      nature: "Natureza",
      shopping: "Compras",
      other: "Outro"
    }[category];
  }

  imageFailed(placeId: string): void {
    this.imageUrls.update((urls) => {
      if (urls[placeId]) URL.revokeObjectURL(urls[placeId]);
      const next = { ...urls };
      delete next[placeId];
      return next;
    });
  }

  transportLabel(mode: TripTransportMode | null): string {
    return { walk: "Caminhada", car: "Carro", transit: "Transporte público", other: "Outro" }[mode || "other"];
  }

  private async reload(): Promise<void> {
    await this.store.load(this.roomId());
    await this.loadImages();
  }

  private initializeDateForms(): void {
    const room = this.store.room();
    if (!room) return;
    this.checkInDate.set(room.startDate);
    this.checkOutDate.set(room.endDate);
  }

  private async loadImages(): Promise<void> {
    await Promise.all(this.store.places().filter((place) => place.hasImage).map((place) => this.loadImage(place.id)));
  }

  private async loadImage(placeId: string, replace = false): Promise<void> {
    if (this.imageUrls()[placeId] && !replace) return;
    try {
      const blob = await firstValueFrom(this.trips.getPlaceImage(this.roomId(), placeId));
      const nextUrl = URL.createObjectURL(blob);
      this.imageUrls.update((urls) => {
        if (urls[placeId]) URL.revokeObjectURL(urls[placeId]);
        return { ...urls, [placeId]: nextUrl };
      });
    } catch {
      // O card continua funcional sem imagem.
    }
  }
}

async function compressToWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.82, 0.72, 0.62, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (blob && blob.size <= 1_048_576) return blob;
  }
  throw new Error("image_too_large");
}
