import { useState, useEffect, useMemo } from 'react';
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
  FiberNew,
  SmartToy,
  InfoOutlined,
} from '@mui/icons-material';
import { visuallyHidden } from '@mui/utils';
import { useAppDispatch } from '@/lib/store';
import { selectEntity } from '@/features/sla/slices/entitiesSlice';
import { format } from 'date-fns';
import { Entity } from '@shared/schema';
import { getEntityTrend } from '@/lib/trendCache';
import { config } from '@/config';
import { STANDARD_STATUSES, STATUS_CONFIG, normalizeStatus } from '@/utils/status-normalization';
import AgentWorkspaceModal from '@/components/modals/AgentWorkspaceModal';

type EntityStatus = 'Pending' | 'Failed' | 'Passed';

interface StatusConfig {
  color: 'success' | 'warning' | 'error' | 'default';
  label: string;
  lightBg: string;
}

const DEFAULT_STATUS = { color: 'default' as const, label: 'Unknown', lightBg: 'rgba(158, 158, 158, 0.1)' };

interface HeadCell {
  id: keyof Entity | 'actions' | 'trend' | 'table_name' | 'dag_name';
  label: string;
  numeric: boolean;
  disablePadding: boolean;
  sortable: boolean;
  width?: string;
}

// Check if entity was recently updated (within last 6 hours)
const isEntityRecent = (entity: Entity): boolean => {
  if (!entity.lastRefreshed && !entity.updatedAt) return false;
  
  const updateTime = entity.lastRefreshed || entity.updatedAt;
  if (!updateTime) return false;
  
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const entityUpdateTime = new Date(updateTime);
  
  return entityUpdateTime >= sixHoursAgo;
};

const getHeadCells = (showActions: boolean, type: 'table' | 'dag', isTeamDashboard: boolean = false, trendLabel: string = '30-Day Trend'): HeadCell[] => [
  { id: 'name', label: 'Entity Name', numeric: false, disablePadding: true, sortable: true, width: '180px' },
  { id: type === 'table' ? 'table_name' : 'dag_name', label: type === 'table' ? 'Table Name' : 'DAG Name', numeric: false, disablePadding: false, sortable: true, width: '200px' },
  { id: isTeamDashboard ? 'is_active' as keyof Entity : 'teamId', label: isTeamDashboard ? 'Active' : 'Team', numeric: false, disablePadding: false, sortable: true, width: '120px' },
  { id: 'status', label: 'Status', numeric: false, disablePadding: false, sortable: true, width: '100px' },
  ...(isTeamDashboard ? [{ id: 'expectedFinish' as keyof Entity, label: 'Expected Finish', numeric: false, disablePadding: false, sortable: false, width: '150px' }] : []),
  { id: 'currentSla', label: 'Current SLA', numeric: true, disablePadding: false, sortable: true, width: '110px' },
  { id: 'trend', label: trendLabel, numeric: true, disablePadding: false, sortable: false, width: '160px' },
  { id: 'lastRefreshed', label: 'Last Updated', numeric: false, disablePadding: false, sortable: true, width: '170px' },
  ...(showActions ? [{ id: 'actions' as const, label: 'Actions', numeric: false, disablePadding: false, sortable: false, width: '120px' }] : []),
];

