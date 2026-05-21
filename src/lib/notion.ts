import { Client } from "@notionhq/client";
import type { Phrase, PhraseDirection, PhraseSource, Score, SrsItem, SrsStatus } from "./types";

const apiKey = process.env.NOTION_API_KEY;
const databaseId = process.env.NOTION_DATABASE_ID;

const notion = apiKey ? new Client({ auth: apiKey }) : null;

type NotionRichText = { plain_text?: string; text?: { content?: string } };
type NotionProperty = {
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  url?: string | null;
  number?: number | null;
  select?: { name?: string } | null;
  date?: { start?: string | null } | null;
};
type NotionPage = {
  id: string;
  created_time: string;
  properties: Record<string, NotionProperty>;
};

const getRichText = (prop: NotionProperty | undefined): string => {
  if (!prop) return "";
  const arr = prop.title ?? prop.rich_text ?? [];
  return arr
    .map((t) => t.plain_text ?? t.text?.content ?? "")
    .join("");
};

const getNumber = (prop: NotionProperty | undefined): number | null =>
  typeof prop?.number === "number" ? prop.number : null;

const getTimestamp = (prop: NotionProperty | undefined): number | null => {
  const start = prop?.date?.start;
  if (!start) return null;
  const timestamp = new Date(start).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getSelectName = (prop: NotionProperty | undefined): string | undefined =>
  prop?.select?.name;

const isDirection = (value: string | undefined): value is PhraseDirection =>
  value === "ja-to-zh" || value === "zh-to-ja";

const isSource = (value: string | undefined): value is PhraseSource =>
  value === "manual" || value === "conversation" || value === "prototype";

const SRS_STATUSES: SrsStatus[] = [
  "new",
  "learning",
  "review",
  "maintenance",
  "mastered",
];

const isSrsStatus = (value: string | undefined): value is SrsStatus =>
  SRS_STATUSES.includes(value as SrsStatus);

const isScore = (value: number | null): value is Score =>
  value === 1 || value === 2 || value === 3;

let ensuredOwnerProperties = false;

async function ensureOwnerProperties(): Promise<void> {
  if (!notion || !databaseId || ensuredOwnerProperties) return;
  try {
    await notion.databases.update({
      database_id: databaseId,
      properties: {
        "Owner Key": { rich_text: {} },
        Nickname: { rich_text: {} },
        "Phrase ID": { rich_text: {} },
        "SRS Status": {
          select: {
            options: SRS_STATUSES.map((name) => ({ name })),
          },
        },
        "SRS Next Review": { date: {} },
        "SRS Interval Days": { number: {} },
        "SRS Ease Factor": { number: {} },
        "SRS Consecutive Good": { number: {} },
        "SRS Last Score": { number: {} },
        "SRS Last Reviewed": { date: {} },
        Direction: {
          select: { options: [{ name: "ja-to-zh" }, { name: "zh-to-ja" }] },
        },
        Category: { rich_text: {} },
        "Should Drill": { select: { options: [{ name: "yes" }, { name: "no" }] } },
        Source: {
          select: {
            options: [
              { name: "manual" },
              { name: "conversation" },
              { name: "prototype" },
            ],
          },
        },
        "Used At": { date: {} },
      } as never,
    });
    ensuredOwnerProperties = true;
  } catch (error) {
    // 既に存在する、または権限不足の場合でもフレーズ生成自体は止めない。
    console.warn("Failed to ensure Notion owner properties:", error);
  }
}

export async function getPhrases(): Promise<Phrase[]> {
  if (!notion || !databaseId) return [];

  const response = await notion.databases.query({
    database_id: databaseId,
    sorts: [{ timestamp: "created_time", direction: "descending" }],
  });

  return (response.results as unknown as NotionPage[]).map((page) => {
    const props = page.properties;
    return {
      id: page.id,
      japanese: getRichText(props["Japanese"]),
      chinese:
        getRichText(props["Chinese (Natural)"]) ||
        getRichText(props["Chinese (Literal)"]),
      pinyin: getRichText(props["Pinyin"]),
      explanation: getRichText(props["Grammar"]),
      audioUrl: props["Audio URL"]?.url ?? null,
      createdAt: page.created_time,
      direction: "ja-to-zh",
      categoryId: null,
      shouldDrill: true,
      source: "manual",
      usedAt: null,
    };
  });
}

export async function createPhrase(input: {
  phraseId?: string;
  japanese: string;
  chinese: string;
  pinyin: string;
  explanation: string;
  audioUrl?: string | null;
  ownerKey?: string;
  nickname?: string;
  direction?: PhraseDirection;
  categoryId?: string | null;
  shouldDrill?: boolean;
  source?: PhraseSource;
  usedAt?: string | null;
}): Promise<{ id: string } | null> {
  if (!notion || !databaseId) return null;

  await ensureOwnerProperties();

  const properties: Record<string, unknown> = {
    Japanese: { title: [{ text: { content: input.japanese } }] },
    "Chinese (Natural)": {
      rich_text: [{ text: { content: input.chinese } }],
    },
    Pinyin: { rich_text: [{ text: { content: input.pinyin } }] },
    Grammar: { rich_text: [{ text: { content: input.explanation } }] },
  };

  if (input.audioUrl) {
    properties["Audio URL"] = { url: input.audioUrl };
  }
  if (input.ownerKey) {
    properties["Owner Key"] = {
      rich_text: [{ text: { content: input.ownerKey } }],
    };
    properties.Nickname = {
      rich_text: [{ text: { content: input.nickname ?? "" } }],
    };
  }
  if (input.phraseId) {
    properties["Phrase ID"] = {
      rich_text: [{ text: { content: input.phraseId } }],
    };
  }
  if (input.direction) {
    properties.Direction = { select: { name: input.direction } };
  }
  if (input.categoryId) {
    properties.Category = {
      rich_text: [{ text: { content: input.categoryId } }],
    };
  }
  if (typeof input.shouldDrill === "boolean") {
    properties["Should Drill"] = {
      select: { name: input.shouldDrill ? "yes" : "no" },
    };
  }
  if (input.source) {
    properties.Source = { select: { name: input.source } };
  }
  if (input.usedAt) {
    properties["Used At"] = { date: { start: input.usedAt } };
  }

  const created = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: properties as never,
  });

  return { id: (created as { id: string }).id };
}

