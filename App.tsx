import {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import {getApp} from '@react-native-firebase/app';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  CalendarDays,
  CircleCheck,
  CircleX,
  Clock,
  Hash,
  LayoutGrid,
  LogOut,
  Mail,
  MapPin,
  Monitor,
  Phone,
  UserCircle,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';

import {
  AttendanceSettings,
  DEFAULT_ATTENDANCE_SETTINGS,
  DAY_ORDER,
  getStudentProfile,
  getAttendanceSettings,
  signOutCurrentUser,
  subscribeAttendanceHistory,
  subscribeAttendanceSettings,
  subscribeStudentProfile,
  validateStudentLogin,
} from './src/firebase';
import AttendanceActionScreen from './src/AttendanceActionScreen';
import {
  getAttendanceScheduleLines,
  buildDateKey,
  getDayKey,
  getAttendanceWindow,
  isScheduleConfigured,
  timeStringToMinutes,
} from './src/attendanceUtils';
import {
  getNationalHolidaysByMonth,
  type NationalHolidayItem,
} from './src/holidayService';
import {
  clearSessionNisn,
  loadSessionNisn,
  saveSessionNisn,
} from './src/session';
import {AttendanceRecord, UserProfile} from './src/types';

const Colors = {
  primary: '#1B3A7B',
  primaryDark: '#0F2555',
  white: '#FFFFFF',
  background: '#F0F4F8',
  text: '#1A1A2E',
  textSecondary: '#6B7280',
  green: '#22C55E',
  greenLight: '#DCFCE7',
  orange: '#F97316',
  orangeLight: '#FFF7ED',
  red: '#EF4444',
  redLight: '#FEE2E2',
  yellow: '#EAB308',
  yellowLight: '#FEF9C3',
  blue: '#3B82F6',
  blueLight: '#DBEAFE',
  border: '#E5E7EB',
  inputBg: '#F9FAFB',
  shadow: '#000000',
};

const SCHOOL_NAME = 'SMK NEGERI 1 KEPANJEN';
const APP_TITLE = 'Sistem Absensi';
const DEFAULT_AVATAR_URI =
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&crop=face';
const DAY_LABELS: Record<(typeof DAY_ORDER)[number], string> = {
  senin: 'Senin',
  selasa: 'Selasa',
  rabu: 'Rabu',
  kamis: 'Kamis',
  jumat: 'Jumat',
  sabtu: 'Sabtu',
  minggu: 'Minggu',
};
const MONTH_LABELS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];
const TAB_ITEMS = [
  {key: 'home', label: 'Dasbor'},
  {key: 'history', label: 'Riwayat'},
  {key: 'profile', label: 'Profil'},
] as const;

type TabKey = (typeof TAB_ITEMS)[number]['key'];
type AttendanceMode = 'checkin' | 'checkout';
type RootStackParamList = {
  MainTabs: undefined;
  AttendanceAction: {mode: AttendanceMode};
};

type DailyHistory = {
  id: string;
  dateKey: string;
  dateLabel: string;
  school: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: AttendanceRecord['status'];
  checkInPhotoUri: string | null;
  checkOutPhotoUri: string | null;
};

type HolidayMap = Record<string, NationalHolidayItem>;
type SelectedPhotoSet = {
  dateLabel: string;
  checkInPhotoUri: string | null;
  checkOutPhotoUri: string | null;
};

type CalendarDayTone = 'national' | 'collective' | 'weekend' | 'default';

const getHolidayTypeLabel = (holiday: NationalHolidayItem) =>
  holiday.isNationalHoliday ? 'Libur Nasional' : 'Cuti Bersama';

