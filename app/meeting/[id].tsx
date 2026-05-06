import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  Animated, Easing, ScrollView, Alert, FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '@/constants/Colors';
import { supabase, Meeting, Participant } from '@/lib/supabase';

type Phase = 'waiting' | 'recording' | 'processing' | 'done';

function WaveBar({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 600, delay, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={[styles.waveBar, { transform: [{ scaleY: anim }] }]} />;
}

function AudioWave() {
  const delays = [0, 80, 160, 240, 320, 400, 160, 80, 0];
  return (
    <View style={styles.waveContainer}>
      {delays.map((d, i) => <WaveBar key={i} delay={d} />)}
    </View>
  );
}

export default function MeetingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [phase, setPhase] = useState<Phase>('waiting');
  const [uploading, setUploading] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recordingRef = useRef<Audio.Recording | null>(null);

  useEffect(() => {
    fetchMeeting();
    const unsub = subscribeToParticipants();
    const unsubMeeting = subscribeToMeeting();
    return () => {
      unsub();
      unsubMeeting();
      deactivateKeepAwake();
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (phase === 'recording') {
      activateKeepAwakeAsync();
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    } else {
      deactivateKeepAwake();
      pulseAnim.stopAnimation();
    }
  }, [phase]);

  async function fetchMeeting() {
    const { data } = await supabase.from('meetings').select('*').eq('id', id).single();
    if (data) { setMeeting(data); setPhase(data.status); }
  }

  function subscribeToMeeting() {
    const channel = supabase
      .channel(`meeting:${id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'meetings',
        filter: `id=eq.${id}`,
      }, (payload) => {
        const updated = payload.new as Meeting;
        setMeeting(updated);
        setPhase(updated.status);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }

  function subscribeToParticipants() {
    supabase.from('participants').select('*').eq('meeting_id', id)
      .then(({ data }) => setParticipants(data ?? []));

    const channel = supabase
      .channel(`participants:${id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'participants',
        filter: `meeting_id=eq.${id}`,
      }, (payload) => setParticipants(prev => [...prev, payload.new as Participant]))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }

  async function handleStartRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'L\'accès au microphone est nécessaire pour enregistrer la réunion.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;

      await supabase.from('meetings').update({
        status: 'recording',
        started_at: new Date().toISOString(),
      }).eq('id', id);

      setPhase('recording');
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de démarrer l\'enregistrement.');
    }
  }

  async function handleEndMeeting() {
    Alert.alert(
      'Terminer la réunion',
      'L\'IA va transcrire et résumer la réunion, puis envoyer le résumé à tous les participants.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Terminer', style: 'destructive',
          onPress: async () => {
            try {
              setPhase('processing');
              setUploading(true);

              // 1. Arrêter l'enregistrement
              const recording = recordingRef.current;
              if (recording) {
                await recording.stopAndUnloadAsync();
                await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
              }
              const audioUri = recording?.getURI();

              // 2. Mettre à jour le statut
              await supabase.from('meetings').update({
                status: 'processing',
                ended_at: new Date().toISOString(),
              }).eq('id', id);

              // 3. Upload audio vers Supabase Storage
              if (audioUri) {
                const { data: { user } } = await supabase.auth.getUser();
                const storagePath = `${user?.id}/${id}/audio.m4a`;

                const base64 = await FileSystem.readAsStringAsync(audioUri, {
                  encoding: 'base64' as any,
                });

                const byteArray = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

                const { error: uploadError } = await supabase.storage
                  .from('meeting-audios')
                  .upload(storagePath, byteArray, {
                    contentType: 'audio/m4a',
                    upsert: true,
                  });

                if (!uploadError) {
                  await supabase.from('meetings').update({ audio_path: storagePath }).eq('id', id);
                }
              }

              // 4. Déclencher l'Edge Function IA
              await supabase.functions.invoke('process-meeting', {
                body: { meeting_id: id },
              });

              setUploading(false);
            } catch (e) {
              console.error('End meeting error:', e);
              setUploading(false);
              Alert.alert('Erreur', 'Un problème est survenu lors du traitement.');
            }
          },
        },
      ]
    );
  }

  if (!meeting) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Salle d'attente */}
      {phase === 'waiting' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.phaseHeader}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>← Retour</Text>
            </TouchableOpacity>
            <Text style={styles.meetingName}>{meeting.name}</Text>
            <Text style={styles.phaseLabel}>Salle d'attente</Text>
          </View>

          <View style={styles.qrCard}>
            <QRCode value={meeting.join_url} size={220} color="#FFFFFF" backgroundColor="transparent" />
          </View>
          <Text style={styles.qrHint}>Les participants scannent ce code pour recevoir le résumé</Text>

          <View style={styles.participantsSection}>
            <View style={styles.participantsHeader}>
              <Text style={styles.participantsTitle}>Participants</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{participants.length}</Text>
              </View>
            </View>
            {participants.length === 0
              ? <Text style={styles.noParticipants}>En attente des participants...</Text>
              : <FlatList
                  data={participants}
                  keyExtractor={p => p.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <View style={styles.participantRow}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{item.email[0].toUpperCase()}</Text>
                      </View>
                      <Text style={styles.participantEmail}>{item.email}</Text>
                    </View>
                  )}
                />
            }
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleStartRecording} activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>🎙 Démarrer l'enregistrement</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Enregistrement */}
      {phase === 'recording' && (
        <View style={styles.recordingContainer}>
          <Animated.View style={[styles.recordingOrb, { transform: [{ scale: pulseAnim }] }]}>
            <AudioWave />
          </Animated.View>
          <Text style={styles.recordingTitle}>Enregistrement en cours</Text>
          <Text style={styles.recordingSubtitle}>{meeting.name}</Text>
          <Text style={styles.recordingParticipants}>
            {participants.length} participant{participants.length > 1 ? 's' : ''}
          </Text>
          <TouchableOpacity style={styles.endButton} onPress={handleEndMeeting} activeOpacity={0.85}>
            <Text style={styles.endButtonText}>Terminer la réunion</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Traitement IA */}
      {phase === 'processing' && (
        <View style={styles.center}>
          <View style={styles.processingOrb} />
          <Text style={styles.processingTitle}>
            {uploading ? 'Envoi de l\'audio...' : 'L\'IA analyse votre réunion...'}
          </Text>
          <Text style={styles.processingSubtitle}>Transcription & résumé en cours</Text>
        </View>
      )}

      {/* Résumé */}
      {phase === 'done' && meeting.summary && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.phaseHeader}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>← Retour</Text>
            </TouchableOpacity>
            <Text style={styles.meetingName}>{meeting.name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: Colors.success + '22' }]}>
              <Text style={[styles.statusText, { color: Colors.success }]}>✓ Résumé envoyé</Text>
            </View>
          </View>

          {(meeting.summary.key_points?.length ?? 0) > 0 && (
            <View style={styles.summarySection}>
              <Text style={styles.summaryTitle}>Points clés</Text>
              {meeting.summary.key_points.map((p, i) => (
                <View key={i} style={styles.summaryItem}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.summaryText}>{p}</Text>
                </View>
              ))}
            </View>
          )}

          {(meeting.summary.decisions?.length ?? 0) > 0 && (
            <View style={styles.summarySection}>
              <Text style={styles.summaryTitle}>Décisions prises</Text>
              {meeting.summary.decisions.map((d, i) => (
                <View key={i} style={styles.summaryItem}>
                  <View style={[styles.bulletDot, { backgroundColor: Colors.accent }]} />
                  <Text style={styles.summaryText}>{d}</Text>
                </View>
              ))}
            </View>
          )}

          {(meeting.summary.actions?.length ?? 0) > 0 && (
            <View style={styles.summarySection}>
              <Text style={styles.summaryTitle}>Actions à faire</Text>
              {meeting.summary.actions.map((a, i) => (
                <View key={i} style={styles.actionCard}>
                  <Text style={styles.actionTask}>{a.task}</Text>
                  {a.owner && <Text style={styles.actionMeta}>👤 {a.owner}</Text>}
                  {a.deadline && <Text style={styles.actionMeta}>📅 {a.deadline}</Text>}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: Colors.text.secondary, fontSize: 15 },

  phaseHeader: { marginBottom: 28 },
  backBtn: { marginBottom: 16 },
  backText: { color: Colors.accent, fontSize: 15 },
  meetingName: { fontSize: 24, fontWeight: '700', color: Colors.text.primary, letterSpacing: -0.3 },
  phaseLabel: { fontSize: 13, color: Colors.text.secondary, marginTop: 4 },

  qrCard: {
    backgroundColor: Colors.surfaceElevated, borderRadius: 24,
    padding: 28, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: 16,
  },
  qrHint: { fontSize: 13, color: Colors.text.secondary, textAlign: 'center', marginBottom: 32, lineHeight: 18 },

  participantsSection: { marginBottom: 32 },
  participantsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  participantsTitle: { fontSize: 17, fontWeight: '600', color: Colors.text.primary },
  countBadge: { backgroundColor: Colors.accent, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  countText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  noParticipants: { fontSize: 14, color: Colors.text.tertiary, fontStyle: 'italic' },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accentDim, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 14, fontWeight: '600', color: Colors.accent },
  participantEmail: { fontSize: 15, color: Colors.text.primary },

  primaryButton: {
    backgroundColor: Colors.accent, borderRadius: 16, paddingVertical: 18, alignItems: 'center',
    shadowColor: Colors.accent, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
  },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  recordingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  recordingOrb: {
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: Colors.accentDim, borderWidth: 2, borderColor: Colors.accent + '44',
    justifyContent: 'center', alignItems: 'center', marginBottom: 36,
  },
  waveContainer: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  waveBar: { width: 4, height: 40, borderRadius: 2, backgroundColor: Colors.accent },
  recordingTitle: { fontSize: 22, fontWeight: '700', color: Colors.text.primary, letterSpacing: -0.3 },
  recordingSubtitle: { fontSize: 15, color: Colors.text.secondary, marginTop: 6 },
  recordingParticipants: { fontSize: 13, color: Colors.text.tertiary, marginTop: 4, marginBottom: 48 },
  endButton: {
    backgroundColor: Colors.error + '22', borderRadius: 16, paddingVertical: 16,
    paddingHorizontal: 40, borderWidth: 1, borderColor: Colors.error + '44',
  },
  endButtonText: { fontSize: 15, fontWeight: '600', color: Colors.error },

  processingOrb: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.accentDim, marginBottom: 24 },
  processingTitle: { fontSize: 20, fontWeight: '700', color: Colors.text.primary, letterSpacing: -0.3 },
  processingSubtitle: { fontSize: 14, color: Colors.text.secondary, marginTop: 6 },

  statusBadge: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  statusText: { fontSize: 13, fontWeight: '600' },

  summarySection: { marginBottom: 28 },
  summaryTitle: { fontSize: 17, fontWeight: '600', color: Colors.text.primary, marginBottom: 12 },
  summaryItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 8 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success, marginTop: 7 },
  summaryText: { flex: 1, fontSize: 15, color: Colors.text.primary, lineHeight: 22 },
  actionCard: {
    backgroundColor: Colors.surfaceElevated, borderRadius: 12,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, gap: 4,
  },
  actionTask: { fontSize: 15, fontWeight: '600', color: Colors.text.primary },
  actionMeta: { fontSize: 13, color: Colors.text.secondary },
});
