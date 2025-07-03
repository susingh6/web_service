import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Checkbox,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Button,
  ButtonGroup,
  Typography,
} from '@mui/material';
import {
  Search,
  FilterList,
  Edit,
  Delete,
  History,
  TrendingUp,
  TrendingDown,
  TrendingFlat,
  Assignment,
  Notifications,
} from '@mui/icons-material';
import { visuallyHidden } from '@mui/utils';
import { useAppDispatch } from '@/lib/store';
import { selectEntity } from '@/features/sla/slices/entitiesSlice';
import { format } from 'date-fns';
import { Entity } from '@shared/schema';
import { getEntityTrend } from '@/lib/trendCache';

type EntityStatus = 'Pending' | 'Failed' | 'Passed';

interface StatusConfig {
  color: 'success' | 'warning' | 'error' | 'default';
  label: string;
  lightBg: string;
}

const DEFAULT_STATUS: StatusConfig = { color: 'default', label: 'Unknown', lightBg: 'rgba(158, 158, 158, 0.1)' };

const STATUS_CONFIG: Record<string, StatusConfig> = {
  // API statuses as specified
  'Passed': { color: 'success', label: 'Passed', lightBg: 'rgba(76, 175, 80, 0.1)' },
  'Pending': { color: 'warning', label: 'Pending', lightBg: 'rgba(255, 152, 0, 0.1)' },
  'Failed': { color: 'error', label: 'Failed', lightBg: 'rgba(244, 67, 54, 0.1)' },
};

interface HeadCell {
  id: keyof Entity | 'actions' | 'trend';
  label: string;
  numeric: boolean;
  disablePadding: boolean;
  sortable: boolean;
  width?: string;
}

const getHeadCells = (showActions: boolean, type: 'table' | 'dag'): HeadCell[] => [
  { id: 'name', label: type === 'table' ? 'Table Name' : 'DAG Name', numeric: false, disablePadding: true, sortable: true },
  { id: 'teamId', label: 'Team', numeric: false, disablePadding: false, sortable: true },
  { id: 'status', label: 'Status', numeric: false, disablePadding: false, sortable: true },
  { id: 'currentSla', label: 'Current SLA', numeric: true, disablePadding: false, sortable: true },
  { id: 'trend', label: '30-Day Trend', numeric: true, disablePadding: false, sortable: false },
  { id: 'lastRefreshed', label: 'Last Updated', numeric: false, disablePadding: false, sortable: true },
  ...(showActions ? [{ id: 'actions', label: 'Actions', numeric: false, disablePadding: false, sortable: false, width: '120px' }] : []),
];

interface EntityTableProps {
  entities: Entity[];
  type: 'table' | 'dag';
  teams: { id: number; name: string }[];
  onEditEntity: (entity: Entity) => void;
  onDeleteEntity: (id: number) => void;
  onViewHistory: (entity: Entity) => void;
  onViewDetails: (entity: Entity) => void;
  onViewTasks?: (entity: Entity) => void; // For DAG entities to view tasks
  onSetNotificationTimeline?: (entity: Entity) => void; // For notification timeline setup
  showActions?: boolean; // Controls whether to show action buttons
}