export async function updatePhraseExplanation(
  phraseId: string,
  explanation: string,
): Promise<boolean> {
  if (!notion || !databaseId || !phraseId) return false;

  await ensureOwnerProperties();

  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: "Phrase ID",
      rich_text: {
        equals: phraseId,
      },
    },
    page_size: 1,
  });
  const page = response.results[0] as { id?: string } | undefined;
  if (!page?.id) return false;

  await notion.pages.update({
    page_id: page.id,
    properties: {
      Grammar: { rich_text: [{ text: { content: explanation } }] },
    } as never,
  });
  return true;
}

function pageToPhraseAndSrs(page: NotionPage): {
  phrase: Phrase;
  srsItem: SrsItem | null;
} {
  const props = page.properties;
  const phraseId = getRichText(props["Phrase ID"]) || page.id;
  const statusName = props["SRS Status"]?.select?.name;
  const directionName = getSelectName(props.Direction);
  const sourceName = getSelectName(props.Source);
  const status = isSrsStatus(statusName) ? statusName : null;
  const lastScoreNumber = getNumber(props["SRS Last Score"]);
  const srsItem: SrsItem | null = status
    ? {
        id: phraseId,
        status,
        nextReviewAt: getTimestamp(props["SRS Next Review"]) ?? 0,
        intervalDays: getNumber(props["SRS Interval Days"]) ?? 0,
        easeFactor: getNumber(props["SRS Ease Factor"]) ?? 2.5,
        consecutiveGood: getNumber(props["SRS Consecutive Good"]) ?? 0,
        lastScore: isScore(lastScoreNumber) ? lastScoreNumber : null,
        lastReviewedAt: getTimestamp(props["SRS Last Reviewed"]),
      }
    : null;

  return {
    phrase: {
      id: phraseId,
      japanese: getRichText(props["Japanese"]),
      chinese:
        getRichText(props["Chinese (Natural)"]) ||
        getRichText(props["Chinese (Literal)"]),
      pinyin: getRichText(props["Pinyin"]),
      explanation: getRichText(props["Grammar"]),
      audioUrl: props["Audio URL"]?.url ?? null,
      createdAt: page.created_time,
      direction: isDirection(directionName) ? directionName : "ja-to-zh",
      categoryId: getRichText(props.Category) || null,
      shouldDrill: getSelectName(props["Should Drill"]) !== "no",
      source: isSource(sourceName) ? sourceName : "manual",
      usedAt: props["Used At"]?.date?.start ?? null,
    },
    srsItem,
  };
}

