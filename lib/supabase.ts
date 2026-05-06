import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Meeting = {
  id: string;
  organizer_id: string;
  name: string;
  status: 'waiting' | 'recording' | 'processing' | 'done';
  join_url: string;
  audio_path?: string;
  transcript?: string;
  summary?: {
    key_points: string[];
    decisions: string[];
    actions: { task: string; owner?: string; deadline?: string }[];
    duration_minutes?: number;
    participant_count?: number;
  };
  started_at?: string;
  ended_at?: string;
  created_at: string;
};

export type Participant = {
  id: string;
  meeting_id: string;
  email: string;
  joined_at: string;
  email_sent: boolean;
};