const EntityTable = ({
  entities,
  type,
  teams,
  onEditEntity,
  onDeleteEntity,
  onViewHistory,
  onViewDetails,
  onViewTasks,
  onSetNotificationTimeline,
  showActions = true, // Default to showing actions
}: EntityTableProps) => {
  const dispatch = useAppDispatch();
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [orderBy, setOrderBy] = useState<keyof Entity>('name');
  const [selected, setSelected] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [filterStatus, setFilterStatus] = useState<'all' | EntityStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredEntities, setFilteredEntities] = useState<Entity[]>([]);
  const [trendData, setTrendData] = useState<Map<number, any>>(new Map());

  // Load 30-day trend data (independent of global date filter)
  useEffect(() => {
    const loadTrendData = async () => {
      const trendsMap = new Map();
      for (const entity of entities) {
        try {
          const trend = await getEntityTrend(entity.id);
          if (trend) {
            trendsMap.set(entity.id, {
              value: trend.trend,
              icon: trend.icon === 'up' ? <TrendingUp /> : trend.icon === 'down' ? <TrendingDown /> : <TrendingFlat />,
              color: trend.color,
            });
          }
        } catch (error) {
          console.error(`Failed to load trend for entity ${entity.id}:`, error);
        }
      }
      setTrendData(trendsMap);
    };

    if (entities.length > 0) {
      loadTrendData();
    }
  }, [entities]);

  // Apply filters and sorting to entities
  useEffect(() => {
    let result = [...entities];
    
    // Apply status filter
    if (filterStatus !== 'all') {
      result = result.filter(entity => entity.status === filterStatus);
    }
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(entity => 
        entity.name.toLowerCase().includes(query) || 
        teams.find(team => team.id === entity.teamId)?.name.toLowerCase().includes(query)
      );
    }
    
    // Apply sorting
    result = result.sort((a, b) => {
      const aValue = a[orderBy];
      const bValue = b[orderBy];
      
      if (aValue === undefined || bValue === undefined) {
        return 0;
      }
      
      // Handle dates specially
      if (aValue instanceof Date && bValue instanceof Date) {
        return order === 'asc' 
          ? aValue.getTime() - bValue.getTime() 
          : bValue.getTime() - aValue.getTime();
      }
      
      // For strings
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return order === 'asc' 
          ? aValue.localeCompare(bValue) 
          : bValue.localeCompare(aValue);
      }
      
      // For numbers
      return order === 'asc' 
        ? (aValue as number) - (bValue as number) 
        : (bValue as number) - (aValue as number);
    });
    
    setFilteredEntities(result);
  }, [entities, filterStatus, searchQuery, order, orderBy, teams]);

  const handleRequestSort = (property: keyof Entity) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const newSelected = filteredEntities.map(n => n.id);
      setSelected(newSelected);
      return;
    }
    setSelected([]);
  };

  const handleSelectClick = (id: number) => {
    const selectedIndex = selected.indexOf(id);
    let newSelected: number[] = [];

    if (selectedIndex === -1) {
      newSelected = [...selected, id];
    } else {
      newSelected = selected.filter(item => item !== id);
    }

    setSelected(newSelected);
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleHistoryClick = (entity: Entity) => {
    dispatch(selectEntity(entity));
    onViewHistory(entity);
  };

  const isSelected = (id: number) => selected.indexOf(id) !== -1;

  // Calculate empty rows
  const emptyRows = page > 0 
    ? Math.max(0, (1 + page) * rowsPerPage - filteredEntities.length) 
    : 0;

  // Get team name by id
  const getTeamName = (teamId: number) => {
    return teams.find(team => team.id === teamId)?.name || 'Unknown';
  };

  // Format date
  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return 'N/A';
    
    // Ensure we're working with a Date object
    const dateObj = date instanceof Date ? date : new Date(date);
    
    // Check if dateObj is valid before proceeding
    if (isNaN(dateObj.getTime())) {
      return 'Invalid date';
    }
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    try {
      // Make sure both dates have valid toDateString methods
      const todayStr = today.toDateString();
      const yesterdayStr = yesterday.toDateString();
      const dateObjStr = dateObj.toDateString();
      
      if (dateObjStr === todayStr) {
        return `Today, ${format(dateObj, 'hh:mm a')}`;
      } else if (dateObjStr === yesterdayStr) {
        return `Yesterday, ${format(dateObj, 'hh:mm a')}`;
      } else {
        return format(dateObj, 'MMM d, yyyy');
      }
    } catch (error) {
      // In case toDateString fails
      return format(dateObj, 'MMM d, yyyy');
    }
  };

  // Get trend data from cache (30-day independent of global date filter)
  const getTrendData = (entity: Entity) => {
    const cached = trendData.get(entity.id);
    if (cached) {
      return cached;
    }
    
    // Fallback if cache hasn't loaded yet
    return {
      value: 0,
      icon: <TrendingFlat />,
      color: 'default',
    };
  };

  return (
    <Box>
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <TextField
          placeholder="Search entities..."
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ width: { xs: '100%', sm: 240 } }}
        />
        
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
            Show:
          </Typography>
          
          <ButtonGroup size="small" variant="outlined">
            <Button 
              variant={filterStatus === 'all' ? 'contained' : 'outlined'} 
              onClick={() => setFilterStatus('all')}
              color="primary"
            >
              All
            </Button>
            <Button 
              variant={filterStatus === 'Passed' ? 'contained' : 'outlined'} 
              onClick={() => setFilterStatus('Passed')}
              sx={{ 
                color: filterStatus === 'Passed' ? 'white' : STATUS_CONFIG.Passed.color,
                borderColor: STATUS_CONFIG.Passed.color,
                '&.Mui-contained': { backgroundColor: STATUS_CONFIG.Passed.color },
              }}
            >
              Passed
            </Button>
            <Button 
              variant={filterStatus === 'Pending' ? 'contained' : 'outlined'} 
              onClick={() => setFilterStatus('Pending')}
              sx={{ 
                color: filterStatus === 'Pending' ? 'white' : STATUS_CONFIG.Pending.color,
                borderColor: STATUS_CONFIG.Pending.color,
                '&.Mui-contained': { backgroundColor: STATUS_CONFIG.Pending.color },
              }}
            >
              Pending
            </Button>
            <Button 
              variant={filterStatus === 'Failed' ? 'contained' : 'outlined'} 
              onClick={() => setFilterStatus('Failed')}
              sx={{ 
                color: filterStatus === 'Failed' ? 'white' : STATUS_CONFIG.Failed.color,
                borderColor: STATUS_CONFIG.Failed.color,
                '&.Mui-contained': { backgroundColor: STATUS_CONFIG.Failed.color },
              }}
            >
              Failed
            </Button>
          </ButtonGroup>
        </Box>
      </Box>

      <TableContainer component={Paper} elevation={0}>
        <Table size="medium">
          <TableHead sx={{ backgroundColor: 'background.default' }}>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  color="primary"
                  indeterminate={selected.length > 0 && selected.length < filteredEntities.length}
                  checked={filteredEntities.length > 0 && selected.length === filteredEntities.length}
                  onChange={handleSelectAllClick}
                  inputProps={{ 'aria-label': 'select all entities' }}
                />
              </TableCell>
              
              {getHeadCells(showActions).map((headCell) => (
                <TableCell
                  key={headCell.id}
                  align={headCell.numeric ? 'right' : 'left'}
                  padding={headCell.disablePadding ? 'none' : 'normal'}
                  sortDirection={orderBy === headCell.id ? order : false}
                  sx={{ 
                    ...(headCell.width ? { width: headCell.width } : {}),
                    whiteSpace: 'nowrap',
                  }}
                >
                  {headCell.sortable ? (
                    <TableSortLabel
                      active={orderBy === headCell.id}
                      direction={orderBy === headCell.id ? order : 'asc'}
                      onClick={() => handleRequestSort(headCell.id as keyof Entity)}
                    >
                      {headCell.label}
                      {orderBy === headCell.id ? (
                        <Box component="span" sx={visuallyHidden}>
                          {order === 'desc' ? 'sorted descending' : 'sorted ascending'}
                        </Box>
                      ) : null}
                    </TableSortLabel>
                  ) : (
                    headCell.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          
          <TableBody>
            {filteredEntities
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((entity) => {
                const isItemSelected = isSelected(entity.id);
                const trendData = getTrendData(entity);
                
                return (
                  <TableRow
                    hover
                    role="checkbox"
                    aria-checked={isItemSelected}
                    tabIndex={-1}
                    key={entity.id}
                    selected={isItemSelected}
                  >
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        color="primary"
                        checked={isItemSelected}
                        onChange={() => handleSelectClick(entity.id)}
                        inputProps={{ 'aria-labelledby': `enhanced-table-checkbox-${entity.id}` }}
                      />
                    </TableCell>
                    
                    <TableCell padding="none">
                      <Typography variant="body2" fontWeight={500}>
                        {entity.name}
                      </Typography>
                    </TableCell>
                    
                    <TableCell>
                      <Typography variant="body2">
                        {getTeamName(entity.teamId)}
                      </Typography>
                    </TableCell>
                    
                    <TableCell>
                      <Chip
                        label={(STATUS_CONFIG[entity.status] || DEFAULT_STATUS).label}
                        size="small"
                        sx={{
                          backgroundColor: (STATUS_CONFIG[entity.status] || DEFAULT_STATUS).lightBg,
                          color: `${(STATUS_CONFIG[entity.status] || DEFAULT_STATUS).color}.dark`,
                          fontWeight: 600,
                          borderRadius: '16px',
                          fontSize: '0.75rem',
                        }}
                      />
                    </TableCell>
                    
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={500}>
                        {entity.currentSla?.toFixed(1)}%
                      </Typography>
                    </TableCell>
                    
                    <TableCell align="right">
                      <Box display="flex" alignItems="center" justifyContent="flex-end">
                        <Box component="span" color={`${trendData.color}.main`} display="flex" alignItems="center" mr={0.5}>
                          {trendData.icon}
                        </Box>
                        <Typography variant="body2" color={`${trendData.color}.main`} fontWeight={500}>
                          {trendData.value > 0 ? '+' : ''}{trendData.value.toFixed(1)}%
                        </Typography>
                      </Box>
                    </TableCell>
                    
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(entity.lastRefreshed)}
                      </Typography>
                    </TableCell>
                    
                    {showActions && (
                      <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                        <Box display="flex" justifyContent="center">
                          <Tooltip title="Edit">
                            <IconButton size="small" color="primary" onClick={() => onEditEntity(entity)}>
                              <Edit fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          
                          {type === 'dag' && onViewTasks && (
                            <Tooltip title="View Tasks">
                              <IconButton size="small" color="info" onClick={() => onViewTasks(entity)}>
                                <Assignment fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          
                          {onSetNotificationTimeline && (
                            <Tooltip title="Notification Timeline">
                              <IconButton size="small" color="secondary" onClick={() => onSetNotificationTimeline(entity)}>
                                <Notifications fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          
                          <Tooltip title={`${entity.type === 'dag' ? 'DAG' : 'Table'} Details`}>
                            <IconButton size="small" color="inherit" onClick={() => handleHistoryClick(entity)}>
                              <History fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => onDeleteEntity(entity.id)}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            
            {emptyRows > 0 && (
              <TableRow style={{ height: 53 * emptyRows }}>
                <TableCell colSpan={showActions ? 8 : 7} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      
      <TablePagination
        rowsPerPageOptions={[5, 10, 25]}
        component="div"
        count={filteredEntities.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
    </Box>
  );
};

export default EntityTable;
