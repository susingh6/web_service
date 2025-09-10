import { useAppDispatch, useAppSelector } from '@/lib/store';
import { setDateRange } from '@/features/sla/slices/dashboardSlice';
import DateRangePicker from './DateRangePicker';

const GlobalDateRangePicker = () => {
  const dispatch = useAppDispatch();
  const { dateRange } = useAppSelector((state) => state.dashboard);

  const handleChange = (range: { startDate: Date; endDate: Date; label: string }) => {
    dispatch(setDateRange(range));
  };

  return (
    <DateRangePicker
      value={dateRange}
      onChange={handleChange}
    />
  );
};

export default GlobalDateRangePicker;