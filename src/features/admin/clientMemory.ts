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
const tagIds = new Set(clientMemoryTags.map((tag) => tag.id));

export function parseClientMemory(value: string | undefined): ClientMemory {
  const note = value?.trim() ?? "";

  if (!note.startsWith(memoryPrefix)) {
    return { tagIds: [], note };
  }

  try {
    const parsed = JSON.parse(note.slice(memoryPrefix.length)) as Partial<ClientMemory>;
    const parsedTagIds = Array.isArray(parsed.tagIds)
      ? parsed.tagIds.filter((id): id is ClientMemoryTagId => typeof id === "string" && tagIds.has(id as ClientMemoryTagId))
      : [];

    return {
      tagIds: parsedTagIds,
      note: typeof parsed.note === "string" ? parsed.note : "",
    };
  } catch {
    return { tagIds: [], note: "" };
  }
}

export function serializeClientMemory(memory: ClientMemory) {
  const normalized: ClientMemory = {
    tagIds: memory.tagIds.filter((id, index, ids) => tagIds.has(id) && ids.indexOf(id) === index),
    note: memory.note.trim(),
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

