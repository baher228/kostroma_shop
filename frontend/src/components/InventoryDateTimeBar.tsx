import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

const TIME_STEP_MINUTES = 5;
const TIME_ROW_HEIGHT = 48;
const weekdayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const monthLabels = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const timeOptions = Array.from({ length: (24 * 60) / TIME_STEP_MINUTES }, (_, index) => {
  const minutes = index * TIME_STEP_MINUTES;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

const pad = (value: number) => String(value).padStart(2, '0');

export const toInventoryDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const roundedInventoryTime = (date: Date) => {
  const minutes = Math.floor((date.getHours() * 60 + date.getMinutes()) / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
};

export const inventoryCountedAtIso = (dateKey: string, time: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes).toISOString();
};

const formatDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-');
  return `${day}.${month}.${year}`;
};

const buildCalendarCells = (year: number, month: number) => {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, month, index - offset + 1);
    return { key: toInventoryDateKey(date), day: date.getDate(), inMonth: date.getMonth() === month };
  });
};

type Props = {
  date: string;
  time: string;
  onChangeDate: (date: string) => void;
  onChangeTime: (time: string) => void;
};

export const InventoryDateTimeBar = ({ date, time, onChangeDate, onChangeTime }: Props) => {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const [year, month] = date.split('-').map(Number);
    return { year, month: month - 1 };
  });
  const cells = useMemo(() => buildCalendarCells(visibleMonth.year, visibleMonth.month), [visibleMonth]);
  const todayKey = toInventoryDateKey(new Date());
  const selectedTimeIndex = Math.max(0, timeOptions.indexOf(time));

  const openCalendar = () => {
    const [year, month] = date.split('-').map(Number);
    setVisibleMonth({ year, month: month - 1 });
    setCalendarOpen(true);
  };

  const shiftMonth = (delta: number) => {
    setVisibleMonth((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  return (
    <View style={styles.bar}>
      <Pressable style={styles.pickerButton} onPress={openCalendar}>
        <Text style={styles.pickerLabel}>Дата</Text>
        <Text style={styles.pickerValue}>{formatDateKey(date)}</Text>
      </Pressable>
      <Pressable style={styles.pickerButton} onPress={() => setTimeOpen(true)}>
        <Text style={styles.pickerLabel}>Время</Text>
        <Text style={styles.pickerValue}>{time}</Text>
      </Pressable>

      <Modal visible={calendarOpen} transparent animationType="fade" onRequestClose={() => setCalendarOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.monthRow}>
              <Pressable style={styles.monthNav} onPress={() => shiftMonth(-1)}>
                <Text style={styles.monthNavText}>‹</Text>
              </Pressable>
              <Text style={styles.monthTitle}>{monthLabels[visibleMonth.month]} {visibleMonth.year}</Text>
              <Pressable style={styles.monthNav} onPress={() => shiftMonth(1)}>
                <Text style={styles.monthNavText}>›</Text>
              </Pressable>
            </View>
            <View style={styles.weekRow}>
              {weekdayLabels.map((label) => (
                <Text key={label} style={styles.weekdayText}>{label}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {cells.map((cell) => {
                const selected = cell.key === date;
                return (
                  <Pressable
                    key={cell.key}
                    style={[styles.dayCell, selected && styles.dayCellSelected, cell.key === todayKey && !selected && styles.dayCellToday]}
                    onPress={() => {
                      onChangeDate(cell.key);
                      setCalendarOpen(false);
                    }}
                  >
                    <Text style={[styles.dayText, !cell.inMonth && styles.dayTextMuted, selected && styles.dayTextSelected]}>{cell.day}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={styles.doneButton} onPress={() => setCalendarOpen(false)}>
              <Text style={styles.doneText}>Закрыть</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={timeOpen} transparent animationType="fade" onRequestClose={() => setTimeOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.card, styles.timeCard]}>
            <Text style={styles.monthTitle}>Время инвентаризации</Text>
            <FlatList
              style={styles.timeList}
              data={timeOptions}
              keyExtractor={(item) => item}
              initialScrollIndex={Math.max(0, selectedTimeIndex - 2)}
              getItemLayout={(_, index) => ({ length: TIME_ROW_HEIGHT, offset: TIME_ROW_HEIGHT * index, index })}
              renderItem={({ item }) => {
                const selected = item === time;
                return (
                  <Pressable style={[styles.timeRow, selected && styles.dayCellSelected]} onPress={() => onChangeTime(item)}>
                    <Text style={[styles.timeText, selected && styles.dayTextSelected]}>{item}</Text>
                  </Pressable>
                );
              }}
            />
            <Pressable style={styles.doneButton} onPress={() => setTimeOpen(false)}>
              <Text style={styles.doneText}>Готово</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 8,
  },
  pickerButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#8fa091',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickerLabel: {
    fontSize: 14,
    color: '#4e5d53',
    fontWeight: '700',
  },
  pickerValue: {
    fontSize: 16,
    color: '#223528',
    fontWeight: '800',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: 380,
    maxWidth: '100%',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    padding: 16,
    gap: 10,
  },
  timeCard: {
    width: 260,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthNav: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ecf1ec',
  },
  monthNavText: {
    fontSize: 24,
    color: '#223528',
    fontWeight: '800',
  },
  monthTitle: {
    fontSize: 17,
    color: '#223528',
    fontWeight: '800',
    textAlign: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekdayText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 13,
    color: '#4e5d53',
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dayCellSelected: {
    backgroundColor: '#2f6b3f',
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: '#2f6b3f',
  },
  dayText: {
    fontSize: 16,
    color: '#223528',
    fontWeight: '700',
  },
  dayTextMuted: {
    color: '#a3ada5',
  },
  dayTextSelected: {
    color: '#ffffff',
  },
  timeList: {
    height: TIME_ROW_HEIGHT * 5,
    flexGrow: 0,
  },
  timeRow: {
    height: TIME_ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  timeText: {
    fontSize: 20,
    color: '#223528',
    fontWeight: '700',
  },
  doneButton: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2f6b3f',
  },
  doneText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '800',
  },
});
