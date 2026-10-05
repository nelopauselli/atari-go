import { reactive, watch } from 'vue';
import { api } from '../services/api.js';
import TeamShield from './TeamShield.js';

// Tabla del ranking detallado de una sala torneo: equipos, sus jugadores y el historial de partidas de cada uno.
// Requiere que los equipos de la sala estén cargados en services/teams.js para resolver los avatares.
export default {
  name: 'RankingDetail',
  components: { TeamShield },
  props: { ranking: { type: Array, required: true } },
  setup(props) {
    // Equipos del ranking expandidos para ver sus integrantes (todos desplegados al inicio).
    const expandedTeams = reactive({});
    const toggleTeam = (teamId) => { expandedTeams[teamId] = !expandedTeams[teamId]; };
    watch(() => props.ranking, (ranking) => {
      for (const r of ranking) if (!(r.team in expandedTeams)) expandedTeams[r.team] = true;
    }, { immediate: true });
    // Jugadores del ranking expandidos para ver su historial de partidas.
    const expandedPlayers = reactive({});
    const togglePlayer = (playerId) => { expandedPlayers[playerId] = !expandedPlayers[playerId]; };

    function playerLabel(p) {
      return p.teamName ? `${p.nickname} (${p.teamName})` : p.nickname;
    }

    return { expandedTeams, toggleTeam, expandedPlayers, togglePlayer, playerLabel, sgfUrl: api.sgfDownloadUrl };
  },
  template: `
  <div class="table-responsive">
    <p v-if="!ranking.length" class="text-muted">Todavía no hay equipos ni partidas.</p>
    <table v-else class="table align-middle">
      <thead><tr><th>#</th><th>Equipo / Jugador</th><th class="text-end">Jugadas</th><th class="text-end">Ganadas</th><th class="text-end">Perdidas</th></tr></thead>
      <tbody v-for="(r, i) in ranking" :key="r.team">
        <tr class="fw-semibold" role="button" :aria-expanded="!!expandedTeams[r.team]" @click="toggleTeam(r.team)">
          <td>{{ i + 1 }}</td>
          <td>
            <span class="d-inline-flex align-items-center gap-2">
              <span class="text-muted small" style="width: 1em">{{ expandedTeams[r.team] ? '▾' : '▸' }}</span>
              <TeamShield :team="r.team" :name="r.teamName" :size="24" />{{ r.teamName }}
            </span>
          </td>
          <td class="text-end">{{ r.played }}</td>
          <td class="text-end">{{ r.wins }}</td>
          <td class="text-end">{{ r.losses }}</td>
        </tr>
        <template v-if="expandedTeams[r.team]">
        <template v-for="p in r.players" :key="p.player">
        <tr :role="p.games.length ? 'button' : null" :aria-expanded="p.games.length ? !!expandedPlayers[p.player] : null" @click="p.games.length && togglePlayer(p.player)">
          <td></td>
          <td class="ps-5">
            <span class="text-muted small d-inline-block" style="width: 1em">{{ p.games.length ? (expandedPlayers[p.player] ? '▾' : '▸') : '' }}</span>
            {{ p.nickname }} <span v-if="p.institutionName" class="text-muted small">({{ p.institutionName }})</span>
          </td>
          <td class="text-end">{{ p.played }}</td>
          <td class="text-end">{{ p.wins }}</td>
          <td class="text-end">{{ p.losses }}</td>
        </tr>
        <template v-if="expandedPlayers[p.player]">
        <tr v-for="g in p.games" :key="p.player + g.match" class="small">
          <td></td>
          <td colspan="4" style="padding-left: 5rem">
            <span class="d-inline-flex flex-wrap align-items-center gap-2">
              <span class="badge" :class="g.won ? 'text-bg-success' : 'text-bg-danger'">{{ g.won ? 'Ganó' : 'Perdió' }}</span>
              <span class="text-muted">{{ g.color==='black' ? '⚫' : '⚪' }} vs</span>
              <template v-if="g.opponent">
                <TeamShield v-if="g.opponent.team" :team="g.opponent.team" :name="g.opponent.teamName" :size="20" />
                <span>{{ playerLabel(g.opponent) }}</span>
              </template>
              <span v-else class="text-muted">sin rival</span>
              <span class="text-muted">· {{ g.reason }} · Tablero #{{ g.boardNumber }}<template v-if="g.endedAt"> · {{ new Date(g.endedAt).toLocaleString() }}</template></span>
              <a class="link-primary" :href="sgfUrl(g.match)" @click.stop>SGF</a>
            </span>
          </td>
        </tr>
        </template>
        </template>
        <tr v-if="!r.players.length">
          <td></td>
          <td colspan="4" class="ps-5 text-muted small">Sin jugadores</td>
        </tr>
        </template>
      </tbody>
    </table>
  </div>
  `,
};
