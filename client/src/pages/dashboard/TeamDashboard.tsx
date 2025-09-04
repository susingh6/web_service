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
import { zodResolver } from '@hookform/resolvers/zod';
import { teamMemberSchema } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

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
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [removeMemberDialogOpen, setRemoveMemberDialogOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
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

  const fetchAvailableUsers = async () => {
    try {
      const response = await apiClient.users.getAll();
      const data = await response.json();
      setAvailableUsers(data || []);
    } catch (error) {
      // Handle error silently
    }
  };

  const handleAddMember = async () => {
    await fetchAvailableUsers();
    setSelectedUserId('');
    setAddMemberDialogOpen(true);
  };

  const handleRemoveMember = () => {
    setSelectedMemberId('');
    setRemoveMemberDialogOpen(true);
  };

  const onAddMember = async () => {
    if (!selectedUserId) return;

    try {
      const memberData = {
        team: teamName,
        tenant: tenantName,
        username: 'azure_test_user', // This would come from OAuth context
        action: 'add' as const,
        memberId: selectedUserId,
      };

      await apiClient.teams.updateMembers(teamName, memberData);
      
      toast({
        title: 'Success',
        description: 'Team member added successfully',
      });
      
      setAddMemberDialogOpen(false);
      setSelectedUserId('');
      await fetchTeamMembers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add team member',
        variant: 'destructive',
      });
    }
  };

  const onRemoveMember = async () => {
    if (!selectedMemberId) return;

    try {
      const memberData = {
        team: teamName,
        tenant: tenantName,
        username: 'azure_test_user', // This would come from OAuth context
        action: 'remove' as const,
        memberId: selectedMemberId,
      };

      await apiClient.teams.updateMembers(teamName, memberData);
      
      toast({
        title: 'Success',
        description: 'Team member removed successfully',
      });
      
      setRemoveMemberDialogOpen(false);
      setSelectedMemberId('');
      await fetchTeamMembers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove team member',
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
                          label={member.name}
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

        {/* Add/Edit Member Dialog */}
        <Dialog open={memberDialogOpen} onClose={() => setMemberDialogOpen(false)} maxWidth="sm" fullWidth>
          <form onSubmit={handleSubmit(onSubmitMember)}>
            <DialogTitle>
              {editingMember ? 'Edit Team Member' : 'Add Team Member'}
            </DialogTitle>
            <DialogContent>
              <Box display="flex" flexDirection="column" gap={3} pt={1}>
                <Controller
                  name="id"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Member ID"
                      error={!!errors.id}
                      helperText={errors.id?.message}
                      fullWidth
                      size="small"
                      disabled={!!editingMember}
                    />
                  )}
                />
                
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Full Name"
                      error={!!errors.name}
                      helperText={errors.name?.message}
                      fullWidth
                      size="small"
                    />
                  )}
                />
                
                <Controller
                  name="email"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Email"
                      type="email"
                      error={!!errors.email}
                      helperText={errors.email?.message}
                      fullWidth
                      size="small"
                    />
                  )}
                />
                
                <Controller
                  name="role"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth size="small">
                      <InputLabel>Role</InputLabel>
                      <Select {...field} label="Role">
                        <MenuItem value="admin">Admin</MenuItem>
                        <MenuItem value="manager">Manager</MenuItem>
                        <MenuItem value="lead">Technical Lead</MenuItem>
                        <MenuItem value="developer">Developer</MenuItem>
                        <MenuItem value="analyst">Data Analyst</MenuItem>
                        <MenuItem value="ops">Operations</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setMemberDialogOpen(false)}>Cancel</Button>
              <Button type="submit" variant="contained">
                {editingMember ? 'Update' : 'Add'} Member
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      </Box>
    </Box>
  );
};

export default TeamDashboard;