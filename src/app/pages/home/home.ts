import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription, interval } from 'rxjs'; 

import { fadeSlideIn, staggerList, todayPulse, statBounceIn } from './home.animations';
import { ProdeApiService } from '../../services/prode.api.service';
import { AuthService } from '../../services/auth.service';
import { Match, Prediction } from '../../models/prode.model';

export interface UserStats {
  username: string;
  avatar: string;
  totalPoints: number;
  rankPosition: number;
  totalPredictions: number;
  correctResults: number;
  exactScores: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
  animations: [fadeSlideIn, staggerList, todayPulse, statBounceIn],
})
export class Home implements OnInit, OnDestroy { 
  private api  = inject(ProdeApiService);
  private auth = inject(AuthService);
  private cdr  = inject(ChangeDetectorRef); 

  private refreshSub?: Subscription; 

  // ─── Estado ───────────────────────────────────────────────────
  upcomingMatches: Match[]      = [];
  recentPredictions: Prediction[] = [];
  allMyPredictions: Prediction[] = []; // ✅ Guardamos TODAS las predicciones acá
  rankingPosition = 0;
  loading = true;
  allMatches: Match[] = []; 
  isModalOpen = false;
  selectedMatch: Match | null = null;
  matchPredictions: any[] = []; // Acá guardaremos lo que votaron los demás
  loadingModal = false;

  // ─── Stats derivadas del user + predicciones ──────────────────
  userStats: UserStats = {
    username: '',
    avatar: '',
    totalPoints: 0,
    rankPosition: 0,
    totalPredictions: 0,
    correctResults: 0,
    exactScores: 0,
  };

  animatedPoints   = 0;
  animatedRank     = 0;
  animatedAccuracy = 0;
  animatedExact    = 0;

