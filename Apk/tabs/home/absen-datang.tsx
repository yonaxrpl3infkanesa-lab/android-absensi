import AttendanceActionScreen, {
  AttendanceActionScreenProps,
} from '../../../src/AttendanceActionScreen';

type AbsenDatangScreenProps = Omit<AttendanceActionScreenProps, 'mode'>;

export default function AbsenDatangScreen(props: AbsenDatangScreenProps) {
  return <AttendanceActionScreen {...props} mode="checkin" />;
}
