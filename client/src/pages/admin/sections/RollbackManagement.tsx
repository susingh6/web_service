import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  IconButton,
  Tooltip,
  TablePagination,
  InputAdornment,
  Tabs,
  Tab,
  Collapse,
  Skeleton,
  Alert
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  History as HistoryIcon,
  RestoreFromTrash as RestoreIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  TableChart as TableIcon,
  AccountTree as DagIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { tenantsApi } from '@/features/sla/api';
import { buildUrl, endpoints } from '@/config';

// Mock data for placeholder - will be replaced with actual API calls
const MOCK_DELETED_ENTITIES: DeletedEntity[] = [
  {
    id: '1',
    entity_name: 'user_analytics_pipeline',
    entity_type: 'dag',
    tenant_name: 'Data Engineering123',
    team_name: 'Analytics Team',
    deleted_date: '2025-09-15T10:30:00Z',
    deleted_by: 'john.doe@company.com',
    entity_id: 'dag_123',
    tenant_id: '1',
    team_id: '1'
  },
  {
    id: '2',
    entity_name: 'customer_data_table',
    entity_type: 'table',
    tenant_name: 'Marketing Ops',
    team_name: 'Customer Insights',
    deleted_date: '2025-09-14T15:45:00Z',
    deleted_by: 'jane.smith@company.com',
    entity_id: 'table_456',
    tenant_id: '2',
    team_id: '2'
  },
  {
    id: '3',
    entity_name: 'sales_reporting_dag',
    entity_type: 'dag',
    tenant_name: 'Sales Operations',
    team_name: 'Sales Analytics',
    deleted_date: '2025-09-13T09:15:00Z',
    deleted_by: 'mike.wilson@company.com',
    entity_id: 'dag_789',
    tenant_id: '3',
    team_id: '3'
  },
  {
    id: '4',
    entity_name: 'inventory_tracking_table',
    entity_type: 'table',
    tenant_name: 'Operations',
    team_name: 'Supply Chain',
    deleted_date: '2025-09-12T14:20:00Z',
    deleted_by: 'sarah.johnson@company.com',
    entity_id: 'table_101',
    tenant_id: '4',
    team_id: '4'
  }
];

// Mock teams data
interface MockTeam {
  id: string;
  name: string;
  tenant_id: string;
}

const MOCK_TEAMS: MockTeam[] = [
  { id: '1', name: 'Analytics Team', tenant_id: '1' },
  { id: '2', name: 'Customer Insights', tenant_id: '2' },
  { id: '3', name: 'Sales Analytics', tenant_id: '3' },
  { id: '4', name: 'Supply Chain', tenant_id: '4' },
  { id: '5', name: 'DevOps Team', tenant_id: '1' },
];

interface DeletedEntity {
  id: string;
  entity_name: string;
  entity_type: 'dag' | 'table';
  tenant_name: string;
  team_name: string;
  deleted_date: string;
  deleted_by: string;
  entity_id: string;
  tenant_id: string;
  team_id: string;
}

