import { ref, onMounted, onUnmounted } from 'vue';
import { api } from '../services/api.js';
import { setTeams } from '../services/teams.js';
import { navigate } from '../router.js';
import RankingDetail from '../components/RankingDetail.js';

// Ranking detallado de una sala torneo: equipos, sus jugadores y el historial de partidas de cada uno.
export default {
  name: 'RankingView',
  components: { RankingDetail },
  props: { roomId: { type: String, required: true } },
  setup(props) {
    const room = ref(null);
    const ranking = ref([]);

    onMounted(async () => {
      const [roomData, historyData] = await Promise.all([api.getRoom(props.roomId), api.getRoomHistory(props.roomId)]);
      room.value = roomData.room;
      // TeamShield resuelve el avatar por id/nombre entre los equipos de esta sala.
      setTeams(room.value.teams || []);
      ranking.value = historyData.ranking;
    });

    onUnmounted(() => setTeams([]));

    return {
      room, ranking,
      goBack: () => navigate(`/room/${props.roomId}`),
    };
  },
  template: `
    <main class="container py-4" v-if="room">
      <div class="mb-3">
        <a href="#" class="link-secondary text-decoration-none" @click.prevent="goBack">← {{ room.name }}</a>
        <h2 class="h4 mt-1 mb-0">Ranking detallado</h2>
      </div>

      <RankingDetail :ranking="ranking" />
    </main>
  `,
};
