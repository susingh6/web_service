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
  IconButton
} from '@mui/material';
import { format } from 'date-fns';
import { CheckCircle, XCircle, AlertTriangle, ListFilter, Search as SearchIcon } from 'lucide-react';
import { Entity } from '@/features/sla/types';
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

  const getStatusIcon = (status: string | null | undefined) => {
    if (!status) return <AlertTriangle color="orange" size={18} />;
    
    switch (status.toLowerCase()) {
      case 'success':
      case 'healthy':
        return <CheckCircle color="green" size={18} />;
      case 'failed':
      case 'critical':
        return <XCircle color="red" size={18} />;
      case 'running':
        return <CircularProgress size={18} />;
      case 'warning':
        return <AlertTriangle color="orange" size={18} />;
      default:
        return <AlertTriangle color="orange" size={18} />;
    }
  };

  const handleDagClick = (dag: Entity) => {
    setSelectedDag(dag);
    setOpenTasksModal(true);
  };

  return (
    <>
      <Paper elevation={0} sx={{ margin: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between" borderBottom={1} borderColor="divider">
          <Typography variant="h6" component="h2" fontWeight="bold">
            DAG Entities
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <TextField
              placeholder="Search DAGs..."
              variant="outlined"
              size="small"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon size={18} />
                  </InputAdornment>
                ),
              }}
              sx={{ 
                minWidth: 250,
                mr: 1
              }}
            />
            <IconButton color="primary" size="small">
              <ListFilter size={18} />
            </IconButton>
          </Box>
        </Box>
        
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Schedule</TableCell>
                <TableCell>Last Run</TableCell>
                <TableCell>Team</TableCell>
                <TableCell>Compliance</TableCell>
                <TableCell>Owner</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredDags.map((dag) => (
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
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {dag.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {dag.description}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      {getStatusIcon(dag.status)}
                      <Typography variant="body2">
                        {dag.status}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {dag.refreshFrequency || "* * * * *"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {dag.lastRun ? (
                      <Typography variant="body2">
                        {format(new Date(dag.lastRun), 'yyyy-MM-dd HH:mm')}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Never
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={`Team ${dag.teamId}`}
                      size="small"
                      sx={{ 
                        backgroundColor: 'primary.light',
                        color: 'primary.contrastText'
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography 
                      variant="body2" 
                      color={dag.currentSla && dag.currentSla > 95 ? 'success.main' : 'error.main'}
                      fontWeight="medium"
                    >
                      {dag.currentSla ? `${dag.currentSla.toFixed(1)}%` : 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {dag.owner || "Unassigned"}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
              
              {filteredDags.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                    <Typography color="text.secondary">
                      No DAGs match your search criteria
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      
      {/* Task Management Modal */}
      <TaskManagementModal
        open={openTasksModal}
        onClose={() => {
          setOpenTasksModal(false);
          setSelectedDag(null);
        }}
        entity={selectedDag}
      />
    </>
  );
};

export default DagList;