  ngOnInit(): void {
    const user = this.auth.user();
    if (user) {
      this.userStats.username = user.username;
      this.userStats.avatar   = user.username.slice(0, 2).toUpperCase();
    }

    // Carga inicial al entrar a la página
    this.loadDashboardData(false); 

    // ✅ ACTUALIZADOR DE DATOS: Cada 5 minutos (300000 milisegundos)
    // Trae los goles nuevos sin saturar tu backend ni la API externa
    this.refreshSub = interval(300000).subscribe(() => {
      this.loadDashboardData(true);
    });

    // ✅ ACTUALIZADOR DEL RELOJ: Cada 1 segundo
    // Solo actualiza la vista HTML para que el getLiveTimer avance, CERO consumo de internet
    setInterval(() => {
      this.cdr.detectChanges();
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.refreshSub) {
      this.refreshSub.unsubscribe();
    }
  }

  private loadDashboardData(isSilent: boolean): void {
    if (!isSilent) this.loading = true;

    Promise.all([
      this.api.getMatches().toPromise(),
      this.api.getMyPredictions().toPromise(),
      this.api.getRanking().toPromise()
    ]).then(([matches, preds, ranking]) => {
      
      // ✅ GUARDAMOS TODOS LOS PARTIDOS
      this.allMatches = matches ?? [];

      // ✅ 1. PROCESAMOS LOS PARTIDOS (Acá va el filtro que incluye los En Vivo y los ordena)
      this.upcomingMatches = this.allMatches
        .filter(m => 
          m.status === 'SCHEDULED' || 
          m.status === 'upcoming' || 
          m.status === 'IN_PLAY' || 
          m.status === 'live' || 
          m.status === 'PAUSED'
        )
        // Priorizamos los partidos en vivo para que salgan primeros en la lista
        .sort((a, b) => {
          const aLive = a.status === 'IN_PLAY' || a.status === 'live' || a.status === 'PAUSED' ? -1 : 1;
          const bLive = b.status === 'IN_PLAY' || b.status === 'live' || b.status === 'PAUSED' ? -1 : 1;
          return aLive - bLive;
        })
        .slice(0, 4);

      // ✅ 2. PROCESAMOS LAS PREDICCIONES
      const safePreds: Prediction[] = preds ?? []; 
      this.allMyPredictions = safePreds; 
      
      // Filtramos SOLO los finalizados y los ordenamos por fecha (del más reciente al más viejo)
      this.recentPredictions = safePreds
        .filter(p => {
          const match = this.allMatches.find(m => String(m.id) === String(p.match_id));
          return match && (match.status === 'FINISHED' || match.status === 'finished');
        })
        .sort((a, b) => {
          const matchA = this.allMatches.find(m => String(m.id) === String(a.match_id));
          const matchB = this.allMatches.find(m => String(m.id) === String(b.match_id));
          const dateA = matchA ? new Date(matchA.date).getTime() : 0;
          const dateB = matchB ? new Date(matchB.date).getTime() : 0;
          return dateB - dateA; // Orden descendente
        })
        .slice(0, 3); // Nos quedamos con los últimos 3
      
      const withPoints = safePreds.filter((p: Prediction) => p.points_earned !== null);
      
      this.userStats.totalPredictions = safePreds.length;
      this.userStats.totalPoints      = withPoints.reduce((acc: number, p: Prediction) => acc + (p.points_earned ?? 0), 0);
      this.userStats.exactScores      = withPoints.filter((p: Prediction) => (p.points_earned ?? 0) >= 8).length; 
      this.userStats.correctResults   = withPoints.filter((p: Prediction) => (p.points_earned ?? 0) > 0).length;

      // ✅ 3. PROCESAMOS EL RANKING
      const user = this.auth.user();
      if (user && ranking) {
        const idx = ranking.findIndex(r => r.id === user.id);
        this.userStats.rankPosition = idx >= 0 ? idx + 1 : 0;
      }

      // ✅ 4. ACTUALIZAMOS LA VISTA (Animaciones)
      if (!isSilent) {
        this.loading = false;
        setTimeout(() => {
          this.animateCounter('animatedPoints',   this.userStats.totalPoints, 1200);
          this.animateCounter('animatedAccuracy', this.accuracy, 900);
          this.animateCounter('animatedExact',    this.userStats.exactScores, 700);
          if (user) this.animateCounter('animatedRank', this.userStats.rankPosition, 600);
        }, 300);
      } else {
        this.animatedPoints   = this.userStats.totalPoints;
        this.animatedAccuracy = this.accuracy;
        this.animatedExact    = this.userStats.exactScores;
        if (user) this.animatedRank = this.userStats.rankPosition;
      }

      this.cdr.detectChanges(); 
    }).catch(err => {
      console.error('Error cargando dashboard:', err);
      if (!isSilent) this.loading = false;
      this.cdr.detectChanges();
    });
  }

  // ✅ Precisión actualizada: (Puntos Obtenidos / Puntos Posibles) * 100
  get accuracy(): number {
    if (this.userStats.totalPredictions === 0) return 0;
    // Asumimos 8 puntos como el máximo ideal (Pleno) por partido
    const maxPossiblePoints = this.userStats.totalPredictions * 8; 
    return Math.round((this.userStats.totalPoints / maxPossiblePoints) * 100);
  }

  // ✅ Nueva función para buscar si el usuario ya predijo un partido específico
  getPredictionForMatch(matchId: number | string | undefined): Prediction | undefined {
    if (!matchId) return undefined;
    return this.allMyPredictions.find(p => String(p.match_id) === String(matchId));
  }

  getMatchTeam(pred: Prediction, side: 'home' | 'away'): string {
    return `Partido #${pred.match_id}`;
  }

  getPointsClass(points: number | null): string {
    if (points === null) return '';
    if (points >= 8) return 'exact';       
    if (points >= 5) return 'difference';  
    if (points >= 3) return 'winner';      
    if (points >= 1) return 'partial';     
    return 'miss';
  }

  getPointsLabel(points: number | null): string {
    if (points === null) return '-';
    if (points >= 8) return '+8 Pleno';
    if (points >= 5) return '+5 Diferencia';
    if (points >= 3) return '+3 Ganador';
    if (points >= 1) return '+1 Parcial';
    return '+0 Burrito';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    const diff  = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0)  return 'Hoy';
    if (diff === 1)  return 'Mañana';
    if (diff === -1) return 'Ayer';
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  }

