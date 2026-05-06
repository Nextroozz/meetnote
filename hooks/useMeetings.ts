import { useState, useEffect } from 'react';
import { supabase, Meeting } from '@/lib/supabase';

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function useMeetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMeetings();
  }, []);

  async function fetchMeetings() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('meetings')
      .select('*')
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false });

    setMeetings(data ?? []);
    setLoading(false);
  }

  async function createMeeting(name: string): Promise<Meeting | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    await supabase.from('users').upsert({ id: user.id, email: user.email }, { onConflict: 'id' });

    const id = uuidv4();
    const { data, error } = await supabase
      .from('meetings')
      .insert({
        id,
        organizer_id: user.id,
        name,
        status: 'waiting',
        join_url: `${process.env.EXPO_PUBLIC_APP_URL}/meet/${id}`,
      })
      .select()
      .single();

    if (error || !data) {
      console.error('createMeeting error:', JSON.stringify(error));
      return null;
    }
    setMeetings(prev => [data, ...prev]);
    return data;
  }

  return { meetings, loading, createMeeting, refetch: fetchMeetings };
}
