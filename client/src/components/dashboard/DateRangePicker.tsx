import { useState } from 'react';
import {
  Box,
  Button,
  Popover,
  Typography,
  TextField,
  Stack,
  IconButton,
} from '@mui/material';
import { DateRange as DateRangeIcon, Close as CloseIcon } from '@mui/icons-material';
import { DateRange, DateRangePicker as MuiDateRangePicker } from 'react-date-range';
import { format, addDays, startOfDay, endOfDay, subDays } from 'date-fns';
import { useAppDispatch, useAppSelector } from '@/lib/store';
import { setDateRange } from '@/features/sla/slices/dashboardSlice';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';

const predefinedRanges = [
  { label: 'Today', value: 'today', startDate: startOfDay(new Date()), endDate: endOfDay(new Date()) },
  { label: 'Yesterday', value: 'yesterday', startDate: startOfDay(subDays(new Date(), 1)), endDate: endOfDay(subDays(new Date(), 1)) },
  { label: 'Last 7 Days', value: 'last7Days', startDate: startOfDay(subDays(new Date(), 6)), endDate: endOfDay(new Date()) },
  { label: 'Last 30 Days', value: 'last30Days', startDate: startOfDay(subDays(new Date(), 29)), endDate: endOfDay(new Date()) },
  { label: 'This Month', value: 'thisMonth', startDate: startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), endDate: endOfDay(new Date()) },
];

const DateRangePicker = () => {
  const dispatch = useAppDispatch();
  const { dateRange } = useAppSelector((state) => state.dashboard);
  
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [localRange, setLocalRange] = useState({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });
  
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    setLocalRange({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    });
  };
  
  const handleClose = () => {
    setAnchorEl(null);
  };
  
  const handleRangeChange = (ranges: any) => {
    setLocalRange({
      startDate: ranges.selection.startDate,
      endDate: ranges.selection.endDate,
    });
  };
  
  const handleApply = () => {
    dispatch(setDateRange({
      startDate: localRange.startDate,
      endDate: localRange.endDate,
      label: 'Custom Range',
    }));
    handleClose();
  };
  
  const handlePredefinedRange = (range: typeof predefinedRanges[0]) => {
    dispatch(setDateRange({
      startDate: range.startDate,
      endDate: range.endDate,
      label: range.label,
    }));
    handleClose();
  };
  
  const open = Boolean(anchorEl);
  
  return (
    <>
      <Button
        variant="outlined"
        color="inherit"
        startIcon={<DateRangeIcon />}
        onClick={handleClick}
        sx={{
          bgcolor: 'background.paper',
          borderColor: 'divider',
          px: 2,
          py: 1,
          fontSize: '0.875rem',
        }}
      >
        {dateRange.label}
      </Button>
      
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        PaperProps={{
          sx: {
            width: 500,
            p: 2,
            mt: 1,
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight={500}>
            Select Date Range
          </Typography>
          <IconButton size="small" onClick={handleClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        
        <Stack direction="row" spacing={2}>
          <Box sx={{ width: 150 }}>
            <Typography variant="body2" fontWeight={500} gutterBottom>
              Predefined Ranges
            </Typography>
            {predefinedRanges.map((range) => (
              <Button
                key={range.value}
                fullWidth
                color="inherit"
                sx={{
                  justifyContent: 'flex-start',
                  py: 1,
                  textAlign: 'left',
                  fontWeight: 400,
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                }}
                onClick={() => handlePredefinedRange(range)}
              >
                {range.label}
              </Button>
            ))}
          </Box>
          
          <Box sx={{ flex: 1 }}>
            <Box sx={{ mb: 2 }}>
              <DateRange
                editableDateInputs={true}
                onChange={handleRangeChange}
                moveRangeOnFirstSelection={false}
                ranges={[
                  {
                    startDate: localRange.startDate,
                    endDate: localRange.endDate,
                    key: 'selection',
                  },
                ]}
                rangeColors={['#1976d2']}
                maxDate={new Date()}
              />
            </Box>
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <TextField
                label="Start Date"
                value={format(localRange.startDate, 'MM/dd/yyyy')}
                InputProps={{ readOnly: true }}
                variant="outlined"
                size="small"
                sx={{ width: '48%' }}
              />
              <TextField
                label="End Date"
                value={format(localRange.endDate, 'MM/dd/yyyy')}
                InputProps={{ readOnly: true }}
                variant="outlined"
                size="small"
                sx={{ width: '48%' }}
              />
            </Box>
            
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleApply}
              >
                Apply
              </Button>
            </Box>
          </Box>
        </Stack>
      </Popover>
    </>
  );
};

export default DateRangePicker;
