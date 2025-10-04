import { useState, useMemo, useEffect } from 'react';
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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAdminMutation } from '@/utils/cache-management';
import { useToast } from '@/hooks/use-toast';
import { tenantsApi, teamsApi, rollbackApi } from '@/features/sla/api';
import { cacheKeys, invalidateAdminCaches, invalidateEntityCaches } from '@/lib/cacheKeys';
import { useWebSocket } from '@/hooks/useWebSocket';
import { WEBSOCKET_CONFIG } from '../../../../../shared/websocket-config';
import { buildUrl, endpoints } from '@/config';
import type { Entity } from '@shared/schema';


interface DeletedEntity {
  id: string;
  entity_name: string;
  entity_type: Entity['type'];
  tenant_name: string;
  team_name: string;
  deleted_date: string;
  deleted_by: string;
  entity_id: string;
  tenant_id: string;
  team_id: string;
  schema_name?: string;
  table_name?: string;
  table_schedule?: string;
  dag_name?: string;
  dag_schedule?: string;
}

const RollbackManagement = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [entityNameSearch, setEntityNameSearch] = useState('');
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [searchResults, setSearchResults] = useState<DeletedEntity[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { adminRollback } = useAdminMutation();

  // WebSocket integration for real-time audit updates
  const sessionId = localStorage.getItem('fastapi_session_id');
  const { sendMessage } = useWebSocket({
    componentType: WEBSOCKET_CONFIG.componentTypes.ROLLBACK_MANAGEMENT,
    sessionId: sessionId || undefined,
    onMessage: async (data: any) => {
      console.log('📡 Received audit update via WebSocket:', data);
      // Invalidate audit search results to refresh data
      await queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] });
      
      // Also invalidate related caches
      await invalidateAdminCaches(queryClient);
      
      // Show toast notification for the update
      if (data.type === 'entity-restored') {
        toast({ 
          title: 'Entity Restored', 
          description: `${data.entityName || 'Entity'} has been restored by ${data.restoredBy}` 
        });
        // Remove restored entity from current search results
        setSearchResults(prev => prev.filter(e => e.id !== data.entityId));
      }
    },
    onConnect: () => {
      console.log('📡 WebSocket connected in RollbackManagement');
    },
    onDisconnect: () => {
      console.log('📡 WebSocket disconnected in RollbackManagement');
    }
  });

  // Listen for rollback data refresh events
  useEffect(() => {
    const handleRefreshAudit = () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] });
    };
    
    window.addEventListener('refresh-audit-data', handleRefreshAudit);
    return () => window.removeEventListener('refresh-audit-data', handleRefreshAudit);
  }, [queryClient]);

  // Fetch active tenants for dropdown with proper cache configuration
  const { data: tenants = [] } = useQuery({
    queryKey: ['/api/tenants', 'active'],
    queryFn: async () => {
      return await tenantsApi.getAll(true); // active_only=true
    },
    staleTime: 60 * 1000, // 60 seconds to match other components
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch ALL teams using same pattern as TeamsManagement
  const { data: allTeams = [] } = useQuery({
    queryKey: ['admin', 'teams'],
    queryFn: async () => {
      console.log('🔍 Fetching all teams for rollback component');
      // Build headers with session ID for RBAC enforcement (same as TeamsManagement)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      const sessionId = localStorage.getItem('fastapi_session_id');
      if (sessionId) headers['X-Session-ID'] = sessionId;
      
      const response = await fetch(buildUrl('/api/teams'), {
        method: 'GET',
        headers,
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Failed to fetch teams');
      return response.json();
    },
    staleTime: 60 * 1000, // 60 seconds to match other components  
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Filter teams based on selected tenant
  const availableTeams = useMemo(() => {
    if (!selectedTenant || !allTeams) {
      console.log('🔍 No filtering: selectedTenant=', selectedTenant, 'allTeams=', allTeams?.length || 0);
      return [];
    }
    
    console.log('🔍 Filtering teams for tenant:', selectedTenant, 'from teams:', allTeams);
    console.log('🔍 Sample team structure:', allTeams[0]);
    
    const filtered = allTeams.filter((team: any) => 
      String(team.tenant_id) === String(selectedTenant) && team.isActive !== false
    );
    console.log('🔍 Filtered teams result:', filtered);
    return filtered;
  }, [allTeams, selectedTenant]);

  // Entity name search mutation using 3-tier fallback pattern
  const entityNameSearchMutation = useMutation({
    mutationFn: async (entityName: string) => {
      console.log('🔍 Searching for entity by name:', entityName);
      return await rollbackApi.getDeletedEntitiesByName(entityName);
    },
    onSuccess: (results: any) => {
      const entities = results.entities || [];
      setSearchResults(entities);
      setShowResults(true);
      setPage(0);
      
      console.log('✅ Entity name search results:', results);
      
      if (entities.length === 0) {
        toast({
          title: 'No Results',
          description: `No deleted entities found matching "${entityNameSearch}"`,
        });
      } else {
        toast({
          title: 'Search Complete',
          description: `Found ${entities.length} deleted entity${entities.length !== 1 ? 'ies' : ''} matching "${entityNameSearch}"`,
        });
      }
    },
    onError: (error: any) => {
      console.error('❌ Entity name search error:', error);
      toast({
        title: 'FastAPI unavailable',
        description: error?.message || 'Search requires FastAPI. Please start the backend or try later.',
        variant: 'destructive'
      });
    }
  });

  // Team/tenant search mutation using 3-tier fallback pattern
  const teamTenantSearchMutation = useMutation({
    mutationFn: async ({ tenantId, teamId }: { tenantId: number; teamId: number }) => {
      console.log('🔍 Searching for deleted entities by team/tenant:', { tenantId, teamId });
      return await rollbackApi.getDeletedEntitiesByTeamTenant(tenantId, teamId);
    },
    onSuccess: (results: any) => {
      const entities = results.entities || [];
      setSearchResults(entities);
      setShowResults(true);
      setPage(0);
      
      console.log('✅ Team/tenant search results:', results);
      
      const selectedTeamName = availableTeams.find((t: any) => t.id === selectedTeam)?.name;
      const selectedTenantName = tenants.find((t: any) => t.id === selectedTenant)?.name;
      
      if (entities.length === 0) {
        toast({
          title: 'No Results',
          description: `No deleted entities found for ${selectedTeamName} in ${selectedTenantName}`,
        });
      } else {
        toast({
          title: 'Search Complete',
          description: `Found ${entities.length} deleted entity${entities.length !== 1 ? 'ies' : ''} for ${selectedTeamName}`,
        });
      }
    },
    onError: (error: any) => {
      console.error('❌ Team/tenant search error:', error);
      toast({
        title: 'FastAPI unavailable',
        description: error?.message || 'Search requires FastAPI. Please start the backend or try later.',
        variant: 'destructive'
      });
    }
  });

  // Rollback mutation using 2-tier fallback pattern (no mock fallback for write operations)
  const rollbackMutation = useMutation({
    mutationFn: async (entity: DeletedEntity) => {
      console.log('🔄 Initiating rollback for entity:', entity);
      return await rollbackApi.performRollback({
        entity_id: entity.entity_id,
        entity_name: entity.entity_name,
        entity_type: entity.entity_type,
        tenant_id: entity.tenant_id,
        team_id: entity.team_id
      });
    },
    onSuccess: async (result: any, entity: DeletedEntity) => {
      console.log('✅ Rollback successful for entity:', entity.entity_name);
      
      toast({
        title: 'Rollback Successful',
        description: `${entity.entity_name} has been successfully restored`,
      });
      
      // Remove the restored entity from search results
      setSearchResults(prev => prev.filter(e => e.id !== entity.id));
      
      // Dual-path cache invalidation following established patterns
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/entities'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/entities'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/tenants', 'active'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] });
      
      // Invalidate entity caches for the restored entity
      await invalidateEntityCaches(queryClient, {
        tenant: entity.tenant_name,
        teamId: parseInt(entity.team_id),
        entityId: entity.entity_id
      });
      
      // Also invalidate admin caches
      await invalidateAdminCaches(queryClient);
      
      // Emit custom event for other components to refresh
      window.dispatchEvent(new CustomEvent('entity-restored', {
        detail: { 
          entityId: entity.entity_id,
          entityName: entity.entity_name,
          tenantId: entity.tenant_id,
          teamId: entity.team_id,
          source: 'rollback-management'
        }
      }));
    },
    onError: (error: any, entity: DeletedEntity) => {
      console.error('❌ Rollback error:', error);
      toast({
        title: 'Rollback Failed',
        description: `Failed to restore ${entity.entity_name}. Please try again.`,
        variant: 'destructive'
      });
    }
  });

  // Handle entity name search using mutation
  const handleEntityNameSearch = async () => {
    if (!entityNameSearch.trim()) {
      toast({
        title: 'Search Required',
        description: 'Please enter an entity name to search',
        variant: 'destructive'
      });
      return;
    }

    try {
      await entityNameSearchMutation.mutateAsync(entityNameSearch);
    } catch {
      setShowResults(false);
    }
  };

  // Handle team/tenant search using mutation
  const handleTeamTenantSearch = async () => {
    if (!selectedTenant || !selectedTeam) {
      toast({
        title: 'Selection Required',
        description: 'Please select both a tenant and team to search',
        variant: 'destructive'
      });
      return;
    }

    try {
      await teamTenantSearchMutation.mutateAsync({
        tenantId: parseInt(selectedTenant),
        teamId: parseInt(selectedTeam)
      });
    } catch {
      setShowResults(false);
    }
  };

  // Modern cache-managed rollback
  const handleRollbackEntity = async (entity: DeletedEntity) => {
    try {
      console.log('🔄 Initiating rollback for entity:', entity);
      await adminRollback(entity);
      
      toast({
        title: 'Rollback Successful',
        description: `Entity "${entity.entity_name}" has been successfully restored.`,
      });
      
      // Remove the rolled back entity from search results
      setSearchResults(prev => prev.filter(e => e.entity_id !== entity.entity_id));
    } catch (error: any) {
      console.error('❌ Rollback failed:', error);
      toast({
        title: 'Rollback Failed',
        description: `Failed to rollback entity "${entity.entity_name}". ${error.message || 'Please try again.'}`,
        variant: 'destructive',
      });
    }
  };

  // Update isSearching state based on mutation status
  const isSearching = entityNameSearchMutation.isPending || teamTenantSearchMutation.isPending;

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
                  disabled={!entityNameSearch.trim() || entityNameSearchMutation.isPending}
                  sx={{ minWidth: 120 }}
                  data-testid="button-search-entity-name"
                >
                  {entityNameSearchMutation.isPending ? 'Searching...' : 'Search'}
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
                    disabled={teamTenantSearchMutation.isPending || entityNameSearchMutation.isPending}
                    data-testid="select-tenant"
                  >
                    {tenants.map((tenant: any) => (
                      <MenuItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl 
                  fullWidth
                  onClick={() => {
                    if (!selectedTenant) {
                      toast({
                        title: "Select Tenant First",
                        description: "Please select a tenant before choosing a team.",
                        variant: "default"
                      });
                    }
                  }}
                >
                  <InputLabel>Team</InputLabel>
                  <Select
                    value={selectedTeam}
                    label="Team"
                    onChange={(e) => setSelectedTeam(e.target.value)}
                    disabled={!selectedTenant || teamTenantSearchMutation.isPending || availableTeams.length === 0}
                    data-testid="select-team"
                  >
                    {availableTeams.map((team: any) => (
                      <MenuItem key={team.id} value={team.id}>
                        {team.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Button
                  variant="contained"
                  onClick={handleTeamTenantSearch}
                  disabled={!selectedTenant || !selectedTeam || teamTenantSearchMutation.isPending}
                  sx={{ minWidth: 120 }}
                  data-testid="button-search-team-tenant"
                >
                  {teamTenantSearchMutation.isPending ? 'Searching...' : 'Search'}
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

                  {/* Table Entities Section */}
                  {(() => {
                    const tableEntities = paginatedResults.filter(e => e.entity_type === 'table');
                    return tableEntities.length > 0 && (
                      <Box sx={{ mb: 4 }}>
                        <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
                          Table Entities
                        </Typography>
                        <TableContainer component={Paper} elevation={0}>
                          <Table>
                            <TableHead>
                              <TableRow>
                                <TableCell>Entity</TableCell>
                                <TableCell>Table Name</TableCell>
                                <TableCell>Schedule</TableCell>
                                <TableCell>Deleted Date</TableCell>
                                <TableCell>Deleted By</TableCell>
                                <TableCell>Actions</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {tableEntities.map((entity) => (
                                <TableRow key={entity.id} data-testid={`row-entity-${entity.id}`}>
                                  <TableCell>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {getEntityTypeIcon(entity.entity_type)}
                                        <Typography variant="body2" fontWeight="medium">
                                          {entity.entity_name}
                                        </Typography>
                                      </Box>
                                      <Box sx={{ display: 'flex', gap: 0.5, ml: 4 }}>
                                        <Chip 
                                          label={entity.tenant_name} 
                                          size="small" 
                                          variant="outlined"
                                          sx={{ height: '20px', fontSize: '0.7rem' }}
                                        />
                                        <Chip 
                                          label={entity.team_name} 
                                          size="small" 
                                          variant="outlined"
                                          sx={{ height: '20px', fontSize: '0.7rem' }}
                                        />
                                      </Box>
                                    </Box>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2">
                                      {entity.schema_name && entity.table_name 
                                        ? `${entity.schema_name}.${entity.table_name}` 
                                        : entity.table_name || '-'}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" color="text.secondary">
                                      {entity.table_schedule || '-'}
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
                                        onClick={() => handleRollbackEntity(entity)}
                                        disabled={rollbackMutation.isPending}
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
                      </Box>
                    );
                  })()}

                  {/* DAG Entities Section */}
                  {(() => {
                    const dagEntities = paginatedResults.filter(e => e.entity_type === 'dag');
                    return dagEntities.length > 0 && (
                      <Box>
                        <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
                          DAG Entities
                        </Typography>
                        <TableContainer component={Paper} elevation={0}>
                          <Table>
                            <TableHead>
                              <TableRow>
                                <TableCell>Entity</TableCell>
                                <TableCell>DAG Name</TableCell>
                                <TableCell>Schedule</TableCell>
                                <TableCell>Deleted Date</TableCell>
                                <TableCell>Deleted By</TableCell>
                                <TableCell>Actions</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {dagEntities.map((entity) => (
                                <TableRow key={entity.id} data-testid={`row-entity-${entity.id}`}>
                                  <TableCell>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {getEntityTypeIcon(entity.entity_type)}
                                        <Typography variant="body2" fontWeight="medium">
                                          {entity.entity_name}
                                        </Typography>
                                      </Box>
                                      <Box sx={{ display: 'flex', gap: 0.5, ml: 4 }}>
                                        <Chip 
                                          label={entity.tenant_name} 
                                          size="small" 
                                          variant="outlined"
                                          sx={{ height: '20px', fontSize: '0.7rem' }}
                                        />
                                        <Chip 
                                          label={entity.team_name} 
                                          size="small" 
                                          variant="outlined"
                                          sx={{ height: '20px', fontSize: '0.7rem' }}
                                        />
                                      </Box>
                                    </Box>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2">
                                      {entity.dag_name || '-'}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" color="text.secondary">
                                      {entity.dag_schedule || '-'}
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
                                        onClick={() => handleRollbackEntity(entity)}
                                        disabled={rollbackMutation.isPending}
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
                      </Box>
                    );
                  })()}

                  {searchResults.length > rowsPerPage && (
                    <Box sx={{ mt: 2 }}>
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
                    </Box>
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