interface EntityTableProps {
  entities: Entity[];
  type: 'table' | 'dag';
  teams: { id: number; name: string }[];
  onEditEntity: (entity: Entity) => void;
  onDeleteEntity: (entity: Entity) => void;
  onViewHistory: (entity: Entity) => void;
  onViewDetails: (entity: Entity) => void;
  onViewTasks?: (entity: Entity) => void; // For DAG entities to view tasks
  onSetNotificationTimeline?: (entity: Entity) => void; // For notification timeline setup
  showActions?: boolean; // Controls whether to show action buttons
  isTeamDashboard?: boolean; // Controls whether to show Entity Owner instead of Team
  hasMetrics?: boolean; // Controls whether to show data or empty state based on date range
  trendLabel?: string; // Dynamic label for trend column based on selected date range
  newEntityIds?: Set<number>; // Optional explicit list of session-new IDs to show NEW badge
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
  isTeamDashboard = false, // Default to summary dashboard
  hasMetrics = true, // Default to true for backward compatibility
  trendLabel = '30-Day Trend', // Default label
  newEntityIds,
}: EntityTableProps) => {
  
  const dispatch = useAppDispatch();
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [orderBy, setOrderBy] = useState<keyof Entity>('lastRefreshed');
  const [selected, setSelected] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [filterStatus, setFilterStatus] = useState<'all' | EntityStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredEntities, setFilteredEntities] = useState<Entity[]>([]);
  const [trendData, setTrendData] = useState<Map<number, { value: number; icon: JSX.Element; color: string }>>(new Map());
  const [agentWorkspaceOpen, setAgentWorkspaceOpen] = useState(false);
  const [selectedDagEntity, setSelectedDagEntity] = useState<Entity | null>(null);

  // Load 30-day trend data (independent of global date filter)
  useEffect(() => {
    const loadTrendData = async () => {
      if (entities.length === 0) return;
      
      try {
        // Get trends for each entity individually
        const trendsMap = new Map();
        
        // Map trends to entities
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
            // Skip trends that fail to load
          }
        }
        
        setTrendData(trendsMap);
      } catch (error) {
        console.error('Failed to load trend data:', error);
      }
    };

    loadTrendData();
  }, [entities.length]);

  // Memoize table head cells to avoid creating a new array on every render
  const headCells = useMemo(
    () => getHeadCells(showActions, type, isTeamDashboard, trendLabel),
    [showActions, type, isTeamDashboard, trendLabel]
  );

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
    
    // If metrics are unavailable for the selected range on team dashboard,
    // prefer to show recent entities but do not hide everything when timestamps are missing.
    if (isTeamDashboard && !hasMetrics) {
      const anyHasTimestamps = result.some(e => e.lastRefreshed || e.updatedAt);
      if (anyHasTimestamps) {
        const recentOnly = result.filter(isEntityRecent);
        result = recentOnly.length > 0 ? recentOnly : result;
      }
    }

    // Apply sorting
    result = result.sort((a, b) => {
      // For team dashboard, group by entity ownership status first
      if (isTeamDashboard) {
        const aIsOwner = a.is_entity_owner ? 1 : 0;
        const bIsOwner = b.is_entity_owner ? 1 : 0;
        
        // Entity owners come first (higher value)
        if (aIsOwner !== bIsOwner) {
          return bIsOwner - aIsOwner;
        }
      }
      
      const aValue = a[orderBy];
      const bValue = b[orderBy];
      
      if (aValue === undefined || bValue === undefined) {
        return 0;
      }
      
      // Handle date strings specially (like lastRefreshed)
      if (orderBy === 'lastRefreshed' || orderBy === 'updatedAt' || orderBy === 'createdAt') {
        const aDate = new Date(aValue as string);
        const bDate = new Date(bValue as string);
        return order === 'asc' 
          ? aDate.getTime() - bDate.getTime() 
          : bDate.getTime() - aDate.getTime();
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
  }, [entities, filterStatus, searchQuery, order, orderBy, teams, isTeamDashboard]);

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

  // Compute next expected finish timestamp from cron-like schedule and runtime
  const computeExpectedFinish = (schedule: string | null | undefined, runtimeMinutes: number | null | undefined): string => {
    if (!schedule || runtimeMinutes == null) return '—';
    try {
      const parts = schedule.trim().split(/\s+/);
      if (parts.length < 5) return '—';
      const [minField, hourField, domField] = [parts[0], parts[1], parts[2]];

      const parseList = (field: string, min: number, max: number): number[] => {
        if (field === '*') {
          return Array.from({ length: max - min + 1 }, (_, i) => i + min);
        }
        const stepMatch = field.match(/^\*(?:\/(\d+))?$/);
        if (stepMatch) {
          const step = Number(stepMatch[1] || '1');
          const arr: number[] = [];
          for (let v = min; v <= max; v += step) arr.push(v);
          return arr;
        }
        return field.split(',')
          .map(v => Number(v))
          .filter(v => !Number.isNaN(v) && v >= min && v <= max)
          .sort((a, b) => a - b);
      };

      const minutes = parseList(minField, 0, 59);
      const hours = parseList(hourField, 0, 23);
      if (minutes.length === 0 || hours.length === 0) return '—';

      const lastMinute = Math.max(...minutes);
      const lastHour = Math.max(...hours);
      const now = new Date();

      // Monthly: choose configured day this month (cap to month's last day), at last hour:minute
      if (domField !== '*') {
        let dom = Number(domField);
        if (Number.isNaN(dom) || dom < 1) dom = 1;
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        dom = Math.min(dom, lastDayOfMonth);
        const candidate = new Date(now.getFullYear(), now.getMonth(), dom, lastHour, lastMinute, 0, 0);
        const finish = new Date(candidate.getTime() + runtimeMinutes * 60 * 1000);
        return format(finish, 'MMM d, hh:mm a');
      }

      // Daily/Hourly: choose the last scheduled time of the current day (ignore most recent run)
      const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), lastHour, lastMinute, 0, 0);
      const finish = new Date(candidate.getTime() + runtimeMinutes * 60 * 1000);
      return format(finish, 'MMM d, hh:mm a');
    } catch {
      return '—';
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

  // Note: Even when metrics are unavailable for the selected range, we still display
  // the entities list so users can always see newly added items.

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
              
              {headCells.map((headCell) => (
                <TableCell
                  key={headCell.id}
                  align={headCell.numeric ? 'right' : headCell.id === 'actions' ? 'center' : 'left'}
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
              .map((entity, index, pageEntities) => {
                const isItemSelected = isSelected(entity.id);
                const trendData = getTrendData(entity);
                
                // For team dashboard, add group headers to separate entity owners from non-owners
                const shouldShowGroupHeader = isTeamDashboard && index === 0 || 
                  (isTeamDashboard && index > 0 && 
                   pageEntities[index - 1].is_entity_owner !== entity.is_entity_owner);
                
                const groupHeaderRow = shouldShowGroupHeader ? (
                  <TableRow key={`group-header-${entity.is_entity_owner ? 'owners' : 'non-owners'}-${index}`}>
                    <TableCell 
                      colSpan={headCells.length + 1}
                      sx={{ 
                        backgroundColor: 'action.hover',
                        borderTop: '2px solid',
                        borderColor: 'divider',
                        py: 1,
                      }}
                    >
                      <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
                        {entity.is_entity_owner ? 'Entity Owners' : 'Non-Entity Owners'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : null;
                
                const entityRow = (
                  <TableRow
                    hover
                    role="checkbox"
                    aria-checked={isItemSelected}
                    tabIndex={-1}
                    key={`${entity.id ?? entity.name}-${index}`}
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
                    
                    <TableCell padding="none" sx={{ width: '180px' }}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2" fontWeight={500}>
                          {entity.name}
                        </Typography>
                        {((entity as any)?.is_entity_owner === false) && !!((entity as any)?.owner_entity_ref_name?.entity_owner_name) && (
                          <Tooltip
                            placement="top"
                            arrow
                            slotProps={{
                              tooltip: {
                                sx: {
                                  bgcolor: 'transparent',
                                  p: 0,
                                  boxShadow: 'none'
                                }
                              },
                              arrow: { sx: { color: 'background.paper' } }
                            }}
                            title={
                              <Paper elevation={1} sx={{ p: 1.25, borderRadius: 1, minWidth: 220 }}>
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Entity Owner Name</Typography>
                                  <Typography variant="body2" fontWeight={600}>
                                    {(entity as any).owner_entity_ref_name.entity_owner_name}
                                  </Typography>
                                </Box>
                                <Box mt={0.5}>
                                  <Typography variant="caption" color="text.secondary">Entity Owner Team</Typography>
                                  <Typography variant="body2" fontWeight={600}>
                                    {(entity as any).owner_entity_ref_name.entity_owner_team_name || '—'}
                                  </Typography>
                                </Box>
                                <Box mt={0.5}>
                                  <Typography variant="caption" color="text.secondary">Entity Owner Tenant</Typography>
                                  <Typography variant="body2" fontWeight={600}>
                                    {(entity as any).owner_entity_ref_name.entity_owner_tenant_name || '—'}
                                  </Typography>
                                </Box>
                              </Paper>
                            }
                          >
                            <InfoOutlined fontSize="small" sx={{ color: 'primary.main', opacity: 0.9, cursor: 'help' }} />
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                    
                    <TableCell sx={{ width: '200px' }}>
                      <Typography variant="body2" fontWeight={500}>
                        {type === 'table' 
                          ? (entity.schema_name && entity.table_name ? `${entity.schema_name}.${entity.table_name}` : entity.table_name || 'N/A')
                          : entity.dag_name || 'N/A'
                        }
                      </Typography>
                    </TableCell>

                    <TableCell sx={{ width: '120px' }}>
                      <Typography variant="body2">
                        {isTeamDashboard ? (entity.is_active ? 'Yes' : 'No') : getTeamName(entity.teamId)}
                      </Typography>
                    </TableCell>
                    
                    <TableCell sx={{ width: '100px' }}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Chip
                          label={(STATUS_CONFIG[entity.status as keyof typeof STATUS_CONFIG] || DEFAULT_STATUS).label}
                          size="small"
                          sx={{
                            backgroundColor: (STATUS_CONFIG[entity.status as keyof typeof STATUS_CONFIG] || DEFAULT_STATUS).lightBg,
                            color: `${(STATUS_CONFIG[entity.status as keyof typeof STATUS_CONFIG] || DEFAULT_STATUS).color}.dark`,
                            fontWeight: 600,
                            borderRadius: '16px',
                            fontSize: '0.75rem',
                          }}
                        />
                        { (newEntityIds ? newEntityIds.has(entity.id) : isEntityRecent(entity)) && (
                          <Chip
                            label="NEW"
                            size="small"
                            icon={<FiberNew fontSize="small" />}
                            sx={{
                              backgroundColor: '#e3f2fd',
                              color: '#1976d2',
                              fontWeight: 700,
                              fontSize: '0.65rem',
                              height: '20px',
                              minWidth: '50px',
                              borderRadius: '10px',
                              '& .MuiChip-label': {
                                paddingLeft: '4px',
                                paddingRight: '6px',
                              },
                              '& .MuiChip-icon': {
                                marginLeft: '4px',
                                marginRight: '-2px',
                              },
                            }}
                          />
                        ) }
                      </Box>
                    </TableCell>
                    
                    {/* Expected Finish (after Status) - Only on Team dashboards */}
                    {isTeamDashboard && (
                      <TableCell sx={{ width: '170px' }}>
                        <Typography variant="body2">
                          {computeExpectedFinish((entity as any).entity_schedule || (entity as any).dag_schedule || (entity as any).table_schedule, (entity as any).expected_runtime_minutes)}
                        </Typography>
                      </TableCell>
                    )}
                    
                    <TableCell align="right" sx={{ width: '110px' }}>
                      <Typography variant="body2" fontWeight={500}>
                        {hasMetrics && typeof entity.currentSla === 'number' ? `${entity.currentSla.toFixed(1)}%` : '—'}
                      </Typography>
                    </TableCell>
                    
                    <TableCell align="right" sx={{ width: '160px', pr: 1.5 }}>
                      {hasMetrics ? (
                        <Box display="flex" alignItems="center" justifyContent="flex-end">
                          <Box component="span" color={`${trendData.color}.main`} display="flex" alignItems="center" mr={0.5}>
                            {trendData.icon}
                          </Box>
                          <Typography variant="body2" color={`${trendData.color}.main`} fontWeight={500}>
                            {trendData.value > 0 ? '+' : ''}{trendData.value.toFixed(1)}%
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                    
                    <TableCell sx={{ width: '150px', pl: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(entity.lastRefreshed)}
                      </Typography>
                    </TableCell>
                    
                    {showActions && (
                      <TableCell align="center" onClick={(e) => e.stopPropagation()} sx={{ width: '120px' }}>
                        <Box display="flex" justifyContent="center">
                          <Tooltip title="Edit">
                            <IconButton size="small" color="primary" onClick={() => onEditEntity(entity)}>
                              <Edit fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          
                          {type === 'dag' && onViewTasks && entity.is_entity_owner && (
                            <Tooltip title="View Tasks">
                              <IconButton size="small" color="info" onClick={() => onViewTasks(entity)}>
                                <Assignment fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          
                          {/* Agent Workspace - Only for DAG owners */}
                          {type === 'dag' && entity.is_entity_owner && (
                            <Tooltip title="Agent Workspace">
                              <IconButton 
                                size="small" 
                                color="secondary" 
                                onClick={() => {
                                  setSelectedDagEntity(entity);
                                  setAgentWorkspaceOpen(true);
                                }}
                              >
                                <SmartToy fontSize="small" />
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
                            <IconButton size="small" color="inherit" onClick={() => onViewDetails(entity)}>
                              <History fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => onDeleteEntity(entity)}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                );
                
                // Return both group header (if exists) and entity row
                return groupHeaderRow ? [groupHeaderRow, entityRow] : entityRow;
              }).flat()}
            
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
      
      {/* Agent Workspace Modal */}
      <AgentWorkspaceModal
        open={agentWorkspaceOpen}
        onClose={() => {
          setAgentWorkspaceOpen(false);
          setSelectedDagEntity(null);
        }}
        dagEntity={selectedDagEntity}
      />
    </Box>
  );
};

export default EntityTable;
