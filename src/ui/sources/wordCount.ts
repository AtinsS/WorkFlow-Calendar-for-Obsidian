import type { Moment } from "moment";
import type { TFile } from "obsidian";
import type { ICalendarSource, IDayMetadata, IDot } from "obsidian-calendar-ui";
import { getDailyNote, getWeeklyNote } from "obsidian-daily-notes-interface";
import { get } from "svelte/store";

import { DEFAULT_WORDS_PER_DOT } from "src/constants";

import { dailyNotes, settings, weeklyNotes } from "../stores";
import { clamp, getWordCount } from "../utils";

const NUM_MAX_DOTS = 5;

// --- Cached word counts per file path to avoid re-reading on every render ---
const wordCountCache = new Map<string, { mtime: number; count: number }>();

async function getCachedWordCount(note: TFile): Promise<number> {
  const cached = wordCountCache.get(note.path);
  const mtime: number = note.stat.mtime;

  if (cached && cached.mtime === mtime) {
    return cached.count;
  }

  const fileContents: string = await window.app.vault.cachedRead(note);
  const count: number = getWordCount(fileContents);
  wordCountCache.set(note.path, { mtime, count });
  return count;
}

export async function getWordCountAsDots(note: TFile): Promise<number> {
  const { wordsPerDot = DEFAULT_WORDS_PER_DOT }: { wordsPerDot: number } = get(settings);
  if (!note || wordsPerDot <= 0) {
    return 0;
  }
  const wordCount = await getCachedWordCount(note);
  const numDots = wordCount / wordsPerDot;
  return clamp(Math.floor(numDots), 1, NUM_MAX_DOTS);
}

export async function getDotsForNote(
  dailyNote: TFile | null
): Promise<IDot[]> {
  if (!dailyNote) {
    return [];
  }
  const numSolidDots = await getWordCountAsDots(dailyNote);

  const dots = [];
  for (let i = 0; i < numSolidDots; i++) {
    dots.push({
      color: "default",
      isFilled: true,
    });
  }
  return dots;
}

export const wordCountSource: ICalendarSource = {
  getDailyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const file = getDailyNote(date, get(dailyNotes));
    const dots = await getDotsForNote(file);
    return {
      dots,
    };
  },

  getWeeklyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const file = getWeeklyNote(date, get(weeklyNotes));
    const dots = await getDotsForNote(file);

    return {
      dots,
    };
  },
};
