import { useState } from 'react';
import { 
  Paper, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Typography,
  Chip,
  Box,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  IconButton,
  Checkbox,
  Button,
  Tabs,
  Tab
} from '@mui/material';
import { format } from 'date-fns';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Search as SearchIcon, 
  ArrowUp, 
  ArrowDown, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  Edit,
  Clock,
  Trash2
} from 'lucide-react';
import { Entity } from '@shared/schema';
import TaskManagementModal from '@/components/modals/TaskManagementModal';

interface DagListProps {
  dags: Entity[];
  isLoading: boolean;
  error: Error | null;
}

const DagList: React.FC<DagListProps> = ({ dags, isLoading, error }) => {
  const [selectedDag, setSelectedDag] = useState<Entity | null>(null);
  const [openTasksModal, setOpenTasksModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredDags, setFilteredDags] = useState<Entity[]>(dags);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [rowsPerPage] = useState(5);

  // Handle search filtering
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setFilteredDags(dags);
      return;
    }
    
    const lowercaseQuery = query.toLowerCase();
    const filtered = dags.filter(dag => 
      dag.name.toLowerCase().includes(lowercaseQuery) ||
      (dag.description && dag.description.toLowerCase().includes(lowercaseQuery)) ||
      (dag.owner && dag.owner.toLowerCase().includes(lowercaseQuery))
    );
    setFilteredDags(filtered);
  };

  // Update filtered dags when props change
  if (dags !== filteredDags && searchQuery === '') {
    setFilteredDags(dags);
  }

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" m={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Error loading DAGs: {error.message || 'Unknown error'}
      </Alert>
    );
  }

  if (!dags || dags.length === 0) {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        No DAGs found in the system.
      </Alert>
    );
  }

  const getStatusChip = (status: string | null | undefined) => {
    if (!status) return null;
    
    const statusLower = status.toLowerCase();
    let color = 'default';
    let bgColor = 'grey.100';
    let textColor = 'text.primary';
    
    switch (statusLower) {
      case 'success':
        bgColor = '#e6f4ea';
        textColor = '#137333';
        break;
      case 'failed':
        bgColor = '#fce8e6';
        textColor = '#c5221f';
        break;
      case 'running':
        bgColor = '#e8f0fe';
        textColor = '#1a73e8';
        break;
      case 'warning':
        bgColor = '#fef7e0';
        textColor = '#b06000';
        break;
    }
    
    return (
      <Box sx={{ 
        display: 'inline-block', 
        bgcolor: bgColor, 
        color: textColor, 
        borderRadius: 1,
        px: 1.5,
        py: 0.5,
        fontSize: '0.75rem',
        fontWeight: 'medium',
        textTransform: 'capitalize'
      }}>
        {status}
      </Box>
    );
  };

  const getTrendIcon = (trend: number | null | undefined) => {
    if (trend === undefined || trend === null) return null;
    
    if (trend > 0) {
      return <Box sx={{ color: 'success.main', display: 'flex', alignItems: 'center' }}>
        <ArrowUp size={16} />
        <Typography variant="caption" sx={{ ml: 0.5 }}>+{trend.toFixed(1)}%</Typography>
      </Box>;
    } else {
      return <Box sx={{ color: 'error.main', display: 'flex', alignItems: 'center' }}>
        <ArrowDown size={16} />
        <Typography variant="caption" sx={{ ml: 0.5 }}>{trend.toFixed(1)}%</Typography>
      </Box>;
    }
  };

  const handleDagClick = (dag: Entity) => {
    setSelectedDag(dag);
    setOpenTasksModal(true);
  };

  const handleFilterChange = (filter: string | null) => {
    setStatusFilter(filter);
  };

  const filteredByStatus = statusFilter 
    ? filteredDags.filter(dag => dag.status?.toLowerCase() === statusFilter.toLowerCase())
    : filteredDags;

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <Tabs
          value={0}
          sx={{ 
            borderBottom: 1, 
            borderColor: 'divider'
          }}
        >
          <Tab label="Tables" />
          <Tab label="DAGs" />
        </Tabs>
        
        <Box sx={{ my: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2 }}>
          <TextField
            placeholder="Search entities..."
            size="small"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon size={16} style={{ opacity: 0.5, marginRight: 8 }} />,
            }}
            sx={{ width: 180 }}
          />
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Typography variant="caption" sx={{ alignSelf: 'center', mr: 1 }}>Show:</Typography>
            <Button 
              variant={statusFilter === null ? "contained" : "outlined"} 
              size="small"
              onClick={() => handleFilterChange(null)}
              sx={{ minWidth: 'auto', px: 2, py: 0.5 }}
            >
              All
            </Button>
            <Button 
              variant={statusFilter === 'success' ? "contained" : "outlined"} 
              size="small"
              color="success"
              onClick={() => handleFilterChange('success')}
              sx={{ minWidth: 'auto', px: 2, py: 0.5 }}
            >
              Healthy
            </Button>
            <Button 
              variant={statusFilter === 'warning' ? "contained" : "outlined"} 
              size="small"
              color="warning"
              onClick={() => handleFilterChange('warning')}
              sx={{ minWidth: 'auto', px: 2, py: 0.5 }}
            >
              Warning
            </Button>
            <Button 
              variant={statusFilter === 'failed' ? "contained" : "outlined"} 
              size="small"
              color="error"
              onClick={() => handleFilterChange('failed')}
              sx={{ minWidth: 'auto', px: 2, py: 0.5 }}
            >
              Critical
            </Button>
          </Box>
        </Box>
        
        <Paper elevation={0} sx={{ mx: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox size="small" />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    Entity Name
                    <ArrowUp size={16} style={{ marginLeft: 4, opacity: 0.5 }} />
                  </Box>
                </TableCell>
                <TableCell>Team</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Current SLA</TableCell>
                <TableCell>30-Day Trend</TableCell>
                <TableCell>Last Updated</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredByStatus.map((dag) => (
                <TableRow 
                  key={dag.id}
                  hover
                  onClick={() => handleDagClick(dag)}
                  sx={{ 
                    '&:hover': { 
                      cursor: 'pointer',
                      backgroundColor: 'action.hover' 
                    }
                  }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox size="small" onClick={(e) => e.stopPropagation()} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {dag.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {dag.teamId === 1 ? 'PGM' : 
                       dag.teamId === 2 ? 'Core' : 
                       dag.teamId === 3 ? 'Viewer Product' : 
                       `Team ${dag.teamId}`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {getStatusChip(dag.status)}
                  </TableCell>
                  <TableCell>
                    <Typography 
                      variant="body2" 
                      fontWeight="medium"
                    >
                      {dag.currentSla ? `${dag.currentSla.toFixed(1)}%` : 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {getTrendIcon(dag.trend || (Math.random() > 0.5 ? 1 : -1) * Math.random() * 2)}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {dag.updatedAt 
                        ? format(new Date(dag.updatedAt), 'HH:mm') > '12:00' 
                          ? `Yesterday, ${format(new Date(dag.updatedAt), 'HH:mm')} PM` 
                          : `Today, ${format(new Date(dag.updatedAt), 'HH:mm')} AM`
                        : 'Never'
                      }
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); }}>
                        <Edit size={16} />
                      </IconButton>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); }}>
                        <Clock size={16} />
                      </IconButton>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); }}>
                        <Trash2 size={16} />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
              
              {filteredByStatus.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                    <Typography color="text.secondary">
                      No DAGs match your search criteria
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            alignItems: 'center', 
            p: 1.5, 
            borderTop: 1, 
            borderColor: 'divider',
            gap: 2
          }}>
            <Typography variant="caption">
              Rows per page: 5
            </Typography>
            <Typography variant="caption">
              1-{Math.min(filteredByStatus.length, rowsPerPage)} of {filteredByStatus.length}
            </Typography>
            <Box sx={{ display: 'flex' }}>
              <IconButton size="small" disabled={true}>
                <ChevronLeft size={16} />
              </IconButton>
              <IconButton size="small" disabled={filteredByStatus.length <= rowsPerPage}>
                <ChevronRight size={16} />
              </IconButton>
            </Box>
          </Box>
        </Paper>
      </Box>
      
      {/* Task Management Modal */}
      <TaskManagementModal
        isOpen={openTasksModal}
        onClose={() => {
          setOpenTasksModal(false);
          setSelectedDag(null);
        }}
        dag={selectedDag}
      />
    </>
  );
};

export default DagList;