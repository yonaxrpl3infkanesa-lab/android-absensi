import type {AttendanceSettings, DailySchedule, DayKey} from './firebase';

const JAKARTA_TIMEZONE = 'Asia/Jakarta';
const SCHEDULE_FIELDS = [
  'checkInStart',
  'checkInEnd',
  'lateStart',
  'lateEnd',
  'checkOutStart',
  'checkOutEnd',
] as const;

export type HolidayInfo = {
  date: string | null;
  isHoliday: boolean;
  isNationalHoliday: boolean;
  holidayList: string[];
  name: string | null;
};

type ScheduleField = (typeof SCHEDULE_FIELDS)[number];

const formatWithTimeZone = (date: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: JAKARTA_TIMEZONE,
    ...options,
  }).format(date);

const getJakartaDateParts = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: JAKARTA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);

  return {
    year: Number(parts.find(part => part.type === 'year')?.value ?? 0),
    month: Number(parts.find(part => part.type === 'month')?.value ?? 1),
    day: Number(parts.find(part => part.type === 'day')?.value ?? 1),
  };
};

const getJakartaTimeParts = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: JAKARTA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);

  return {
    hours: Number(parts.find(part => part.type === 'hour')?.value ?? 0),
    minutes: Number(parts.find(part => part.type === 'minute')?.value ?? 0),
  };
};

const isValidTimeString = (value: unknown): value is string =>
  typeof value === 'string' && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);

const sanitizeTime = (value: unknown, fallbackValue: string | null = null): string | null => {
  if (value === null) {
    return null;
  }

  if (isValidTimeString(value)) {
    return value;
  }

  return isValidTimeString(fallbackValue) ? fallbackValue : null;
};

const addMinutesToTimeString = (value: string, deltaMinutes: number): string | null => {
  if (!isValidTimeString(value)) {
    return null;
  }

  const nextMinutes = timeStringToMinutes(value) + deltaMinutes;
  const safeMinutes = Math.max(0, Math.min(nextMinutes, 23 * 60 + 59));

  return `${`${Math.floor(safeMinutes / 60)}`.padStart(2, '0')}:${`${safeMinutes % 60}`.padStart(2, '0')}`;
};

const getLegacyFallback = (
  field: ScheduleField,
  rawDay: Partial<DailySchedule> & {checkIn?: unknown; checkOut?: unknown},
  defaultDay: DailySchedule,
) => {
  const legacyCheckIn = sanitizeTime(rawDay?.checkIn, defaultDay.checkInStart);
  const legacyCheckOut = sanitizeTime(rawDay?.checkOut, defaultDay.checkOutEnd);

  switch (field) {
    case 'checkInStart':
    case 'checkInEnd':
      return legacyCheckIn ?? defaultDay[field];
    case 'lateStart':
      return legacyCheckIn ? addMinutesToTimeString(legacyCheckIn, 1) : defaultDay.lateStart;
    case 'lateEnd':
    case 'checkOutStart':
    case 'checkOutEnd':
      return legacyCheckOut ?? defaultDay[field];
    default:
      return defaultDay[field];
  }
};

export const timeStringToMinutes = (value: string | null | undefined): number => {
  if (!isValidTimeString(value)) {
    return 0;
  }

  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

export const formatScheduleTime = (value: string | null | undefined): string =>
  value ? value.replace(':', '.') : '-';

export const formatDateShort = (date: Date): string =>
  formatWithTimeZone(date, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export const formatTimeShort = (date: Date): string =>
  formatWithTimeZone(date, {
    hour: '2-digit',
    minute: '2-digit',
  }).replaceAll(':', '.');

export const buildDateKey = (date: Date): string => {
  const {year, month, day} = getJakartaDateParts(date);
  return `${year}-${`${month}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
};

export const getDayKey = (date: Date = new Date()): DayKey => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: JAKARTA_TIMEZONE,
    weekday: 'long',
  });
  const weekday = formatter.format(date).toLowerCase();

  return (
    {
      monday: 'senin',
      tuesday: 'selasa',
      wednesday: 'rabu',
      thursday: 'kamis',
      friday: 'jumat',
      saturday: 'sabtu',
      sunday: 'minggu',
    }[weekday] ?? 'senin'
  );
};

export const normalizeHolidayInfo = (holidayInfo?: Partial<HolidayInfo> | null): HolidayInfo => {
  const holidayList = Array.isArray(holidayInfo?.holidayList)
    ? holidayInfo.holidayList.filter(item => typeof item === 'string' && item.trim())
    : [];

  return {
    date: typeof holidayInfo?.date === 'string' ? holidayInfo.date : null,
    isHoliday: Boolean(holidayInfo?.isHoliday),
    isNationalHoliday: Boolean(holidayInfo?.isNationalHoliday),
    holidayList,
    name: holidayList[0] ?? null,
  };
};

export const isScheduleConfigured = (schedule?: DailySchedule | null): boolean =>
  SCHEDULE_FIELDS.every(field => isValidTimeString(schedule?.[field]));

export const normalizeDaySchedule = (
  rawDay: (Partial<DailySchedule> & {checkIn?: unknown; checkOut?: unknown}) | null | undefined,
  defaultDay: DailySchedule,
): DailySchedule => {
  const normalized: DailySchedule = {
    isActive: typeof rawDay?.isActive === 'boolean' ? rawDay.isActive : defaultDay.isActive,
    checkInStart: defaultDay.checkInStart,
    checkInEnd: defaultDay.checkInEnd,
    lateStart: defaultDay.lateStart,
    lateEnd: defaultDay.lateEnd,
    checkOutStart: defaultDay.checkOutStart,
    checkOutEnd: defaultDay.checkOutEnd,
  };

  for (const field of SCHEDULE_FIELDS) {
    normalized[field] = sanitizeTime(rawDay?.[field], getLegacyFallback(field, rawDay ?? {}, defaultDay));
  }

  if (!normalized.isActive) {
    for (const field of SCHEDULE_FIELDS) {
      normalized[field] = null;
    }
  }

  return normalized;
};

