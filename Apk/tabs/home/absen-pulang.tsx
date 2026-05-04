import AttendanceActionScreen, {
  AttendanceActionScreenProps,
} from '../../../src/AttendanceActionScreen';

type AbsenPulangScreenProps = Omit<AttendanceActionScreenProps, 'mode'>;

export default function AbsenPulangScreen(props: AbsenPulangScreenProps) {
  return <AttendanceActionScreen {...props} mode="checkout" />;
}
