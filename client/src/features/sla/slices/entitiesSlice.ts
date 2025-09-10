import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { entitiesApi, teamsApi } from '../api';
import { Entity, Team, InsertEntity } from '@shared/schema';

// Define local types for the slice
interface EntityFilter {
  search: string;
  status: 'all' | 'healthy' | 'warning' | 'critical';
  teamId?: number;
  type?: string;
  sortBy: 'name' | 'status' | 'slaTarget' | 'lastRefreshed';
  sortDirection: 'asc' | 'desc';
}

interface CreateEntityPayload extends InsertEntity {}

interface UpdateEntityPayload {
  id: number;
  updates: any;
}

interface EntitiesState {
  list: Entity[];
  teams: Team[];
  selectedEntity: Entity | null;
  filter: EntityFilter;
  isLoading: boolean;
  error: string | null;
}

const initialState: EntitiesState = {
  list: [],
  teams: [],
  selectedEntity: null,
  filter: {
    search: '',
    status: 'all',
    teamId: undefined,
    type: undefined,
    sortBy: 'name',
    sortDirection: 'asc',
  },
  isLoading: false,
  error: null,
};

// Async thunks
export const fetchEntities = createAsyncThunk(
  'entities/fetchAll',
  async (params: { teamId?: number; type?: string; tenant?: string } = {}) => {
    if (params.teamId) {
      return await entitiesApi.getByTeam(params.teamId);
    } else if (params.type) {
      return await entitiesApi.getByType(params.type);
    }
    return await entitiesApi.getAll(params.tenant);
  }
);

export const fetchEntity = createAsyncThunk(
  'entities/fetchOne',
  async (id: number) => {
    return await entitiesApi.getById(id);
  }
);

export const fetchTeams = createAsyncThunk(
  'entities/fetchTeams',
  async (teamName?: string) => {
    return await teamsApi.getAll(teamName);
  }
);

export const createEntity = createAsyncThunk(
  'entities/createEntity',
  async (entity: CreateEntityPayload) => {
    return await entitiesApi.create(entity);
  }
);

export const updateEntity = createAsyncThunk(
  'entities/updateEntity',
  async (payload: UpdateEntityPayload) => {
    return await entitiesApi.update(payload);
  }
);

export const deleteEntity = createAsyncThunk(
  'entities/deleteEntity',
  async (id: number) => {
    await entitiesApi.delete(id);
    return id;
  }
);

const entitiesSlice = createSlice({
  name: 'entities',
  initialState,
  reducers: {
    selectEntity: (state, action: PayloadAction<Entity | null>) => {
      state.selectedEntity = action.payload;
    },
    updateFilter: (state, action: PayloadAction<Partial<EntityFilter>>) => {
      state.filter = { ...state.filter, ...action.payload };
    },
    resetFilter: (state) => {
      state.filter = initialState.filter;
    },
    resetEntities: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // fetchEntities
      .addCase(fetchEntities.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchEntities.fulfilled, (state, action) => {
        state.isLoading = false;
        state.list = action.payload;
      })
      .addCase(fetchEntities.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch entities';
      })
      
      // fetchEntity
      .addCase(fetchEntity.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchEntity.fulfilled, (state, action) => {
        state.isLoading = false;
        state.selectedEntity = action.payload;
      })
      .addCase(fetchEntity.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch entity';
      })
      
      // fetchTeams
      .addCase(fetchTeams.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchTeams.fulfilled, (state, action) => {
        state.isLoading = false;
        state.teams = action.payload;
      })
      .addCase(fetchTeams.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch teams';
      })
      
      // createEntity
      .addCase(createEntity.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createEntity.fulfilled, (state, action) => {
        state.isLoading = false;
        state.list.push(action.payload);
      })
      .addCase(createEntity.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to create entity';
      })
      
      // updateEntity
      .addCase(updateEntity.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateEntity.fulfilled, (state, action) => {
        state.isLoading = false;
        const index = state.list.findIndex((entity: Entity) => entity.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        if (state.selectedEntity && state.selectedEntity.id === action.payload.id) {
          state.selectedEntity = action.payload;
        }
      })
      .addCase(updateEntity.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to update entity';
      })
      
      // deleteEntity
      .addCase(deleteEntity.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteEntity.fulfilled, (state, action) => {
        state.isLoading = false;
        state.list = state.list.filter((entity: Entity) => entity.id !== action.payload);
        if (state.selectedEntity && state.selectedEntity.id === action.payload) {
          state.selectedEntity = null;
        }
      })
      .addCase(deleteEntity.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to delete entity';
      });
  },
});

export const { 
  selectEntity, 
  updateFilter, 
  resetFilter, 
  resetEntities 
} = entitiesSlice.actions;

export default entitiesSlice.reducer;
