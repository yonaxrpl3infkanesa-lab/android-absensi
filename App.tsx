import {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
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
type AttendanceRoute = 'checkin' | 'checkout' | null;

type DailyHistory = {
  id: string;
  dateKey: string;
  dateLabel: string;
  school: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: AttendanceRecord['status'];
  photoUri: string | null;
};

const getDayKey = (date: Date) => {
  const dayIndex = date.getDay();

  switch (dayIndex) {
    case 1:
      return 'senin';
    case 2:
      return 'selasa';
    case 3:
      return 'rabu';
    case 4:
      return 'kamis';
    case 5:
      return 'jumat';
    case 6:
      return 'sabtu';
    default:
      return 'minggu';
  }
};

const formatScheduleTime = (value: string | null | undefined) =>
  value ? value.replace(':', '.') : '-';

const timeStringToMinutes = (value: string | null | undefined): number => {
  if (!value || !value.includes(':')) {
    return 0;
  }

  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

const getAttendanceWindow = (
  settings: AttendanceSettings,
  now: Date = new Date(),
) => {
  const dayKey = getDayKey(now);
  const schedule = settings.weeklySchedule[dayKey];

  if (!schedule?.isActive || !schedule.checkIn || !schedule.checkOut) {
    return {
      dayKey,
      schedule,
      isOffDay: true,
      withinHours: false,
      isLate: false,
    };
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = timeStringToMinutes(schedule.checkIn);
  const endMinutes = timeStringToMinutes(schedule.checkOut);

  if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
    return {
      dayKey,
      schedule,
      isOffDay: false,
      withinHours: false,
      isLate: false,
    };
  }

  return {
    dayKey,
    schedule,
    isOffDay: false,
    withinHours: true,
    isLate: currentMinutes > startMinutes,
  };
};

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
  const [selectedPhotoUri, setSelectedPhotoUri] = useState<string | null>(null);
  const [settings, setSettings] = useState<AttendanceSettings>(
    DEFAULT_ATTENDANCE_SETTINGS,
  );
  const [attendanceRoute, setAttendanceRoute] = useState<AttendanceRoute>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

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
          setAttendanceRoute(null);
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

  const groupedHistory = useMemo<DailyHistory[]>(() => {
    if (history.some(item => item.date || item.checkInTime || item.checkOutTime)) {
      return [...history]
        .map(item => {
          const dateKey =
            item.date ||
            String(item.createdAt || item.deviceTimestamp || '').slice(0, 10);

          return {
            id: item.id,
            dateKey,
            dateLabel: item.dateLabel || formatDayMonthYear(dateKey),
            school: item.school || currentUser?.schoolName || SCHOOL_NAME,
            checkInTime: item.checkInTime ?? null,
            checkOutTime: item.checkOutTime ?? null,
            status: item.status,
            photoUri: item.photoUri || item.photoUrl || null,
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
          photoUri: item.photoUrl || null,
        });
        return;
      }

      if (eventType === 'checkin' && !existing.checkInTime) {
        existing.checkInTime = eventTime;
      }

      if (eventType === 'checkout' && !existing.checkOutTime) {
        existing.checkOutTime = eventTime;
      }

      if (!existing.photoUri && item.photoUrl) {
        existing.photoUri = item.photoUrl;
      }

      if (existing.status === 'hadir' && item.status !== 'hadir') {
        existing.status = item.status;
      }
    });

    return Array.from(map.values()).sort((left, right) =>
      right.dateKey.localeCompare(left.dateKey),
    );
  }, [currentUser?.schoolName, history]);

  const summary = useMemo(
    () => ({
      hadir: groupedHistory.filter(item => item.status === 'hadir').length,
      terlambat: groupedHistory.filter(item => item.status === 'terlambat').length,
      tidakHadir: groupedHistory.filter(item => item.status === 'tidak_hadir').length,
    }),
    [groupedHistory],
  );

  const attendanceWindow = getAttendanceWindow(settings, currentTime);
  const selectedMonthYear = selectedMonth.getFullYear();
  const selectedMonthIndex = selectedMonth.getMonth();
  const firstDay = new Date(selectedMonthYear, selectedMonthIndex, 1).getDay();
  const daysInMonth = new Date(
    selectedMonthYear,
    selectedMonthIndex + 1,
    0,
  ).getDate();
  const calendarDays = Array.from(
    {length: firstDay + daysInMonth},
    (_, index) => {
      if (index < firstDay) {
        return null;
      }

      return index - firstDay + 1;
    },
  );

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
    setAttendanceRoute(null);
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
          <Text style={styles.scheduleSubtitle}>
            {DAY_LABELS[attendanceWindow.dayKey]} •{' '}
            {attendanceWindow.isOffDay
              ? 'Libur'
              : `${formatScheduleTime(attendanceWindow.schedule?.checkIn)} - ${formatScheduleTime(
                  attendanceWindow.schedule?.checkOut,
                )}`}
          </Text>
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
            onPress={() => setAttendanceRoute('checkin')}>
            <Clock size={36} color={Colors.white} />
            <Text style={styles.attendanceBtnTitle}>Datang</Text>
            <Text style={styles.attendanceBtnSub}>Absen Datang</Text>
          </Pressable>

          <Pressable
            style={({pressed}) => [
              styles.checkOutButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => setAttendanceRoute('checkout')}>
            <Clock size={36} color={Colors.white} />
            <Text style={styles.attendanceBtnTitle}>Pulang</Text>
            <Text style={styles.attendanceBtnSub}>Absen Pulang</Text>
          </Pressable>
        </View>

        <Pressable style={styles.summaryCard} onPress={() => setActiveTab('history')}>
          <Text style={styles.summaryTitle}>Ringkasan Kehadiran</Text>
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
                  onPress={() => item.photoUri && setSelectedPhotoUri(item.photoUri)}>
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
                      item.photoUri
                        ? styles.photoHint
                        : styles.photoHintDisabled
                    }>
                    {item.photoUri
                      ? 'Ketuk untuk melihat foto absen'
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

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.appRoot}>
        {!currentUser ? (
          renderLoginScreen()
        ) : attendanceRoute ? (
          <AttendanceActionScreen
            currentUser={currentUser}
            isAdmin={false}
            mode={attendanceRoute}
            settings={settings}
            onBack={() => setAttendanceRoute(null)}
            onSaved={() => {
              setAttendanceRoute(null);
              setActiveTab('history');
            }}
          />
        ) : (
          <>
            {activeTab === 'home'
              ? renderDashboard()
              : activeTab === 'history'
                ? renderHistory()
                : renderProfile()}
            {renderBottomTabs()}
          </>
        )}

        <Modal
          visible={calendarVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCalendarVisible(false)}>
          <View style={styles.calendarOverlay}>
            <Pressable
              style={styles.calendarBackdrop}
              onPress={() => setCalendarVisible(false)}
            />
            <View style={styles.calendarModal}>
              <View style={styles.calendarModalHeader}>
                <Text style={styles.calendarModalTitle}>Kalender</Text>
                <Pressable onPress={() => setCalendarVisible(false)}>
                  <Text style={styles.calendarCloseText}>Tutup</Text>
                </Pressable>
              </View>

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

              <View style={styles.calendarGrid}>
                {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(dayName => (
                  <Text key={dayName} style={styles.calendarDayName}>
                    {dayName}
                  </Text>
                ))}
                {calendarDays.map((day, index) => {
                  const isToday =
                    day === currentTime.getDate() &&
                    selectedMonthIndex === currentTime.getMonth() &&
                    selectedMonthYear === currentTime.getFullYear();

                  return (
                    <View
                      key={day === null ? `empty-${index}` : `day-${day}`}
                      style={[
                        styles.calendarDayCell,
                        isToday && styles.calendarDayToday,
                      ]}>
                      {day ? (
                        <Text
                          style={[
                            styles.calendarDayText,
                            isToday && styles.calendarDayTodayText,
                          ]}>
                          {day}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={Boolean(selectedPhotoUri)}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedPhotoUri(null)}>
          <View style={styles.photoOverlay}>
            <Pressable
              style={styles.photoBackdrop}
              onPress={() => setSelectedPhotoUri(null)}
            />
            <View style={styles.photoModal}>
              <Text style={styles.photoTitle}>Foto Kehadiran</Text>
              {selectedPhotoUri ? (
                <Image
                  source={{uri: selectedPhotoUri}}
                  style={styles.photoPreview}
                  resizeMode="contain"
                />
              ) : null}
              <Pressable
                style={styles.closeButton}
                onPress={() => setSelectedPhotoUri(null)}>
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
  scheduleSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
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
    padding: 18,
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
  calendarMonthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  calendarDayName: {
    width: '12.85%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  calendarDayCell: {
    width: '12.85%',
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  calendarDayToday: {
    backgroundColor: Colors.primary,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  calendarDayTodayText: {
    color: Colors.white,
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
    marginBottom: 12,
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
