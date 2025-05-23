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
} from '@mui/icons-material';
import { visuallyHidden } from '@mui/utils';
import { useAppDispatch } from '@/lib/store';
import { selectEntity } from '@/features/sla/slices/entitiesSlice';
import { format } from 'date-fns';
import { Entity, EntityStatus } from '@/features/sla/types';

interface StatusConfig {
  color: 'success' | 'warning' | 'error' | 'default';
  label: string;
  lightBg: string;
}

const DEFAULT_STATUS: StatusConfig = { color: 'default', label: 'Unknown', lightBg: 'rgba(158, 158, 158, 0.1)' };

const STATUS_CONFIG: Record<string, StatusConfig> = {
  // Regular monitoring status terms (for tables)
  healthy: { color: 'success', label: 'Healthy', lightBg: 'rgba(76, 175, 80, 0.1)' },
  warning: { color: 'warning', label: 'Warning', lightBg: 'rgba(255, 152, 0, 0.1)' },
  critical: { color: 'error', label: 'Critical', lightBg: 'rgba(244, 67, 54, 0.1)' },
  
  // DAG status terms
  success: { color: 'success', label: 'Success', lightBg: 'rgba(76, 175, 80, 0.1)' },
  failed: { color: 'error', label: 'Failed', lightBg: 'rgba(244, 67, 54, 0.1)' },
  running: { color: 'warning', label: 'Running', lightBg: 'rgba(255, 152, 0, 0.1)' },
  
  // Add a "Passed" status as requested
  passed: { color: 'success', label: 'Passed', lightBg: 'rgba(76, 175, 80, 0.1)' },
};

interface HeadCell {
  id: keyof Entity | 'actions' | 'trend';
  label: string;
  numeric: boolean;
  disablePadding: boolean;
  sortable: boolean;
  width?: string;
}

const getHeadCells = (showActions: boolean): HeadCell[] => [
  { id: 'name', label: 'Entity Name', numeric: false, disablePadding: true, sortable: true },
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

  const handleRowClick = (entity: Entity) => {
    dispatch(selectEntity(entity));
    onViewDetails(entity);
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

  // Demo trend data - in a real app, this would come from the entity or history API
  const getTrendData = (entity: Entity) => {
    // For demo purposes, generate random trend data
    const seed = entity.id * 7919; // Use a prime number for better distribution
    const rand = () => {
      const x = Math.sin(seed) * 10000;
      return (x - Math.floor(x)) * 4 - 2; // Generate a value between -2 and 2
    };
    
    const value = rand();
    
    return {
      value,
      icon: value > 0.5 ? <TrendingUp /> : value < -0.5 ? <TrendingDown /> : <TrendingFlat />,
      color: value > 0.5 ? 'success' : value < -0.5 ? 'error' : 'warning',
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
              variant={filterStatus === 'healthy' ? 'contained' : 'outlined'} 
              onClick={() => setFilterStatus('healthy')}
              sx={{ 
                color: filterStatus === 'healthy' ? 'white' : STATUS_CONFIG.healthy.color,
                borderColor: STATUS_CONFIG.healthy.color,
                '&.Mui-contained': { backgroundColor: STATUS_CONFIG.healthy.color },
              }}
            >
              Healthy
            </Button>
            <Button 
              variant={filterStatus === 'warning' ? 'contained' : 'outlined'} 
              onClick={() => setFilterStatus('warning')}
              sx={{ 
                color: filterStatus === 'warning' ? 'white' : STATUS_CONFIG.warning.color,
                borderColor: STATUS_CONFIG.warning.color,
                '&.Mui-contained': { backgroundColor: STATUS_CONFIG.warning.color },
              }}
            >
              Warning
            </Button>
            <Button 
              variant={filterStatus === 'critical' ? 'contained' : 'outlined'} 
              onClick={() => setFilterStatus('critical')}
              sx={{ 
                color: filterStatus === 'critical' ? 'white' : STATUS_CONFIG.critical.color,
                borderColor: STATUS_CONFIG.critical.color,
                '&.Mui-contained': { backgroundColor: STATUS_CONFIG.critical.color },
              }}
            >
              Critical
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
                    onClick={() => handleRowClick(entity)}
                    role="checkbox"
                    aria-checked={isItemSelected}
                    tabIndex={-1}
                    key={entity.id}
                    selected={isItemSelected}
                    sx={{ cursor: 'pointer' }}
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
                          
                          <Tooltip title="History">
                            <IconButton size="small" color="inherit" onClick={() => onViewHistory(entity)}>
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