export async function getPhrasesByOwner(ownerKey: string): Promise<{
  phrases: Phrase[];
  srsItems: SrsItem[];
}> {
  if (!notion || !databaseId || !ownerKey.trim()) {
    return { phrases: [], srsItems: [] };
  }

  await ensureOwnerProperties();

  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: "Owner Key",
      rich_text: {
        equals: ownerKey.trim(),
      },
    },
    sorts: [{ timestamp: "created_time", direction: "descending" }],
  });

  const mapped = (response.results as unknown as NotionPage[]).map(
    pageToPhraseAndSrs,
  );

  return {
    phrases: mapped.map((item) => item.phrase),
    srsItems: mapped
      .map((item) => item.srsItem)
      .filter((item): item is SrsItem => Boolean(item)),
  };
}

async function findPhrasePage(input: {
  phraseId: string;
  ownerKey: string;
  japanese: string;
  chinese: string;
}): Promise<string | null> {
  if (!notion || !databaseId) return null;

  const byPhraseId = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: "Phrase ID",
      rich_text: {
        equals: input.phraseId,
      },
    },
    page_size: 1,
  });
  const matchById = (byPhraseId.results[0] as { id?: string } | undefined)?.id;
  if (matchById) return matchById;

  const byContent = await notion.databases.query({
    database_id: databaseId,
    filter: {
      and: [
        {
          property: "Owner Key",
          rich_text: {
            equals: input.ownerKey,
          },
        },
        {
          property: "Japanese",
          title: {
            equals: input.japanese,
          },
        },
        {
          property: "Chinese (Natural)",
          rich_text: {
            equals: input.chinese,
          },
        },
      ],
    },
    page_size: 1,
  } as never);

  return (byContent.results[0] as { id?: string } | undefined)?.id ?? null;
}

export async function updatePhraseSrs(input: {
  phrase: Phrase;
  ownerKey: string;
  srsItem: SrsItem;
}): Promise<void> {
  if (!notion || !databaseId || !input.ownerKey.trim()) return;

  await ensureOwnerProperties();
  const pageId = await findPhrasePage({
    phraseId: input.phrase.id,
    ownerKey: input.ownerKey.trim(),
    japanese: input.phrase.japanese,
    chinese: input.phrase.chinese,
  });
  if (!pageId) return;

  const { srsItem } = input;
  await notion.pages.update({
    page_id: pageId,
    properties: {
      "Phrase ID": {
        rich_text: [{ text: { content: input.phrase.id } }],
      },
      "SRS Status": {
        select: { name: srsItem.status },
      },
      "SRS Next Review": {
        date: { start: new Date(srsItem.nextReviewAt).toISOString() },
      },
      "SRS Interval Days": {
        number: srsItem.intervalDays,
      },
      "SRS Ease Factor": {
        number: srsItem.easeFactor,
      },
      "SRS Consecutive Good": {
        number: srsItem.consecutiveGood,
      },
      "SRS Last Score": {
        number: srsItem.lastScore,
      },
      "SRS Last Reviewed": {
        date: srsItem.lastReviewedAt
          ? { start: new Date(srsItem.lastReviewedAt).toISOString() }
          : null,
      },
    } as never,
  });
}

export async function deletePhrase(pageId: string): Promise<void> {
  if (!notion) return;
  await notion.pages.update({
    page_id: pageId,
    archived: true,
  });
}
