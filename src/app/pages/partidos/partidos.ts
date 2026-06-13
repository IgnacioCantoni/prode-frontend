import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs'; // ✅ Agregamos RxJS
import { ProdeApiService } from '../../services/prode.api.service';
import { Match } from '../../models/prode.model';

export type MatchStatus = 'upcoming' | 'live' | 'finished' | 'SCHEDULED' | 'IN_PLAY' | 'FINISHED' | 'PAUSED';
export type Phase = 'grupos' | 'octavos' | 'cuartos' | 'semis' | 'final';

export interface Group {
  name: string;
  letter: string;
  matches: Match[];
}

export interface KnockoutMatch {
  id: number;
  label: string;
  homeTeam: string;
  awayTeam: string;
  homeFlag: string;
  awayFlag: string;
  homeScore: number | null;
  awayScore: number | null;
  date: string;
  time: string;
  stadium: string;
  status: MatchStatus;
}

@Component({
  selector: 'app-partidos',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './partidos.html',
  styleUrls: ['./partidos.scss']
})
export class Partidos implements OnInit, OnDestroy { // ✅ Implementamos OnDestroy
  private api = inject(ProdeApiService);
  private cdr = inject(ChangeDetectorRef); // ✅ Inyectamos el detector de cambios

  private refreshSub?: Subscription; // ✅ Guardamos el temporizador

  activePhase: Phase = 'grupos';
  activeGroup = 'A';
  loading = true;
  error   = '';

  phases = [
    { key: 'grupos',  label: 'Fase de Grupos', icon: '⚽' },
    { key: 'octavos', label: 'Octavos',        icon: '🔵' },
    { key: 'cuartos', label: 'Cuartos',        icon: '🟡' },
    { key: 'semis',   label: 'Semifinales',    icon: '🔴' },
    { key: 'final',   label: 'Final',          icon: '🏆' },
  ];

  groups: Group[] = [];

  knockoutMatches: Record<string, KnockoutMatch[]> = {
    octavos: [], cuartos: [], semis: [], final: []
  };

  ngOnInit(): void {
    this.loadData(); // Carga inicial (con spinner)

    // ✅ Polling: Actualiza el fixture cada 60 segundos por si hay goles o cambios de estado
    this.refreshSub = interval(5000).subscribe(() => {
      this.silentReload();
    });
  }

  ngOnDestroy(): void {
    // ✅ Detenemos el reloj cuando cambiamos de pestaña
    if (this.refreshSub) {
      this.refreshSub.unsubscribe();
    }
  }

  private loadData(): void {
    this.loading = true;
    this.api.getMatches().subscribe({
      next: (matches) => {
        this.buildGroups(matches);
        this.loading = false;
        this.cdr.detectChanges(); // Forzamos la actualización visual
      },
      error: () => {
        this.error   = 'No se pudieron cargar los partidos.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ✅ Recarga los resultados de fondo sin mostrar que está "Cargando..."
  private silentReload(): void {
    this.api.getMatches().subscribe({
      next: (matches) => {
        this.buildGroups(matches);
        this.cdr.detectChanges(); // Repinta los goles o el estado "En vivo" / "Finalizado"
      },
      error: (err) => console.error('Error recargando partidos de fondo:', err)
    });
  }

  private buildGroups(matches: Match[]): void {
    const groupMap = new Map<string, Group>();

    for (const match of matches) {
      const phase = match.phase?.toLowerCase() ?? '';

      if (phase && phase !== 'group') {
        continue;
      }

      const letter = match.group_name ?? 'Sin grupo';

      if (!groupMap.has(letter)) {
        groupMap.set(letter, { name: `Grupo ${letter}`, letter, matches: [] });
      }
      groupMap.get(letter)!.matches.push(match);
    }

    this.groups = Array.from(groupMap.values()).sort((a, b) => a.letter.localeCompare(b.letter));

    // Si ya hay un grupo activo seleccionado, no lo pisamos (para no volver a la pestaña A en cada recarga)
    if (this.groups.length > 0 && !this.groups.find(g => g.letter === this.activeGroup)) {
      this.activeGroup = this.groups[0].letter;
    }
  }

  get activeGroupData(): Group | undefined {
    return this.groups.find(g => g.letter === this.activeGroup);
  }

  setPhase(phase: string) { this.activePhase = phase as Phase; }
  setGroup(letter: string) { this.activeGroup = letter; }

  getStatusLabel(status: string): string {
    if (status === 'IN_PLAY' || status === 'live' || status === 'PAUSED') return 'En vivo';
    if (status === 'FINISHED' || status === 'finished') return 'Finalizado';
    return 'Próximo';
  }

  getNormalizedStatus(status: string): string {
    if (status === 'IN_PLAY' || status === 'PAUSED') return 'live';
    if (status === 'FINISHED') return 'finished';
    return 'upcoming';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  }

  formatTime(dateStr: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
}