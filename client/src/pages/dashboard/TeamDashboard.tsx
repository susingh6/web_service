import React, { useState, useEffect } from 'react';
import { Box, Typography, Tabs, Tab, Card, CardContent, Chip, Paper, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, FormControl, InputLabel, Select, MenuItem, IconButton } from '@mui/material';
import { Add as AddIcon, Upload as UploadIcon, Person as PersonIcon, Edit as EditIcon, Delete as DeleteIcon, PersonAdd as PersonAddIcon } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/lib/store';
import { fetchEntities } from '@/features/sla/slices/entitiesSlice';
import { Entity, Team } from '@shared/schema';
import MetricCard from '@/components/dashboard/MetricCard';
import ChartCard from '@/components/dashboard/ChartCard';
import EntityTable from '@/components/dashboard/EntityTable';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import ComplianceTrendChart from '@/components/dashboard/ComplianceTrendChart';
import EntityPerformanceChart from '@/components/dashboard/EntityPerformanceChart';
import { apiClient } from '@/config/api';
import { useForm, Controller } from 'react-hook-form';
import { User } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';

interface TeamDashboardProps {
  teamName: string;
  tenantName: string;
  onEditEntity: (entity: Entity) => void;
  onDeleteEntity: (id: number) => void;
  onViewDetails: (entity: Entity) => void;
  onAddEntity: () => void;
  onBulkUpload: () => void;
  onNotificationTimeline: (entity: Entity) => void;
  onViewTasks: (entity: Entity) => void;
}

