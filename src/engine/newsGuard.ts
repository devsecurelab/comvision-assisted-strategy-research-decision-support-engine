// News Guard Fail-Safe Architecture
// Monitors High-Impact (Red Folder) Macroeconomic Events
// Restriction Window: [T_news - 30 minutes, T_news + 30 minutes]

import { NewsEvent, NewsWindowState } from './types';

export class NewsGuardService {
  private events: NewsEvent[] = [];
  private sourceOnline: boolean = true;
  private lastCheckedTimestamp: string = new Date().toISOString();

  constructor() {
  }

  public getEvents(): NewsEvent[] {
    return this.events;
  }

  public isSourceOnline(): boolean {
    return this.sourceOnline;
  }

  public isOnline(): boolean {
    return this.sourceOnline;
  }

  public setSourceStatus(online: boolean) {
    this.sourceOnline = online;
    this.lastCheckedTimestamp = new Date().toISOString();
  }

  public addEvent(event: NewsEvent) {
    this.events.push(event);
  }


  public checkNewsWindow(currentTimestamp: string = new Date().toISOString()): {
    state: NewsWindowState;
    activeEvent?: NewsEvent;
    sourceOnline: boolean;
    lastChecked: string;
    countdownMinutes?: number;
  } {
    this.lastCheckedTimestamp = new Date().toISOString();
    if (!this.sourceOnline) {
      return {
        state: 'NEWS_DATA_UNAVAILABLE',
        sourceOnline: false,
        lastChecked: this.lastCheckedTimestamp,
      };
    }

    const currentTime = new Date(currentTimestamp).getTime();
    const restrictionMs = 30 * 60 * 1000; // 30 minutes

    for (const evt of this.events) {
      if (evt.impact === 'HIGH') {
        const evtTime = new Date(evt.timestamp).getTime();
        const diff = Math.abs(currentTime - evtTime);
        if (diff <= restrictionMs) {
          const remainingMinutes = Math.ceil((restrictionMs - (currentTime - evtTime)) / (60 * 1000));
          return {
            state: 'ACTIVE',
            activeEvent: evt,
            sourceOnline: true,
            lastChecked: this.lastCheckedTimestamp,
            countdownMinutes: remainingMinutes,
          };
        }
      }
    }

    return {
      state: 'CLEAR',
      sourceOnline: true,
      lastChecked: this.lastCheckedTimestamp,
    };
  }
}

export const newsGuard = new NewsGuardService();
