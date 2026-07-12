import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  student_id?: string;
  department?: string;
  session_year?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  // False until we've confirmed the session with the server (via /auth/me).
  // Route guards wait for this so a refresh doesn't bounce a logged-in user.
  initialized: boolean;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  initialized: false,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Called after a successful login or when /auth/me confirms a live session.
    // The session itself lives in an HttpOnly cookie — never in Redux/storage.
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
      state.initialized = true;
    },
    // Called on logout or when the server reports no valid session.
    clearUser: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.initialized = true;
    },
  },
});

export const { setUser, clearUser } = authSlice.actions;

export default authSlice.reducer;