const TeamDashboard = ({ 
  teamName, 
  tenantName, 
  onEditEntity, 
  onDeleteEntity, 
  onViewDetails, 
  onAddEntity, 
  onBulkUpload, 
  onNotificationTimeline, 
  onViewTasks 
}: TeamDashboardProps) => {
  const dispatch = useAppDispatch();
  const { list: entities, teams, isLoading } = useAppSelector((state) => state.entities);
  
  const [tabValue, setTabValue] = useState(0);
  const [chartFilter, setChartFilter] = useState('All');
  const [entitiesChartFilter, setEntitiesChartFilter] = useState('All');
  
  // Get current team info by name
  const team = teams.find((t: Team) => t.name === teamName);
  
  // Local state for team entities to avoid affecting Summary dashboard
  const [teamEntities, setTeamEntities] = useState<Entity[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<User | null>(null);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const { toast } = useToast();
  
  // Fetch data when team is found
  useEffect(() => {
    if (team?.id) {
      // Fetch team entities directly without updating Redux store
      const fetchTeamEntities = async () => {
        try {
          const response = await fetch(`/api/entities?teamId=${team.id}`);
          const data = await response.json();
          setTeamEntities(data);
        } catch (error) {
          // Handle error silently - team data will remain empty
        }
      };
      fetchTeamEntities();
    }
  }, [team?.id]);

  // Fetch team details with members when teamName is available
  useEffect(() => {
    if (teamName) {
      const fetchTeamDetails = async () => {
        try {
          const response = await apiClient.teams.getDetails(teamName);
          const data = await response.json();
          setTeamMembers(data.members || []);
        } catch (error) {
          // Handle error silently - team members will remain empty
        }
      };
      fetchTeamDetails();
    }
  }, [teamName]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      user_email: '',
      user_slack: '',
      user_pagerduty: '',
      is_active: true,
    },
  });

  const fetchTeamMembers = async () => {
    if (teamName) {
      try {
        const response = await apiClient.teams.getDetails(teamName);
        const data = await response.json();
        setTeamMembers(data.members || []);
      } catch (error) {
        // Handle error silently
      }
    }
  };

  const handleAddMember = async () => {
    try {
      const response = await apiClient.users.getAll();
      const users = await response.json();
      setAvailableUsers(users);
      setAddMemberDialogOpen(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load available users',
        variant: 'destructive',
      });
    }
  };

  const handleSelectUser = async (user: User) => {
    try {
      const memberData = {
        team: teamName,
        tenant: tenantName,
        username: 'azure_test_user',
        action: 'add' as const,
        userId: user.id,
      };

      await apiClient.teams.update(teamName, memberData);
      
      toast({
        title: 'Success',
        description: 'Team member added successfully',
      });
      
      setAddMemberDialogOpen(false);
      await fetchTeamMembers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add team member',
        variant: 'destructive',
      });
    }
  };

  const handleEditMember = (member: User) => {
    setEditingMember(member);
    reset({
      user_email: member.email || '',
      user_slack: '', // Not in current schema
      user_pagerduty: '', // Not in current schema  
      is_active: true, // Default value
    });
    setMemberDialogOpen(true);
  };

  const handleDeleteMember = async (userId: number) => {
    try {
      const memberData = {
        team: teamName,
        tenant: tenantName,
        username: 'azure_test_user',
        action: 'remove' as const,
        userId,
      };

      await apiClient.teams.update(teamName, memberData);
      
      toast({
        title: 'Success',
        description: 'Team member removed successfully',
      });
      
      await fetchTeamMembers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove team member',
        variant: 'destructive',
      });
    }
  };

  const onSubmitMember = async (data: any) => {
    if (!editingMember) return;
    
    try {
      const userData = {
        email: data.user_email,
        displayName: data.user_slack, // Use displayName for slack
        // Note: current schema doesn't have pagerduty or is_active fields
      };

      await apiClient.users.update(editingMember.id, userData);
      
      toast({
        title: 'Success',
        description: 'User updated successfully',
      });
      
      setMemberDialogOpen(false);
      await fetchTeamMembers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update user',
        variant: 'destructive',
      });
    }
  };
  
  // Filter entities for this team from local state
  const tables = teamEntities.filter((entity) => entity.type === 'table');
  const dags = teamEntities.filter((entity) => entity.type === 'dag');
  
  // Calculate team metrics
  const calculateAvgSla = (items: Entity[]) => {
    if (items.length === 0) return 0;
    const sum = items.reduce((acc, item) => acc + (item.currentSla || 0), 0);
    return parseFloat((sum / items.length).toFixed(1));
  };
  
  const tablesComplianceAvg = calculateAvgSla(tables);
  const dagsComplianceAvg = calculateAvgSla(dags);
  const overallComplianceAvg = calculateAvgSla(teamEntities);
  
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };
  
  // Show loading state when team is not found
  if (!team) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" color="text.secondary">
          Loading team dashboard for {teamName}...
        </Typography>
      </Box>
    );
  }
  
  return (
    <Box sx={{ p: 3 }}>
      <Box mb={4}>
        <Paper elevation={0} sx={{ p: 3, borderRadius: 2, mb: 4 }}>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start">
            <Box>
              <Typography variant="h4" component="h1" fontWeight={600} fontFamily="Inter, sans-serif">
                {team.name}
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
                {team.description || `Team dashboard for ${team.name}`}
              </Typography>
              <Box display="flex" alignItems="center" mt={2} gap={1} flexWrap="wrap">
                <Chip 
                  label={`${teamEntities.length} Entities`} 
                  size="small" 
                  sx={{ bgcolor: 'primary.light', color: 'white' }} 
                />
                <Chip 
                  label={`${tables.length} Tables`} 
                  size="small" 
                  sx={{ bgcolor: 'info.light', color: 'white' }} 
                />
                <Chip 
                  label={`${dags.length} DAGs`} 
                  size="small" 
                  sx={{ bgcolor: 'secondary.light', color: 'white' }} 
                />
                <Chip 
                  icon={<PersonIcon fontSize="small" />}
                  label={`${teamMembers.length} Members`} 
                  size="small" 
                  sx={{ bgcolor: 'success.light', color: 'white' }} 
                />
              </Box>
              
              {/* Team Members Section */}
              <Box mt={2}>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" color="text.secondary">
                    Team Members:
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<PersonAddIcon />}
                    onClick={handleAddMember}
                    sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
                  >
                    Add Member
                  </Button>
                </Box>
                <Box display="flex" flexWrap="wrap" gap={0.5}>
                  {teamMembers.length > 0 ? (
                    teamMembers.map((member) => (
                      <Box key={member.id} display="flex" alignItems="center" gap={0.5}>
                        <Chip 
                          label={member.username || member.displayName}
                          size="small"
                          variant="outlined"
                          sx={{ 
                            fontSize: '0.75rem',
                            height: '24px',
                            '& .MuiChip-label': { px: 1 }
                          }}
                        />
                        <IconButton 
                          size="small" 
                          onClick={() => handleEditMember(member)}
                          sx={{ width: 20, height: 20 }}
                        >
                          <EditIcon sx={{ fontSize: 12 }} />
                        </IconButton>
                        <IconButton 
                          size="small" 
                          onClick={() => handleDeleteMember(member.id)}
                          sx={{ width: 20, height: 20 }}
                          color="error"
                        >
                          <DeleteIcon sx={{ fontSize: 12 }} />
                        </IconButton>
                      </Box>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No team members found
                    </Typography>
                  )}
                </Box>
              </Box>
            </Box>
            
            <Box display="flex" alignItems="center" gap={2}>
              <DateRangePicker />
              
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddIcon />}
                onClick={onAddEntity}
              >
                Add Entity
              </Button>
              
              <Button
                variant="outlined"
                color="primary"
                startIcon={<UploadIcon />}
                onClick={onBulkUpload}
              >
                Bulk Upload
              </Button>
            </Box>
          </Box>
        </Paper>
        
        {/* Metrics Cards */}
        <Box display="flex" flexWrap="wrap" gap={3} mb={4}>
          {[
            { 
              title: "Overall SLA Compliance", 
              value: overallComplianceAvg, 
              trend: 1.2, 
              progress: overallComplianceAvg, 
              suffix: "%",
              infoTooltip: `Average SLA compliance calculated across all tables and DAGs for ${team.name} team`
            },
            { 
              title: "Tables SLA Compliance", 
              value: tablesComplianceAvg, 
              trend: 0.8, 
              progress: tablesComplianceAvg, 
              suffix: "%",
              infoTooltip: `Average SLA compliance percentage calculated across all table entities for ${team.name} team`
            },
            { 
              title: "DAGs SLA Compliance", 
              value: dagsComplianceAvg, 
              trend: 1.5, 
              progress: dagsComplianceAvg, 
              suffix: "%",
              infoTooltip: `Average SLA compliance percentage calculated across all DAG entities for ${team.name} team`
            },
            { 
              title: "Entities Monitored", 
              value: teamEntities.length, 
              trend: 0, 
              suffix: "",
              subtitle: `${tables.length} Tables • ${dags.length} DAGs`
            }
          ].map((card, idx) => (
            <Box key={card.title} flex="1 1 250px" minWidth="250px">
              <MetricCard {...card} />
            </Box>
          ))}
        </Box>
        
        {/* Charts */}
        <Box display="flex" flexWrap="wrap" gap={3} mb={4}>
          <Box flex="1 1 500px" minWidth="500px">
            <ChartCard
              title="Compliance Trend"
              filters={['All', 'Tables', 'DAGs']}
              onFilterChange={setChartFilter}
              loading={isLoading}
              chart={<ComplianceTrendChart filter={chartFilter.toLowerCase() as 'all' | 'tables' | 'dags'} />}
            />
          </Box>
          
          <Box flex="1 1 500px" minWidth="500px">
            <ChartCard
              title="Top 5 Entities Performance"
              filters={['All', 'Tables', 'DAGs']}
              onFilterChange={setEntitiesChartFilter}
              loading={isLoading}
              chart={<EntityPerformanceChart entities={teamEntities} filter={entitiesChartFilter.toLowerCase() as 'all' | 'tables' | 'dags'} />}
            />
          </Box>
        </Box>
        
        {/* Tables/DAGs Sub-tabs */}
        <Tabs value={tabValue} onChange={handleTabChange} sx={{ mb: 3 }}>
          <Tab 
            label="Tables" 
            sx={{ 
              fontWeight: 500, 
              textTransform: 'none',
              '&.Mui-selected': { fontWeight: 600 } 
            }} 
          />
          <Tab 
            label="DAGs" 
            sx={{ 
              fontWeight: 500, 
              textTransform: 'none',
              '&.Mui-selected': { fontWeight: 600 } 
            }} 
          />
        </Tabs>
        
        <Box role="tabpanel" hidden={tabValue !== 0}>
          {tabValue === 0 && (
            <EntityTable
              entities={tables}
              type="table"
              teams={teams}
              onEditEntity={onEditEntity}
              onDeleteEntity={onDeleteEntity}
              onViewHistory={() => {}}
              onViewDetails={onViewDetails}
              onSetNotificationTimeline={onNotificationTimeline}
              showActions={true}
              isTeamDashboard={true}
            />
          )}
        </Box>
        
        <Box role="tabpanel" hidden={tabValue !== 1}>
          {tabValue === 1 && (
            <EntityTable
              entities={dags}
              type="dag"
              teams={teams}
              onEditEntity={onEditEntity}
              onDeleteEntity={onDeleteEntity}
              onViewHistory={() => {}}
              onViewDetails={onViewDetails}
              onViewTasks={onViewTasks}
              onSetNotificationTimeline={onNotificationTimeline}
              showActions={true}
              isTeamDashboard={true}
            />
          )}
        </Box>

        {/* Add Member Dialog - User Selection */}
        <Dialog open={addMemberDialogOpen} onClose={() => setAddMemberDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Select a user to add to the team:
            </Typography>
            <Box maxHeight={300} overflow="auto">
              {availableUsers.map((user) => (
                <Box 
                  key={user.id}
                  display="flex" 
                  alignItems="center" 
                  justifyContent="space-between"
                  p={1}
                  border="1px solid"
                  borderColor="divider"
                  borderRadius={1}
                  mb={1}
                  sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                  onClick={() => handleSelectUser(user)}
                >
                  <Box>
                    <Typography variant="body2" fontWeight="medium">
                      {user.username || user.displayName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {user.email}
                    </Typography>
                  </Box>
                  <Button size="small" variant="outlined">
                    Add
                  </Button>
                </Box>
              ))}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddMemberDialogOpen(false)}>Cancel</Button>
          </DialogActions>
        </Dialog>

        {/* Edit Member Dialog - User Details */}
        <Dialog open={memberDialogOpen} onClose={() => setMemberDialogOpen(false)} maxWidth="sm" fullWidth>
          <form onSubmit={handleSubmit(onSubmitMember)}>
            <DialogTitle>
              Edit User: {editingMember?.username || editingMember?.displayName}
            </DialogTitle>
            <DialogContent>
              <Box display="flex" flexDirection="column" gap={3} pt={1}>
                <Controller
                  name="user_email"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Email"
                      type="email"
                      fullWidth
                      size="small"
                    />
                  )}
                />
                
                <Controller
                  name="user_slack"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Display Name / Slack Handle"
                      fullWidth
                      size="small"
                      placeholder="Display name or @username"
                    />
                  )}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setMemberDialogOpen(false)}>Cancel</Button>
              <Button type="submit" variant="contained">
                Update User
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      </Box>
    </Box>
  );
};

export default TeamDashboard;