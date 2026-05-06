import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  SafeAreaView, Modal, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { useMeetings } from '@/hooks/useMeetings';
import { Meeting } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';

function MeetingCard({ meeting, onPress }: { meeting: Meeting; onPress: () => void }) {
  const statusLabel: Record<Meeting['status'], string> = {
    waiting: 'En attente',
    recording: 'En cours',
    processing: 'Analyse...',
    done: 'Terminée',
  };
  const statusColor: Record<Meeting['status'], string> = {
    waiting: Colors.secondary,
    recording: Colors.error,
    processing: Colors.warning,
    done: Colors.success,
  };

  const date = new Date(meeting.created_at).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short',
  });

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardLeft}>
        <Text style={styles.cardName} numberOfLines={1}>{meeting.name}</Text>
        <Text style={styles.cardDate}>{date}</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: statusColor[meeting.status] + '22' }]}>
        <View style={[styles.statusDot, { backgroundColor: statusColor[meeting.status] }]} />
        <Text style={[styles.statusText, { color: statusColor[meeting.status] }]}>
          {statusLabel[meeting.status]}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { meetings, loading, createMeeting } = useMeetings();
  const [modalVisible, setModalVisible] = useState(false);
  const [meetingName, setMeetingName] = useState('');
  const [creating, setCreating] = useState(false);

  const recentMeetings = meetings.slice(0, 5);

  async function handleCreate() {
    if (!meetingName.trim()) return;
    setCreating(true);
    const meeting = await createMeeting(meetingName.trim());
    setCreating(false);
    if (!meeting) { Alert.alert('Erreur', 'Impossible de créer la réunion.'); return; }
    setModalVisible(false);
    setMeetingName('');
    router.push(`/meeting/${meeting.id}`);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Bonjour 👋</Text>
            <Text style={styles.tagline}>Prêt pour votre prochaine réunion ?</Text>
          </View>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Déco</Text>
          </TouchableOpacity>
        </View>

        {/* CTA principal */}
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.85}
        >
          <View style={styles.ctaIcon}>
            <Text style={styles.ctaIconText}>+</Text>
          </View>
          <Text style={styles.ctaText}>Lancer une réunion</Text>
          <Text style={styles.ctaSubtext}>Générez un QR code en quelques secondes</Text>
        </TouchableOpacity>

        {/* Réunions récentes */}
        {recentMeetings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Récentes</Text>
            {loading
              ? <ActivityIndicator color={Colors.accent} style={{ marginTop: 20 }} />
              : recentMeetings.map(m => (
                  <MeetingCard
                    key={m.id}
                    meeting={m}
                    onPress={() => router.push(`/meeting/${m.id}`)}
                  />
                ))
            }
          </View>
        )}

        {!loading && meetings.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎙️</Text>
            <Text style={styles.emptyText}>Aucune réunion pour l'instant.</Text>
            <Text style={styles.emptySubtext}>Lancez votre première réunion ci-dessus.</Text>
          </View>
        )}
      </ScrollView>

      {/* Modal création réunion */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Nouvelle réunion</Text>
            <Text style={styles.modalSubtitle}>Donnez un nom à votre réunion</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Ex: Point Marketing Q3"
              placeholderTextColor={Colors.text.tertiary}
              value={meetingName}
              onChangeText={setMeetingName}
              autoFocus
              onSubmitEditing={handleCreate}
              returnKeyType="done"
            />

            <TouchableOpacity
              style={[styles.modalButton, (!meetingName.trim() || creating) && styles.buttonDisabled]}
              onPress={handleCreate}
              disabled={!meetingName.trim() || creating}
              activeOpacity={0.8}
            >
              {creating
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.modalButtonText}>Créer & afficher le QR</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setModalVisible(false); setMeetingName(''); }}>
              <Text style={styles.cancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 },
  greeting: { fontSize: 26, fontWeight: '700', color: Colors.text.primary, letterSpacing: -0.3 },
  tagline: { fontSize: 14, color: Colors.text.secondary, marginTop: 4 },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: Colors.surfaceElevated },
  signOutText: { fontSize: 13, color: Colors.text.secondary },

  ctaButton: {
    backgroundColor: Colors.accent, borderRadius: 20,
    paddingVertical: 28, paddingHorizontal: 28,
    marginBottom: 36,
    shadowColor: Colors.accent, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  ctaIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center',
    marginBottom: 14,
  },
  ctaIconText: { fontSize: 28, color: '#fff', lineHeight: 32 },
  ctaText: { fontSize: 22, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  ctaSubtext: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: Colors.text.primary, marginBottom: 14, letterSpacing: -0.2 },

  card: {
    backgroundColor: Colors.surfaceElevated, borderRadius: 14,
    padding: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: Colors.border,
  },
  cardLeft: { flex: 1, marginRight: 12 },
  cardName: { fontSize: 15, fontWeight: '600', color: Colors.text.primary },
  cardDate: { fontSize: 12, color: Colors.text.secondary, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },

  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 17, fontWeight: '600', color: Colors.text.primary },
  emptySubtext: { fontSize: 14, color: Colors.text.secondary, marginTop: 6 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surfaceElevated, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: '700', color: Colors.text.primary, letterSpacing: -0.3 },
  modalSubtitle: { fontSize: 14, color: Colors.text.secondary, marginTop: 4, marginBottom: 24 },
  modalInput: {
    backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: Colors.text.primary, borderWidth: 1, borderColor: Colors.border, marginBottom: 16,
  },
  modalButton: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  modalButtonText: { fontSize: 16, fontWeight: '600', color: '#000' },
  cancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelText: { fontSize: 15, color: Colors.text.secondary },
});
