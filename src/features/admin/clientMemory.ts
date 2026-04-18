export type ClientMemoryTagId =
  | "allergy"
  | "favorite_shape"
  | "dislikes_bright"
  | "often_late"
  | "pays_transfer"
  | "prefers_evening"
  | "fragile_nails"
  | "likes_minimal";

export type ClientMemory = {
  tagIds: ClientMemoryTagId[];
  note: string;
  source: "empty" | "legacy" | "structured" | "corrupt";
  warning?: string;
};

export const clientMemoryTags: Array<{ id: ClientMemoryTagId; label: string }> = [
  { id: "allergy", label: "аллергии" },
  { id: "favorite_shape", label: "любимая форма" },
  { id: "dislikes_bright", label: "не любит яркое" },
  { id: "often_late", label: "часто опаздывает" },
  { id: "pays_transfer", label: "платит переводом" },
  { id: "prefers_evening", label: "любит вечер" },
  { id: "fragile_nails", label: "тонкие ногти" },
  { id: "likes_minimal", label: "любит минимализм" },
];

const memoryPrefix = "__MASTER_MEMORY_V1__";
const maxMemoryNoteLength = 2000;
const tagIds = new Set(clientMemoryTags.map((tag) => tag.id));

function normalizeNote(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxMemoryNoteLength);
}

function normalizeTagIds(value: unknown): ClientMemoryTagId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((id, index, ids): id is ClientMemoryTagId =>
    typeof id === "string" && tagIds.has(id as ClientMemoryTagId) && ids.indexOf(id) === index
  );
}

function getTextWarning(value: string) {
  return /Рќ|Р°|Р»|Рµ|Рё|Рѕ|СЃ|С‚|СЊ|СЏ|вЂ/.test(value)
    ? "Похоже, заметка сохранена в битой кодировке. Текст оставлен как есть, чтобы не потерять данные."
    : undefined;
}

export function parseClientMemory(value: string | undefined): ClientMemory {
  const note = normalizeNote(value ?? "");

  if (!note.startsWith(memoryPrefix)) {
    return { tagIds: [], note, source: note ? "legacy" : "empty", warning: getTextWarning(note) };
  }

  const payload = note.slice(memoryPrefix.length).trim();

  if (!payload) {
    return {
      tagIds: [],
      note: "",
      source: "corrupt",
      warning: "Память была сохранена в старом или пустом формате.",
    };
  }

  try {
    const parsed = JSON.parse(payload) as Partial<ClientMemory>;

    const parsedNote = typeof parsed.note === "string" ? normalizeNote(parsed.note) : "";

    return {
      tagIds: normalizeTagIds(parsed.tagIds),
      note: parsedNote,
      source: "structured",
      warning: getTextWarning(parsedNote),
    };
  } catch {
    return {
      tagIds: [],
      note: normalizeNote(payload),
      source: "corrupt",
      warning: "Память не удалось разобрать. Текст сохранён, теги можно выбрать заново.",
    };
  }
}

export function serializeClientMemory(memory: ClientMemory) {
  const normalized: ClientMemory = {
    tagIds: normalizeTagIds(memory.tagIds),
    note: normalizeNote(memory.note),
    source: "structured",
  };

  if (normalized.tagIds.length === 0 && !normalized.note) {
    return "";
  }

  return `${memoryPrefix}${JSON.stringify(normalized)}`;
}

export function getClientMemoryLabels(memory: ClientMemory) {
  return memory.tagIds
    .map((id) => clientMemoryTags.find((tag) => tag.id === id)?.label)
    .filter((label): label is string => Boolean(label));
}
