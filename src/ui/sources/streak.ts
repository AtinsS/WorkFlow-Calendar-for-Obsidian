import type { Moment } from "moment";
import type { TFile } from "obsidian";
import type { ICalendarSource, IDayMetadata } from "obsidian-calendar-ui";
import { getDailyNote, getWeeklyNote } from "obsidian-daily-notes-interface";
import { get } from "svelte/store";

import { dailyNotes, weeklyNotes } from "../stores";
import { getActiveClasses } from "../utils";

const getNoteExistenceClasses = (file: TFile | null): string[] => {
  return getActiveClasses({
    "has-note": !!file,
  });
};

export const streakSource: ICalendarSource = {
  getDailyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const file: TFile | null = getDailyNote(date, get(dailyNotes));
    return {
      classes: getNoteExistenceClasses(file),
      dots: [],
    };
  },

  getWeeklyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const file: TFile | null = getWeeklyNote(date, get(weeklyNotes));
    return {
      classes: getNoteExistenceClasses(file),
      dots: [],
    };
  },
};
