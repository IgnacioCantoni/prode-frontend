import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription, interval } from 'rxjs'; // ✅ Agregamos RxJS

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
export class Home implements OnInit, OnDestroy { // ✅ Implementamos OnDestroy
  private api  = inject(ProdeApiService);
  private auth = inject(AuthService);
  private cdr  = inject(ChangeDetectorRef); // ✅ Inyectamos detector de cambios

  private refreshSub?: Subscription; // ✅ Reloj de actualización

  // ─── Estado ───────────────────────────────────────────────────
  upcomingMatches: Match[]      = [];
  recentPredictions: Prediction[] = [];
  rankingPosition = 0;
  loading = true;

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

    this.loadDashboardData(false); // Carga inicial con animaciones

    // ✅ Polling: Recarga silenciosa cada 60 segundos
    this.refreshSub = interval(60000).subscribe(() => {
      this.loadDashboardData(true);
    });
  }

  ngOnDestroy(): void {
    if (this.refreshSub) {
      this.refreshSub.unsubscribe();
    }
  }

  // ✅ Función unificada que carga todo junto (con o sin animaciones)
  private loadDashboardData(isSilent: boolean): void {
    if (!isSilent) this.loading = true;

    Promise.all([
      this.api.getMatches().toPromise(),
      this.api.getMyPredictions().toPromise(),
      this.api.getRanking().toPromise()
    ]).then(([matches, preds, ranking]) => {
      
      // 1. Procesar Partidos
      this.upcomingMatches = (matches ?? [])
        .filter(m => m.status === 'SCHEDULED' || m.status === 'upcoming')
        .slice(0, 4);

      // 2. Procesar Predicciones (Ajustado al nuevo sistema de puntos)
      const safePreds = preds ?? [];
      this.recentPredictions = safePreds.slice(0, 3);
      const withPoints = safePreds.filter(p => p.points_earned !== null);
      
      this.userStats.totalPredictions = safePreds.length;
      this.userStats.totalPoints      = withPoints.reduce((acc, p) => acc + (p.points_earned ?? 0), 0);
      this.userStats.exactScores      = withPoints.filter(p => (p.points_earned ?? 0) >= 8).length; // ✅ Ahora busca plenos de 8+ pts
      this.userStats.correctResults   = withPoints.filter(p => (p.points_earned ?? 0) > 0).length;

      // 3. Procesar Ranking
      const user = this.auth.user();
      if (user && ranking) {
        const idx = ranking.findIndex(r => r.id === user.id);
        this.userStats.rankPosition = idx >= 0 ? idx + 1 : 0;
      }

      // 4. Lógica de UI (Animaciones vs Recarga silenciosa)
      if (!isSilent) {
        this.loading = false;
        setTimeout(() => {
          this.animateCounter('animatedPoints',   this.userStats.totalPoints, 1200);
          this.animateCounter('animatedAccuracy', this.accuracy, 900);
          this.animateCounter('animatedExact',    this.userStats.exactScores, 700);
          if (user) this.animateCounter('animatedRank', this.userStats.rankPosition, 600);
        }, 300);
      } else {
        // En recarga silenciosa, actualizamos los números directo sin volver a lanzar la animación de 0 a X
        this.animatedPoints   = this.userStats.totalPoints;
        this.animatedAccuracy = this.accuracy;
        this.animatedExact    = this.userStats.exactScores;
        if (user) this.animatedRank = this.userStats.rankPosition;
      }

      this.cdr.detectChanges(); // Repintamos la pantalla
    }).catch(err => {
      console.error('Error cargando dashboard:', err);
      if (!isSilent) this.loading = false;
      this.cdr.detectChanges();
    });
  }

  get accuracy(): number {
    if (this.userStats.totalPredictions === 0) return 0;
    return Math.round((this.userStats.correctResults / this.userStats.totalPredictions) * 100);
  }

  getMatchTeam(pred: Prediction, side: 'home' | 'away'): string {
    return `Partido #${pred.match_id}`;
  }

  // ✅ Actualizado a los nuevos valores y clases
  getPointsClass(points: number | null): string {
    if (points === null) return '';
    if (points >= 8) return 'exact';       // Tendrías que tener .exact en tu SCSS
    if (points >= 5) return 'difference';  // Asegurate de agregar .difference en SCSS
    if (points >= 3) return 'winner';      // Asegurate de agregar .winner en SCSS
    if (points >= 1) return 'partial';     // Asegurate de agregar .partial en SCSS
    return 'miss';
  }

  // ✅ Actualizado con las etiquetas exactas de tu tabla
  getPointsLabel(points: number | null): string {
    if (points === null) return '-';
    if (points >= 8) return '+8 Pleno';
    if (points >= 5) return '+5 Diferencia';
    if (points >= 3) return '+3 Resultado';
    if (points >= 1) return '+1 Parcial';
    return '0 pts';
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