export const getAttendanceWindow = (
  settings: AttendanceSettings,
  now: Date = new Date(),
  holidayInfo?: HolidayInfo | null,
) => {
  const dayKey = getDayKey(now);
  const schedule = settings.weeklySchedule[dayKey];
  const holiday = normalizeHolidayInfo(holidayInfo);

  if (holiday.isNationalHoliday) {
    return {
      dayKey,
      schedule,
      holiday,
      isOffDay: true,
      offReason: 'national_holiday' as const,
      checkInStatus: 'closed' as const,
      checkOutStatus: 'closed' as const,
      canCheckIn: false,
      canCheckOut: false,
      attendanceStatus: null as 'hadir' | 'terlambat' | null,
      isLate: false,
      withinHours: false,
    };
  }

  if (!schedule?.isActive || !isScheduleConfigured(schedule)) {
    return {
      dayKey,
      schedule,
      holiday,
      isOffDay: true,
      offReason: 'inactive_schedule' as const,
      checkInStatus: 'closed' as const,
      checkOutStatus: 'closed' as const,
      canCheckIn: false,
      canCheckOut: false,
      attendanceStatus: null as 'hadir' | 'terlambat' | null,
      isLate: false,
      withinHours: false,
    };
  }

  const {hours, minutes} = getJakartaTimeParts(now);
  const currentMinutes = hours * 60 + minutes;
  const checkInStartMinutes = timeStringToMinutes(schedule.checkInStart);
  const checkInEndMinutes = timeStringToMinutes(schedule.checkInEnd);
  const lateStartMinutes = timeStringToMinutes(schedule.lateStart);
  const lateEndMinutes = timeStringToMinutes(schedule.lateEnd);
  const checkOutStartMinutes = timeStringToMinutes(schedule.checkOutStart);
  const checkOutEndMinutes = timeStringToMinutes(schedule.checkOutEnd);

  let checkInStatus: 'not_open' | 'normal' | 'late' | 'closed' = 'closed';
  let attendanceStatus: 'hadir' | 'terlambat' | null = null;

  if (currentMinutes < checkInStartMinutes) {
    checkInStatus = 'not_open';
  } else if (currentMinutes <= checkInEndMinutes) {
    checkInStatus = 'normal';
    attendanceStatus = 'hadir';
  } else if (currentMinutes >= lateStartMinutes && currentMinutes <= lateEndMinutes) {
    checkInStatus = 'late';
    attendanceStatus = 'terlambat';
  }

  let checkOutStatus: 'not_open' | 'open' | 'closed' = 'closed';
  if (currentMinutes < checkOutStartMinutes) {
    checkOutStatus = 'not_open';
  } else if (currentMinutes <= checkOutEndMinutes) {
    checkOutStatus = 'open';
  }

  return {
    dayKey,
    schedule,
    holiday,
    isOffDay: false,
    offReason: null,
    checkInStatus,
    checkOutStatus,
    canCheckIn: checkInStatus === 'normal' || checkInStatus === 'late',
    canCheckOut: checkOutStatus === 'open',
    attendanceStatus,
    isLate: attendanceStatus === 'terlambat',
    withinHours:
      checkInStatus === 'normal' || checkInStatus === 'late' || checkOutStatus === 'open',
  };
};

export const getAttendanceBlockedMessage = (
  attendanceWindow: ReturnType<typeof getAttendanceWindow>,
  mode: 'checkin' | 'checkout',
  dayLabel = 'hari ini',
): string => {
  if (attendanceWindow.isOffDay) {
    if (attendanceWindow.offReason === 'national_holiday') {
      return 'Hari Libur Nasional';
    }

    return `Hari ini ${dayLabel} libur. Tidak ada presensi yang perlu dikirim.`;
  }

  if (mode === 'checkin') {
    if (attendanceWindow.checkInStatus === 'not_open') {
      return 'Jam presensi datang belum dibuka.';
    }

    if (attendanceWindow.checkInStatus === 'closed') {
      return 'Jam presensi datang sudah ditutup. Silakan lihat jadwal presensi.';
    }
  }

  if (attendanceWindow.checkOutStatus === 'not_open') {
    return 'Jam presensi pulang belum dibuka.';
  }

  if (attendanceWindow.checkOutStatus === 'closed') {
    return 'Jam presensi pulang sudah ditutup.';
  }

  return '';
};

export const getAttendanceScheduleLines = (schedule?: DailySchedule | null): string[] => {
  if (!schedule?.isActive || !isScheduleConfigured(schedule)) {
    return ['Libur'];
  }

  return [
    `Datang ${formatScheduleTime(schedule.checkInStart)} - ${formatScheduleTime(schedule.checkInEnd)}`,
    `Terlambat ${formatScheduleTime(schedule.lateStart)} - ${formatScheduleTime(schedule.lateEnd)}`,
    `Pulang ${formatScheduleTime(schedule.checkOutStart)} - ${formatScheduleTime(schedule.checkOutEnd)}`,
  ];
};

export const getAttendanceScheduleSummary = (schedule?: DailySchedule | null): string => {
  return getAttendanceScheduleLines(schedule).join(' • ');
};
