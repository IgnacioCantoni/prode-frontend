import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs'; // ✅ Agregamos RxJS
import { ProdeApiService } from '../../services/prode.api.service';
import { AuthService } from '../../services/auth.service';
import { RankingEntry } from '../../models/prode.model';

export interface Player {
  position: number;
  name: string;
  initials: string;
  color: string;
  points: number;
  exactScores: number;
  correctResults: number;
  totalPredictions: number;
  isMe: boolean;
}

// Paleta de colores para avatares
const AVATAR_COLORS = [
  '#F6B40E', '#74ACDF', '#3DDC84', '#FF6B6B', '#A78BFA',
  '#FB923C', '#34D399', '#F472B6', '#60A5FA', '#FBBF24',
];

@Component({
  selector: 'app-ranking',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ranking.html',
  styleUrls: ['./ranking.scss']
})
export class Ranking implements OnInit, OnDestroy { // ✅ Implementamos OnDestroy
  private api  = inject(ProdeApiService);
  private auth = inject(AuthService);
  private cdr  = inject(ChangeDetectorRef); // ✅ Inyectamos el detector de cambios

  private refreshSub?: Subscription; // ✅ Guardamos el temporizador

  searchQuery = '';
  players: Player[] = [];
  loading = true;
  error   = '';

  ngOnInit(): void {
    this.loadData(); // Carga inicial con spinner

    // ✅ Polling: Actualiza el ranking cada 60 segundos 
    this.refreshSub = interval(60000).subscribe(() => {
      this.silentReload();
    });
  }

  ngOnDestroy(): void {
    // ✅ Apagamos el reloj al salir de la pestaña
    if (this.refreshSub) {
      this.refreshSub.unsubscribe();
    }
  }

  private loadData(): void {
    this.loading = true;
    this.api.getRanking().subscribe({
      next: (ranking) => {
        this.players = this.processRanking(ranking);
        this.loading = false;
        this.cdr.detectChanges(); // Forzamos actualización visual
      },
      error: () => {
        this.error   = 'No se pudo cargar el ranking.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ✅ Recarga de fondo sin spinner
  private silentReload(): void {
    this.api.getRanking().subscribe({
      next: (ranking) => {
        this.players = this.processRanking(ranking);
        this.cdr.detectChanges(); // Repinta las posiciones en vivo
      },
      error: (err) => console.error('Error recargando el ranking de fondo:', err)
    });
  }

  // Función auxiliar para no repetir la lógica de mapeo
  private processRanking(ranking: RankingEntry[]): Player[] {
    const currentUser = this.auth.user();
    
    return ranking.map((entry, idx) => {
      const initials = entry.username.slice(0, 2).toUpperCase();
      const color    = AVATAR_COLORS[idx % AVATAR_COLORS.length];
      const isMe     = currentUser ? entry.id === currentUser.id : false;

      return {
        position:         idx + 1,
        name:             entry.username,
        initials,
        color,
        points:           Number(entry.total_points),
        exactScores:      0,   // el endpoint /ranking no devuelve breakdown
        correctResults:   0,   // si querés mostrarlo, extendé la query SQL
        totalPredictions: 0,
        isMe,
      };
    });
  }

  get top3(): Player[] { return this.players.slice(0, 3); }

  get filteredPlayers(): Player[] {
    if (!this.searchQuery.trim()) return this.players;
    return this.players.filter(p =>
      p.name.toLowerCase().includes(this.searchQuery.toLowerCase())
    );
  }

  get myPlayer(): Player | undefined {
    return this.players.find(p => p.isMe);
  }

  getAccuracy(player: Player): number {
    if (player.totalPredictions === 0) return 0;
    return Math.round(((player.exactScores + player.correctResults) / player.totalPredictions) * 100);
  }

  onSearch(event: Event) {
    this.searchQuery = (event.target as HTMLInputElement).value;
  }

  getMedalIcon(position: number): string {
    if (position === 1) return '🥇';
    if (position === 2) return '🥈';
    if (position === 3) return '🥉';
    return '';
  }
}