export type UserProfile = {
  studentDocId: string;
  nisn: string;
  name: string;
  password: string;
  className?: string;
  schoolName?: string;
  major?: string;
  birthDate?: string;
  email?: string;
  phone?: string;
  address?: string;
  avatar?: string;
};

export type CapturedPhoto = {
  uri?: string;
  originalPath?: string;
  fileName?: string;
  fileSize?: number;
  height?: number;
  width?: number;
  type?: string;
};

export type AttendanceRecord = {
  id: string;
  createdAt?: string | null;
  deviceTimestamp: string;
  photoUrl: string;
  photoPath: string;
  status: 'hadir' | 'terlambat' | 'tidak_hadir' | 'tidak_valid';
  note: string;
  eventType?: 'checkin' | 'checkout';
  date?: string;
  dateLabel?: string;
  dateValue?: number | null;
  school?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  photoUri?: string | null;
  userNisn?: string | null;
  userName?: string | null;
  kelas?: string | null;
  jurusan?: string | null;
};
