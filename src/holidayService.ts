import AsyncStorage from '@react-native-async-storage/async-storage';

import {buildDateKey, normalizeHolidayInfo, type HolidayInfo} from './attendanceUtils';

const API_BASE_URL = 'https://libur.deno.dev/api';
const STORAGE_PREFIX = 'national-holiday:';
const MONTH_STORAGE_PREFIX = 'national-holiday-month:';
const memoryCache = new Map<string, Promise<HolidayInfo>>();
const monthMemoryCache = new Map<string, Promise<NationalHolidayItem[]>>();

export type NationalHolidayItem = {
  date: string;
  name: string;
  isNationalHoliday: boolean;
  isCollectiveLeave: boolean;
};

const readCachedHoliday = async (dateKey: string): Promise<HolidayInfo | null> => {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${dateKey}`);
    if (!raw) {
      return null;
    }

    return normalizeHolidayInfo(JSON.parse(raw));
  } catch {
    return null;
  }
};

const writeCachedHoliday = async (dateKey: string, holidayInfo: HolidayInfo) => {
  try {
    await AsyncStorage.setItem(
      `${STORAGE_PREFIX}${dateKey}`,
      JSON.stringify(holidayInfo),
    );
  } catch {
    // Cache failure should not block attendance.
  }
};

const readCachedHolidayMonth = async (
  monthKey: string,
): Promise<NationalHolidayItem[] | null> => {
  try {
    const raw = await AsyncStorage.getItem(`${MONTH_STORAGE_PREFIX}${monthKey}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeCachedHolidayMonth = async (
  monthKey: string,
  holidays: NationalHolidayItem[],
) => {
  try {
    await AsyncStorage.setItem(
      `${MONTH_STORAGE_PREFIX}${monthKey}`,
      JSON.stringify(holidays),
    );
  } catch {
    // Cache failure should not block attendance.
  }
};

const fetchHoliday = async (dateKey: string): Promise<HolidayInfo> => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const response = await fetch(`${API_BASE_URL}?year=${year}&month=${month}&day=${day}`);

  if (!response.ok) {
    throw new Error(`Holiday API returned ${response.status}`);
  }

  const data = await response.json();

  return normalizeHolidayInfo({
    date: data?.date ?? dateKey,
    isHoliday: data?.is_holiday,
    isNationalHoliday: data?.is_national_holiday,
    holidayList: data?.holiday_list,
  });
};

const fetchHolidayMonth = async (
  year: number,
  month: number,
): Promise<NationalHolidayItem[]> => {
  const response = await fetch(`${API_BASE_URL}?year=${year}&month=${month}`);

  if (!response.ok) {
    throw new Error(`Holiday API returned ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .filter(item => item?.date && item?.name)
    .map(item => ({
      date: String(item.date),
      name: String(item.name),
      isNationalHoliday: !!item.is_national_holiday,
      isCollectiveLeave: !item.is_national_holiday,
    }));
};

export const getNationalHolidayInfo = async (
  date: Date | string,
): Promise<HolidayInfo> => {
  const dateKey = typeof date === 'string' ? date : buildDateKey(date);

  if (memoryCache.has(dateKey)) {
    return memoryCache.get(dateKey)!;
  }

  const cached = await readCachedHoliday(dateKey);
  if (cached) {
    const cachedPromise = Promise.resolve(cached);
    memoryCache.set(dateKey, cachedPromise);
    return cached;
  }

  const request = fetchHoliday(dateKey)
    .then(async result => {
      await writeCachedHoliday(dateKey, result);
      return result;
    })
    .catch(() =>
      normalizeHolidayInfo({
        date: dateKey,
        isHoliday: false,
        isNationalHoliday: false,
        holidayList: [],
      }),
    );

  memoryCache.set(dateKey, request);
  return request;
};

export const getNationalHolidaysByMonth = async (
  date: Date | string,
): Promise<NationalHolidayItem[]> => {
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth() + 1;
  const monthKey = `${year}-${`${month}`.padStart(2, '0')}`;

  if (monthMemoryCache.has(monthKey)) {
    return monthMemoryCache.get(monthKey)!;
  }

  const cached = await readCachedHolidayMonth(monthKey);
  if (cached) {
    const cachedPromise = Promise.resolve(cached);
    monthMemoryCache.set(monthKey, cachedPromise);
    return cached;
  }

  const request = fetchHolidayMonth(year, month)
    .then(async result => {
      await writeCachedHolidayMonth(monthKey, result);

      await Promise.all(
        result.map(async holiday => {
          const normalized = normalizeHolidayInfo({
            date: holiday.date,
            isHoliday: true,
            isNationalHoliday: holiday.isNationalHoliday,
            holidayList: [holiday.name],
          });
          memoryCache.set(holiday.date, Promise.resolve(normalized));
          await writeCachedHoliday(holiday.date, normalized);
        }),
      );

      return result;
    })
    .catch(() => []);

  monthMemoryCache.set(monthKey, request);
  return request;
};
