import { User } from "@/lib/types";
import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";

interface UsersState {
  users: User[];
  loading: boolean;
  error: string | null;
}

const initialState: UsersState = {
  users: [],
  loading: false,
  error: null,
};

export const fetchUsers = createAsyncThunk(
  "users/fetchUsers",
  async (organisation_id: string) => {
    if (!organisation_id) {
      return;
    }
    try {
      const response = await fetch(
        `/api/get-users-with-org-id?organisation_id=${organisation_id}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }

      if (response.status === 401) {
        toast.error(
          "Session token expired, logging out the user to regenerate token",
        );
      }

      const result = await response.json();
      toast.success("Users fetched successfully");
      return result.users;
    } catch (error) {
      toast.error("Error fetching users.");
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      console.error("Error fetching users:", error);
      throw error;
    }
  },
);

const usersSlice = createSlice({
  name: "users",
  initialState,
  reducers: {
    setUsers: (state, action: PayloadAction<User[]>) => {
      state.users = action.payload;
    },
    addUser: (state, action: PayloadAction<User>) => {
      state.users = Array.isArray(state.users)
        ? [...state.users, action.payload]
        : [action.payload];
    },
    removeUser: (state, action: PayloadAction<string>) => {
      if (Array.isArray(state.users)) {
        state.users = state.users.filter(
          (user) => user.user_id !== action.payload,
        );
      }
    },
    updateUserRole: (
      state,
      action: PayloadAction<{ userId: string; roles: string[] }>,
    ) => {
      const { userId, roles } = action.payload;
      if (Array.isArray(state.users)) {
        state.users = state.users.map((user) =>
          user.user_id === userId ? { ...user, roles } : user,
        );
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false;
        state.users = action.payload || [];
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch users";
      });
  },
});

export const { setUsers, addUser, removeUser, updateUserRole } =
  usersSlice.actions;
export default usersSlice.reducer;