const RollbackManagement = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [entityNameSearch, setEntityNameSearch] = useState('');
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [searchResults, setSearchResults] = useState<DeletedEntity[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const { toast } = useToast();

  // Fetch active tenants for dropdown
  const { data: tenants = [] } = useQuery({
    queryKey: ['/api/tenants', 'active'],
    queryFn: async () => {
      return await tenantsApi.getAll(true); // active_only=true
    },
    staleTime: 6 * 60 * 60 * 1000,
  });

  // Fetch teams for selected tenant
  const { data: teams = [] } = useQuery({
    queryKey: ['admin', 'teams', selectedTenant],
    queryFn: async () => {
      if (!selectedTenant) return [];
      
      // Mock teams fetch - replace with actual API call
      console.log('🔍 Fetching teams for tenant:', selectedTenant);
      return MOCK_TEAMS.filter(team => team.tenant_id === selectedTenant);
    },
    enabled: !!selectedTenant,
    staleTime: 5 * 60 * 1000,
  });

  // Filter teams based on selected tenant
  const availableTeams = useMemo(() => {
    if (!selectedTenant) return [];
    return teams;
  }, [teams, selectedTenant]);

  // Handle entity name search
  const handleEntityNameSearch = async () => {
    if (!entityNameSearch.trim()) {
      toast({
        title: 'Search Required',
        description: 'Please enter an entity name to search',
        variant: 'destructive'
      });
      return;
    }

    setIsSearching(true);
    console.log('🔍 Searching for entity by name:', entityNameSearch);

    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock search - find entities that match the name
      const results = MOCK_DELETED_ENTITIES.filter(entity => 
        entity.entity_name.toLowerCase().includes(entityNameSearch.toLowerCase())
      );
      
      setSearchResults(results);
      setShowResults(true);
      setPage(0);
      
      console.log('✅ Entity name search results:', results);
      
      if (results.length === 0) {
        toast({
          title: 'No Results',
          description: `No deleted entities found matching "${entityNameSearch}"`,
        });
      } else {
        toast({
          title: 'Search Complete',
          description: `Found ${results.length} deleted entity${results.length !== 1 ? 'ies' : ''} matching "${entityNameSearch}"`,
        });
      }
    } catch (error) {
      console.error('❌ Entity name search error:', error);
      toast({
        title: 'Search Failed',
        description: 'Failed to search for entities. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Handle team/tenant search
  const handleTeamTenantSearch = async () => {
    if (!selectedTenant || !selectedTeam) {
      toast({
        title: 'Selection Required',
        description: 'Please select both a tenant and team to search',
        variant: 'destructive'
      });
      return;
    }

    setIsSearching(true);
    console.log('🔍 Searching for deleted entities by team/tenant:', { selectedTenant, selectedTeam });

    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      // Mock search - find entities for the selected team/tenant
      const results = MOCK_DELETED_ENTITIES.filter(entity => 
        entity.tenant_id === selectedTenant && entity.team_id === selectedTeam
      );
      
      setSearchResults(results);
      setShowResults(true);
      setPage(0);
      
      console.log('✅ Team/tenant search results:', results);
      
      const selectedTeamName = availableTeams.find((t: MockTeam) => t.id === selectedTeam)?.name;
      const selectedTenantName = tenants.find((t: any) => t.id === selectedTenant)?.name;
      
      if (results.length === 0) {
        toast({
          title: 'No Results',
          description: `No deleted entities found for ${selectedTeamName} in ${selectedTenantName}`,
        });
      } else {
        toast({
          title: 'Search Complete',
          description: `Found ${results.length} deleted entity${results.length !== 1 ? 'ies' : ''} for ${selectedTeamName}`,
        });
      }
    } catch (error) {
      console.error('❌ Team/tenant search error:', error);
      toast({
        title: 'Search Failed',
        description: 'Failed to search for entities. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Handle rollback action
  const handleRollback = async (entity: DeletedEntity) => {
    console.log('🔄 Initiating rollback for entity:', entity);
    
    try {
      // Simulate rollback API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('✅ Rollback successful for entity:', entity.entity_name);
      
      toast({
        title: 'Rollback Successful',
        description: `${entity.entity_name} has been successfully restored`,
      });
      
      // Remove the restored entity from search results
      setSearchResults(prev => prev.filter(e => e.id !== entity.id));
      
    } catch (error) {
      console.error('❌ Rollback error:', error);
      toast({
        title: 'Rollback Failed',
        description: `Failed to restore ${entity.entity_name}. Please try again.`,
        variant: 'destructive'
      });
    }
  };

  // Clear search and results
  const handleClearSearch = () => {
    setEntityNameSearch('');
    setSelectedTenant('');
    setSelectedTeam('');
    setSearchResults([]);
    setShowResults(false);
    setPage(0);
  };

  // Pagination logic
  const paginatedResults = useMemo(() => {
    const startIndex = page * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return searchResults.slice(startIndex, endIndex);
  }, [searchResults, page, rowsPerPage]);

  // Get entity type icon
  const getEntityTypeIcon = (entityType: string) => {
    return entityType === 'dag' ? <DagIcon /> : <TableIcon />;
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Rollback Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Search and restore deleted entities from audit history
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<ClearIcon />}
          onClick={handleClearSearch}
          disabled={!entityNameSearch && !selectedTenant && !selectedTeam && searchResults.length === 0}
          data-testid="button-clear-all"
        >
          Clear All
        </Button>
      </Box>

      <Card elevation={2}>
        <CardContent>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs 
              value={activeTab} 
              onChange={(e, newValue) => setActiveTab(newValue)}
              data-testid="tabs-search-methods"
            >
              <Tab 
                label="Search by Entity Name" 
                icon={<SearchIcon />} 
                iconPosition="start"
                data-testid="tab-entity-name"
              />
              <Tab 
                label="Search by Team/Tenant" 
                icon={<HistoryIcon />} 
                iconPosition="start"
                data-testid="tab-team-tenant"
              />
            </Tabs>
          </Box>

          {/* Entity Name Search Tab */}
          {activeTab === 0 && (
            <Box sx={{ py: 3 }}>
              <Typography variant="h6" gutterBottom>
                Search Deleted Entity by Name
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Enter the exact or partial name of a deleted entity to find it in the audit history
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
                <TextField
                  fullWidth
                  label="Entity Name"
                  placeholder="Enter entity name (e.g., user_analytics_pipeline)"
                  value={entityNameSearch}
                  onChange={(e) => setEntityNameSearch(e.target.value)}
                  disabled={isSearching}
                  data-testid="input-entity-name"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                    endAdornment: entityNameSearch && (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => setEntityNameSearch('')}
                          edge="end"
                          data-testid="button-clear-entity-name"
                        >
                          <ClearIcon />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleEntityNameSearch();
                    }
                  }}
                />
                <Button
                  variant="contained"
                  onClick={handleEntityNameSearch}
                  disabled={!entityNameSearch.trim() || isSearching}
                  sx={{ minWidth: 120 }}
                  data-testid="button-search-entity-name"
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </Button>
              </Box>
            </Box>
          )}

          {/* Team/Tenant Search Tab */}
          {activeTab === 1 && (
            <Box sx={{ py: 3 }}>
              <Typography variant="h6" gutterBottom>
                Search Deleted Entities by Team and Tenant
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Select a tenant and team to find all entities that were deleted from that scope
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Tenant</InputLabel>
                  <Select
                    value={selectedTenant}
                    label="Tenant"
                    onChange={(e) => {
                      setSelectedTenant(e.target.value);
                      setSelectedTeam(''); // Clear team selection when tenant changes
                    }}
                    disabled={isSearching}
                    data-testid="select-tenant"
                  >
                    {tenants.map((tenant: any) => (
                      <MenuItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth>
                  <InputLabel>Team</InputLabel>
                  <Select
                    value={selectedTeam}
                    label="Team"
                    onChange={(e) => setSelectedTeam(e.target.value)}
                    disabled={!selectedTenant || isSearching || availableTeams.length === 0}
                    data-testid="select-team"
                  >
                    {availableTeams.map((team) => (
                      <MenuItem key={team.id} value={team.id}>
                        {team.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Button
                  variant="contained"
                  onClick={handleTeamTenantSearch}
                  disabled={!selectedTenant || !selectedTeam || isSearching}
                  sx={{ minWidth: 120 }}
                  data-testid="button-search-team-tenant"
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Search Results */}
      {(showResults || isSearching) && (
        <Card elevation={2} sx={{ mt: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Search Results
                {!isSearching && ` (${searchResults.length} deleted entities found)`}
              </Typography>
              <IconButton
                onClick={() => setShowResults(!showResults)}
                data-testid="button-toggle-results"
              >
                {showResults ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>

            <Collapse in={showResults}>
              {isSearching ? (
                <Box>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Searching for deleted entities...
                  </Alert>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton key={index} variant="rectangular" height={60} />
                    ))}
                  </Box>
                </Box>
              ) : searchResults.length === 0 ? (
                <Alert severity="info">
                  No deleted entities found. Try adjusting your search criteria.
                </Alert>
              ) : (
                <>
                  <Typography 
                    variant="body2" 
                    color="text.secondary" 
                    sx={{ mb: 2 }}
                    data-testid="status-result-count"
                  >
                    Showing {page * rowsPerPage + 1}–{Math.min(searchResults.length, (page + 1) * rowsPerPage)} of {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                  </Typography>

                  <TableContainer component={Paper} elevation={0}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Entity</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Tenant</TableCell>
                          <TableCell>Team</TableCell>
                          <TableCell>Deleted Date</TableCell>
                          <TableCell>Deleted By</TableCell>
                          <TableCell>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {paginatedResults.map((entity) => (
                          <TableRow key={entity.id} data-testid={`row-entity-${entity.id}`}>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {getEntityTypeIcon(entity.entity_type)}
                                <Typography variant="body2" fontWeight="medium">
                                  {entity.entity_name}
                                </Typography>
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={entity.entity_type.toUpperCase()} 
                                size="small" 
                                variant="outlined"
                                color={entity.entity_type === 'dag' ? 'primary' : 'secondary'}
                                data-testid={`chip-type-${entity.id}`}
                              />
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={entity.tenant_name} 
                                size="small" 
                                variant="outlined"
                                color="primary"
                                data-testid={`chip-tenant-${entity.id}`}
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {entity.team_name}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {formatDate(entity.deleted_date)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {entity.deleted_by}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Tooltip title={`Restore ${entity.entity_name}`}>
                                <Button
                                  variant="contained"
                                  color="primary"
                                  size="small"
                                  startIcon={<RestoreIcon />}
                                  onClick={() => handleRollback(entity)}
                                  data-testid={`button-rollback-${entity.id}`}
                                >
                                  Rollback
                                </Button>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  {searchResults.length > rowsPerPage && (
                    <TablePagination
                      component="div"
                      count={searchResults.length}
                      page={page}
                      onPageChange={(event, newPage) => setPage(newPage)}
                      rowsPerPage={rowsPerPage}
                      onRowsPerPageChange={(event) => {
                        setRowsPerPage(parseInt(event.target.value, 10));
                        setPage(0);
                      }}
                      rowsPerPageOptions={[10, 25, 50]}
                      showFirstButton
                      showLastButton
                      data-testid="pagination-results"
                    />
                  )}
                </>
              )}
            </Collapse>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default RollbackManagement;