const getHolidayDescription = (holiday: NationalHolidayItem) => {
  const name = holiday.name.toLowerCase();

  if (name.includes('cuti bersama')) {
    return 'Hari libur tambahan untuk memberi ruang istirahat, kebersamaan keluarga, dan kelancaran perayaan.';
  }

  if (name.includes('hari buruh')) {
    return 'Momentum perjuangan hak pekerja dan solidaritas buruh internasional.';
  }

  if (name.includes('hari lahir pancasila')) {
    return 'Momen memperingati lahirnya Pancasila sebagai dasar negara dan pemersatu bangsa.';
  }

  if (name.includes('kemerdekaan republik indonesia') || name.includes('hari kemerdekaan')) {
    return 'Peringatan kemerdekaan Indonesia yang menumbuhkan semangat persatuan, perjuangan, dan cinta tanah air.';
  }

  if (name.includes('tahun baru masehi')) {
    return 'Momen pergantian tahun yang identik dengan harapan, evaluasi, dan awal baru.';
  }

  if (name.includes('imlek') || name.includes('cina')) {
    return 'Perayaan tahun baru bagi masyarakat Tionghoa yang sarat doa, harapan, dan kebersamaan keluarga.';
  }

  if (name.includes('cap go meh')) {
    return 'Penutup rangkaian Tahun Baru Imlek yang identik dengan syukur, tradisi, dan kebersamaan.';
  }

  if (name.includes('nyepi')) {
    return 'Hari suci umat Hindu yang dimaknai sebagai waktu hening, refleksi, dan penyucian diri.';
  }

  if (name.includes('galungan')) {
    return 'Perayaan kemenangan dharma melawan adharma dalam tradisi Hindu Bali.';
  }

  if (name.includes('kuningan')) {
    return 'Hari suci umat Hindu Bali sebagai penutup rangkaian Galungan dan penghormatan kepada leluhur.';
  }

  if (name.includes('waisak')) {
    return 'Perayaan suci umat Buddha untuk memperingati kelahiran, pencerahan, dan parinibbana Buddha.';
  }

  if (name.includes('asadha')) {
    return 'Peringatan penting umat Buddha yang menandai awal penyebaran ajaran Dharma.';
  }

  if (name.includes('isra mikraj')) {
    return 'Peringatan perjalanan spiritual Nabi Muhammad SAW yang sarat makna iman.';
  }

  if (name.includes('ramadan') || name.includes('awal puasa')) {
    return 'Penanda dimulainya bulan suci Ramadan sebagai momen ibadah, pengendalian diri, dan kepedulian sosial.';
  }

  if (name.includes('nuzulul quran')) {
    return 'Peringatan turunnya Al-Quran sebagai petunjuk hidup bagi umat Islam.';
  }

  if (name.includes('idul fitri')) {
    return 'Perayaan kemenangan setelah Ramadan dan momen silaturahmi bersama keluarga.';
  }

  if (name.includes('idul adha')) {
    return 'Hari raya kurban yang meneguhkan keikhlasan, ibadah, dan kepedulian sosial.';
  }

  if (name.includes('tahun baru islam') || name.includes('1 muharram')) {
    return 'Penanda pergantian tahun Hijriah dan momen refleksi bagi umat Islam.';
  }

  if (name.includes('maulid nabi')) {
    return 'Peringatan kelahiran Nabi Muhammad SAW sebagai momen meneladani akhlaknya.';
  }

  if (name.includes('kelahiran yesus kristus') || name.includes('natal')) {
    return 'Perayaan kelahiran Yesus Kristus yang membawa pesan damai, kasih, dan sukacita.';
  }

  if (name.includes('wafat yesus kristus')) {
    return 'Peringatan pengorbanan Yesus Kristus yang dimaknai dengan khidmat oleh umat Kristiani.';
  }

  if (name.includes('kenaikan yesus kristus')) {
    return 'Peringatan kenaikan Yesus Kristus ke surga dalam tradisi Kristiani.';
  }

  if (name.includes('paskah')) {
    return 'Perayaan kebangkitan Yesus Kristus yang dimaknai sebagai kemenangan harapan dan kehidupan.';
  }

  if (name.includes('jumat agung')) {
    return 'Momen khidmat untuk mengenang pengorbanan Yesus Kristus dalam tradisi Kristiani.';
  }

  if (name.includes('kamis putih')) {
    return 'Peringatan kebersamaan dan pelayanan menjelang wafat Yesus Kristus.';
  }

  if (name.includes('ascension') || name.includes('kenaikan')) {
    return 'Peringatan keagamaan yang mengajak umat memaknai iman, harapan, dan keteladanan.';
  }

  if (name.includes('hari pahlawan')) {
    return 'Momentum mengenang jasa para pahlawan dan menumbuhkan semangat pengabdian bagi bangsa.';
  }

  if (name.includes('sumpah pemuda')) {
    return 'Peringatan persatuan pemuda Indonesia yang menegaskan satu tanah air, bangsa, dan bahasa.';
  }

  if (name.includes('hari kartini')) {
    return 'Momen mengenang perjuangan R.A. Kartini untuk pendidikan, emansipasi, dan kemajuan perempuan.';
  }

  if (name.includes('hari pendidikan')) {
    return 'Pengingat pentingnya pendidikan sebagai fondasi masa depan dan kemajuan bangsa.';
  }

  if (name.includes('hari anak nasional')) {
    return 'Momen untuk menegaskan perlindungan, kebahagiaan, dan masa depan terbaik bagi anak-anak.';
  }

  if (name.includes('pemilu') || name.includes('pilkada')) {
    return 'Hari penting demokrasi untuk menyalurkan hak pilih dan menentukan arah kepemimpinan bersama.';
  }

  if (holiday.isCollectiveLeave) {
    return 'Hari libur tambahan untuk memberi ruang istirahat, kebersamaan, dan kelancaran perayaan.';
  }

  return 'Hari libur untuk memberi ruang peringatan, refleksi, dan kebersamaan sesuai momennya.';
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

const formatClockTime = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}.${String(
    date.getMinutes(),
  ).padStart(2, '0')}.${String(date.getSeconds()).padStart(2, '0')}`;

const formatFullDate = (date: Date) =>
  `${DAY_LABELS[DAY_ORDER[date.getDay()]]}, ${date.getDate()} ${
    MONTH_LABELS[date.getMonth()]
  } ${date.getFullYear()}`;

const formatDateLabel = (date: Date) =>
  `${date.getDate()} ${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`;

const formatDayMonthYear = (dateKey: string) => {
  const parsedDate = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return dateKey;
  }

  return formatDateLabel(parsedDate);
};

const getTimeFromIso = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${String(date.getHours()).padStart(2, '0')}.${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
};

const getStatusConfig = (status: AttendanceRecord['status']) => {
  switch (status) {
    case 'terlambat':
      return {
        label: 'Terlambat',
        color: Colors.orange,
        bgColor: Colors.orangeLight,
      };
    case 'tidak_hadir':
      return {
        label: 'Tidak Hadir',
        color: Colors.red,
        bgColor: Colors.redLight,
      };
    case 'tidak_valid':
      return {
        label: 'Tidak Valid',
        color: Colors.yellow,
        bgColor: Colors.yellowLight,
      };
    default:
      return {
        label: 'Hadir',
        color: Colors.green,
        bgColor: Colors.greenLight,
      };
  }
};

function App() {
  const [nisn, setNisn] = useState('');
  const [password, setPassword] = useState('');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [booting, setBooting] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [monthHolidays, setMonthHolidays] = useState<NationalHolidayItem[]>([]);
  const [selectedHolidayDate, setSelectedHolidayDate] = useState<string | null>(null);
  const [holidayPopup, setHolidayPopup] = useState<NationalHolidayItem | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [summaryMonthHolidays, setSummaryMonthHolidays] = useState<NationalHolidayItem[]>([]);
  const [selectedPhotoSet, setSelectedPhotoSet] = useState<SelectedPhotoSet | null>(null);
  const [settings, setSettings] = useState<AttendanceSettings>(
    DEFAULT_ATTENDANCE_SETTINGS,
  );
  const currentSummaryYear = currentTime.getFullYear();
  const currentSummaryMonth = currentTime.getMonth();
  const currentSummaryMonthDate = useMemo(
    () => new Date(currentSummaryYear, currentSummaryMonth, 1),
    [currentSummaryMonth, currentSummaryYear],
  );
  const popupOpacity = useRef(new Animated.Value(0)).current;
  const popupTranslateY = useRef(new Animated.Value(12)).current;
  const detailOpacity = useRef(new Animated.Value(1)).current;
  const detailTranslateY = useRef(new Animated.Value(0)).current;
  const monthHolidayMap = useMemo(
    () =>
      monthHolidays.reduce((result, holiday) => {
        result[holiday.date] = holiday;
        return result;
      }, {} as HolidayMap),
    [monthHolidays],
  );
  const selectedHoliday =
    monthHolidays.find(holiday => holiday.date === selectedHolidayDate) ?? null;
  const selectedHolidayDescription = selectedHoliday
    ? getHolidayDescription(selectedHoliday)
    : '';

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;

    setCalendarLoading(true);
    getNationalHolidaysByMonth(selectedMonth)
      .then(result => {
        if (!active) {
          return;
        }

        setMonthHolidays(result);
        setHolidayPopup(null);
        setSelectedHolidayDate(null);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setMonthHolidays([]);
        setSelectedHolidayDate(null);
        setHolidayPopup(null);
      })
      .finally(() => {
        if (active) {
          setCalendarLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedMonth]);

  useEffect(() => {
    let active = true;

    getNationalHolidaysByMonth(currentSummaryMonthDate)
      .then(result => {
        if (active) {
          setSummaryMonthHolidays(result);
        }
      })
      .catch(() => {
        if (active) {
          setSummaryMonthHolidays([]);
        }
      });

    return () => {
      active = false;
    };
  }, [currentSummaryMonth, currentSummaryMonthDate, currentSummaryYear]);

  useEffect(() => {
    if (!holidayPopup) {
      popupOpacity.setValue(0);
      popupTranslateY.setValue(12);
      return;
    }

    popupOpacity.setValue(0);
    popupTranslateY.setValue(12);
    Animated.parallel([
      Animated.timing(popupOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(popupTranslateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [holidayPopup, popupOpacity, popupTranslateY]);

  useEffect(() => {
    if (!selectedHoliday) {
      detailOpacity.setValue(1);
      detailTranslateY.setValue(0);
      return;
    }

    detailOpacity.setValue(0.65);
    detailTranslateY.setValue(8);
    Animated.parallel([
      Animated.timing(detailOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(detailTranslateY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [detailOpacity, detailTranslateY, selectedHoliday]);

  useEffect(() => {
    const bootstrap = async () => {
      let ready = false;

      try {
        ready = Boolean(getApp().options.projectId);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Firebase native belum terinisialisasi dengan benar.',
        );
      }

      setFirebaseReady(ready);

      if (!ready) {
        setErrorMessage(
          'Firebase belum terhubung. Tambahkan `google-services.json` dan `GoogleService-Info.plist` dari project Firebase Anda.',
        );
        setBooting(false);
        return;
      }

      try {
        const storedNisn = await loadSessionNisn();

        if (!storedNisn) {
          return;
        }

        const profile = await getStudentProfile(storedNisn);

        if (profile) {
          setCurrentUser(profile);
          setNisn(profile.nisn);
        } else {
          await clearSessionNisn();
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Gagal memuat sesi login.',
        );
      } finally {
        setBooting(false);
      }
    };

    bootstrap();
  }, []);

  useEffect(() => {
    if (!currentUser?.nisn) {
      return;
    }

    const unsubscribe = subscribeStudentProfile(
      currentUser.nisn,
      profile => {
        if (!profile) {
          setCurrentUser(null);
          setHistory([]);
          clearSessionNisn().catch(() => undefined);
          return;
        }

        setCurrentUser(previous => {
          if (
            previous &&
            previous.nisn === profile.nisn &&
            previous.name === profile.name &&
            previous.className === profile.className &&
            previous.schoolName === profile.schoolName &&
            previous.major === profile.major &&
            previous.birthDate === profile.birthDate &&
            previous.email === profile.email &&
            previous.phone === profile.phone &&
            previous.address === profile.address &&
            previous.avatar === profile.avatar
          ) {
            return previous;
          }

          return profile;
        });
      },
      error => {
        setErrorMessage(
          `Profil realtime gagal dimuat: ${error.message}.`,
        );
      },
    );

    return unsubscribe;
  }, [currentUser?.nisn]);

  useEffect(() => {
    if (!currentUser) {
      setHistory([]);
      setHistoryLoading(false);
      return;
    }

    setHistoryLoading(true);
    setErrorMessage(null);

    const unsubscribe = subscribeAttendanceHistory(
      currentUser.nisn,
      records => {
        setHistory(records);
        setHistoryLoading(false);
      },
      error => {
        setHistoryLoading(false);
        setErrorMessage(
          `Riwayat absensi gagal dimuat: ${error.message}. Cek koneksi internet atau aturan Firestore.`,
        );
      },
    );

    return unsubscribe;
  }, [currentUser]);

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      try {
        const remoteSettings = await getAttendanceSettings();
        if (active) {
          setSettings(remoteSettings);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Gagal memuat jadwal absensi.',
          );
        }
      }
    };

    loadSettings();

    const unsubscribe = subscribeAttendanceSettings(
      remoteSettings => {
        if (active) {
          setSettings(remoteSettings);
        }
      },
      error => {
        if (active) {
          setErrorMessage(
            `Jadwal realtime gagal dimuat: ${error.message}.`,
          );
        }
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!currentUser) {
          return false;
        }

        if (selectedPhotoSet) {
          setSelectedPhotoSet(null);
          return true;
        }

        if (calendarVisible) {
          setCalendarVisible(false);
          return true;
        }

        if (navigationRef.isReady() && navigationRef.canGoBack()) {
          navigationRef.goBack();
          return true;
        }

        if (activeTab !== 'home') {
          setActiveTab('home');
          return true;
        }

        return false;
      },
    );

    return () => subscription.remove();
  }, [activeTab, calendarVisible, currentUser, selectedPhotoSet]);

  const groupedHistory = useMemo<DailyHistory[]>(() => {
    if (history.some(item => item.date || item.checkInTime || item.checkOutTime)) {
      return [...history]
        .map(item => {
          const dateKey =
            item.date ||
            String(item.createdAt || item.deviceTimestamp || '').slice(0, 10);
          const hasCheckIn =
            typeof item.checkInTime === 'string' && item.checkInTime.trim().length > 0;
          const hasCheckOut =
            typeof item.checkOutTime === 'string' && item.checkOutTime.trim().length > 0;
          const fallbackPhoto = item.photoUri || item.photoUrl || null;

          return {
            id: item.id,
            dateKey,
            dateLabel: item.dateLabel || formatDayMonthYear(dateKey),
            school: item.school || currentUser?.schoolName || SCHOOL_NAME,
            checkInTime: item.checkInTime ?? null,
            checkOutTime: item.checkOutTime ?? null,
            status: item.status,
            checkInPhotoUri:
              item.checkInPhotoUri ||
              item.checkInPhotoUrl ||
              (hasCheckIn ? fallbackPhoto : null),
            checkOutPhotoUri:
              item.checkOutPhotoUri ||
              item.checkOutPhotoUrl ||
              (hasCheckOut && !hasCheckIn ? fallbackPhoto : null),
          };
        })
        .sort((left, right) => right.dateKey.localeCompare(left.dateKey));
    }

    const map = new Map<string, DailyHistory>();
    const sorted = [...history].sort((left, right) => {
      const leftValue = new Date(
        left.createdAt || left.deviceTimestamp || 0,
      ).getTime();
      const rightValue = new Date(
        right.createdAt || right.deviceTimestamp || 0,
      ).getTime();
      return rightValue - leftValue;
    });

    sorted.forEach(item => {
      const sourceValue = item.createdAt || item.deviceTimestamp;
      const parsedDate = sourceValue ? new Date(sourceValue) : new Date();
      const dateKey = Number.isNaN(parsedDate.getTime())
        ? String(sourceValue).slice(0, 10)
        : parsedDate.toISOString().slice(0, 10);
      const existing = map.get(dateKey);
      const eventType =
        item.eventType === 'checkout' || /pulang/i.test(item.note)
          ? 'checkout'
          : 'checkin';
      const eventTime =
        getTimeFromIso(item.createdAt) || getTimeFromIso(item.deviceTimestamp);

      if (!existing) {
        map.set(dateKey, {
          id: dateKey,
          dateKey,
          dateLabel: formatDayMonthYear(dateKey),
          school: currentUser?.schoolName || SCHOOL_NAME,
          checkInTime: eventType === 'checkin' ? eventTime : null,
          checkOutTime: eventType === 'checkout' ? eventTime : null,
          status: item.status,
          checkInPhotoUri:
            eventType === 'checkin'
              ? item.checkInPhotoUri || item.checkInPhotoUrl || item.photoUrl || null
              : null,
          checkOutPhotoUri:
            eventType === 'checkout'
              ? item.checkOutPhotoUri || item.checkOutPhotoUrl || item.photoUrl || null
              : null,
        });
        return;
      }

      if (eventType === 'checkin' && !existing.checkInTime) {
        existing.checkInTime = eventTime;
      }

      if (eventType === 'checkout' && !existing.checkOutTime) {
        existing.checkOutTime = eventTime;
      }

      if (
        eventType === 'checkin' &&
        !existing.checkInPhotoUri &&
        (item.checkInPhotoUri || item.checkInPhotoUrl || item.photoUrl)
      ) {
        existing.checkInPhotoUri =
          item.checkInPhotoUri || item.checkInPhotoUrl || item.photoUrl || null;
      }

      if (
        eventType === 'checkout' &&
        !existing.checkOutPhotoUri &&
        (item.checkOutPhotoUri || item.checkOutPhotoUrl || item.photoUrl)
      ) {
        existing.checkOutPhotoUri =
          item.checkOutPhotoUri || item.checkOutPhotoUrl || item.photoUrl || null;
      }

      if (existing.status === 'hadir' && item.status !== 'hadir') {
        existing.status = item.status;
      }
    });

    return Array.from(map.values()).sort((left, right) =>
      right.dateKey.localeCompare(left.dateKey),
    );
  }, [currentUser?.schoolName, history]);

  const currentMonthKey = `${currentTime.getFullYear()}-${`${currentTime.getMonth() + 1}`.padStart(2, '0')}`;
  const monthlyHistory = useMemo(
    () => groupedHistory.filter(item => item.dateKey.startsWith(currentMonthKey)),
    [currentMonthKey, groupedHistory],
  );

  const summary = useMemo(() => {
    const recordedDays = new Set(monthlyHistory.map(item => item.dateKey));
    const holidayKeys = new Set(summaryMonthHolidays.map(item => item.date));
    const currentYear = currentTime.getFullYear();
    const currentMonth = currentTime.getMonth();
    const today = currentTime.getDate();
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    let tidakHadir = 0;

    for (let day = 1; day <= today; day += 1) {
      const date = new Date(currentYear, currentMonth, day, 12, 0, 0);
      const dateKey = buildDateKey(date);
      const dayKey = getDayKey(date);
      const schedule = settings.weeklySchedule[dayKey];

      if (!schedule?.isActive || !isScheduleConfigured(schedule) || holidayKeys.has(dateKey)) {
        continue;
      }

      if (day === today) {
        const lateEndMinutes = timeStringToMinutes(schedule.lateEnd);

        if (currentMinutes <= lateEndMinutes) {
          continue;
        }
      }

      if (!recordedDays.has(dateKey)) {
        tidakHadir += 1;
      }
    }

    return {
      hadir: monthlyHistory.filter(item => item.status === 'hadir').length,
      terlambat: monthlyHistory.filter(item => item.status === 'terlambat').length,
      tidakHadir,
    };
  }, [currentTime, monthlyHistory, settings.weeklySchedule, summaryMonthHolidays]);
  const summaryPeriodLabel = `Periode ${MONTH_LABELS[currentSummaryMonth]} ${currentSummaryYear}`;

  const attendanceWindow = getAttendanceWindow(settings, currentTime);
  const scheduleLines = attendanceWindow.holiday.isNationalHoliday
    ? ['Hari Libur Nasional']
    : getAttendanceScheduleLines(attendanceWindow.schedule);
  const selectedMonthYear = selectedMonth.getFullYear();
  const selectedMonthIndex = selectedMonth.getMonth();
  const firstDay = new Date(selectedMonthYear, selectedMonthIndex, 1).getDay();
  const daysInMonth = new Date(
    selectedMonthYear,
    selectedMonthIndex + 1,
    0,
  ).getDate();
  const totalCalendarSlots = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const calendarDays = Array.from({length: totalCalendarSlots}, (_, index) => {
    if (index < firstDay) {
      return null;
    }

    const dayNumber = index - firstDay + 1;
    return dayNumber <= daysInMonth ? dayNumber : null;
  });
  const handleLogin = async () => {
    const trimmedNisn = nisn.trim();
    const trimmedPassword = password.trim();

    if (!trimmedNisn || !trimmedPassword) {
      setErrorMessage('NISN dan Kata Sandi harus diisi');
      return;
    }

    setAuthLoading(true);
    setErrorMessage(null);

    try {
      const profile = await validateStudentLogin(trimmedNisn, trimmedPassword);
      await saveSessionNisn(profile.nisn);
      setCurrentUser(profile);
      setNisn(profile.nisn);
      setPassword('');
      setActiveTab('home');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'NISN atau Kata Sandi salah',
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOutCurrentUser();
    await clearSessionNisn();
    setCurrentUser(null);
    setPassword('');
    setHistory([]);
    setErrorMessage(null);
    setActiveTab('home');
  };

  const renderHeaderBar = () => (
    <View style={styles.headerBar}>
      <Image
        source={{
          uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Seal_of_Malang_Regency.svg/120px-Seal_of_Malang_Regency.svg.png',
        }}
        style={styles.headerLogo}
      />
      <View>
        <Text style={styles.headerTitle}>{APP_TITLE}</Text>
        <Text style={styles.headerSubtitle}>{SCHOOL_NAME}</Text>
      </View>
    </View>
  );

  const renderLoginScreen = () => (
    <View style={styles.loginRoot}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      <KeyboardAvoidingView
        style={styles.loginFlex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.loginScroll}
          keyboardShouldPersistTaps="handled">
          <View style={styles.logoSection}>
            <Image
              source={require('./assets/images/logo kanesa.png')}
              style={styles.loginLogo}
              resizeMode="contain"
            />
            <Text style={styles.loginSchoolName}>{SCHOOL_NAME}</Text>
            <Text style={styles.loginSubtitle}>Sistem Absensi Siswa</Text>
          </View>

          <View style={styles.loginCard}>
            <Text style={styles.loginLabel}>NISN</Text>
            <TextInput
              style={styles.loginInput}
              placeholder="Masukkan NISN Anda"
              placeholderTextColor={Colors.textSecondary}
              value={nisn}
              onChangeText={setNisn}
              keyboardType="numeric"
            />

            <Text style={styles.loginLabel}>KATA SANDI</Text>
            <TextInput
              style={styles.loginInput}
              placeholder="Masukkan Kata Sandi Anda"
              placeholderTextColor={Colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {errorMessage ? (
              <Text style={styles.errorTextCenter}>{errorMessage}</Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.loginButton,
                (authLoading || !firebaseReady) && styles.buttonPressed,
              ]}
              onPress={handleLogin}
              activeOpacity={0.8}
              disabled={authLoading || !firebaseReady}>
              {authLoading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.loginButtonText}>Masuk</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7}>
              <Text style={styles.forgotText}>Lupa Kata Sandi?</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.loginFooter}>@ {SCHOOL_NAME}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );

  const renderDashboard = () => (
    <View style={styles.tabRoot}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      {renderHeaderBar()}
      <ScrollView
        style={styles.tabScroll}
        contentContainerStyle={styles.tabScrollContent}
        showsVerticalScrollIndicator={false}>
        <Pressable style={styles.greetingCard} onPress={() => setActiveTab('profile')}>
          <View style={styles.greetingLeft}>
            <Text style={styles.greetingName}>Hallo, {currentUser?.name}</Text>
            <Text style={styles.greetingClass}>
              {currentUser?.className || '-'}
            </Text>
          </View>
          <Image
            source={{uri: currentUser?.avatar || DEFAULT_AVATAR_URI}}
            style={styles.avatar}
          />
        </Pressable>

        <View style={styles.timeCard}>
          <View style={styles.timeHeader}>
            <Text style={styles.timeLabel}>Waktu Saat Ini</Text>
            <Pressable
              style={styles.calendarButton}
              onPress={() => setCalendarVisible(true)}>
              <CalendarDays size={20} color={Colors.white} />
            </Pressable>
          </View>
          <Text style={styles.timeValue}>{formatClockTime(currentTime)}</Text>
          <Text style={styles.dateValue}>{formatFullDate(currentTime)}</Text>
        </View>

        <View style={styles.scheduleCard}>
          <Text style={styles.scheduleTitle}>{settings.name}</Text>
          <Text style={styles.scheduleDayLabel}>{DAY_LABELS[attendanceWindow.dayKey]}</Text>
          <View style={styles.scheduleSummaryBlock}>
            {scheduleLines.map(line => (
              <Text key={line} style={styles.scheduleSubtitle}>
                {line}
              </Text>
            ))}
          </View>
          <Text style={styles.scheduleMeta}>{settings.location.name}</Text>
          <Text style={styles.scheduleMeta}>
            Radius {settings.radiusMeters} meter
          </Text>
        </View>

        {errorMessage ? <Text style={styles.dashboardError}>{errorMessage}</Text> : null}

        <View style={styles.attendanceButtons}>
          <Pressable
            style={({pressed}) => [
              styles.checkInButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={() =>
              navigationRef.isReady() &&
              navigationRef.navigate('AttendanceAction', {mode: 'checkin'})
            }>
            <Clock size={36} color={Colors.white} />
            <Text style={styles.attendanceBtnTitle}>Datang</Text>
            <Text style={styles.attendanceBtnSub}>Absen Datang</Text>
          </Pressable>

          <Pressable
            style={({pressed}) => [
              styles.checkOutButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={() =>
              navigationRef.isReady() &&
              navigationRef.navigate('AttendanceAction', {mode: 'checkout'})
            }>
            <Clock size={36} color={Colors.white} />
            <Text style={styles.attendanceBtnTitle}>Pulang</Text>
            <Text style={styles.attendanceBtnSub}>Absen Pulang</Text>
          </Pressable>
        </View>

        <Pressable style={styles.summaryCard} onPress={() => setActiveTab('history')}>
          <Text style={styles.summaryTitle}>Ringkasan Kehadiran</Text>
          <Text style={styles.summarySubtitle}>{summaryPeriodLabel}</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <CircleCheck size={28} color={Colors.green} />
              <Text style={styles.summaryCount}>{summary.hadir}</Text>
              <Text style={styles.summaryLabel}>Hadir</Text>
            </View>
            <View style={styles.summaryItem}>
              <Clock size={28} color={Colors.orange} />
              <Text style={styles.summaryCount}>{summary.terlambat}</Text>
              <Text style={styles.summaryLabel}>Terlambat</Text>
            </View>
            <View style={styles.summaryItem}>
              <CircleX size={28} color={Colors.red} />
              <Text style={styles.summaryCount}>{summary.tidakHadir}</Text>
              <Text style={styles.summaryLabel}>Tidak Hadir</Text>
            </View>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );

  const renderHistory = () => (
    <View style={styles.tabRoot}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      {renderHeaderBar()}
      <View style={styles.historyContent}>
        <Text style={styles.screenTitle}>Riwayat Kehadiran</Text>
        {historyLoading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : groupedHistory.length === 0 ? (
          <View style={styles.centerContent}>
            <Text style={styles.emptyText}>Belum ada riwayat kehadiran</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {groupedHistory.map(item => {
              const config = getStatusConfig(item.status);

              return (
                <Pressable
                  key={item.id}
                  style={styles.recordCard}
                  onPress={() =>
                    (item.checkInPhotoUri || item.checkOutPhotoUri) &&
                    setSelectedPhotoSet({
                      dateLabel: item.dateLabel,
                      checkInPhotoUri: item.checkInPhotoUri,
                      checkOutPhotoUri: item.checkOutPhotoUri,
                    })
                  }>
                  <View style={styles.recordHeader}>
                    <View style={styles.recordHeaderLeft}>
                      {item.status === 'hadir' ? (
                        <CircleCheck size={20} color={config.color} />
                      ) : item.status === 'terlambat' ? (
                        <Clock size={20} color={config.color} />
                      ) : (
                        <CircleX size={20} color={config.color} />
                      )}
                      <Text style={styles.recordDate}>{item.dateLabel}</Text>
                    </View>
                    <View
                      style={[styles.statusBadge, {backgroundColor: config.bgColor}]}>
                      <Text style={[styles.statusText, {color: config.color}]}>
                        {config.label}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.recordSchool}>{item.school}</Text>
                  <View style={styles.recordTimesRow}>
                    <Text style={styles.recordTimeLabel}>
                      Datang :{' '}
                      <Text style={styles.recordTimeValue}>
                        {item.checkInTime || '-'}
                      </Text>
                    </Text>
                    <Text style={styles.recordTimeLabel}>
                      Pulang :{' '}
                      <Text style={styles.recordTimeValue}>
                        {item.checkOutTime || '-'}
                      </Text>
                    </Text>
                  </View>
                  <Text
                    style={
                      item.checkInPhotoUri || item.checkOutPhotoUri
                        ? styles.photoHint
                        : styles.photoHintDisabled
                    }>
                    {item.checkInPhotoUri || item.checkOutPhotoUri
                      ? 'Ketuk untuk melihat foto absen datang dan pulang'
                      : 'Foto belum tersedia'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );

  const renderProfile = () => (
    <View style={styles.profileRoot}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      {renderHeaderBar()}
      <ScrollView
        style={styles.profileScroll}
        contentContainerStyle={styles.profileScrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <Image
            source={{uri: currentUser?.avatar || DEFAULT_AVATAR_URI}}
            style={styles.profileAvatar}
          />
          <Text style={styles.profileName}>{currentUser?.name || '-'}</Text>
          <Text style={styles.profileId}>{currentUser?.nisn || '-'}</Text>
          <View style={styles.classBadge}>
            <Text style={styles.classBadgeText}>
              {currentUser?.className || '-'}
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          {[
            {
              label: 'NISN',
              value: currentUser?.nisn || '-',
              icon: <Hash size={18} color={Colors.primary} />,
            },
            {
              label: 'Kelas',
              value: currentUser?.className || '-',
              icon: <Users size={18} color={Colors.orange} />,
            },
            {
              label: 'Jurusan',
              value: currentUser?.major || '-',
              icon: <Monitor size={18} color={Colors.green} />,
            },
            {
              label: 'Tanggal Lahir',
              value: currentUser?.birthDate || '-',
              icon: <CalendarDays size={18} color={Colors.blue} />,
            },
            {
              label: 'Email Siswa',
              value: currentUser?.email || '-',
              icon: <Mail size={18} color={Colors.primary} />,
            },
            {
              label: 'No. Telepon Siswa',
              value: currentUser?.phone || '-',
              icon: <Phone size={18} color={Colors.green} />,
            },
            {
              label: 'Alamat',
              value: currentUser?.address || '-',
              icon: <MapPin size={18} color={Colors.red} />,
            },
          ].map(({label, value, icon}, index) => (
            <View key={label}>
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>{icon}</View>
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>{label}</Text>
                  <Text style={styles.infoValue}>{value}</Text>
                </View>
              </View>
              {index < 6 ? <View style={styles.divider} /> : null}
            </View>
          ))}
        </View>

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <LogOut size={20} color={Colors.white} />
          <Text style={styles.logoutText}>Keluar</Text>
        </Pressable>
      </ScrollView>
    </View>
  );

  const renderBottomTabs = () => (
    <View style={styles.bottomTabBar}>
      {TAB_ITEMS.map(item => {
        const active = activeTab === item.key;

        return (
          <Pressable
            key={item.key}
            style={styles.bottomTabItem}
            onPress={() => setActiveTab(item.key)}>
            <View
              style={[
                styles.bottomTabIconWrap,
                active && styles.bottomTabIconWrapActive,
              ]}>
              {item.key === 'home' ? (
                <LayoutGrid
                  size={24}
                  color={active ? Colors.primary : Colors.textSecondary}
                />
              ) : item.key === 'history' ? (
                <Clock
                  size={24}
                  color={active ? Colors.primary : Colors.textSecondary}
                />
              ) : (
                <UserCircle
                  size={24}
                  color={active ? Colors.primary : Colors.textSecondary}
                />
              )}
            </View>
            <Text
              style={[
                styles.bottomTabLabel,
                active && styles.bottomTabLabelActive,
              ]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (booting) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.loadingRoot}>
          <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
          <ActivityIndicator color={Colors.white} size="large" />
          <Text style={styles.loadingText}>Memuat sesi aplikasi...</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  const renderMainTabsScreen = () => (
    <>
      {activeTab === 'home'
        ? renderDashboard()
        : activeTab === 'history'
          ? renderHistory()
          : renderProfile()}
      {renderBottomTabs()}
    </>
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.appRoot}>
        {!currentUser ? (
          renderLoginScreen()
        ) : (
          <NavigationContainer ref={navigationRef} key={currentUser.nisn}>
            <Stack.Navigator screenOptions={{headerShown: false}}>
              <Stack.Screen name="MainTabs">
                {renderMainTabsScreen}
              </Stack.Screen>
              <Stack.Screen name="AttendanceAction">
                {({navigation, route}) => (
                  <AttendanceActionScreen
                    currentUser={currentUser}
                    isAdmin={false}
                    mode={route.params.mode}
                    settings={settings}
                    onBack={() => navigation.goBack()}
                    onSaved={() => {
                      setActiveTab('history');
                      navigation.goBack();
                    }}
                  />
                )}
              </Stack.Screen>
            </Stack.Navigator>
          </NavigationContainer>
        )}

        <Modal
          visible={calendarVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setCalendarVisible(false);
            setHolidayPopup(null);
          }}>
          <View style={styles.calendarOverlay}>
            <Pressable
              style={styles.calendarBackdrop}
              onPress={() => {
                setCalendarVisible(false);
                setHolidayPopup(null);
              }}
            />
            <View style={styles.calendarModal}>
              <View style={styles.calendarModalHeader}>
                <Text style={styles.calendarModalTitle}>Kalender</Text>
                <Pressable
                  onPress={() => {
                    setCalendarVisible(false);
                    setHolidayPopup(null);
                  }}>
                  <Text style={styles.calendarCloseText}>Tutup</Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.calendarScrollArea}
                contentContainerStyle={styles.calendarScrollContent}
                showsVerticalScrollIndicator={false}>
                <View style={styles.calendarMonthRow}>
                  <Pressable
                    style={styles.calendarNavButton}
                    onPress={() =>
                      setSelectedMonth(
                        previous =>
                          new Date(
                            previous.getFullYear(),
                            previous.getMonth() - 1,
                            1,
                          ),
                      )
                    }>
                    <ChevronLeft size={18} color={Colors.primary} />
                  </Pressable>
                  <Text style={styles.calendarMonthText}>
                    {MONTH_LABELS[selectedMonthIndex]} {selectedMonthYear}
                  </Text>
                  <Pressable
                    style={styles.calendarNavButton}
                    onPress={() =>
                      setSelectedMonth(
                        previous =>
                          new Date(
                            previous.getFullYear(),
                            previous.getMonth() + 1,
                            1,
                          ),
                      )
                    }>
                    <ChevronRight size={18} color={Colors.primary} />
                  </Pressable>
                </View>

                {holidayPopup ? (
                  <Animated.View
                    style={[
                      styles.calendarPopupCard,
                      {
                        opacity: popupOpacity,
                        transform: [{translateY: popupTranslateY}],
                      },
                    ]}>
                    <Text style={styles.calendarPopupDate}>
                      {formatDayMonthYear(holidayPopup.date)}
                    </Text>
                    <Text style={styles.calendarPopupTitle}>{holidayPopup.name}</Text>
                  </Animated.View>
                ) : null}

                <View style={styles.calendarGrid}>
                  {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((dayName, dayIndex) => (
                    <Text
                      key={dayName}
                      style={[styles.calendarDayName, dayIndex === 0 && styles.calendarSundayName]}>
                      {dayName}
                    </Text>
                  ))}
                  {calendarDays.map((day, index) => {
                    const isToday =
                      day === currentTime.getDate() &&
                      selectedMonthIndex === currentTime.getMonth() &&
                      selectedMonthYear === currentTime.getFullYear();
                    const dateKey =
                      day === null
                        ? null
                        : `${selectedMonthYear}-${`${selectedMonthIndex + 1}`.padStart(
                            2,
                            '0',
                          )}-${`${day}`.padStart(2, '0')}`;
                    const holiday = dateKey ? monthHolidayMap[dateKey] : null;
                    const isSelectedHoliday = holiday?.date === selectedHolidayDate;
                    const weekdayColumn = index % 7;
                    const isWeekendColumn = weekdayColumn === 0 || weekdayColumn === 6;
                    const dayTone: CalendarDayTone = holiday
                      ? holiday.isNationalHoliday
                        ? 'national'
                        : 'collective'
                      : isWeekendColumn
                        ? 'weekend'
                        : 'default';

                    return (
                      <Pressable
                        key={day === null ? `empty-${index}` : `day-${day}`}
                        disabled={!holiday}
                        onPress={() => {
                          if (holiday) {
                            setSelectedHolidayDate(holiday.date);
                            setHolidayPopup(holiday);
                          }
                        }}
                        style={[
                          styles.calendarDayCell,
                          dayTone === 'weekend' && styles.calendarWeekendCell,
                          dayTone === 'national' && styles.calendarNationalHolidayCell,
                          dayTone === 'collective' && styles.calendarCollectiveLeaveCell,
                          isSelectedHoliday && styles.calendarHolidaySelected,
                          isToday && styles.calendarDayToday,
                        ]}>
                        {day ? (
                          <Text
                            style={[
                              styles.calendarDayText,
                              dayTone === 'weekend' && styles.calendarWeekendText,
                              dayTone === 'national' && styles.calendarNationalHolidayText,
                              dayTone === 'collective' && styles.calendarCollectiveLeaveText,
                              isSelectedHoliday && styles.calendarHolidaySelectedText,
                              isToday && styles.calendarDayTodayText,
                            ]}>
                            {day}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.calendarHolidayPanel}>
                  <View style={styles.calendarHolidayPanelHeader}>
                    <Text style={styles.calendarHolidayPanelTitle}>Hari Libur & Cuti Bersama</Text>
                    {!calendarLoading && monthHolidays.length > 0 ? (
                      <View style={styles.calendarHolidayCountBadge}>
                        <Text style={styles.calendarHolidayCountText}>
                          {monthHolidays.length} hari
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {calendarLoading ? (
                    <Text style={styles.calendarHolidayEmpty}>Memuat data hari libur...</Text>
                  ) : selectedHoliday ? (
                    <Animated.View
                      style={[
                        styles.calendarHolidayDetailCard,
                        selectedHoliday.isNationalHoliday
                          ? styles.calendarHolidayDetailNational
                          : styles.calendarHolidayDetailCollective,
                        {
                          opacity: detailOpacity,
                          transform: [{translateY: detailTranslateY}],
                        },
                      ]}>
                      <Text style={styles.calendarHolidayDate}>
                        {formatDayMonthYear(selectedHoliday.date)}
                      </Text>
                      <Text style={styles.calendarHolidayName}>{selectedHoliday.name}</Text>
                      <Text style={styles.calendarHolidayTypeLabel}>
                        {getHolidayTypeLabel(selectedHoliday)}
                      </Text>
                      <Text style={styles.calendarHolidayHint}>
                        {selectedHolidayDescription}
                      </Text>
                    </Animated.View>
                  ) : (
                    <View style={styles.calendarHolidayEmptyCard}>
                      <Text style={styles.calendarHolidayEmptyTitle}>
                        Belum ada detail dipilih
                      </Text>
                      <Text style={styles.calendarHolidayEmpty}>
                        Ketuk tanggal libur pada kalender untuk melihat nama hari libur dan
                        penjelasan singkatnya.
                      </Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={Boolean(selectedPhotoSet)}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedPhotoSet(null)}>
          <View style={styles.photoOverlay}>
            <Pressable
              style={styles.photoBackdrop}
              onPress={() => setSelectedPhotoSet(null)}
            />
            <View style={styles.photoModal}>
              <Text style={styles.photoTitle}>Foto Kehadiran</Text>
              <Text style={styles.photoSubtitle}>
                {selectedPhotoSet?.dateLabel ?? 'Detail foto absensi'}
              </Text>
              <ScrollView
                style={styles.photoScrollArea}
                contentContainerStyle={styles.photoScrollContent}
                showsVerticalScrollIndicator={false}>
                {selectedPhotoSet?.checkInPhotoUri ? (
                  <View style={styles.photoSection}>
                    <Text style={styles.photoSectionTitle}>Absen Datang</Text>
                    <Image
                      source={{uri: selectedPhotoSet.checkInPhotoUri}}
                      style={styles.photoPreview}
                      resizeMode="contain"
                    />
                  </View>
                ) : null}

                {selectedPhotoSet?.checkOutPhotoUri ? (
                  <View style={styles.photoSection}>
                    <Text style={styles.photoSectionTitle}>Absen Pulang</Text>
                    <Image
                      source={{uri: selectedPhotoSet.checkOutPhotoUri}}
                      style={styles.photoPreview}
                      resizeMode="contain"
                    />
                  </View>
                ) : null}
              </ScrollView>
              <Pressable
                style={styles.closeButton}
                onPress={() => setSelectedPhotoSet(null)}>
                <Text style={styles.closeButtonText}>Tutup</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: Colors.white,
    fontSize: 14,
  },
  loginRoot: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  loginFlex: {
    flex: 1,
  },
  loginScroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 30,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 50,
    paddingTop: 10,
  },
  loginLogo: {
    width: 180,
    height: 180,
    marginBottom: 24,
  },
  loginSchoolName: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  loginSubtitle: {
    color: Colors.white,
    fontSize: 14,
    opacity: 0.85,
    marginTop: 4,
  },
  loginCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    shadowColor: Colors.shadow,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  loginLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
    marginTop: 12,
  },
  loginInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loginButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  loginButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  forgotText: {
    color: Colors.primary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
    fontWeight: '500',
  },
  loginFooter: {
    color: Colors.white,
    fontSize: 12,
    opacity: 0.6,
    marginTop: 'auto',
    paddingTop: 30,
  },
  errorTextCenter: {
    color: Colors.red,
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  tabRoot: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  headerBar: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: Colors.white,
    fontSize: 12,
    opacity: 0.9,
  },
  tabScroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabScrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  greetingCard: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  greetingLeft: {
    flex: 1,
  },
  greetingName: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  greetingClass: {
    color: Colors.white,
    fontSize: 13,
    opacity: 0.85,
    marginTop: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  timeCard: {
    backgroundColor: Colors.primaryDark,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  timeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  timeLabel: {
    color: Colors.white,
    fontSize: 13,
    opacity: 0.85,
  },
  calendarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  calendarButtonText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  timeValue: {
    color: Colors.white,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 2,
  },
  dateValue: {
    color: Colors.white,
    fontSize: 13,
    opacity: 0.8,
    marginTop: 2,
  },
  scheduleCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: Colors.shadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  scheduleTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  scheduleDayLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: 6,
  },
  scheduleSummaryBlock: {
    marginTop: 6,
    gap: 2,
  },
  scheduleSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  scheduleMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  dashboardError: {
    fontSize: 13,
    color: Colors.red,
    marginBottom: 12,
  },
  attendanceButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  checkInButton: {
    flex: 1,
    backgroundColor: Colors.green,
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOutButton: {
    flex: 1,
    backgroundColor: Colors.orange,
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendanceIcon: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: '700',
  },
  attendanceBtnTitle: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  attendanceBtnSub: {
    color: Colors.white,
    fontSize: 11,
    opacity: 0.85,
    marginTop: 2,
  },
  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    elevation: 3,
    shadowColor: Colors.shadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  summarySubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 8,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIconText: {
    fontSize: 15,
    fontWeight: '700',
  },
  summaryCount: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 6,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  historyContent: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: 12,
  },
  recordCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: Colors.shadow,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  recordHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordStatusDot: {
    fontSize: 18,
    fontWeight: '700',
  },
  recordDate: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  recordSchool: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 10,
    marginLeft: 26,
  },
  recordTimesRow: {
    flexDirection: 'row',
    marginLeft: 28,
    gap: 24,
  },
  recordTimeLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  recordTimeValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  photoHint: {
    marginTop: 10,
    fontSize: 11,
    color: Colors.textSecondary,
    marginLeft: 26,
  },
  photoHintDisabled: {
    marginTop: 10,
    fontSize: 11,
    color: Colors.textSecondary,
    marginLeft: 26,
    opacity: 0.6,
  },
  profileRoot: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  profileHeader: {
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  profileHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  profileScroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  profileScrollContent: {
    padding: 16,
    paddingBottom: 30,
  },
  profileCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 3,
    shadowColor: Colors.shadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: Colors.primary,
    marginBottom: 12,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  profileId: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  classBadge: {
    backgroundColor: Colors.blueLight,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.blue,
  },
  classBadgeText: {
    color: Colors.blue,
    fontSize: 13,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    elevation: 3,
    shadowColor: Colors.shadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoIconText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  logoutButton: {
    backgroundColor: Colors.red,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 4,
    paddingBottom: 8,
  },
  bottomTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bottomTabIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomTabIconWrapActive: {
    backgroundColor: Colors.blueLight,
  },
  bottomTabIconText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  bottomTabIconTextActive: {
    color: Colors.primary,
  },
  bottomTabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  bottomTabLabelActive: {
    color: Colors.primary,
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  calendarBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  calendarModal: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    maxHeight: '86%',
    elevation: 10,
    shadowColor: Colors.shadow,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  calendarModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  calendarCloseText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  calendarScrollArea: {
    flexGrow: 0,
  },
  calendarScrollContent: {
    paddingBottom: 4,
  },
  calendarMonthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calendarNavButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  calendarNavText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  calendarMonthText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  calendarPopupCard: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  calendarPopupDate: {
    fontSize: 11,
    fontWeight: '600',
    color: '#BE123C',
    marginBottom: 2,
  },
  calendarPopupTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9F1239',
    lineHeight: 16,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayName: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  calendarSundayName: {
    color: '#EA580C',
  },
  calendarDayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    position: 'relative',
    marginBottom: 7,
  },
  calendarWeekendCell: {
    backgroundColor: '#FFF7ED',
  },
  calendarNationalHolidayCell: {
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  calendarCollectiveLeaveCell: {
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FEFCE8',
  },
  calendarHolidaySelected: {
    backgroundColor: Colors.red,
    borderColor: Colors.red,
  },
  calendarDayToday: {
    backgroundColor: Colors.primary,
  },
  calendarDayText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  calendarWeekendText: {
    color: '#C2410C',
  },
  calendarNationalHolidayText: {
    color: '#B91C1C',
  },
  calendarCollectiveLeaveText: {
    color: '#A16207',
  },
  calendarHolidaySelectedText: {
    color: Colors.white,
  },
  calendarDayTodayText: {
    color: Colors.white,
  },
  calendarHolidayPanel: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  calendarHolidayPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calendarHolidayPanelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  calendarHolidayCountBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  calendarHolidayCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  calendarHolidayDetailCard: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  calendarHolidayDetailNational: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  calendarHolidayDetailCollective: {
    backgroundColor: '#FEFCE8',
    borderColor: '#FDE68A',
  },
  calendarHolidayDate: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.orange,
    marginBottom: 4,
  },
  calendarHolidayName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  calendarHolidayTypeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: 5,
  },
  calendarHolidayHint: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 6,
    lineHeight: 16,
  },
  calendarHolidayEmpty: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  calendarHolidayEmptyCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  calendarHolidayEmptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
  },
  photoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  photoBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  photoModal: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
  },
  photoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  photoSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  photoScrollArea: {
    width: '100%',
    maxHeight: 460,
  },
  photoScrollContent: {
    gap: 14,
  },
  photoSection: {
    width: '100%',
  },
  photoSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  photoPreview: {
    width: '100%',
    height: 300,
    borderRadius: 14,
    backgroundColor: Colors.background,
  },
  closeButton: {
    marginTop: 16,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  closeButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.82,
  },
});

export default App;