  formatTime(dateStr: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  getMatchDetails(matchId: number | string | undefined): Match | undefined {
    if (!matchId) return undefined;
    return this.allMatches.find(m => String(m.id) === String(matchId));
  }


  closeModal(): void {
    this.isModalOpen = false;
    this.selectedMatch = null;
    this.matchPredictions = [];
    this.cdr.detectChanges();
  }

  getLiveTimer(dateStr: string, status: string): string {
    if (status === 'PAUSED') return 'ET'; // Entretiempo
    if (!dateStr) return '00:00';
    
    const start = new Date(dateStr).getTime();
    const now = new Date().getTime();
    const diff = Math.max(0, Math.floor((now - start) / 1000));
    
    const mins = Math.floor(diff / 60).toString().padStart(2, '0');
    const secs = (diff % 60).toString().padStart(2, '0');
    
    return `${mins}:${secs}`;
  }

  // ✅ CÁLCULO DE PUNTOS EN TIEMPO REAL PARA EL MODAL
  calculateLivePoints(pred: any, match: Match): number {
    const homeActual = match.home_score ?? 0;
    const awayActual = match.away_score ?? 0;
    const homePred = pred.home_score;
    const awayPred = pred.away_score;

    if (homeActual === homePred && awayActual === awayPred) return 8; // Pleno
    
    const actualDiff = homeActual - awayActual;
    const predDiff = homePred - awayPred;
    if (actualDiff === predDiff) return 5; // Diferencia/Empate
    
    const actualWinner = actualDiff > 0 ? 'home' : (actualDiff < 0 ? 'away' : 'draw');
    const predWinner = predDiff > 0 ? 'home' : (predDiff < 0 ? 'away' : 'draw');
    if (actualWinner === predWinner) return 3; // Ganador
    
    if (homeActual === homePred || awayActual === awayPred) return 1; // Parcial
    
    return 0; // Burrito
  }

  // ✅ MODIFICAMOS EL MODAL PARA ORDENAR POR PUNTOS
  openMatchModal(matchId: number | string | undefined): void {
    if (!matchId) return;
    const numericMatchId = Number(matchId);

    this.selectedMatch = this.getMatchDetails(numericMatchId) || null;
    if (!this.selectedMatch) return;

    this.isModalOpen = true;
    this.loadingModal = true;
    this.matchPredictions = [];

    this.api.getMatchPredictions(numericMatchId).subscribe({
      next: (preds) => {
        const isLiveOrFinished = ['IN_PLAY', 'live', 'PAUSED', 'FINISHED', 'finished'].includes(this.selectedMatch!.status);
        
        if (isLiveOrFinished) {
          // Si está en vivo o terminó, calculamos los puntos y ordenamos de mayor a menor
          this.matchPredictions = preds.map(p => ({
            ...p,
            livePoints: this.calculateLivePoints(p, this.selectedMatch!)
          })).sort((a, b) => b.livePoints - a.livePoints);
        } else {
          // Si no empezó, mostramos la lista normal
          this.matchPredictions = preds;
        }

        this.loadingModal = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando predicciones del partido', err);
        this.loadingModal = false;
        this.cdr.detectChanges();
      }
    });
  }

  private animateCounter(
    key: 'animatedPoints' | 'animatedRank' | 'animatedAccuracy' | 'animatedExact',
    target: number,
    duration: number
  ): void {
    const steps    = 40;
    const interval = duration / steps;
    const step     = target / steps;
    let   current  = 0;
    let   count    = 0;

    const timer = setInterval(() => {
      count++;
      current = Math.round(step * count);
      if (current >= target || count >= steps) {
        this[key] = target;
        clearInterval(timer);
      } else {
        this[key] = current;
      }
    }, interval);
  }
}