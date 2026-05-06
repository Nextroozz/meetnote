import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { useMeetings } from '@/hooks/useMeetings';
import { Meeting } from '@/lib/supabase';

function HistoryCard({ meeting, onPress }: { meeting: Meeting; onPress: () => void }) {
  const date = new Date(meeting.created_at).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });

  const isDone = meeting.status === 'done';
  const participants = meeting.summary?.participant_count ?? 0;
  const duration = meeting.summary?.duration_minutes;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.cardIndicator, { backgroundColor: isDone ? Colors.success : Colors.secondary }]} />
      <View style={styles.cardContent}>
        <Text style={styles.cardName} numberOfLines={1}>{meeting.name}</Text>
        <Text style={styles.cardDate}>{date}</Text>
        {isDone && (
          <View style={styles.cardMeta}>
            {participants > 0 && (
              <Text style={styles.metaItem}>👥 {participants} participant{participants > 1 ? 's' : ''}</Text>
            )}
            {duration && (
              <Text style={styles.metaItem}>⏱ {duration} min</Text>
            )}
          </View>
        )}
        {!isDone && (
          <Text style={styles.cardStatus}>
            {meeting.status === 'processing' ? '⏳ Analyse en cours...' : '⚪ Non terminée'}
          </Text>
        )}
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const { meetings, loading } = useMeetings();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Historique</Text>
        <Text style={styles.subtitle}>{meetings.length} réunion{meetings.length > 1 ? 's' : ''}</Text>
      </View>

      {loading
        ? <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
        : meetings.length === 0
          ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>Aucune réunion dans l'historique</Text>
            </View>
          )
          : (
            <FlatList
              data={meetings}
              keyExtractor={m => m.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <HistoryCard
                  meeting={item}
                  onPress={() => router.push(`/meeting/${item.id}`)}
                />
              )}
            />
          )
      }
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.text.primary, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: Colors.text.secondary, marginTop: 4 },
  list: { paddingHorizontal: 24, paddingBottom: 40 },

  card: {
    backgroundColor: Colors.surfaceElevated, borderRadius: 14,
    marginBottom: 10, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  cardIndicator: { width: 4, alignSelf: 'stretch' },
  cardContent: { flex: 1, padding: 14 },
  cardName: { fontSize: 15, fontWeight: '600', color: Colors.text.primary },
  cardDate: { fontSize: 12, color: Colors.text.secondary, marginTop: 2 },
  cardMeta: { flexDirection: 'row', gap: 12, marginTop: 6 },
  metaItem: { fontSize: 12, color: Colors.text.secondary },
  cardStatus: { fontSize: 12, color: Colors.text.tertiary, marginTop: 6 },
  chevron: { fontSize: 20, color: Colors.text.tertiary, paddingRight: 14 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 16, color: Colors.text.secondary },
});
